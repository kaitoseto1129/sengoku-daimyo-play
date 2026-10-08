// ======================================================================
// 攻城 C7・C9　高遠城の戦い・縄張り版（docs/siege-plan.md C7・C9／siege-spec.md 57・62・69章）
// 天正十年（1582）三月二日。武田の城々が次々に開く中、信玄の五男・仁科盛信だけは高遠城に籠もり降らなかった。
// 織田信忠の手が城を攻め、その日のうちに落ちた。ここは castle_plan.js の縄張り（castles/takato.js）・
// 門（siege_gate.js）・梯子（siege_ladder.js）・区域制圧（siege_zones.js）・城の頭（siege_ai.js）を
// 使った縄張り版（旧い b_takato.js の読み口もこの一戦を参照する）。
// C9：攻め方で結果が変わる【城62】。①大手だけ ②大手で引きつけて搦手 ③西の切岸を梯子で
//      ④二の丸を取って高い所から本丸を撃つ、の四つ（軍議・window.__takatoStrategy で選ぶ）。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { yamaLift } from './yamalift.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { nm, strengthBanner, wallLine } from './bhelp.js';
import { distToPolyline } from './world.js';
import { demRelief } from './dem.js';
let tkDem = null;
import('./asset_dem_takato.js').then((m) => { tkDem = m.default; }).catch(() => {});
import { heightOf, inPoly, buildCastlePlan, makeLordKeep } from './castle_plan.js';
import { horiboriHeight, kabukiGate, goten } from './castle_parts.js';
import { palisade, kabukimon, ishigaki, makeKitBatch, finalizeKitBatch, village, solidCircle } from './props.js';
import { buildRoom, roomTick } from './interior_parts.js';
import { cgtOn, KitBatch } from './cgt.js';
import { addNaibu } from './naibu_kit.js';
import { ishidan } from './temple_parts.js';
import { reset as flReset } from './floors.js';
import { makeSiegeZones, siegeFighter } from './siege_zones.js';
import { makeGate, updateGates, resetGates } from './siege_gate.js';
import { makeNawabari } from './nawabari.js';
import { placeLadder, startClimb, knockDown, updateLadders, resetLadders } from './siege_ladder.js';
import { makeButai, butaiTick } from './butai.js';
import { tickTabas, tabaInteractTick, announceAdvance, makeTabaAdvance } from './taketaba.js';
import { logEvent } from './senkyo.js';
import { battleEvent, EVENT_COMMANDER_ADVANCE, EVENT_RETREAT, EVENT_REINFORCEMENT } from './battle_events.js';
import { volleyAll, leanAll } from './b_mid.js';
import {
  TAKATO_PLAN as TAKATO_BASE_PLAN, TAKATO_BUILDINGS, OTE, GATE_NI, GATE_HON, KARAMETE, GATE_HODOIN, CLIFF_Z, NISHI_X,
  ROAD_OTE, ROAD_KARAMETE, ROAD_NISHI, ROAD_YODOU,
} from './castles/takato.js';

// 共通の七曲輪を土の城として建てる。全曲輪の床に同じ台地の高さを足す。
const TAKATO_PLAN = { ...TAKATO_BASE_PLAN, kuruwa: TAKATO_BASE_PLAN.kuruwa.map((k) => ({
  ...k,
  // 台地の高さを全曲輪と建物で共用する。外の地面だけ高くしない。
  level: () => castleBase(0, 0) + k.level,
})),
  // 共通の枡形は辺全体を開ける。土の喰違いでは外門の幅だけ柵を切る。
  koguchi: TAKATO_BASE_PLAN.koguchi.map((g) => ({ ...g, kind: g.kind === 'masu' ? 'kuichigai' : g.kind })),
};

const CLEAR_BOUNDS = TAKATO_BASE_PLAN.kuruwa.map((k) => ({ x0: Math.min(...k.poly.map((p) => p[0])), x1: Math.max(...k.poly.map((p) => p[0])), z0: Math.min(...k.poly.map((p) => p[1])), z1: Math.max(...k.poly.map((p) => p[1])) }));

const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
import { jinkeiBuild } from './jinkei.js';
import { flagTexture } from './textures.js';

// 備えごとの人数・細かな持ち場は復元値。総勢とは別に本物の兵を増やさない。
// 名の伝わらない持ち場に架空の将を置かず、旗と紋は既存の家の物で示す。
function sonaePlan(name, team, honjin, facing, rows) {
  const sn = Math.sin(facing), cs = Math.cos(facing);
  return { name, team, honjin, facing, sonae: rows.map(([id, role, general, soldiers, x, z, face, flag, mon, count = 0, w = 14, d = 8]) => ({
    id, role, general, soldiers, at: { right: (x - honjin.x) * cs - (z - honjin.z) * sn, front: (x - honjin.x) * sn + (z - honjin.z) * cs },
    facing: face, flag, mon, count, w, d, bindOnly: count === 0,
  })) };
}

// 作るのは準備時の軽い備えだけ。台本の近い兵・前進・退去を優先する。
function buildSonae(rt, plans) {
  const hosts = [];
  for (const plan of plans) jinkeiBuild(rt, plan, (s, at) => {
    const h = rt.world.addDistantArmy({ ...at, w: s.w, d: s.d, count: s.count, facing: s.facing,
      team: plan.team, armor: plan.team ? 0x34302a : 0x2b3140, flagTex: flagTexture(s.flag), mon: s.mon,
      kind: 'mixed', general: s.general === '名は伝わらない' ? undefined : s.general, seed: 15810 + hosts.length });
    h.army.noWake = true;
    h.army.jinkeiGuard = true;
    hosts.push(h);
    return h;
  });
  return hosts;
}

// 信長公記巻十五の大手五将と西の信忠。曲輪別の将の配り・人数は復元。
// 三万対三千は総勢の目安。近い部隊の人数とは分け、既存の門兵を動かさない。
const TAKATO_ATTACK = sonaePlan('両口の寄せ', 0, { x: -72, z: 0 }, Math.PI / 2, [
  ['nobutada', '本陣', '織田信忠', 10000, -72, 0, Math.PI / 2, 'oda', 'oda'],
  ['oteSpear', '大手の仕寄り', '森長可', 5000, 78, -38, -Math.PI / 2, 'tsuru', 'tsuru'],
  ['reserve', '大手の控え', '河尻秀隆', 5000, 100, -32, -Math.PI / 2, 'oda', 'none'],
  ['dan', '大手の第二陣', '団忠正（団平八）', 4000, 104, -54, -Math.PI / 2, 'oda', 'none', 64, 12, 8],
  ['mori', '大手の南脇', '毛利河内守', 3000, 100, -10, -Math.PI / 2, 'oda', 'none', 48, 12, 8],
  ['ogasawara', '大手の北脇', '小笠原信嶺', 3000, 80, -66, -Math.PI / 2, 'oda', 'none', 48, 12, 8],
]);
const TAKATO_DEFEND = sonaePlan('曲輪ごとの守り', 1, { x: 0, z: 29 }, Math.PI, [
  ['honGuard', '本丸', '仁科盛信', 900, 0, 22, Math.PI, 'takeda', 'takeda'],
  ['sanSpear', '三の丸と大手', '諏訪勝右衛門', 950, 24, -54, Math.PI / 2, 'takeda', 'takeda'],
  ['niSpear', '二の丸', '小山田昌行', 500, 0, -12, Math.PI, 'takeda', 'takeda'],
  ['hodoinSpear', '西の搦手', '名は伝わらない', 450, -24, 0, -Math.PI / 2, 'takeda', 'takeda'],
  ['reserveDef', '二の丸の控え', '名は伝わらない', 200, 12, 2, Math.PI, 'takeda', 'takeda'],
]);
for (const p of [TAKATO_ATTACK, TAKATO_DEFEND]) for (const s of p.sonae) s.bind = (rt) => rt.flags[s.id];

const ODA = { armor: 0x2b3140, flag: 'oda' };
const TAKEDA = { armor: 0x3a2622, flag: 'takeda' };

// ---------------- 地形：南は崖（三峰川）、西は切岸（梯子が要る）、北から緩く台地へ ----------------
function baseTerrain(x, z) {
  let h = 1 + 5 / (1 + Math.exp(-(z + 90) / 6));   // 南の平地から台地へ（z が増すほど高い）
  h += 0.3 * Math.sin(x * 0.05 + 0.4) * Math.cos(z * 0.045);
  if (z > CLIFF_Z) h -= (z - CLIFF_Z) * 3.2;         // 本丸の裏、三峰川の崖
  // 尾根の芯だけでなく、二列の兵が歩く幅六メートルを平らに残す。
  // 以前は z=0 以外が急斜面で、旗本の後列が道の始点より西で動けなかった。
  const side = Math.max(0, Math.abs(z) - 3);
  if (x < NISHI_X) h -= Math.min(36, (NISHI_X - x) * 1.8) * (1 - Math.exp(-side * side / 28));
  if (z < -78) h -= Math.min(32, (-78 - z) * 1.6);  // 北の藤沢川の谷
  if (x > 60) h -= (x - 60) * 0.15;                  // 東（法幢院曲輪の先）へ緩く下る
  return h;
}
// 空堀と竪堀の窪みを見た目と歩く地形へ共通に反映する。
const HORI_FNS = TAKATO_PLAN.hori
  .map((h) => horiboriHeight(h.pts, { depth: h.deep ?? 2, width: h.w ?? 6 }));
function castleBase(x, z) { return baseTerrain(x, z) + yamaLift(x, z, LIFT); }
function baseWithHori(x, z) { let h = castleBase(x, z); for (const f of HORI_FNS) h += f(x, z); return h; }
const DEM_RELIEF = { xy: 2, cx: 0, cz: 0, inner: 170, fade: 40, scale: 0.1 };
let HEIGHT_FN = null, HEIGHT_DEM = null, ROAD_SEGMENTS = null;
const WALK_ROADS = [[[-94, 0], ...ROAD_KARAMETE], ...TAKATO_PLAN.paths.filter((p) => p.kind !== 'nishi' && p.kind !== 'yodou').map((p) => p.pts)];
function rawHeight(x, z) {
  return HEIGHT_FN(x, z) + (HEIGHT_DEM ? demRelief(HEIGHT_DEM, x, z, DEM_RELIEF) : 0);
}
function roadLevel(x, z) {
  // 勘助曲輪への枝道は谷底へ落とさず、台地西側の段としてつなぐ（高さは推定）。
  const west = TAKATO_PLAN.paths.find((p) => p.id === 'kansuke');
  for (let i = 0; i < west.pts.length; i++) if (west.levels[i] != null && Math.hypot(x - west.pts[i][0], z - west.pts[i][1]) < .001) return castleBase(0, 0) + west.levels[i];
  // 本丸から低い笹曲輪へは、土橋の前後十二メートルで段差を配る。
  if (Math.abs(x + 6) < .001 && (Math.abs(z - 44) < .001 || Math.abs(z - 48) < .001)) return castleBase(0, 0) + 9 - (z - 40) * 5 / 12;
  let level = -Infinity;
  for (const k of TAKATO_PLAN.kuruwa) if (inPoly(k.poly, x, z) || inPoly(k.poly, x - .001, z - .001) || inPoly(k.poly, x + .001, z + .001)) level = Math.max(level, k.level());
  return Number.isFinite(level) ? level : rawHeight(x, z);
}
function height(x, z) {
  if (!HEIGHT_FN) {
    HEIGHT_DEM = tkDem; HEIGHT_FN = heightOf(TAKATO_PLAN, baseWithHori, 3);
    // 段の境界で急変しない坂を準備時に作る。毎コマの配列・形・材質は増やさない。
    ROAD_SEGMENTS = [];
    for (const pts of WALK_ROADS) for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az;
      ROAD_SEGMENTS.push({ ax, az, dx, dz, l2: dx * dx + dz * dz || 1, ya: roadLevel(ax, az), yb: roadLevel(bx, bz) });
    }
  }
  const h0 = rawHeight(x, z);
  // 建物の四隅と縁側は曲輪の床へ水平に据える。
  for (const b of TAKATO_BUILDINGS) {
    const dx = x - b.at[0], dz = z - b.at[1], c = Math.cos(b.rot), s = Math.sin(b.rot);
    if (Math.abs(dx * c - dz * s) <= b.w / 2 + .3 && Math.abs(dx * s + dz * c) <= b.d / 2 + .3) return rawHeight(b.at[0], b.at[1]);
  }
  let best = 3.5, roadY = h0;
  for (const q of ROAD_SEGMENTS) {
    const t = Math.max(0, Math.min(1, ((x - q.ax) * q.dx + (z - q.az) * q.dz) / q.l2));
    const d = Math.hypot(x - q.ax - q.dx * t, z - q.az - q.dz * t);
    if (d < best) { best = d; roadY = q.ya + (q.yb - q.ya) * t; }
  }
  const blend = Math.max(0, Math.min(1, (3.5 - best) / 1.5));
  return h0 + (roadY - h0) * blend;
}

// 門の数・場所・耐久の識別は保ち、土の喰違いを冠木門と柵で囲う。
// 共通の枡形は瓦の櫓門を建てるため、高遠だけ板葺きの二つの門で組む。
function takatoGates(rt) {
  const gates = {}, batch = makeKitBatch();
  for (const g of TAKATO_PLAN.koguchi) {
    const [x, z] = g.at, rot = g.rot || 0;
    if (!Array.isArray(g.gate)) { gates[g.id] = kabukiGate(rt, x, z, g.w, rot, { team: 1 }); continue; }
    const hs = g.size, turn = g.turn, ux = Math.sin(rot), uz = Math.cos(rot), px = turn * uz, pz = -turn * ux;
    const cx = x - ux * hs, cz = z - uz * hs;
    const P = (a, b) => [cx + px * a - ux * b, cz + pz * a - uz * b];
    const walls = [];
    for (const edge of [[-hs, -hs, -hs, hs], [-hs, hs, hs, hs], [hs, hs, hs, 1.6]]) {
      walls.push(...wallLine(rt, [P(edge[0], edge[1]), P(edge[2], edge[3])], { team: 1, hp: 420, name: '虎口の柵', segLen: 8, mesh: palisade, meshOpt: { batch } }));
    }
    const [ix, iz] = P(hs, -hs * .35);
    gates[g.id] = { outer: kabukiGate(rt, x, z, g.w1, rot, { team: 1 }),
      inner: kabukiGate(rt, ix, iz, g.w2, rot + turn * Math.PI / 2, { team: 1 }), walls, plaza: { x: cx, z: cz } };
  }
  finalizeKitBatch(rt, batch);
  return gates;
}
function takatoLife(rt) {
  const rooms = [];
  for (const b of TAKATO_BUILDINGS) {
    const [x, z] = b.at;
    if (b.kind === 'temple') goten(rt, x, z, { ...b, tile: false, naka: true, doorX: 0, team: 1, noTarget: true });
    else {
      const room = buildRoom(rt, x, z, b);
      room.inside.name = b.name; room.inside.where = b.name;
      // 和の部屋の購入部品は入った時に一度だけ。低画質は共通の軽い調度を使う。
      room.inside.onEnter = () => {
        if (room.naibu || !cgtOn()) return;
        const kit = new KitBatch(), p = room.P(room.w / 2 - .35, -room.d / 2 + .35);
        if (addNaibu(kit, 'japanese_lamp_emissive', p.x, room.y, p.z, .25, .45, .25, b.rot)) { rt.scene.add(kit.build()); room.naibu = true; }
      };
      rooms.push(room);
    }
  }
  // 井筒・柱・板葺きの井戸。瓦の井戸の共通部品は戦国期の高遠へ写さない。
  const batch = makeKitBatch();
  const wood = [], stone = [];
  for (const [x, z] of [[-9, 27], [29, 29]]) {
    const y = rt.world.heightAt(x, z);
    const ring = new THREE.CylinderGeometry(.85, .95, .8, 10, 1, true); ring.translate(x, y + .4, z); stone.push(ring); solidCircle(x, z, .95);
    for (const dx of [-1, 1]) { const post = new THREE.BoxGeometry(.14, 2.5, .14); post.translate(x + dx, y + 1.25, z); wood.push(post); solidCircle(x + dx, z, .12); }
    const beam = new THREE.BoxGeometry(2.5, .14, .14); beam.translate(x, y + 2.35, z); wood.push(beam);
    for (const sign of [-1, 1]) { const roof = new THREE.BoxGeometry(2.7, .1, 1); roof.rotateX(sign * .35); roof.translate(x, y + 2.65, z + sign * .43); wood.push(roof); }
  }
  for (const [parts, color] of [[wood, 0x615040], [stone, 0x81796b]]) { const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ color })); mesh.userData.camBlock = true; rt.scene.add(mesh); for (const geo of parts) geo.dispose(); }
  // 門の横の短い石留めに購入済みの野面積みを使う。総石垣にはしない。
  ishigaki(rt.world, [[31, -44], [35, -44]], { kind: 'nozura', topY: rt.world.heightAt(33, -44) + .3,
    minH: 2, maxH: 2.2, out: -1, batch, scene: rt.scene });
  finalizeKitBatch(rt, batch);
  for (const [ax, az, bx, bz] of [[10, -24, 10, -16], [-8, 8, -8, 14], [36, 42, 36, 50], [-6, 42, -6, 50]]) rt.scene.add(ishidan(rt.world, ax, az, bx, bz, 3));
  for (const [x, z, rot] of [[36, 48, 0], [-6, 48, 0], [-42, -38, Math.PI / 2], [48, 60, Math.PI / 2]]) rt.scene.add(kabukimon(rt.world, x, z, 4.6, rot, { doors: false }));
  rt.scene.add(village(rt.world, 112, 30, { n: 5, fields: 8, r: 22, smoke: 0, seed: 15823 }));
  return rooms;
}

// 早春の北側の窪みに残る雪。天気は復元で、当日の降雪とはしない。
// 道と曲輪を避け、地面に沿う小さな斑を一つの形・材質へまとめる。
function takatoSpring(rt) {
  // 足元の近い草も、この戦では枯れ色にする。共通の草の作りは変えない。
  const grass = rt.world.nearGrass;
  if (grass?.instanceColor) {
    const color = new THREE.Color();
    for (let i = 0; i < grass.count; i++) {
      grass.getColorAt(i, color);
      const shade = Math.max(.7, Math.min(1.1, (color.r + color.g + color.b) / .8));
      color.setRGB(.46 * shade, .39 * shade, .25 * shade);
      grass.setColorAt(i, color);
    }
    grass.instanceColor.needsUpdate = true;
  }
  const points = [];
  for (const [x, z, r] of [[44, -60, 3], [54, -56, 2], [66, -68, 4], [82, -60, 3],
    [-18, -66, 3], [2, -66, 2], [-44, -62, 3], [-56, -54, 2]]) {
    const y = rt.world.heightAt(x, z) + .04;
    for (let i = 0; i < 12; i++) {
      points.push(x, y, z);
      for (const j of [i + 1, i]) {
        const a = j * Math.PI / 6, radius = r * (.8 + .2 * Math.sin(j * 2.3));
        const px = x + Math.cos(a) * radius, pz = z + Math.sin(a) * radius;
        points.push(px, rt.world.heightAt(px, pz) + .04, pz);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geo.computeVertexNormals();
  const snow = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0xdadbd2 }));
  snow.receiveShadow = true;
  rt.scene.add(snow);
}

// 冷えた朝の息。近い八人までを一つの描画にまとめ、形と置き場所を使い回す。
function takatoBreath(rt) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const mist = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  mist.addColorStop(0, 'rgba(235,239,237,0.32)');
  mist.addColorStop(.4, 'rgba(235,239,237,0.16)');
  mist.addColorStop(1, 'rgba(235,239,237,0)');
  ctx.fillStyle = mist; ctx.fillRect(0, 0, 32, 32);
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false }), 8);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; mesh.count = 0; rt.scene.add(mesh);
  const people = new Array(8), pose = new THREE.Object3D();
  let scan = 0, tick = 0, count = 0;
  return (dt) => {
    // 昼へ移った後と終戦後は消す。部屋の中や倒れた兵には付けない。
    if (rt.flags.niFell || rt.flags.ending || rt.over) { mesh.visible = false; return; }
    scan -= dt; tick -= dt;
    if (scan <= 0) {
      scan = 1; count = 0;
      const p = rt.player.u;
      if (siegeFighter(p) && !p.naka) people[count++] = p;
      for (const u of rt.army.units) {
        if (count === people.length) break;
        if (u !== p && siegeFighter(u) && !u.naka && u.mesh?.visible &&
            Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) < 18) people[count++] = u;
      }
    }
    if (tick > 0) return;
    tick = .1;
    let n = 0;
    for (let i = 0; i < count; i++) {
      const u = people[i], age = (rt.t + i * .47) % 3.6;
      if (age > .9 || !siegeFighter(u) || u.naka || !u.mesh?.visible) continue;
      const fade = Math.sin(age / .9 * Math.PI), heading = u.heading || 0;
      const drift = .18 + age * .25;
      pose.position.set(u.pos.x + Math.sin(heading) * drift + age * .08,
        u.pos.y + (u.bodyHeight || 1.72) * .9 + age * .12, u.pos.z + Math.cos(heading) * drift);
      pose.quaternion.copy(rt.camera.quaternion);
      pose.scale.set((.2 + age * .4) * fade, (.12 + age * .22) * fade, 1);
      pose.updateMatrix(); mesh.setMatrixAt(n++, pose.matrix);
    }
    mesh.count = n; mesh.instanceMatrix.needsUpdate = true;
  };
}

// 部隊の多点の道：着いたら次の点へ、最後は attack（b_hiei_mtn.js の setRoute・advance・tickRoutes と同じ形）。
// b.assault（下で門ごとに持たせる）があれば、最後は assault にする：塀・門ごしで敵に届かない間、
// 立ち尽くさず（確かめで見つけた「道があるのに20秒動かない兵」）門を打ちに掛かる
function setRoute(b, pts) { b._route = pts; b._routeGate = null; b._i = 0; advance(b); }
function advance(b) {
  if (!b._route || b._i >= b._route.length) {
    b.order({ id: b.tkRetreat ? 'hold' : b.assault ? 'assault' : 'attack', form: b.kind === 'ashigaru' ? 'yari' : 'line' });
    if (b.tkRetreat && b.real) b.real.facing = Math.PI;
    b._route = null; return;
  }
  const [x, z] = b._route[b._i++];
  b.order({ id: 'move', to: { x, z }, form: 'column' });
}
// 破れていない門をまとめて渡すと、生きている最初の一つを的にする（外の門が破れれば内の門、という順）
function gateAssault(...gates) {
  const target = () => { for (const g of gates) if (g && g.struct && g.struct.alive && !g.opened) return g.struct; return null; };
  target.gateOnly = true;
  return target;
}
// 陽動の手：決まった的（門）が無いので、近い城方の塀・柵を的にする（確かめで見つけた「陽動の手が20秒止まる」の直し）
function nearWallAssault(rt) {
  return (u) => {
    let best = null, bd = 45;
    for (const s of rt.army.structs) {
      if (!s.alive || !s.seg || s.team !== 1) continue;
      const mx = (s.seg[0] + s.seg[2]) / 2, mz = (s.seg[1] + s.seg[3]) / 2;
      const d = Math.hypot(u.pos.x - mx, u.pos.z - mz);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  };
}
function tickRoutes(list) {
  for (const b of list) {
    if (!b._route || deadB(b)) continue;
    // 竹束を据えている間は道順を進めない。留める処理の保存した下知と食い違わせない。
    if (b.real?._pinH) continue;
    const gate = b.assault?.gateOnly ? b.assault() : null;
    if (b._routeGate) {
      if (b._routeGate.alive && !b._routeGate.opened) continue;
      const opened = b._routeGate;
      b._routeGate = null;
      const point = b._route[b._i - 1];
      // 門の真ん中で縦隊を止めない。後列の持ち場が塀・切岸に掛かり、
      // 到着待ちから抜けられなくなる。破った門は通過して次の道の点へ寄せる。
      if (opened.seg && Math.hypot(point[0] - (opened.seg[0] + opened.seg[2]) / 2,
          point[1] - (opened.seg[1] + opened.seg[3]) / 2) < 3) {
        advance(b); continue;
      }
      b.order({ id: 'move', to: { x: point[0], z: point[1] }, form: 'column' });
    }
    if (gate?.seg && gate.alive && !gate.opened && b.real &&
        Math.hypot(b.pos.x - (gate.seg[0] + gate.seg[2]) / 2, b.pos.z - (gate.seg[1] + gate.seg[3]) / 2) < 10) {
      // 閉じた門を越す行軍の下知を止め、実兵で今の門を破る。
      b._routeGate = gate; b.order({ id: 'assault', form: 'column' }); continue;
    }
    const [x, z] = b._route[b._i - 1];
    // 縦隊の後列は門の外に残る。平均位置を待つと、到着して待機に戻った隊も次へ進めない。
    const g = b.real;
    const arrived = g && g.order === 'hold' && !g.onArrive &&
      Math.hypot(g.anchor.x - x, g.anchor.z - z) < 0.5;
    // 門前では後列の平均を待たず、先頭が道の点へ着いたら次へ送る。
    const headArrived = g?.order === 'move' && g.units.some((u) => u.alive && !u.fleeing && !u.downed && !u.woundOut && Math.hypot(u.pos.x - x, u.pos.z - z) < 1.2);
    if (arrived || headArrived || Math.hypot(b.pos.x - x, b.pos.z - z) < 2.5) advance(b);
  }
}
// 今いる曲輪から本丸へ。西口が先に抜けても、大手の隊は曲がる門を省かない。
function toHonmaru(rt, b, enterKeep = false) {
  if (deadB(b)) return;
  const F = rt.flags, p = b.pos;
  const road = [[GATE_HON.x, GATE_HON.z], [-8, 18], [-4, 16.6], [0, 18], [0, 25]];
  if (enterKeep) road.push([0, 31], [0, 35]);
  if (F.C.kuruwa.hon.test(p.x, p.z)) {
    b.assault = gateAssault(F.gates.honInner);
    setRoute(b, road.slice(3));
  } else if (F.C.kuruwa.ni.test(p.x, p.z)) {
    b.assault = gateAssault(F.gates.honOuter, F.gates.honInner);
    setRoute(b, road);
  } else if (p.x < NISHI_X) {
    b.assault = gateAssault(F.gates.karamete, F.gates.honOuter, F.gates.honInner);
    setRoute(b, [...ROAD_KARAMETE.slice(1), ...road]);
  } else {
    b.assault = gateAssault(F.gates.oteOuter, F.gates.oteInner, F.gates.gateNi, F.gates.honOuter, F.gates.honInner);
    setRoute(b, [...ROAD_OTE.slice(F.C.kuruwa.san.test(p.x, p.z) ? 7 : 1, 10), ...road]);
  }
}
// 十四部隊を十四人ずつ。物見の射手と室内の守り・居所・自分の組も合わせて約二百五十人。
function mkB(rt, o) {
  // 総勢は備の表へ。近い一組は全員が本物。塀を抜けて消える軽い後列を置かない。
  // 交戦中の消失・同じ場所への補充・将の再出現をこの戦では行わない。
  const b = makeButai(rt, { ...o, nominal: 14, real: o.real ?? 14, maxReal: 14,
    nearReal: 14, farReal: 14, noSwitch: true, lightWidth: o.at.x < NISHI_X ? 2 : 7, lightDepth: 12,
    mix: o.kind === 'ashigaru' ? { ashigaru: 0.8, samurai: 0.2 } : undefined });
  b.paperNominal = o.paperNominal; // 備の推定人数。近い実兵十四人とは別。
  if (b.light) b.light.visible = false; // 通れず本物に替えられない場所へ軽い兵を残さない。
  if (b.real) b.real.noAI = true;
  return b;
}
// 搦手の尾根道は幅六メートル。横陣の端や遠景の散らばった位置を持ち場にしない。
function mkKarameteTroops(rt, o) {
  const b = mkB(rt, { ...o, real: 0 });
  // 初めに本物へ替える位置も尾根の幅に収める。
  const canSpawn = b._canSpawn, grow = b.growReal;
  b._canSpawn = (x, z) => canSpawn(x, z) && (x >= NISHI_X - 2 || Math.abs(z) < 1.3);
  b.order({ id: 'hold', form: 'column' });
  b.growReal = (n) => {
    const made = grow.call(b, n);
    // 城攻めの道に従う。野戦の頭が隊を切岸の横へ広げないようにする。
    if (b.real) b.real.noAI = true;
    return made;
  };
  b.growReal(14);
  return b;
}
function deadB(b) { return !b || !b.real || b.real.count <= 0 || b.real.routed || b.real.units.every((u) => !u.alive || u.fleeing || u.woundOut || u.noTarget); }

// 高遠の守りは土橋と曲がる口を通って退く。本丸では奥の守りを続ける。
// 道と門の記録は準備時だけ作り、見回りは一秒ごと。共通の守備判断を変えない。
function takatoDefense(rt) {
  const F = rt.flags;
  const hon = [[2, 0], [GATE_HON.x, GATE_HON.z], [-8, 18], [-4, 16.6], [0, 18], [0, 25]];
  const san = [[4, -38], [GATE_NI.x, -24], [GATE_NI.x, GATE_NI.z], [2, 0]];
  const posts = [
    { b: F.sanSpear, zone: 'san', road: san, next: 'ni' },
    { b: F.sanGun, zone: 'san', road: san, next: 'ni' },
    { b: F.hodoinSpear, zone: 'ni', road: hon, next: 'hon' },
    { b: F.niSpear, zone: 'ni', road: hon, next: 'hon' },
  ];
  const doors = [F.gates.gateNi, F.gates.honOuter, F.gates.honInner].map((gate) => {
    const s = gate.struct, x = (s.seg[0] + s.seg[2]) / 2, z = (s.seg[1] + s.seg[3]) / 2;
    const end = gate === F.gates.gateNi ? san[san.length - 1] : hon[hon.length - 1];
    return { gate, x, z, side: Math.sign((end[0] - x) * s.nx + (end[1] - z) * s.nz) || 1, active: false };
  });
  return { usingGate: (gate) => doors.some((q) => q.gate === gate && q.active), tick() {
    if (!F.refresh || F.step < 1) return;
    for (const p of posts) {
      const b = p.b;
      if (deadB(b) || b._route) continue;
      if (p.zone === 'hon') continue;
      const lost = p.zone === 'san' ? F.sanFell : F.niFell;
      const generalDown = b.general && !b.real.units.some((u) => u.alive && u.name === b.general);
      if (!lost && !generalDown && b.real.count > 4 && b.morale >= 22) continue;
      b.tkRetreat = true; b.assault = null;
      for (const q of doors) {
        if ((p.zone === 'san') !== (q.gate === F.gates.gateNi)) continue;
        q.active = true;
        if (!q.gate.breached && !q.gate.opened) q.gate._openNow(false);
      }
      setRoute(b, p.road);
      p.zone = p.next; p.road = hon; p.next = 'hon';
      battleEvent(rt, EVENT_RETREAT, b.pos, b.real, 1, false, '城兵が土橋を渡り、奥の備えへ退く');
    }
    for (const q of doors) {
      if (!q.active || q.gate.breached) continue;
      let passed = true;
      const s = q.gate.struct;
      // 残る後列と、同じ門を使う出撃の組も待つ。秒数だけで閉めない。
      for (const p of posts) {
        if (!p.b.tkRetreat || deadB(p.b)) continue;
        for (const u of p.b.real.units) {
          if (!u.alive || u.fleeing || u.woundOut || u.noTarget) continue;
          if (((u.pos.x - q.x) * s.nx + (u.pos.z - q.z) * s.nz) * q.side < 2) { passed = false; break; }
        }
        if (!passed) break;
      }
      if (q.gate === F.gates.gateNi && (F.sallyOut || F.sallyUntil || F.sallyReturning || F.reserveDef._route)) passed = false;
      if (passed) { if (!q.gate.occupied) q.gate.close(); q.active = false; }
    }
  } };
}

const takato_siege = {
  jinkei: [TAKATO_ATTACK, TAKATO_DEFEND],
  taisho: { b: null }, // 城将の討死だけで共通処理に勝利させず、本丸の確保まで戦う。
  rangedWarning: true, // 狭間の射手が見えなくても、発射前の向きを知らせる。
  botOrders: true, // 道・木戸・供・退き口は、この戦の下知に従う。
  gateRamHold: 1.2, // 掛矢の重い一打ごとに間を置き、同じ音を鳴らし続けない。
  noWake: true, // 部隊が本物と遠景を管理する。共通の追加兵を重ねない。
  spawn: { x: 66, z: -38, heading: -Math.PI / 2 },
  world: {
    seed: 15930,
    time: 'day',
    winter: true, // 落葉樹と花は冬の姿。春の山国に夏の茂みを置かない。
    autumn: true, // 共通の枯れ草の色を使う。木は winter の姿を優先する。
    fieldStage: 'stubble',
    mist: false,
    wind: [0.8, 0.3],
    fogFar: 360,   // 開戦の所から、尾根の上の三の丸・本丸の屋根が霞まずに見える遠さ（携帯の見える遠さを掛けても 250m ほど）
    muddy: 0.1,
    climbTan: 0.70,
    terrainTags: true,     // M1：坂・道の速さ・向き変えを効かせる（西の切岸が本当に登りにくくなる）
    // 信忠の旗本の後列まで尾根道をつなぐ。門へ進む道順は変えない。
    paths: [{ pts: [[-94, 0], ...ROAD_KARAMETE], w: 3 }, ...TAKATO_PLAN.paths.map((p) => ({ pts: p.pts, w: 3 }))],
    streams: [
      { pts: [[-110, -25], [-92, -82], [0, -108], [150, -104]], w: 9, depth: 1.6 },
      { pts: [[-110, -25], [-96, 60], [0, 82], [150, 90]], w: 12, depth: 1.8 },
    ],
    height,
    tint(x, z, h, c) { c.setRGB(c.r * 1.12, c.g * .86, c.b * 1.05); },
    clear: (x, z) => distToPolyline(x, z, ROAD_OTE) < 12 || TAKATO_PLAN.paths.some((p) => distToPolyline(x, z, p.pts) < 5) || CLEAR_BOUNDS.some((k) => x >= k.x0 && x <= k.x1 && z >= k.z0 && z <= k.z1),
    trees: 500,
    tufts: 1800,
    treeDensity: (x, z) => (x < NISHI_X - 6 ? 1.2 : 0.4),
    groves: [{ x: -40, z: 30, r: 16, n: 18 }],
    fleeOut: (x, z, team) => team === 1 && z < -140,
  },

  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  setup(rt) {
    const F = rt.flags;
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完。表には出さない）
    F.hist = { castleSite: 'HIST_B', nishinaMorinobu: 'HIST_A', twoFronts: 'HIST_A', nobutadaAdvance: 'HIST_A', oneDay: 'HIST_A', cliffs: 'HIST_B', routes: 'GAME_C', ladders: 'GAME_C', lordJudgement: 'GAME_C' };
    F.step = 0; F.ek = 0; F.ak = 0; F.fow = true;
    // 傷は共通の当たり処理に任せる。時刻による体力の下限を設けない。
    resetGates(); resetLadders(); flReset();
    // 兵力の差を数で見せる（長篠城と同じ共通の関数。攻め手は織田の大軍、城はごく少数で持ちこたえる）
    strengthBanner(rt, 30000, 3000);

    // ---- 縄張り：塀・門・櫓を castle_plan.js に建てさせる（C1・C2） ----
    const C = F.C = buildCastlePlan(rt, TAKATO_PLAN, { baseHeight: castleBase, edgeW: 3, buildGates: false, buildTowers: true, life: false, team: 1 });
    C.gateObjs = takatoGates(rt);
    F.rooms = takatoLife(rt);
    takatoSpring(rt);
    F.coldBreath = takatoBreath(rt);
    F.botKuruwa = Object.values(C.kuruwa);
    const sanC = C.kuruwa.san.centroid, niC = C.kuruwa.ni.centroid, honC = C.kuruwa.hon.centroid;

    // ---- 門（C5）：枡形は一の門・二の門の二つ、それぞれに makeGate。struct.name を一つずつに直す ----
    const G = C.gateObjs;
    G.ote.outer.struct.name = '大手門（一の門）'; G.ote.inner.struct.name = OTE.name;
    G.gate_hon.outer.struct.name = '本丸門（一の門）'; G.gate_hon.inner.struct.name = GATE_HON.name;
    G.gate_ni.struct.name = GATE_NI.name;
    G.karamete.struct.name = KARAMETE.name;
    G.gate_hodoin.struct.name = GATE_HODOIN.name;
    F.gates = {
      oteOuter: makeGate(rt, G.ote.outer, { name: '大手門（一の門）', guardTeam: 1 }),
      oteInner: makeGate(rt, G.ote.inner, { name: OTE.name, guardTeam: 1 }),
      gateNi: makeGate(rt, G.gate_ni, { name: GATE_NI.name, guardTeam: 1 }),
      honOuter: makeGate(rt, G.gate_hon.outer, { name: '本丸門（一の門）', guardTeam: 1 }),
      honInner: makeGate(rt, G.gate_hon.inner, { name: GATE_HON.name, guardTeam: 1 }),
      karamete: makeGate(rt, G.karamete, { name: KARAMETE.name, guardTeam: 1 }),
      hodoin: makeGate(rt, G.gate_hodoin, { name: GATE_HODOIN.name, guardTeam: 1 }),
    };

    F.gatePairs = { ote: [F.gates.oteOuter, F.gates.oteInner], hon: [F.gates.honOuter, F.gates.honInner] };
    F.honPost = { x: 0, y: rt.world.heightAt(0, 25), z: 25 };
    F.sallyGates = [F.gates.gateNi, F.gates.oteInner, F.gates.oteOuter].map((gate, i) => {
      const s = gate.struct, x = (s.seg[0] + s.seg[2]) / 2, z = (s.seg[1] + s.seg[3]) / 2;
      return { gate, x, z, side: Math.sign((42 - x) * s.nx + (-38 - z) * s.nz) || 1, passed: false,
        outAfter: [2, 6, 8][i], backAfter: [8, 4, 2][i] };
    });
    // ---- 本丸の主殿（見た目だけ。飾り） ----
    // 城主の居所（kaito 10/1）：天守の無い戦国期の城なので、仁科盛信は主殿（茅葺・質素な館）の中。
    // 江戸期の御殿にしない（final7-1579-1582-spec 73〜74章）。旗本が北の上がり口を守り、
    // 攻め手が主殿へ上がるまでは討てない。主殿は人が上がれるよう、丸い当たり（solidR）を外す
    // 主殿は縄張り（castles/takato.js の lordSeat）から castle_plan.js が建てる：中に入れて、奥の間に城主（kaito 10/2）

    // ---- 西の切岸の梯子（C3）：足場（ROAD_NISHI の終わり）から、二の丸の西の縁のすぐ内へ ----
    const foot = { x: NISHI_X - 2, z: 8 };
    F.nishiLadder2 = placeLadder(rt.world, { foot, topY: rt.world.heightAt(-22, 6) + 0.2, topX: -22, topZ: 6, hp: 50, team: 0, name: '西の切岸の梯子' });

    // ---- 守り（仁科盛信・2,000）。区域ごとに小さく（butai.js。S1） ----
    // 門の内の口（inner）のすぐそばに立たせる：siege_gate.js は「門兵（guardTeam）が居なくなったら開く」ので、
    // 曲輪の真ん中に置くと（遠すぎて）始めから門兵が居ない事になり、すぐ開いてしまう（確かめで見つけた）
    const midOf = (s) => ({ x: (s.seg[0] + s.seg[2]) / 2, z: (s.seg[1] + s.seg[3]) / 2 });
    const oteGP = midOf(F.gates.oteInner.struct), niGP = midOf(F.gates.gateNi.struct);
    const karaGP = midOf(F.gates.karamete.struct), honGP = midOf(F.gates.honInner.struct);
    F.sanSpear = mkB(rt, { name: '三の丸の備え（諏訪勝右衛門）', general: '諏訪勝右衛門', team: 1, faction: 'takeda', kind: 'ashigaru', paperNominal: 750, armor: TAKEDA.armor, flag: TAKEDA.flag, at: { x: oteGP.x - 5, z: oteGP.z }, facing: Math.PI / 2 });
    F.sanGun = mkB(rt, { name: '三の丸の鉄砲（塀の上）', team: 1, faction: 'takeda', kind: 'gun', paperNominal: 200, armor: TAKEDA.armor, flag: TAKEDA.flag, at: { x: 20, z: -50 }, facing: Math.PI / 2 });
    F.niSpear = mkB(rt, { name: '二の丸の備え（小山田昌行）', general: '小山田昌行', team: 1, faction: 'takeda', kind: 'ashigaru', paperNominal: 400, armor: TAKEDA.armor, flag: TAKEDA.flag, at: { x: niGP.x, z: niGP.z + 5 }, facing: Math.PI });
    F.hodoinSpear = mkB(rt, { name: '西の搦手の備え', team: 1, faction: 'takeda', kind: 'bow', paperNominal: 450, armor: TAKEDA.armor, flag: TAKEDA.flag, at: { x: karaGP.x + 5, z: karaGP.z }, facing: -Math.PI / 2 });
    F.honGuard = mkB(rt, { name: '本丸の仁科盛信の衆', team: 1, faction: 'takeda', kind: 'ashigaru', paperNominal: 400, armor: TAKEDA.armor, flag: TAKEDA.flag, at: { x: honGP.x, z: honGP.z + 5 }, facing: Math.PI });
    F.reserveDef = mkB(rt, { name: '城方の予備', team: 1, faction: 'takeda', kind: 'ashigaru', paperNominal: 200, armor: TAKEDA.armor, flag: TAKEDA.flag, at: { x: 16, z: -46 }, facing: Math.PI });
    F.defenders = [F.sanSpear, F.sanGun, F.niSpear, F.hodoinSpear, F.honGuard, F.reserveDef];
    F.defendTotal = F.defenders.reduce((s, b) => s + b.nominal, 0);
    F.keep = makeLordKeep(rt, {
      name: '仁科盛信', spot: C.seat ? C.seat.spot : { x: honC.x, z: honC.z + 8 }, naka: C.seat && C.seat.naka, mouth: { x: honC.x, z: honC.z + 2 }, facing: Math.PI, guardN: 4,
      faction: 'takeda', armor: TAKEDA.armor, flag: TAKEDA.flag,
      onReach: () => rt.say('城兵', '本丸の備えを崩すな。門の内で押し返せ', 3),
    });
    F.commander = { get alive() { return !F.keep.down; }, get real() { return F.keep.lord; } };
    // castleGarrison（shiro.js・束8）の城主の判断に寄せる：'defend'→'fallback'→'surrender' の記録だけ
    // （盛信は「最後まで刀を取って戦い、城と共に果てた」筋のまま。台詞や降伏は変えず、状態の記録のみ）
    F.lordState = 'defend';

    // ---- 攻め（織田信忠の手・5,000）。小さな部隊（butai.js） ----
    F.oteSpear = mkB(rt, { name: '東の大手先手（森長可）', general: '森長可', team: 0, faction: 'oda', kind: 'ashigaru', paperNominal: 900, armor: ODA.armor, flag: TAKATO_ATTACK.sonae[1].flag, mon: TAKATO_ATTACK.sonae[1].mon, at: { x: 78, z: -38 }, facing: -Math.PI / 2 });
    F.oteGun = mkB(rt, { name: '大手の先手（鉄砲）', team: 0, faction: 'oda', kind: 'gun', paperNominal: 400, armor: ODA.armor, flag: ODA.flag, at: { x: 86, z: -46 }, facing: -Math.PI / 2 });
    F.karameteSpear = mkKarameteTroops(rt, { name: '西の搦手の手（槍）', team: 0, faction: 'oda', kind: 'ashigaru', paperNominal: 500, armor: ODA.armor, flag: ODA.flag, at: { x: -56, z: 0 }, facing: Math.PI / 2 });
    F.karameteBow = mkKarameteTroops(rt, { name: '西の搦手の手（弓）', team: 0, faction: 'oda', kind: 'bow', paperNominal: 300, armor: ODA.armor, flag: ODA.flag, at: { x: -64, z: 0 }, facing: Math.PI / 2 });
    F.nishiLadder = mkB(rt, { name: '西の切岸の手（梯子）', team: 0, faction: 'oda', kind: 'ashigaru', paperNominal: 300, armor: ODA.armor, flag: ODA.flag, at: { x: -50, z: 12 }, facing: Math.PI / 2 });
    F.yodou = mkB(rt, { name: '陽動の手', team: 0, faction: 'oda', kind: 'ashigaru', paperNominal: 200, armor: ODA.armor, flag: ODA.flag, at: { x: -54, z: -74 }, facing: 0 });
    F.reserve = mkB(rt, { name: '大手の後詰（河尻秀隆）', general: '河尻秀隆', team: 0, faction: 'oda', kind: 'ashigaru', paperNominal: 900, armor: ODA.armor, flag: ODA.flag, at: { x: 100, z: -32 }, facing: -Math.PI / 2 });
    F.nobutada = mkKarameteTroops(rt, { name: '西の織田信忠の旗本', general: '織田信忠', team: 0, faction: 'oda', kind: 'ashigaru', paperNominal: 1500, armor: ODA.armor, flag: ODA.flag, at: { x: -72, z: 0 }, facing: Math.PI / 2 });
    // 信忠は西の搦手から塀際へ進む。taisho.js の adopt() は invuln 持ちの味方の総大将に
    // 深手（討たれない）の退きを与えるので、ここで立てておく（kaito 10/1。滝川一益の手と同じ作り）
    if (F.nobutada.taishoU) F.nobutada.taishoU.invuln = true;
    if (F.nobutada.real) {
      F.nobutada.real.noAI = true; // 総大将は旗本と下知の道を歩く。
      F.nobutada.real.leaderAssault = true; // 信忠自身も門・柵を破り、城内へ乗り入れる。
    }
    F.attackers = [F.oteSpear, F.oteGun, F.karameteSpear, F.karameteBow, F.nishiLadder, F.yodou, F.reserve, F.nobutada];
    F.movers = [...F.attackers, ...F.defenders];
    F.localTroops = [...F.attackers, ...F.defenders];
    F.jinHosts = buildSonae(rt, this.jinkei);
    F.attackTotal = F.attackers.reduce((s, b) => s + b.nominal, 0);
    // 徒歩の槍：道の先が塀・門ごしで敵に届かなければ、立ち尽くさず門を打ちに掛かる（確かめで見つけた「20秒動かない兵」の直し）
    F.oteSpear.assault = gateAssault(F.gates.oteOuter, F.gates.oteInner);
    F.karameteSpear.assault = gateAssault(F.gates.karamete);
    F.reserve.assault = gateAssault(F.gates.oteOuter, F.gates.oteInner, F.gates.gateNi, F.gates.honOuter, F.gates.honInner);
    F.nobutada.assault = gateAssault(F.gates.karamete, F.gates.honOuter, F.gates.honInner);
    for (const b of [...F.attackers, ...F.defenders]) {
      const onRidge = b === F.karameteSpear || b === F.karameteBow || b === F.nobutada;
      b.order({ id: 'hold', form: onRidge ? 'column' : b.kind === 'ashigaru' ? 'yari' : 'line' });
    }

    // ---- 区域の網：東の三の丸・西の搦手の口→二の丸→本丸。南端の寺へ攻め手を誘導しない ----
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'san', name: '三の丸', test: C.kuruwa.san.test, pos: sanC, need: 4, hold: 7, gate: '大手門（一の門）', next: 'ni' },
        { id: 'hodoin', name: '搦手の口', test: (x, z) => C.kuruwa.ni.test(x, z) && x < -16 && Math.abs(z) < 8, pos: { x: -20, z: 0 }, need: 6, hold: 14, gate: KARAMETE.name, next: 'ni' },
        { id: 'ni', name: '二の丸', test: C.kuruwa.ni.test, pos: niC, need: 4, hold: 7, gate: GATE_NI.name, next: 'hon' },
        { id: 'hon', name: '本丸', test: C.kuruwa.hon.test, pos: honC, need: 4, hold: 18, honmaru: true, gate: GATE_HON.name },
      ],
      links: [['san', 'ni'], ['hodoin', 'ni'], ['ni', 'hon']],
      friendTeam: 0, enemyTeam: 1,
      // siege_zones.js の兵力比は「今、本物（real）の兵」で数える（butai.js は名目の多くを軽い大軍で持つ）。
      // 名目の 2,000 をそのまま渡すと、本物の枠（235）はいつも遥かに下回り、本丸に一人でも寄っただけで
      // 「降伏」が暴発してしまう（確かめで見つけた）。実際に本物として出せる見込みの数で渡す
      totalDefenders: 1, // 盛信は降伏しない。共通の二割降伏判定を使わない。
      commander: () => F.commander,
      noReinforce: () => true,
      quietRange: [0, 0], reserves: [],
      onFall: (id) => this.onZoneFall(rt, id),
      onHonmaru: () => this.honTaken(rt),
      onSurrender: () => {},
    });
    // ---- 縄張りの今の様子（nawabari.js・束19）：曲輪・門・ルートの数の表。読むだけで、戦の動きは変えない ----
    F.K = makeNawabari(rt, C, {
      SZ: F.SZ, team: 1, friendTeam: 0,
      gates: {
        ote: [F.gates.oteOuter, F.gates.oteInner], gate_ni: F.gates.gateNi,
        gate_hon: [F.gates.honOuter, F.gates.honInner], karamete: F.gates.karamete, gate_hodoin: F.gates.hodoin,
      },
    });
    // 束12・束31・束32：K を rt にも持たせ、軍議の俯瞰の説明・小地図の曲輪塗り分け・制圧の札に使えるようにする
    rt.nawabari = F.K;

    // ---- 城の頭（siege_ai.js・F4・C8）：守りは持ち場・門・退き・出撃、攻めは道を選ぶ。
    // 出撃の一組は、この戦の門を通る道順で動かす。共通の自動出撃へ重ねて渡さない。
    F.DA = takatoDefense(rt);
    for (const b of F.defenders) b.order({ id: 'hold', form: b.kind === 'ashigaru' ? 'yari' : 'line' });
    // 攻めの頭（軍議で作戦を選ばなければ、道の厚さ・長さ・口の狭さに揺らぎを掛けて自分で選ぶ
    // ＝味方 AI の手も同じ頭で動く【城39】。道の指図そのものは runStrategy の walkRoute に渡す）
    F.AI_ROUTES = [
      { id: 'ote', defThickness: 3.2, pathLen: 60, chokeWidth: 4.2 },
      { id: 'karamete', defThickness: 1.6, pathLen: 46, chokeWidth: 4.4 },
    ];

    // ---- 竹束の寄せ（taketaba.js）：大手・搦手の先手は竹束を押し立て、ゆっくり寄せ場まで進んで撃ち合う ----
    const oteOpen = () => F.gates.oteInner.opened, karaOpen = () => F.gates.karamete.opened;
    F.TA = makeTabaAdvance(rt, {
      speed: 1.8, holdMelee: 4, // 大手の寄せと据え置きを短くし、最初の斬り合いへつなぐ。
      items: [
        { g: F.oteSpear, yose: { x: 48, z: -38 }, until: oteOpen }, { g: F.oteGun, yose: { x: 50, z: -46 }, until: oteOpen },
        { g: F.karameteSpear, yose: { x: -40, z: 0 }, until: karaOpen }, { g: F.karameteBow, yose: { x: -44, z: 0 }, until: karaOpen },
      ],
      avoid: [this.spawn, { x: 64, z: -34 }],
    });
    // 門が開いたら、味方は自分の組と同じ下知で続く。

    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 64, z: -34 }, -Math.PI / 2, [{ kind: 'spear', n: Math.min(n, 16) }]);

    // 塀際・切岸に重ねていた架空の交戦は置かない。射撃は実兵が行う。
    F.lines = [];
    F.stageCheck = 0; F.honHold = 0;
    rt.world.setTime('morning');
    rt.setPhase('brief');
    sfx('siegeDistant', 0.4);
    rt.obj('main', hi(rt) ? '森長可の一隊を率い、東の大手道へ寄せよ' : '森長可の先手で、東の大手道へ寄せよ', 'main', true);
    // ②降伏の勧め→断る（final7-1579-1582-spec 79章「流れ：1包囲→2降伏の勧め→3攻撃開始…」）。
    // 使者を出す段を一言で見せてから、信忠が攻め掛かりを告げる
    rt.say('森長可', `${nm(rt)}、盛信は降らぬ。川の崖を避け、東の大手道へ寄せよ`, 5);
    rt.after(6, () => rt.say('使番', '信忠様の下知じゃ。西の尾根からも寄せる。両口から攻め入れ', 4));
    rt.after(8, () => this.assault(rt));
  },

  // ① 軍議で選んだ作戦（無ければ攻めの頭が自分で選ぶ）に沿って、部隊を動かす（C9）
  assault(rt) {
    const F = rt.flags;
    if (F.step >= 1 || F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('assault');
    sfx('horagai', 0.85);
    announceAdvance(rt, '織田信忠');
    F.strategy = window.__takatoStrategy || F.strategy || 'ote';
    this.runStrategy(rt, F.strategy);
    for (const c of F.lines) c.go();
    rt.after(12, () => { if (!F.ending) volleyAll(F.lines, 'B'); });
    rt.after(6, () => {
      if (F.ending || rt.over || F.sanFell || F.niFell || deadB(F.reserveDef)) return;
      F.sallyOut = true; F.sallyUntil = 0;
      // 三の丸に備えた予備が、大手の曲がる口を歩いて抜ける。
      for (const q of F.sallyGates) { q.passed = false; if (!q.gate.breached) q.gate._openNow(false); }
      setRoute(F.reserveDef, [[25.075, -46], [25.075, -42.5], [23.5, -38], [28, -38], [42, -38]]);
      rt.obj('main', '大手へ出た城兵を退け、門への道を空けよ', 'main', true);
      rt.say('森長可', '城兵が打って出た！　道を譲るな。槍をそろえて押し返せ', 4);
      rt.marker('sally', F.reserveDef.pos, '打って出た城兵', { red: true });
    });
    rt.after(45, () => {
      if (F.ending || rt.over || F.niFell || deadB(F.nobutada)) return;
      setRoute(F.nobutada, ROAD_KARAMETE.slice(1));
      F.signalReady = true;
    });
    // 陽動の手：どの作戦でも、西の切岸の下へ出て塀際を脅す（決まった的が無いまま hold で待ち続けて、
    // 他家の見張りに「道があるのに20秒動かない」と見つかった兵。kaito 10/1）
    F.yodou.assault = nearWallAssault(rt);
    setRoute(F.yodou, [...ROAD_YODOU]);
    rt.marker('san', F.sanSpear.pos, '三の丸の備え', { red: true });
    // 本丸の衆と本丸の門の印は、二の丸の守りが崩れてから出す（開戦で札が四つ固まって浮かないように。見回り 10/3）
  },

  // C9 の四つの作戦：①大手だけ ②大手で引きつけて搦手 ③西の切岸を梯子で ④二の丸を取って本丸を撃つ
  runStrategy(rt, strat) {
    const F = rt.flags;
    strat = ['ote', 'karamete', 'nishi', 'ni_bombard'].includes(strat) ? strat : 'ote';
    F.pushVia = strat;
    // 自分は大手の先手。選ぶのは支え方で、両口の総攻めは必ず行う。
    F.oteSpear.assault = gateAssault(F.gates.oteOuter, F.gates.oteInner);
    setRoute(F.oteSpear, ROAD_OTE.slice(1, 8));
    setRoute(F.oteGun, ROAD_OTE.slice(1, 2));
    F.oteGun._pin = true;
    setRoute(F.karameteSpear, ROAD_KARAMETE.slice(1));
    setRoute(F.karameteBow, ROAD_KARAMETE.slice(1, 2));
    if (strat === 'karamete') setRoute(F.karameteBow, ROAD_KARAMETE.slice(1));
    if (strat === 'nishi') setRoute(F.nishiLadder, ROAD_NISHI.slice(1));
    rt.obj('main', '東の大手門を破り、三の丸へ踏み込め', 'main', true);
    rt.obj('support', strat === 'karamete' ? '西の搦手の組が進む。自分は大手で敵を引きつけよ' : strat === 'nishi' ? '西の梯子の組が登る。自分は大手の口を支えよ' : strat === 'ni_bombard' ? '二の丸を取ったら射手の場所を守れ。まず大手の組を支えよ' : '大手の槍と鉄砲をそろえ、門の攻めを支えよ', 'side');
    rt.say('森長可', '槍をそろえ、竹束の陰へ寄れ。矢玉を避け、門へ取り付け', 5);
    rt.objProgress('support', '竹束と敵の間へ出ない。束のすぐ後ろを歩く');
    rt.after(16, () => {
      if (!F.ending && !rt.over) rt.bark('竹束を押し立て、門へ寄せよ。矢玉が来たら陰へ入れ', true);
    });
  },

  // 区域が落ちた（siege_zones.js の onFall）
  // 本丸の備えを崩したら、旗の周りを守って攻め手を通す
  honTaken(rt) {
    const F = rt.flags;
    if (F.honFell || F.ending) return;
    if (!F.niFell) { F.pendingHon = true; return; }
    F.honFell = true; F.honT = rt.t;
    rt.banner('本丸へ攻め入る', '主殿の守りを崩し、広場を取る');
    rt.obj('main', '主殿の守りを崩し、本丸に残る城兵を退けよ', 'main', true);
    rt.say('森長可', '門を抜けたぞ。広場を取れ！　旗の周りを空けるな', 4);
    rt.unmark('hon'); rt.unmark('gateHon'); rt.unmark('next');
    rt.marker('rally', F.keep.guide, '主殿の守りを崩す');
    for (const b of [F.oteSpear, F.reserve, F.nobutada, F.karameteSpear])
      toHonmaru(rt, b, true);
  },

  onZoneFall(rt, id) {
    const F = rt.flags;
    if (F.ending) return;
    if (id === 'san' && !F.sanFell) {
      F.sanFell = true; F.sanT = rt.t; F.sallyUntil = 0; F.sallyOut = false; F.sallyReturning = false;
      rt.unmark('san'); rt.unmark('sally');
      if (F.niFell) return;
      rt.obj('main', '二の丸の土橋を押さえ、門の内の反撃を退けよ', 'main', true);
      rt.say('森長可', '次は二の丸だ。堀へ散るな！　土橋に槍を集めて門を押せ', 4);
      F.oteSpear.assault = gateAssault(F.gates.gateNi);
      setRoute(F.oteSpear, [[4, -38], [GATE_NI.x, GATE_NI.z], [2, 0]]);
      F.reserve.assault = gateAssault(F.gates.oteOuter, F.gates.oteInner, F.gates.gateNi);
      // 既に三の丸へ入った後詰を、外の寄せ場へ引き返させない。
      if (!deadB(F.reserve)) setRoute(F.reserve, ROAD_OTE.slice(F.C.kuruwa.san.test(F.reserve.pos.x, F.reserve.pos.z) ? 7 : 1, 10));
      rt.marker('next', GATE_NI, '二の丸の土橋');
      setRoute(F.reserveDef, [[4, -38], [GATE_NI.x, -24]]);
      battleEvent(rt, EVENT_REINFORCEMENT, F.reserveDef.pos, F.reserveDef.real, 1, true, '二の丸の門から城兵が押し返す');
    } else if (id === 'hodoin') {
      F.hodoinFell = true;
    } else if (id === 'ni' && !F.niFell) {
      if (!F.sanFell && !F.gates.karamete.opened) { F.pendingNi = true; return; }
      F.niFell = true; F.niT = rt.t;
      rt.world.setTime('day');
      rt.unmark('next'); rt.unmark('gateOte'); rt.unmark('sally');
      F.sallyOut = false; F.sallyUntil = 0; F.sallyReturning = false;
      rt.obj('main', '本丸の門を破り、城兵の最後の備えを崩せ', 'main', true);
      rt.say('使番', '本丸の土橋へ寄せよとの下知じゃ。狭い口で足を止めるな', 4);
      rt.marker('next', GATE_HON, '本丸への土橋');
      const road = [[GATE_HON.x, GATE_HON.z], [-8, 18], [-4, 16.6], [0, 18], [0, 25]];
      for (const b of [F.oteSpear, F.reserve, F.nobutada, F.karameteSpear]) toHonmaru(rt, b);
      // 西の射手も、通れる搦手の道から二の丸へ続く。
      if (!deadB(F.karameteBow)) setRoute(F.karameteBow, ROAD_KARAMETE.slice(1));
      F.oteGun._pin = false;
      setRoute(F.oteGun, [[28, -38], [23.5, -38], [25.075, -42.5], [25.075, -46], [16, -46], [4, -38], [GATE_NI.x, -18], [2, 0]]);
      if (F.pushVia === 'ni_bombard') {
        rt.say('森長可', '二の丸に鉄砲をそろえよ。顔を出す城兵を狙え', 3);
      }
      setRoute(F.reserveDef, road);
    } else if (id === 'hon') this.honTaken(rt);
  },

  // 主人公だけを待たず、実際に味方が口を越え、守りが崩れたかを見る。
  checkAttrition(rt) {
    const F = rt.flags;
    const held = F.attritionHeld || (F.attritionHeld = {});
    const occupied = (id, foothold = false) => {
      let n = 0, enemy = 0;
      for (const u of rt.army.units) {
        if (!siegeFighter(u) || !F.C.kuruwa[id].test(u.pos.x, u.pos.z)) continue;
        if (u.team === 0) n++; else enemy++;
      }
      const zone = F.SZ.byId[id];
      if (foothold) return n >= zone.need;
      if (n < zone.need || enemy > 0 || rt.t < zone.quietUntil) { delete held[id]; return false; }
      if (held[id] == null) held[id] = rt.t;
      return rt.t - held[id] >= zone.hold;
    };
    if (F.gates.oteInner.opened && occupied('san') && deadB(F.sanSpear) && deadB(F.sanGun)) this.onZoneFall(rt, 'san');
    if ((F.gates.gateNi.opened || F.gates.karamete.opened) && occupied('ni') && deadB(F.niSpear)) this.onZoneFall(rt, 'ni');
    if (F.gates.honInner.opened && occupied('hon', true) && deadB(F.honGuard)) this.honTaken(rt);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending || !rt.player.u.alive || !F.keep.down) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('san'); rt.unmark('hon'); rt.unmark('next'); rt.unmark('rally'); rt.unmark('gateOte'); rt.unmark('gateHon'); rt.unmark('sally');
    rt.objDone('main'); rt.objRemove('support');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '高遠城を攻め落とした', pts: 24 }; }, '任務達成・高遠城を攻め落とした');
    sfx('kane', 0.5);
    rt.banner('高遠城、落ちる', '盛信は討死。本丸の守りが崩れた');
    // 盛信が討たれると、周りの武田兵の士気は崩れる（城の主が果てた知らせは、曲輪ごとの備へ広がる）
    for (const b of F.defenders || []) {
      b.morale = Math.min(b.morale, 5);
      if (b.real) { b.real.noRout = false; b.real.morale = 5; }
    }
    battleEvent(rt, EVENT_RETREAT, F.C.kuruwa.hon.centroid, F.honGuard.real, 1, true, '本丸の備えが崩れた。高遠城、落ちる');
    for (const c of F.lines) c.rout('B');
    if (F.keep && F.keep.down) rt.after(1.5, () => rt.say('足軽', '盛信公が果てられた！　武田の兵が、総崩れじゃ！', 3));
    rt.say('使番', '本丸を押さえた。手をそろえ、城内を固めよとの下知じゃ', 4.5);
    rt.after(6, () => rt.say('使番', '城内を固めたら甲斐へ進む。勝頼を追うぞ', 3));
    rt.player.u.invuln = true;
    rt.finish({}, 10);
  },

  // 東の大手は外の冠木門から内の櫓門へ、曲がった広場を通って入る。
  // 枡形（一の門・二の門が近い）は、今打つべき門だけに印と残りの棒を出す。壊れた・開いた門は外し、
  // 奥の門へ切り替える（二つとも済んだら印を消す。確かめで見つけた：両方出ると、どちらを打つか迷う）
  gateMarker(rt, id, pair) {
    const g = pair.find((q) => q.struct.alive && !q.opened);
    const key = id + 'Target';
    if (rt.flags[key] === (g || null)) return;
    rt.flags[key] = g || null;
    if (!g) { rt.unmark(id); return; }
    const mid = { x: (g.struct.seg[0] + g.struct.seg[2]) / 2, z: (g.struct.seg[1] + g.struct.seg[3]) / 2 };
    rt.marker(id, mid, g.name, { h: 4.8 });
  },

  // 目の前の門と曲輪の変化は、その場の下知にする。遠い使番の到着を待たない。
  guideAssault(rt) {
    const F = rt.flags;
    if (F.step < 1 || F.honFell) return;
    let text;
    if (F.niFell) text = F.gates.honInner.opened
      ? '本丸へ踏み込み、最後の備えを崩せ'
      : '本丸の門を破り、城兵の最後の備えを崩せ';
    else if (F.sanFell) text = F.gates.gateNi.opened
      ? '二の丸へ踏み込み、残る城兵を退けよ'
      : '二の丸の土橋を押さえ、門の内の反撃を退けよ';
    else if (F.sallyOut || F.sallyUntil) text = '大手へ出た城兵を退け、門への道を空けよ';
    else if (F.gates.oteInner.opened) text = '大手の口を抜け、三の丸の城兵を退けよ';
    else if (F.gates.oteOuter.opened) text = '大手の口を曲がり、奥の門を破れ';
    else text = '東の大手門を破り、三の丸へ踏み込め';
    if (F.guideText !== text) { F.guideText = text; rt.obj('main', text, 'main', true); }
  },

  update(rt, dt) {
    const F = rt.flags;
    F.coldBreath?.(dt);
    butaiTick(rt, dt);
    if (F.ending || rt.over || !rt.player.u.alive) return;
    const hit = rt.player.lastHit;
    // 同じ守り方の知らせを、被弾のたびに出し直さない。
    if (hit?.ranged && rt.t - hit.t < 2 && !F.gunHelpSaid) {
      F.gunHelpSaid = true; rt.bark('矢玉が来る。竹束の陰か、門の曲がり角へ退け', true);
    }
    F.stageCheck -= dt;
    F.refresh = F.stageCheck <= 0;
    if (F.refresh) F.stageCheck = 1;
    if (F.gates && F.refresh) {
      if (!F.sanFell && !F.niFell) this.gateMarker(rt, 'gateOte', F.gatePairs.ote);
      if (F.niFell && !F.honFell) this.gateMarker(rt, 'gateHon', F.gatePairs.hon);
      if (F.niFell && !F.honMk && !F.honFell) { F.honMk = true; rt.marker('hon', F.honGuard.pos, '本丸の備え', { red: true }); }
    }
    if (F.TA) F.TA.tick(dt);
    for (const room of F.rooms || []) roomTick(room, rt.player?.u?.pos);
    tickTabas(rt, dt);
    tabaInteractTick(rt, { allowPush: F.step >= 1, team: 0 });
    updateGates();
    updateLadders(rt.army, dt);
    // 死傷で味方の全体が四人未満になっても、消えた人数を待たせない。
    // 地域の敵を退ける条件と、確保に要る時間は保つ。
    if (F.refresh) {
      let alive = 0;
      for (const u of rt.army.units)
        if (u.team === 0 && siegeFighter(u)) alive++;
      F.captureNeed = Math.max(1, Math.min(4, alive));
      for (const z of F.SZ.zones) z.need = Math.max(1, Math.min(z.id === 'hodoin' ? 6 : 4, alive));
    }
    if (F.SZ) F.SZ.tick(dt);
    if (F.K) F.K.tick(dt);
    if (F.DA) F.DA.tick(dt);
    if (F.step >= 1) { tickRoutes(F.movers); if (F.refresh) this.checkAttrition(rt); }

    // 西の切岸の梯子：着いた兵を一人ずつ登らせ、守りが時おり押し倒す
    if (F.nishiLadder2 && F.nishiLadder2.hp > 0) {
      for (const u of (F.nishiLadder.real ? F.nishiLadder.real.units : [])) {
        if (!u.alive || u.fleeing || u.woundOut || u.noTarget || u.group?.routed || u.climb) continue;
        if (Math.hypot(u.pos.x - F.nishiLadder2.x, u.pos.z - F.nishiLadder2.z) < 2.2) startClimb(u, F.nishiLadder2);
      }
      F._kdT = (F._kdT || 0) - dt;
      if (F._kdT <= 0) {
        F._kdT = 6;
        let defender = false;
        for (const u of rt.army.units) if (u.team === 1 && u.alive && !u.fleeing && !u.woundOut && !u.noTarget && !u.isStruct && Math.hypot(u.pos.x - F.nishiLadder2.topX, u.pos.z - F.nishiLadder2.topZ) < 4 && Math.abs(u.pos.y - F.nishiLadder2.y1) < 3) { defender = true; break; }
        if (defender && Math.random() < 0.4) {
          const fallen = knockDown(F.nishiLadder2, rt.army);
          if (fallen && F.pushVia === 'nishi' && !F.ladderFallSaid) {
            F.ladderFallSaid = true; rt.obj('support', '西の登る兵が押し落とされた。大手の先手を支えよ', 'side');
            rt.say('使番', '西の登る兵が押し落とされた。大手の組を支え、両口の攻めを保て', 4);
          }
        }
      }
    }
    if (F.pushVia === 'nishi' && F.nishiLadder2?.hp <= 0 && !F.ladderLost) {
      F.ladderLost = true;
      // 倒れた梯子を待たず、既にいる兵を尾根の門へ回す。
      F.nishiLadder.assault = gateAssault(F.gates.karamete);
      if (F.niFell) toHonmaru(rt, F.nishiLadder, F.honFell);
      else if (!deadB(F.nishiLadder)) setRoute(F.nishiLadder, ROAD_KARAMETE.slice(1));
      rt.obj('support', '西の梯子は倒れた。東の大手で先手を支えよ', 'side');
      rt.say('使番', '西の梯子が倒れた。大手の組へ戻り、門の攻めを支えよ', 4);
    }
    // 鉄砲の損害は実際の射撃だけで決める。時刻だけで本丸の兵を減らさない。
    // 段の札は一秒に一度だけ。毎コマ、道や印を作り直さない。
    if (F.step >= 1 && F.refresh) {
      // 三の丸を取ってからでは、先手が減った時に口を越す人数をそろえられない。
      // 外の門が開くか先手が崩れたら、既にいる後詰を同じ道から寄せる。
      if (!F.sanFell && !F.niFell && !F.reserveSent && !deadB(F.reserve) &&
          (F.gates.oteOuter.opened || deadB(F.oteSpear))) {
        F.reserveSent = true;
        F.reserve.assault = gateAssault(F.gates.oteOuter, F.gates.oteInner);
        setRoute(F.reserve, ROAD_OTE.slice(1, 8));
      }
      if (F.signalReady && !F.signalGiven && !deadB(F.nobutada) && Math.hypot(F.nobutada.pos.x - KARAMETE.x, F.nobutada.pos.z - KARAMETE.z) < 18) {
        F.signalGiven = true;
        battleEvent(rt, EVENT_COMMANDER_ADVANCE, F.nobutada.pos, F.nobutada.real, 0, true, '信忠が西の塀際へ出た。両口から押し入れ');
        rt.say('使番', '信忠様が西の塀際へ出た！　両口から乗り入れとの下知じゃ', 4);
        leanAll(F.lines, 'A', 0.55); volleyAll(F.lines, 'A');
      }
      if ((F.sallyOut || F.sallyUntil || F.sallyReturning) && deadB(F.reserveDef)) {
        F.sallyOut = false; F.sallyUntil = 0; F.sallyReturning = false;
        for (const q of F.sallyGates) if (!q.gate.breached && !F.DA.usingGate(q.gate)) q.gate.close();
        rt.unmark('sally');
      }
      // 門へ着く前から半平面の向こうにいる兵もいる。曲がった道の該当の門を抜けてから閉める。
      if (F.sallyOut && !F.reserveDef._route && !deadB(F.reserveDef)) {
        F.sallyOut = false; F.sallyUntil = rt.t + 42;
      }
      if (F.sallyOut || F.sallyUntil || F.sallyReturning) for (const q of F.sallyGates) {
        if (q.passed || q.gate.breached || F.DA.usingGate(q.gate)) continue;
        if (F.reserveDef._route && F.reserveDef._i < (F.sallyReturning ? q.backAfter : q.outAfter)) continue;
        const s = q.gate.struct; let passed = true;
        for (const u of F.reserveDef.real?.units || []) {
          if (!u.alive || u.fleeing || u.woundOut) continue;
          if (((u.pos.x - q.x) * s.nx + (u.pos.z - q.z) * s.nz) * q.side < 2) { passed = false; break; }
        }
        if (passed) { q.passed = true; q.gate.close(); }
      }
      if (F.sallyUntil && rt.t >= F.sallyUntil) {
        for (const q of F.sallyGates) if (!q.gate.breached) q.gate._openNow(false);
        F.sallyUntil = 0; F.sallyReturning = true;
        for (const q of F.sallyGates) { q.side = -q.side; q.passed = false; }
        rt.unmark('sally');
        setRoute(F.reserveDef, [[28, -38], [23.5, -38], [25.075, -42.5], [25.075, -46], [16, -46], [4, -38], [GATE_NI.x, -18], [2, 0]]);
        battleEvent(rt, EVENT_RETREAT, F.reserveDef.pos, F.reserveDef.real, 1, false, '打って出た城兵が門の内へ退く');
      }
      if (F.pendingNi && (F.sanFell || F.gates.karamete.opened)) this.onZoneFall(rt, 'ni');
      if (F.pendingHon && F.niFell) this.honTaken(rt);
      this.guideAssault(rt);
      if (!F.honFell) {
        if (F.niFell) rt.objProgress('main', F.gates.honInner.opened ? '本丸の備えの印へ。味方と城兵を退けよ' : '本丸の土橋の印へ。門を破り、最後の備えを崩せ');
        else if (F.sanFell) rt.objProgress('main', F.gates.gateNi.opened ? '二の丸へ踏み込み、残る備えを崩せ' : '二の丸の土橋の印へ。門を押せ');
        else rt.objProgress('main', F.sallyOut || F.sallyUntil ? '城兵を押し返し、東の大手道を進め' : F.gates.oteInner.opened ? '口を曲がり、三の丸の備えの印へ進め' : '東の門の印へ。曲がった道を進め');
      }
      if (rt.t - F.stepT > 320 && !F.lastPush) {
        F.lastPush = true;
        rt.say('森長可', '後詰を前へ！　攻め口へ集まり、残る備えを押し崩せ', 4);
        if (!deadB(F.reserve)) {
          if (F.honFell || F.niFell) {
            toHonmaru(rt, F.reserve, F.honFell);
          } else {
            F.reserve.assault = F.sanFell ? gateAssault(F.gates.gateNi) : gateAssault(F.gates.oteOuter, F.gates.oteInner);
            setRoute(F.reserve, ROAD_OTE.slice(1, F.sanFell ? 10 : 8));
          }
        }
        leanAll(F.lines, 'A', 0.8);
      }
    }
    if (F.refresh) {
      for (const b of F.localTroops) if (deadB(b) && !b.tkRouted) {
        b.tkRouted = true;
        if (b.light) b.light.rout();
      }
      if (F.keep.down && !F.lordDown) {
        F.lordDown = true;
        for (const b of F.defenders) if (b.real) {
          b.real.noRout = false; b.real.morale = Math.min(b.real.morale, 15);
        }
        rt.marker('rally', { x: 0, z: 25 }, '味方と本丸を固める');
      }
      if (rt.canFailMission() && F.step >= 1 && deadB(F.oteSpear) && deadB(F.reserve) && deadB(F.karameteSpear) && deadB(F.nobutada)) {
        F.ending = true;
        rt.setPhase('end'); rt.objRemove('support'); rt.objProgress('main', ''); rt.objFail('main'); rt.tracker.main = false;
        for (const id of ['san', 'hon', 'next', 'rally', 'gateOte', 'gateHon', 'sally']) rt.unmark(id);
        rt.banner('先手が崩れた。退け', '攻めは後の備えに任せ、味方の旗へ戻る');
        rt.player.u.invuln = true;
        rt.finish({}, 8); return;
      }
    }
    if (F.keep) F.keep.tick();
    // 時間だけで勝ちにはしない。本丸内で旗を守り、最後の備えを崩して決着。
    if (F.honFell) {
      const p = rt.player.u.pos;
      const near = siegeFighter(rt.player.u) && Math.hypot(p.x, p.z - 25) < 14 &&
        F.C.kuruwa.hon.test(p.x, p.z) && Math.abs(p.y - F.honPost.y) < 3 &&
        !rt.army.wallBetween(p, -1, F.honPost);
      const need = F.captureNeed || 4;
      let enemy = 0, friend = 0;
      for (const u of rt.army.units)
        if (siegeFighter(u) && u.team === 1 && F.C.kuruwa.hon.test(u.pos.x, u.pos.z)) enemy++;
      for (const u of rt.army.units)
        if (siegeFighter(u) && u.team === 0 && Math.hypot(u.pos.x, u.pos.z - 25) < 14 && F.C.kuruwa.hon.test(u.pos.x, u.pos.z) &&
            Math.abs(u.pos.y - rt.world.heightAt(0, 25)) < 3 &&
            !rt.army.wallBetween(u.pos, -1, F.honPost)) friend++;
      if (near && F.keep.down && enemy === 0 && friend >= need) F.honHold += dt;
      else F.honHold = Math.max(0, F.honHold - dt);
      if (F.refresh) rt.objProgress('main', !F.keep.down ? '主殿の印へ。味方と入り、奥の盛信を討て' : enemy ? '本丸に敵が残る。味方と押し返せ' : friend < need ? `旗の周りの味方 ${friend}／${need}人。組を集めよ` : !near ? '本丸の旗へ戻り、味方と守れ' : `味方と本丸を固めよ。あと ${Math.max(0, Math.ceil(12 - F.honHold))}秒`);
      if (F.honHold >= 12) this.win(rt);
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    // 死傷は部隊の通常の集計に任せる。局地の一人を全軍の数十人へ換算しない。
    if (v.isStruct || v.group?.civ || v.type === 'porter') return;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  // 崩れた知らせは共通の戦況へ任せ、同じ隊の台詞を重ねない。
};

// 開戦時の総勢の目安。近い一組の死傷から全軍の残数を逆算しない。
takato_siege.force = () => ({ a: 30000, a0: 30000, b: 3000, b0: 3000 });
takato_siege.sides = { a: { name: '織田軍（開戦時の総勢・目安）', mon: 'oda' }, b: { name: '武田軍（開戦時の総勢・目安）', mon: 'takeda' } };
takato_siege.famous = []; // 両将は持ち場に最初からいる。別の隊へ追加しない。
takato_siege.date = (rt) => `天正十年三月二日　早春・${rt.flags.niFell ? '昼' : '朝'}`;
takato_siege.history = '信長公記巻十五によれば、天正十年三月二日、森長可・団平八・河尻秀隆・毛利河内守・小笠原信嶺らが大手へ、信忠は尾根続きの搦手へ寄せた。大手では城兵が打って出て数刻戦い、信忠自身も柵を破り塀へ上がって突入を命じた。両口の兵が城内で激しく戦い、盛信らは討たれ、その日のうちに落城した。信濃史料は兼見卿記ほかも挙げて三月二日の落城を記す。織田三万・城兵三千ともいうが、総数は諸説ある。戦国期の大手は東、搦手は西。七曲輪の位置関係は伊那市の保存活用計画を参考にした。法幢院は南端の寺、笹曲輪は本丸の南、勘助曲輪は西。曲輪・川・門・館の細かな寸法、天気、竹束・梯子・鉄砲の下知は復元。近い兵は各備えの前の一組だけで、総勢の全員を城内へ置くものではない。二の丸は本丸より低く、鉄砲は見通せる城兵を撃つ。 各備えの兵数と将ごとの細かな持ち場は、家中の組み方と地形から復元した目安で、史料に確かな布陣図が伝わるという意味ではない。';

// 軍議（gungi.js・C6）：城を回して見て、作戦を一つ選ぶ【城19〜22・68】
takato_siege.gungi = (rt) => {
  const F = rt.flags;
  if (!rt.G.lord) return null; // 足軽は全軍の攻め方を選ばず、森の下知に従う。
  const G = {
    center: { x: 0, z: 0 }, dist: 130,
    // 束31：info を足し、押すと短い札が出るように（俯瞰の説明）
    landmarks: [
      { name: '大手門', x: OTE.x, z: OTE.z, info: '東の正門。森長可の先手が西へ攻める' },
      { name: '搦手門', x: KARAMETE.x, z: KARAMETE.z, info: '西の尾根道。信忠の旗本が東へ攻め入る' },
      { name: '三の丸', x: 0, z: -38, info: '大手門のすぐ内。守備兵が多い' },
      { name: '二の丸', x: 0, z: -2, info: '城の中心。喰い違いの門が続く' },
      { name: '法幢院曲輪', x: 36, z: 59, info: '本丸の南東に続く曲輪' },
      { name: '本丸', x: 0, z: 29, info: '最後の備え。堀と土橋を越えて旗の周りを取る' },
      { name: '西の切岸', x: NISHI_X, z: 8, info: '道が狭い　梯子でしか登れない' },
    ],
    nawabari: F.K,
    lines: [
      { name: '三の丸', owner: '敵' }, { name: '法幢院曲輪', owner: '敵' }, { name: '二の丸', owner: '敵' }, { name: '本丸', owner: '敵' },
    ],
    units: [{ id: 'main', name: '織田信忠の旗本', group: () => F.nobutada && F.nobutada.real, nominal: () => (F.nobutada ? F.nobutada.aliveNominal() : 0) }],
    routes: [
      { id: 'ote', name: '両口から攻め、大手を厚くする' },
      { id: 'karamete', name: '両口から攻め、信忠の搦手を支える' },
      { id: 'nishi', name: '別働の隊は西の梯子へ。自分は東の大手を守る' },
      { id: 'ni_bombard', name: '二の丸を取ってから鉄砲を進め、城兵を抑える' },
    ],
    default: { main: 'ote' },
    enemy: [
      { name: '三の丸の備え', known: false },
      { name: '法幢院曲輪の備え', known: false },
      { name: '二の丸・本丸の備え', known: false },
    ],
    cinema: { attackers: { x: 96, z: -38 }, gate: { x: OTE.x, z: OTE.z }, defenders: { x: F.honGuard ? F.honGuard.pos.x : 0, z: F.honGuard ? F.honGuard.pos.z : 29 } },
    onStart: (assign) => takato_siege.onGungiStart(rt, assign),
  };
  // F9：bot・sim で確かめる時、作戦を渡していれば window.__takatoStrategy で決め打ち。
  // 渡していなければ（AI どうしの確かめ）軍議の札を出さず、攻めの頭（siege_ai.js）に選ばせる
  if (window.__takatoStrategy) { takato_siege.onGungiStart(rt, { main: window.__takatoStrategy }); return null; }
  if (/[?&]bot/.test(location.search)) return null;
  return G;
};
takato_siege.onGungiStart = (rt, assign) => { rt.flags.strategy = ['ote', 'karamete', 'nishi', 'ni_bombard'].includes(assign?.main) ? assign.main : 'ote'; };

// 素直な遊び手：敵へ向かって戦い、無ければ大手へ
// 枡形の折れと土橋を省かず通る。道と門の対応は準備時に一度だけ作る。
const BOT_ROAD = [...ROAD_OTE.slice(0, 11), [-8, 18], [-4, 16.6], [0, 18], [0, 25]];
const BOT_GATES = { 2: 'oteOuter', 4: 'oteInner', 8: 'gateNi', 10: 'honOuter', 12: 'honInner' };
takato_siege.botBrain = (b, inp, { goTo, patientStrike }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  b.botFollowingTaba = false;
  if (!u.alive || F.ending) return;
  // 下知の前に単独で門へ走り込まず、味方と同じ寄せの合図を待つ。
  if (F.step < 1) {
    b.botFollowingTaba = true;
    inp.runHeld = false; inp.guardHold = false; inp.leftPressed = false;
    return;
  }
  // 大手の先手が竹束を運び、据えて撃ち合う間は、その陰から寄せる。
  // 構えだけでは鉄砲を防げない。目の前の城兵には従来どおり応戦する。
  if (!F.gates.oteOuter.opened && F.gates.oteOuter.struct.alive &&
      !b.army.nearestEnemy(u, 4, (o) => !o.fleeing && !o.noTarget &&
        Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, u.team, o.pos, false))) {
    const it = F.TA && F.TA.items.find((it) => it.g === F.oteSpear);
    if (it && it.st !== 'free') {
      let tb = null, bd = Infinity;
      for (const t of it.tabas) {
        // 道端の束を追って川の崖へ横切らず、大手道の芯の束を使う。
        if (Math.abs(t.z + 38) > 1.2) continue;
        const d = Math.hypot(t.x - u.pos.x, t.z - u.pos.z);
        if (d < bd) { tb = t; bd = d; }
      }
      if (tb) {
        b.botFollowingTaba = true;
        inp.runHeld = false; inp.guardHold = false; inp.leftPressed = false;
        goTo(p, inp, tb.x - Math.sin(tb.rot) * 1.4, -38, 0.5);
        return;
      }
    }
  }
  // 門の途中から曲輪の敵へ直進すると、枡形の折れを飛ばして壁際で撃たれ続ける。
  // 近い打ち手には応戦し、遠い敵を追うのは同じ曲輪へ入ってから。
  let here = null;
  if ((F.botRoadI ?? 1) > 7) {
    for (const k of F.botKuruwa) if (k.test(u.pos.x, u.pos.z)) { here = k; break; }
  }
  // 近い敵の隙を突く間も、横から自分へ打ち込む兵を先に受ける。
  // この戦は性格の頭が構えを上書きしないため、ここで実際の打ち手へ向く。
  const attacker = b.army.nearestEnemy(u, 8, (o) => !o.isStruct && !o.fleeing && !o.woundOut && !o.noTarget &&
    // 柵を越して届く槍も受ける。通れない事と、武器が届かない事は分ける。
    Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(o.pos, -1, u.pos,
      (o.wpnKind || o.lookWeapon) === 'spear' && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) <= o.reach + 0.3) &&
    ((o.atk && !o.atk.ranged && !o.atk.bow && o.atk.target === u) ||
      (o.swing && !o.swing.done && o.swing.target === u) || (o.charging && o.target === u)));
  const e = attacker || b.army.nearestEnemy(u, 24, (o) => !o.isStruct && !o.fleeing && !o.woundOut && !o.noTarget && !o.invuln &&
    Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos, false) &&
    (Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 4 ||
      ((F.sallyOut || F.sallyUntil) && o.group === F.reserveDef.real && o.pos.x >= 28 && Math.abs(o.pos.z + 38) < 4) ||
      (here && here.test(o.pos.x, o.pos.z))));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 櫓・主殿の壁の向こうへ直進せず、共通の回り込みを使って追う。
    const reach = p.weapon === 'sword' ? 1.6 : 2.5;
    if (!attacker && d > reach) goTo(p, inp, e.pos.x, e.pos.z, reach);
    // 長い振りかぶりを受け続けるだけでは、気力を失い反撃も出ない。
    // 別の打ち手がいない時だけ、普通の突きが先に届く隙を使う。
    let opening = true;
    for (const other of b.army.threats || []) {
      if (other === e || !other.alive || other.fleeing || other.woundOut || other.noTarget ||
          other.type === 'gun' || other.type === 'bow' || Math.abs(other.pos.y - u.pos.y) >= 3) continue;
      const gap = Math.hypot(other.pos.x - u.pos.x, other.pos.z - u.pos.z);
      if (gap < 8 && !b.army.wallBetween(other.pos, -1, u.pos,
          (other.wpnKind || other.lookWeapon) === 'spear' && gap <= other.reach + 0.3)) {
        opening = false; break;
      }
    }
    patientStrike(p, inp, e, d, opening);
    return;
  }
  inp.guardHold = false;
  if (F.honFell) { if (F.keep.down) goTo(p, inp, 0, 25, 1.5); else { const target = F.keep.guide(); goTo(p, inp, target.x, target.z, 1.5); } return; }
  const end = F.niFell ? BOT_ROAD.length - 1 : F.sanFell ? 9 : 7;
  let i = F.botRoadI ?? 1;
  while (i <= end) {
    const gate = F.gates[BOT_GATES[i]];
    if (gate && gate.struct.alive && !gate.opened) {
      const t = gate.struct, mx = (t.seg[0] + t.seg[2]) / 2, mz = (t.seg[1] + t.seg[3]) / 2;
      // 門の向きではなく道の手前側へ寄せる。内門の正面は城内側なので、その向きだけでは閉じた門を越そうとする。
      const prev = BOT_ROAD[i - 1], side = Math.sign((prev[0] - mx) * t.nx + (prev[1] - mz) * t.nz) || 1;
      const x = mx + t.nx * side * 1.5, z = mz + t.nz * side * 1.5;
      goTo(p, inp, x, z, 0.6);
      if (Math.hypot(u.pos.x - x, u.pos.z - z) < 1) {
        p.yaw = Math.atan2(mx - u.pos.x, mz - u.pos.z);
        // 槍の空振りを重ねず、画面で案内している掛矢を使う。
        // 門前へ歩き続けないので、柱への挟まりと突きの連続音も防ぐ。
        inp.k.delete('KeyW'); inp.leftPressed = false; inp.chargeHold = false;
        const it = b.nearestInteract();
        if (it?.id === '_gram' && b._gg?.cur === t) inp.k.add('KeyE');
      }
      return;
    }
    const [x, z] = BOT_ROAD[i];
    if (Math.hypot(u.pos.x - x, u.pos.z - z) >= 1) { goTo(p, inp, x, z, 0.6); return; }
    F.botRoadI = ++i;
  }
};

export { takato_siege };

// 山城の高さ（kaito 10/3）：高遠は平山城（三峰川・藤沢川の段丘の上、比高 約30m）。北の麓から台地へ段を一つ高くする（yamalift.js）
const LIFT = { x: 0, z: 30, tx: 0, tz: -62, w: 70, R: 56, rise: 22 };
