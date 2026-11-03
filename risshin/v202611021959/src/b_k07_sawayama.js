// ======================================================================
// 徳川編 7　佐和山城の戦い（慶長五年 1600・九月十八日〜二十日）　関ヶ原のすぐ後の山城攻め
// 筋書きの正：docs/chapter3_tokugawa.md の「7. 佐和山城」
// 三成は関ヶ原で敗れて城にいない（ボスにしない）。城は父の石田正継、兄の正澄、子の重成ら二千八百ほどが守る。
// 小早川秀秋・田中吉政・脇坂安治らおよそ一万五千が、琵琶湖の側（東）の大手と搦手から攻め、城は火に包まれて落ちた。
// 主人公は東軍（徳川方）の一手として、小早川勢の先手に付き大手から攻める。
// 段：①大手口を破る ②三の丸の石田正澄を崩す ③太鼓丸・法華丸の尾根を登る ④本丸の天守を落とす（正継は火の中で自害）
// 負け方：日が暮れ切る（六分）。
// 向き：北が -z、東が +x（琵琶湖の側）。東の麓の大手から西へ、尾根の曲輪を一つずつ本丸（山の頂）へ登る。
// 縄張りは castle_plan.js（曲輪・虎口・塀）、段は b_depth.js。曲輪の寸法は実の半分ほどに縮め、高さも縮めた。
// 国土地理院の標高：tools/dem.mjs に鍵を足して asset_dem_sawayama.js を作ったら HAS_DEM を true にして山の外側の起伏を混ぜる。
// ======================================================================
import * as THREE from 'three';
import { useTerrain, BATTLE_ASSETS, assetsForBattle } from './asset_manifest.js';
import { demRelief } from './dem.js';
import { nobori, jinmaku, kagaribi, tenshu, sumiyagura } from './props.js';
import { farSight } from './far_sight.js';
import { RANKS } from './state.js';
import { STAGES } from './stages.js';
import { sfx } from './audio.js';
import { allyGroup, nm } from './bhelp.js';
import { distToPolyline } from './world.js';
import { heightOf, buildCastlePlan, rectPoly } from './castle_plan.js';
import * as DP from './b_depth.js';
import { depthStart, depthTick, depthBot } from './b_depth.js';
import { timeslipField } from './timeslip_field.js';

const HAS_DEM = false;
let dem = null;
if (HAS_DEM) {
  BATTLE_ASSETS.k07_sawayama = Object.freeze([...assetsForBattle('k07_sawayama'), 'dem_sawayama']);
  useTerrain('dem_sawayama', (data) => { dem = data; });
}

// ---- 場所（ゲームの座標） ----
const START = { x: 215, z: 40 };         // 小早川勢の寄せ口（麓の田の中）
const OTE = { x: 152, z: 32 };           // 大手の曲輪（麓の馬場）
const SAN = { x: 93, z: 12 };            // 三の丸（石田正澄）
const TAIKO = { x: 53, z: -26 };         // 太鼓丸
const HOKKE = { x: 40, z: -62 };         // 法華丸（北の脇）
const HON = { x: -3, z: -63 };           // 本丸（天守）
const KARAME = { x: -40, z: -30 };       // 搦手から田中勢が出てくる所
const LIMIT = 360;                       // 日が暮れ切るまで（秒）

// 大手の道：麓から西へ、三の丸、太鼓丸、本丸へ
const ROUTE = [
  [235, 42], [START.x, START.z], [190, 36], [165, 32], [140, 32], [125, 24], [106, 12], [SAN.x, SAN.z], [80, 4], [72, -12], [66, -26],
  [TAIKO.x, TAIKO.z], [40, -30], [26, -42], [20, -56], [14, -60], [HON.x, HON.z],
];
// 尾根の背（x, z, 高さ）
const SPINE = [
  [125, 24, 13], [106, 12, 22], [SAN.x, SAN.z, 22], [80, 4, 22], [72, -12, 29], [66, -26, 36], [TAIKO.x, TAIKO.z, 36], [40, -30, 36],
  [26, -42, 43], [14, -60, 50], [HON.x, HON.z, 50], [-40, -80, 46], [-90, -110, 40],
];
const HOKKE_ARM = [[26, -42, 43], [HOKKE.x, HOKKE.z, 40], [58, -72, 34]];

const ISHIDA = { armor: 0x2e2a24, lace: 0x4a4468, flag: 'ishida' };
const KOBA = { flag: 'kobayakawa' };
const TOKU = { flag: 'tokugawa' };
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const clamp01 = (v) => Math.max(0, Math.min(1, v));

const SP_OUT = { d: 0, h: 0 };
function spineAt(line, x, z) {
  let best = Infinity, bh = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az, ah] = line[i], [bx, bz, bh2] = line[i + 1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) { best = d; bh = ah + (bh2 - ah) * t; }
  }
  SP_OUT.d = best; SP_OUT.h = bh;
  return SP_OUT;
}

// ---- 地形：麓の田・尾根（佐和山の頂へ）。手で描いた形に、国土地理院の起伏を外側だけ足す ----
function base(x, z) {
  let h = 2 + 0.03 * Math.max(0, 230 - x);
  h += 0.4 * Math.max(0, z - 80) + 0.25 * Math.max(0, -z - 130);
  let s = spineAt(SPINE, x, z);
  h = Math.max(h, s.h - 0.55 * Math.max(0, s.d - 8));
  s = spineAt(HOKKE_ARM, x, z);
  h = Math.max(h, s.h - 0.5 * Math.max(0, s.d - 10));
  h += 0.3 * Math.max(0, -x - 110) * clamp01((-z + 40) / 40);
  h += 0.3 * Math.sin(x * 0.045 + 0.4) * Math.cos(z * 0.05) + 0.2 * Math.sin(z * 0.08 - x * 0.03);
  if (dem) h += demRelief(dem, x, z, { xy: 1, cx: 40, cz: -20, inner: 200, fade: 60, scale: 0.06 });
  return h;
}

// ---- 縄張り：大手の馬場・三の丸（石垣）・太鼓丸・法華丸・本丸（天守） ----
const PLAN = {
  mon: 'ishida', name: '佐和山城', type: 'yama', year: 1600, gateSlope: 7, lifeNoFlags: true,
  kuruwa: [
    { id: 'ote', name: '大手の馬場', level: 4.8, wall: 'saku', kind: 'san', poly: rectPoly(140, 165, 20, 44), gapAt: [[165, 32], [140, 32]], gapW: 6, floor: false },
    { id: 'san', name: '三の丸', level: 22, wall: 'ishigaki', kind: 'ni', poly: rectPoly(80, 106, 0, 24), gapAt: [[106, 12], [80, 4]], gapW: 5 },
    { id: 'taiko', name: '太鼓丸', level: 36, wall: 'ishigaki', kind: 'koshi', poly: rectPoly(40, 66, -38, -14), gapAt: [[66, -26], [40, -30]], gapW: 5 },
    { id: 'hokke', name: '法華丸', level: 40, wall: 'saku', kind: 'koshi', poly: rectPoly(28, 52, -74, -52), gapAt: [[40, -52]], gapW: 5 },
    { id: 'hon', name: '本丸', level: 50, wall: 'dobei', kind: 'hon', poly: rectPoly(-20, 14, -76, -50), gapAt: [[14, -60]], gapW: 5 },
  ],
  koguchi: [
    { id: 'ote_e', name: '大手の木戸', from: 'out', to: 'ote', kind: 'hira', at: [165, 32], rot: Math.PI / 2, w: 5 },
    { id: 'ote_w', name: '大手の奥の木戸', from: 'ote', to: 'out', kind: 'hira', at: [140, 32], rot: -Math.PI / 2, w: 5 },
    { id: 'san_e', name: '三の丸の虎口', from: 'out', to: 'san', kind: 'hira', at: [106, 12], rot: Math.PI / 2, w: 5 },
    { id: 'san_w', name: '三の丸の奥の口', from: 'san', to: 'out', kind: 'hira', at: [80, 4], rot: -Math.PI / 2, w: 4.4 },
    { id: 'taiko_e', name: '太鼓丸の口', from: 'out', to: 'taiko', kind: 'hira', at: [66, -26], rot: Math.PI / 2, w: 4.4 },
    { id: 'taiko_w', name: '太鼓丸の奥の口', from: 'taiko', to: 'out', kind: 'hira', at: [40, -30], rot: -Math.PI / 2, w: 4.4 },
    { id: 'hokke', name: '法華丸の口', from: 'out', to: 'hokke', kind: 'hira', at: [40, -52], rot: 0, w: 4.4 },
    { id: 'hon', name: '本丸の口', from: 'out', to: 'hon', kind: 'hira', at: [14, -60], rot: Math.PI / 2, w: 4.4 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: ROUTE.slice(1) }],
};
let HEIGHT_FN = null;
function height(x, z) { if (!HEIGHT_FN) HEIGHT_FN = heightOf(PLAN, base, 3); return HEIGHT_FN(x, z); }

// ---- 道を外れない動き：道に沿って、一つ先の曲がり角へ（bot と兵の両方） ----
function routeAt(x, z, out) {
  let best = Infinity, bs = 0, bx = x, bz = z;
  for (let i = 0; i < ROUTE.length - 1; i++) {
    const [ax, az] = ROUTE[i], [cx, cz] = ROUTE[i + 1];
    const dx = cx - ax, dz = cz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; bs = i + t; bx = px; bz = pz; }
  }
  out.d = best; out.s = bs; out.x = bx; out.z = bz;
  return out;
}
const RF = { d: 0, s: 0, x: 0, z: 0 }, RT = { d: 0, s: 0, x: 0, z: 0 };
function sawayamaWay(army, u, want) {
  const q = u._k07Way || (u._k07Way = { x: 0, z: 0, t: -1, active: false, botRadius: 2 });
  if (q.t > army.time && q.active && Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 1.2) return q;
  if (q.t > army.time && !q.active) return want;
  q.t = army.time + 0.3; q.active = false;
  if (Math.hypot(want.x - u.pos.x, want.z - u.pos.z) < 9) return want;
  routeAt(u.pos.x, u.pos.z, RF); routeAt(want.x, want.z, RT);
  if (RF.d > 30 || RT.d > 30 || Math.abs(RT.s - RF.s) < 0.6) return want;
  q.active = true;
  if (RF.d > 4) { q.x = RF.x; q.z = RF.z; return q; }
  const fwd = RT.s > RF.s;
  let i = fwd ? Math.floor(RF.s) + 1 : Math.ceil(RF.s) - 1;
  i = Math.max(0, Math.min(ROUTE.length - 1, i));
  if (Math.hypot(ROUTE[i][0] - u.pos.x, ROUTE[i][1] - u.pos.z) < 1.5) i += fwd ? 1 : -1;
  if (i < 0 || i >= ROUTE.length || (fwd ? i > RT.s : i < RT.s)) { q.x = RT.x; q.z = RT.z; }
  else { q.x = ROUTE[i][0]; q.z = ROUTE[i][1]; }
  return q;
}

// ---- 旗と篝火：東軍の寄せ口・石田の曲輪 ----
function flags(rt) {
  const W = rt.world;
  rt.scene.add(jinmaku(W, START.x + 10, START.z, 12, 9, 4, { mon: 'kobayakawa' }));
  for (const [x, z] of [[START.x - 2, START.z - 7], [START.x - 2, START.z + 7], [START.x + 4, START.z - 14]]) rt.scene.add(nobori(W, x, z, 'kobayakawa', 6));
  for (const [x, z] of [[START.x + 2, START.z - 4], [START.x + 2, START.z + 5]]) rt.scene.add(kagaribi(W, x, z));
  for (const [x, z] of [[160, 24], [160, 40], [100, 4], [88, 20], [60, -20], [46, -34], [44, -66], [8, -56], [-12, -70]]) rt.scene.add(nobori(W, x, z, 'ishida', 5));
  for (const [x, z] of [[OTE.x, OTE.z - 6], [SAN.x + 4, SAN.z - 4], [TAIKO.x - 6, TAIKO.z], [HON.x + 6, HON.z]]) rt.scene.add(kagaribi(W, x, z));
}

const keep = (name, at, list, o = {}) => ({ name, from: { x: at.x + (o.dx || 0), z: at.z + (o.dz || 0) }, width: o.width || 8, list, seek: o.seek || 45, morale: o.morale || 92, dmg: o.dmg ?? 0.28 });

const k07_sawayama = {
  // 身の回りの合戦の跡（timeslip_field.js）。佐和山：九月半ばの山城。乾いた土と落ちた矢・槍、秋の草
  timeslip: {
    wet: 0.15, dust: 0.5, trample: 0.3, debris: 1.2, arrows: 1, maxSlope: 0.3,
    grass: 0x9a9a60, grassTints: [0xffffff, 0xeadcb0, 0xd0c898], grassH: 1.05, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.8,
    flagColors: [0xe6dfcc, 0x24211e, 0x5a4a36],
  },
  spawn: { x: START.x - 4, z: START.z, heading: -Math.PI / 2 },
  cutFloor: 0.5,
  meleeGrace: { rate: 1, burst: 1, interval: 3 },   // 刃を受けた後の3秒は次の刃を通さない（bot が続けての太刀で倒れて負けた）
  noWake: true,
  minutes: 6,
  world: {
    seed: 1600921,
    time: 'day',
    groundHalf: 280,
    paths: [ROUTE.slice(0, 9), ROUTE.slice(8)],
    height,
    moveWay: sawayamaWay,
    tint(x, z, h, c) {
      if (distToPolyline(x, z, ROUTE) < 3.2) { c.setRGB(c.r * 0.5 + 0.2, c.g * 0.5 + 0.17, c.b * 0.5 + 0.12); return; }
      // 麓は刈り入れ前の田（秋）
      if (h < 4 && x > 170) { c.setRGB(c.r * 0.6 + 0.26, c.g * 0.6 + 0.22, c.b * 0.5 + 0.06); return; }
      if (h > 14) c.setRGB(c.r * 0.74, c.g * 0.84, c.b * 0.7);
    },
    clear: (x, z) => distToPolyline(x, z, ROUTE) < 7 || PLAN.kuruwa.some((k) => x > k.poly[0][0] - 2 && x < k.poly[1][0] + 2 && z > k.poly[0][1] - 2 && z < k.poly[2][1] + 2),
    trees: 480,
    tufts: 2400,
    treeDensity: (x, z) => {
      const d = distToPolyline(x, z, ROUTE);
      if (d < 9) return 0;
      if (x > 170) return 0.1;
      // 大手の馬場から三の丸の石垣と隅櫓が見えるように、その間の斜面の木はまばらに
      if (x > 92 && x < 170 && z > -6 && z < 50) return 0.3;
      return 1.1;
    },
    groves: [{ x: 128, z: 88, r: 16, n: 20, kind: 'sugi' }, { x: 70, z: 30, r: 18, n: 24, kind: 'sugi' }, { x: 10, z: -20, r: 18, n: 24, kind: 'sugi' }],
    fleeOut: (x, z, team) => (team === 1 ? x < -130 || z < -170 : x > 245),
  },

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    { const P = rt.player, td = P.takeDamage, k = rt.def.cutFloor; P.takeDamage = function (a, s) { const m = this.u.hitKind === 'gun' || this.u.hitKind === 'arrow'; const d = td.call(this, a, s); return s && !s.isStruct && !m && d > 0 ? d * k : d; }; }   // 刃の一太刀を def.cutFloor 倍に（共通の一太刀五割・六割は変えず、この戦だけ）
    const W = rt.world, F = rt.flags;
    F.ek = 0; F.ak = 0; F.ending = false; F.begun = false;
    const castle0 = rt.scene.children.length;
    F.C = buildCastlePlan(rt, PLAN, { baseHeight: base, edgeW: 3, team: 1, perch: false, interiorGuards: false });
    // 佐和山の頂の五重の天守（三成の居城。「三成に過ぎたるもの」の一つ）と、三の丸・太鼓丸の石垣の隅櫓。麓の田から山の上に城が見える
    try {
      rt.scene.add(tenshu(W, HON.x - 4, HON.z - 2, { floors: 5, b: 12, base: 3.4, old: true, rot: Math.PI / 2, team: 1, name: '佐和山城の天守', where: '本丸の天守' }));
      rt.scene.add(sumiyagura(W, 102, 20, { w: 6, d: 5, base: 1.2, rot: Math.PI / 2 }), sumiyagura(W, 62, -18, { w: 5, d: 4.4, base: 1.2, rot: Math.PI / 2 }));
    } catch (e) { console.warn(e); }
    farSight(rt.scene.children.slice(castle0), { W, ground: { x: 60, z: -20, r: 90 } });
    flags(rt);
    // 麓に控える東軍の大軍（軽い作り）と、山肌に並ぶ石田の旗
    W.addDistantArmy({ x: START.x + 40, z: START.z - 4, w: 50, d: 36, count: 380, facing: -Math.PI / 2, armor: 0x24221f, team: 0, mon: 'kobayakawa', seed: 16001 });
    W.addDistantArmy({ x: START.x + 10, z: START.z + 44, w: 36, d: 22, count: 220, facing: -Math.PI / 2, armor: 0x24221f, team: 0, mon: 'tokugawa', seed: 16002 });
    // ---- 東軍：自分の手勢と小早川の先手。秀秋は寄せ口の本陣に残る ----
    F.honjin = allyGroup(rt, { faction: 'oda', name: '小早川秀秋の本陣', anchor: { x: START.x + 8, z: START.z }, facing: -Math.PI / 2, width: 4, aggro: 3, order: 'hold', fixed: true, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '小早川秀秋', invuln: true, horse: false } }, { type: 'samurai', n: 3 }], KOBA));
    F.mine = allyGroup(rt, { faction: 'oda', name: '手勢', anchor: { x: START.x - 8, z: START.z + 3 }, facing: -Math.PI / 2, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 5 }], KOBA));
    F.saki = allyGroup(rt, { faction: 'oda', name: '脇坂安治の先手', anchor: { x: START.x - 10, z: START.z - 6 }, facing: -Math.PI / 2, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '脇坂安治', invuln: true, horse: false } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 16 }, { type: 'bow', n: 3 }], TOKU));
    for (const g of [F.mine, F.saki]) { g.defMult = 1.5; g.dmgMult = 1.1; g.aggro = 24; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: START.x - 2, z: START.z + 6 }, -Math.PI / 2, [{ kind: 'spear', n: Math.min(n, 16) }]);
    W.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', '日が暮れ切る前に、佐和山城を落とせ', 'main');
    // 戦の前
    rt.say('小早川秀秋', '関ヶ原は終わった。残るは治部（三成）の本拠、佐和山じゃ', 4.5);
    rt.after(5, () => rt.say(nm(rt), '治部少輔はおらぬと聞きます。城には誰が', 3.5));
    rt.after(9, () => rt.say('脇坂安治', '父の石田正継、兄の正澄ら。二千八百ほどが籠もっておる', 4));
    rt.after(13.5, () => rt.say('小早川秀秋', '田中吉政殿が搦手から回る。我らは大手じゃ。かかれ！', 3.6));
    rt.after(17.5, () => this.begin(rt));
  },

  begin(rt) {
    const F = rt.flags;
    if (F.begun) return;
    F.begun = true; F.t0 = rt.t;
    rt.setPhase('siege');
    sfx('horagai', 0.8);
    rt.after(1.2, () => sfx('taiko', 0.8));
    depthStart(rt, { faction: 'ishida', flag: 'ishida', armor: ISHIDA.armor, friends: () => [F.mine, F.saki], look: (list) => dress(list, ISHIDA), scale: 1.3, backing: false, fixedSpawn: true, dmg: 0.4, botSeek: 40 }, [
      // ① 大手口を破る
      DP.fight({ at: OTE, title: '大手口', sub: '麓の馬場に石田の鉄砲が並ぶ', obj: '大手口の木戸を破れ', max: 60,
        say: [['脇坂の侍', '木戸の内に鉄砲じゃ！　盾を前に押せ']],
        foes: () => [keep('大手の守り', OTE, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 7 }, { type: 'gun', n: 2 }])],
        reward: '大手口を破った' }),
      DP.move({ to: { x: 125, z: 24 }, obj: '三の丸の坂まで登れ', label: '三の丸の坂', r: 8, max: 50,
        ambush: { d: 34, say: ['小早川の侍', '坂の脇に伏兵じゃ！'], foes: () => [keep('坂の伏兵', { x: 120, z: 44 }, [{ type: 'ashigaru', n: 7 }, { type: 'samurai', n: 1 }])] } }),
      DP.rest({ dur: 5, heal: 0.7 }),
      // ② 三の丸
      DP.fight({ at: SAN, title: '三の丸', sub: '石垣の上に石田正澄', obj: '三の丸の石田正澄を崩せ', max: 65,
        say: [['石田正澄', '三成の兄ここにあり。一歩も通すな！']],
        foes: () => [keep('三の丸の守り', SAN, [{ type: 'busho', n: 1, o: { name: '石田正澄', hat: 'kabuto_m', horse: false } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 4 }], { morale: 98 })],
        reward: '三の丸を落とした' }),
      DP.rest({ dur: 5, heal: 0.7 }),
      // ③ 太鼓丸・法華丸
      DP.fight({ at: TAIKO, title: '太鼓丸', sub: '尾根の曲輪を一つずつ落とす', obj: '太鼓丸を落とせ', max: 55,
        say: [['小早川の侍', '搦手に田中家の旗！　挟み撃ちじゃ']],
        foes: () => [keep('太鼓丸の守り', TAIKO, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 4 }])],
        reward: '太鼓丸を落とした' }),
      DP.fight({ at: HOKKE, title: '法華丸', sub: '北の脇の曲輪', obj: '法華丸を落とせ', max: 50,
        foes: () => [keep('法華丸の守り', HOKKE, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 7 }, { type: 'bow', n: 3 }])],
        reward: '法華丸を落とした' }),
      DP.rest({ dur: 5, heal: 0.7 }),
      // ④ 本丸の天守
      DP.fight({ at: HON, title: '本丸', sub: '佐和山の頂、五層の天守', obj: '本丸の石田正継を追い詰めよ', max: 80,
        say: [['石田正継', '倅の城を、ただでは渡さぬ！'], ['石田重成', '父上、城に火を放ちまする！']],
        onEnd: (rt2) => this.burn(rt2),
        foes: () => [keep('本丸の守り', HON, [{ type: 'busho', n: 1, o: { name: '石田正継', hat: 'kabuto_m', horse: false } }, { type: 'samurai', n: 1, o: { name: '石田重成', hat: 'kabuto_m' } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 3 }], { morale: 100, seek: 30 })],
        reward: '本丸に攻め入った' }),
    ], (rt2) => this.win(rt2));
  },

  // 田中吉政の手：太鼓丸の段で、搦手（西）から攻め上る
  tanaka(rt) {
    const F = rt.flags;
    if (F.tanaka) return;
    F.tanaka = allyGroup(rt, { faction: 'oda', name: '田中吉政の手', anchor: { x: KARAME.x, z: KARAME.z }, facing: 0, width: 10, aggro: 12, noRout: true, order: 'attack', seekRange: 60 },
      dress([{ type: 'busho', n: 1, o: { name: '田中吉政', invuln: true, horse: false } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }], TOKU));
    F.tanaka.anchor = { x: HOKKE.x - 10, z: HOKKE.z + 14 };
    F.tanaka.dmgMult = 0.7;
    rt.after(1.5, () => rt.say('田中吉政', '搦手は田中が破る。小早川殿に遅れるな', 3.4));
    rt.scene.add(nobori(rt.world, KARAME.x + 4, KARAME.z - 4, 'tokugawa', 6));
    rt.army.play('toki', KARAME, 1.4);
  },

  // 本丸の段の終わり：天守に火が回る（炎上・落城）
  burn(rt) {
    const F = rt.flags;
    if (F.burned) return;
    F.burned = true;
    rt.world.setTime('dusk');
    for (const [x, z, s] of [[HON.x, HON.z, 2.6], [HON.x - 8, HON.z + 6, 2], [HON.x + 6, HON.z - 6, 2.2], [TAIKO.x, TAIKO.z, 1.6], [SAN.x, SAN.z, 1.6]]) {
      if (rt.world.addFire) rt.world.addFire(x, z, { size: s, h: 2 });
    }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    this.burn(rt);
    rt.setPhase('end');
    rt.objDone('main');
    rt.award((t) => { t.main = true; t.special = { label: '佐和山城を落とした', pts: 40 }; }, '佐和山城が落ちた');
    sfx('horagai', 0.9);
    rt.banner('佐和山城、落城', '慶長五年九月　石田家、滅ぶ');
    rt.player.u.invuln = true;
    rt.after(2, () => rt.say(nm(rt), '天守が燃えておりまする。正継殿は、中で自害なされたと', 4));
    rt.after(6.5, () => rt.say('小早川秀秋', '……三成は城に戻れなんだ。主のおらぬ城を、我らは落としたのよ', 4.4));
    rt.after(11, () => rt.say('田中吉政', '治部（三成）は伊吹の山に逃れた。我が手の者が捜し出す', 4.4));
    rt.finish({}, 16);
  },

  lose(rt) {
    const F = rt.flags;
    if (F.ending || !rt.canFailMission()) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objFail('main');
    rt.tracker.main = false;
    rt.banner('日が暮れ切った', '城はまだ落ちぬ');
    rt.say('小早川秀秋', '日が暮れたか。今日のうちに落とせなんだ', 4);
    rt.finish({ failureReason: '日が暮れるまでに本丸を落とせなかった' }, 6);
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending) return;
    depthTick(rt, dt);
    const D = F.dp;
    if (D && D.on && D.i >= 4) this.tanaka(rt);
    if (D && D.on && D.i >= 6 && !F.dusk) { F.dusk = true; rt.world.setTime('dusk'); }
    if (F.begun && rt.t - F.t0 > LIMIT) this.lose(rt);
    else if (F.begun && !F.warned && rt.t - F.t0 > LIMIT - 60) { F.warned = true; rt.say('小早川の侍', '西の空が赤い！　日が暮れる、急げ', 3.5); }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    if (v.name === '石田正継') rt.award((t) => { t.special = { label: '石田正継を追い詰めた', pts: 30 }; }, '石田正継を追い詰めた');
    if (v.name === '石田正澄') rt.award((t) => { t.special = { label: '石田正澄を討ち取った', pts: 20 }; }, '石田正澄を討ち取った');
  },
  onRout(rt, g) {
    if (g.team === 1 && g.name) rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },
};

k07_sawayama.force = (rt) => ({ a: Math.round(15000 - (rt.flags.ak || 0) * 20), a0: 15000, b: Math.max(0, 2800 - (rt.flags.ek || 0) * 25), b0: 2800 });
k07_sawayama.sides = { a: { name: '東軍', mon: 'kobayakawa' }, b: { name: '石田方', mon: 'ishida' } };
k07_sawayama.date = (rt) => (rt.flags.dusk ? '慶長五年（1600）九月　秋・夕暮れ' : '慶長五年（1600）九月　秋・昼');
k07_sawayama.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
k07_sawayama.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k07_sawayama.history = '慶長五年（1600）九月十五日、関ヶ原で西軍が敗れると、東軍は三成の本拠・佐和山城へ向かった。城は琵琶湖を見下ろす佐和山の頂に五層の天守を持つ山城で、三成は戻らず、父の石田正継、兄の正澄、子の重成らが二千八百ほどで守った。小早川秀秋・田中吉政・脇坂安治・朽木元綱らおよそ一万五千が大手と搦手から攻め、城は火に包まれて二十日ごろに落ちた。正継と正澄は自害したと伝えられ、石田家は滅んだ。三成本人は関ヶ原の後に逃れ、近江で捕らえられた。\n曲輪の並びと寸法は遊びのために縮めて復元したもので、攻め口の細かい道筋は推定である。内応や裏切りの伝えなど、史料により異なる点もある。';
k07_sawayama.bushou = [{ name: '石田正継', g: /正継/ }, { name: '石田正澄', g: /正澄/ }];

k07_sawayama.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  if (!u.alive || F.ending) return;
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  inp.k.delete('KeyW');
  goTo(p, inp, START.x - 6, START.z, 3);
};

const dpAt = (k) => (rt) => (rt.flags.dp?.i ?? -1) >= k || (rt.flags.dp && !rt.flags.dp.on && rt.flags.begun);
STAGES.k07_sawayama = [['大手口を破る'], ['三の丸の石田正澄を崩す', dpAt(2)], ['太鼓丸・法華丸の尾根を登る', dpAt(3)], ['本丸の天守を落とす', dpAt(5)]];

export { k07_sawayama };
export default k07_sawayama;
