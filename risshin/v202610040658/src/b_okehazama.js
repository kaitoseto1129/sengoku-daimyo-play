import { battleJin, buildBattleJin } from './b_jinkei_g1.js';
// 第1戦　桶狭間。雨後の急襲・旗本の囲み・元の道への帰陣。
import * as THREE from 'three';
import { SOLIDS } from './props.js';
import { gauss, allyGroup, enemyGroup, unitPos, nm } from './bhelp.js';
import { distToPolyline } from './world.js';
import { palisade, hut, yagura, nobori, tawara, campfire, koshi, umaFollow } from './props.js';
import { nagashinojo } from './b_nagashinojo.js';
import { customFlag } from './b_inabayama.js';
import { farArmy, moveFar, gone, sky } from './b_shared.js';
import { sfx, hush } from './audio.js';
import { sightPoint } from './battle_sight.js';
import { demBlend } from './dem.js';

// ======================================================================
// 第1戦　桶狭間
// ======================================================================
const P1 = [[0, 172], [-4, 150], [-4, 144], [4, 140], [6, 118], [-8, 90], [-24, 60], [-30, 30], [-22, 0], [-12, -30], [-8, -46]];
const HONJIN = { x: 18, z: -116 };

// 位置図の北を上にそろえる。中島砦から本陣へは西北西から東南東。
// 図の原点は地面の中央に収まる所へずらし、本陣はそこから東11・南3（実地の十分の一）。
// 元の道の曲がりと段の間合いは、同じ回転を全ての位置へかけて保つ。
const FIELD_TURN = Math.atan2(-261, -53) - Math.atan2(-18, 278);
const FIELD_C = Math.cos(FIELD_TURN), FIELD_S = Math.sin(FIELD_TURN);
const FIELD_X = 112 - 18 * FIELD_C + 116 * FIELD_S;
const FIELD_Z = 33 + 18 * FIELD_S + 116 * FIELD_C;
const fieldX = (x, z) => FIELD_X + x * FIELD_C + z * FIELD_S;
const fieldZ = (x, z) => FIELD_Z - x * FIELD_S + z * FIELD_C;
const fieldPoint = (x, z) => ({ x: fieldX(x, z), z: fieldZ(x, z) });
const fieldVector = (x, z) => ({ x: x * FIELD_C + z * FIELD_S, z: -x * FIELD_S + z * FIELD_C });
const localX = (x, z) => (x - FIELD_X) * FIELD_C - (z - FIELD_Z) * FIELD_S;
const localZ = (x, z) => (x - FIELD_X) * FIELD_S + (z - FIELD_Z) * FIELD_C;
const fieldPathPoint = ([x, z]) => [fieldX(x, z), fieldZ(x, z)];
const FIELD_HONJIN = fieldPoint(HONJIN.x, HONJIN.z);

// 幕と手盾を横切る行き先は、本陣の口を経由する。兵と bot で同じ道を使う。
function wayCross(x, z, dx, dz, a, lo, hi) {
  if (Math.abs(dx) < 1e-6) return false;
  const t = (a - x) / dx, q = z + dz * t;
  return t > 0 && t < 1 && q > lo && q < hi;
}
function honjinWay(army, u, goal) {
  const x = localX(u.pos.x, u.pos.z), z = localZ(u.pos.x, u.pos.z);
  const tx = localX(goal.x, goal.z), tz = localZ(goal.x, goal.z);
  const dx = tx - x, dz = tz - z;
  if (!wayCross(x, z, dx, dz, 5, -126, -106) && !wayCross(x, z, dx, dz, 31, -126, -106) &&
      !wayCross(z, x, dz, dx, -125, 4, 32) && !wayCross(z, x, dz, dx, -107, 4, 13.8) && !wayCross(z, x, dz, dx, -107, 22.2, 32) &&
      !wayCross(z, x, dz, dx, -104.8, 3, 12.8) && !wayCross(z, x, dz, dx, -104.8, 23.2, 33)) return goal;
  let wx = 18, wz;
  const inside = x > 5 && x < 31 && z > -125 && z < -107;
  const targetInside = tx > 5 && tx < 31 && tz > -125 && tz < -107;
  if (inside) wz = z < -111 ? -110 : -100;
  // 奥の幕の外から口へ回る時は、先に奥の角を回る。
  // いきなり口の横へ向かうと、奥の幕を斜めに横切って止まる。
  else if (z <= -125 && x > 3 && x < 33) { wx = x < 18 ? 2 : 34; wz = -128; }
  else if (!targetInside && tz <= -125 && (x <= 4 || x >= 32)) { wx = x < 18 ? 2 : 34; wz = -128; }
  else if (z < -101) { wx = x < 18 ? 2 : 34; wz = -100; }
  else if (!targetInside && (tx < 5 || tx > 31)) { wx = tx < 5 ? 2 : 34; wz = -100; }
  else if (!targetInside && tz <= -125) { wx = x < 18 ? 2 : 34; wz = x > 4 && x < 32 ? -100 : -128; }
  else if (Math.abs(x - 18) > 2) wz = -100;
  else wz = -110;
  const q = u._okeWay || (u._okeWay = { x: 0, z: 0 });
  q.x = fieldX(wx, wz); q.z = fieldZ(wx, wz);
  return q;
}

// 幕・柵・丘の小道具を始めに一度だけ回す。当たりの形も同じだけ回す。
function fieldScenery(rt) {
  const scene = new THREE.Group(), start = SOLIDS.length;
  scene.rotation.y = FIELD_TURN; scene.position.set(FIELD_X, 0, FIELD_Z);
  rt.scene.add(scene);
  const world = Object.create(rt.world);
  world.heightAt = (x, z) => rt.world.heightAt(fieldX(x, z), fieldZ(x, z));
  return { world, scene, finish() {
    for (let i = start; i < SOLIDS.length; i++) {
      const o = SOLIDS[i];
      // 当たりの囲みは回す前の四隅から作り直す。
      const corners = [[o.x0, o.z0], [o.x0, o.z1], [o.x1, o.z0], [o.x1, o.z1]].map(fieldPathPoint);
      if (o.k === 's') {
        const a = fieldPoint(o.ax, o.az), b = fieldPoint(o.bx, o.bz);
        o.ax = a.x; o.az = a.z; o.bx = b.x; o.bz = b.z;
      } else {
        const p = fieldPoint(o.x, o.z); o.x = p.x; o.z = p.z;
        if (o.k === 'r') { const c = o.c; o.c = c * FIELD_C - o.s * FIELD_S; o.s = o.s * FIELD_C + c * FIELD_S; }
      }
      o.x0 = Math.min(...corners.map((p) => p[0])); o.x1 = Math.max(...corners.map((p) => p[0]));
      o.z0 = Math.min(...corners.map((p) => p[1])); o.z1 = Math.max(...corners.map((p) => p[1]));
    }
  } };
}

// 国土地理院の標高（桶狭間古戦場。束0 の asset_dem_okehazama.js）を手書きの base に混ぜる。
// 野戦は手書きの地形（ゲーム内の尺）の幅が広いので xyScale で実測の格子に合わせて縮めて引く
let okeDem = null;
import('./asset_dem_okehazama.js').then((m) => { okeDem = m.default; }).catch(() => {});
const OKE_DEM_OPTIONS = { scale: 0.3, floor: 0, xyScale: 4 };
const okeHeight = (dem, x, z, b) => {
  OKE_DEM_OPTIONS.floor = b - 5;
  return dem ? demBlend(dem, x, z, b, OKE_DEM_OPTIONS) : b;
};

// 今川の小荷駄（本陣の北の窪み）。俵と幔幕の脇に荷の隊を置く（遠景。数は軽い）
function DA0(rt, W) {
  const KT2 = nagashinojo.kit;
  for (let i = 0; i < 6; i++) tawara(W, HONJIN.x + 26 + (i % 3) * 3, HONJIN.z - 58 + Math.floor(i / 3) * 3, 0.3 * i, 6);
  KT2.farHost(rt, fieldX(HONJIN.x + 34, HONJIN.z - 66), fieldZ(HONJIN.x + 34, HONJIN.z - 66), 26, 10, 70, FIELD_TURN, 0x4a3a2a, 'imagawa', 41, 'mixed');
}

// 首巻の本陣急襲。八陣の名を当てず、織田は谷の縦列、今川は休息陣と分遣隊。
const OKEHAZAMA_JIN = [
  battleJin('谷を進む縦備え', 0, fieldPoint(2, 150), Math.PI + FIELD_TURN, [
    ['okhVan', '谷の先手', '名は伝わらない', 600, 2, 140, 'cols.0', 'oda'],
    ['okhMain', '谷の本備', '名は伝わらない', 1200, 2, 158, 'cols.2', 'oda'],
    ['okhNobu', '本陣', '織田信長', 200, 2, 150, 'nob', 'eiraku', 'oda'],
    ['okhSaku', '善照寺方面の控え', '佐久間信盛', 500, 0, 232, 'jinSaku', 'oda'],
  ], '攻撃兵二千ほど。善照寺方面の五百は別の控え。家臣ごとの配置と各備の割り振りは推定。', fieldPoint),
  battleJin('休息中の備え', 1, FIELD_HONJIN, FIELD_TURN, [
    ['okhYoshi', '本陣', '今川義元', 1500, HONJIN.x, HONJIN.z + 2, 'hatamoto', 'imagawa'],
    ['okhGuard', '本陣前の守り', '名は伝わらない', 600, 0, -96, 'enemies.0', 'imagawa'],
    ['okhFrontEast', '本陣前の右の守り', '名は伝わらない', 400, 40, -92, 'enemies.1', 'imagawa'],
    ['okhWest', '本陣左の備え', '松井宗信', 1000, -22, -118, 'enemies.2', 'imagawa'],
    ['okhEast', '本陣右の備え', '名は伝わらない', 1000, 40, -124, 'enemies.3', 'imagawa'],
    ['okhReserve', '本陣後ろの控え', '名は伝わらない', 1500, -4, -134, 'enemies.4', 'imagawa'],
  ], '今川全軍二万五千とも。本陣周辺は五千から六千とする説があり、ここでは六千を分けた目安。松平元康らの大高・丸根方面の別働勢はここへ集めない。', fieldPoint),
];

const okehazama = {
  jinkei: OKEHAZAMA_JIN,
  noWake: true,   // 近場の隊は初めから置く。遠景の補充・兵の入れ替えを行わない。
  noReserve: true,
  botOrders: true,   // 性格の突進で、組について進む下知や反撃の隙を上書きしない。
  prelude: false,   // 奇襲の戦は溜めない（prelude.js）
  spawn: { ...fieldPoint(3, 162), heading: Math.PI + FIELD_TURN },
  world: {
    seed: 3,
    moveWay: honjinWay,
    muddy: 0.85,     // 豪雨の後の山道はぬかるむ
    paths: [P1.map(fieldPathPoint)],
    height(wx, wz) {
      // 舞台の最初の高さを取る時に固定する。遅れて素材が届いても地面を替えない。
      if (!Object.hasOwn(this, '_okeDem')) this._okeDem = okeDem;
      const x = localX(wx, wz), z = localZ(wx, wz);
      let h = 6 * Math.sin(x * 0.021 + 0.5) * Math.cos(z * 0.018) + 3 * Math.sin(x * 0.05) * Math.sin(z * 0.043 + 1);
      h += 16 * gauss(x, z, -85, -10, 2600) + 12 * gauss(x, z, 80, 40, 3000) + 10 * gauss(x, z, 75, -60, 2200) + 9 * gauss(x, z, -70, 110, 2400);
      h += 6 * gauss(x, z, HONJIN.x, HONJIN.z, 1400) + 5 * gauss(x, z, -46, -34, 500);
      // 本陣の東西に迫る尾根：田楽狭間の狭い谷あい
      h += 9 * gauss(x, z, HONJIN.x - 58, HONJIN.z - 6, 900) + 10 * gauss(x, z, HONJIN.x + 60, HONJIN.z + 4, 1000);
      // 中島砦：柵の外に土塁、その外に空堀（北の口は切る）
      const fr = Math.hypot(x, z - 162);
      if (fr > 12 && fr < 24 && !(z < 150 && Math.abs(x) < 4)) h += 1.1 * Math.exp(-((fr - 15.8) ** 2) / 2) - 1.3 * Math.exp(-((fr - 19.5) ** 2) / 1.6);
      const d = distToPolyline(x, z, P1);
      h -= 4 * Math.exp(-(d * d) / 300);
      return okeHeight(this._okeDem, wx, wz, h);
    },
    clear: (wx, wz) => {
      const x = localX(wx, wz), z = localZ(wx, wz);
      return Math.hypot(x - HONJIN.x, z - HONJIN.z) < 28 || Math.hypot(x, z + 96) < 16 || Math.hypot(x - 40, z + 92) < 14 ||
      Math.hypot(x + 22, z + 118) < 16 || Math.hypot(x, z - 162) < 20 || (z < -30 && z > -66 && x > -50 && x < 36) || Math.hypot(x + 46, z + 34) < 10 ||
      Math.hypot(x - 124, z - 110) < 34;
    },   // 谷の村
    trees: 520,
    lightning: true,
    rainDir: [FIELD_C * 0.18 - FIELD_S * 0.98, -FIELD_S * 0.18 - FIELD_C * 0.98],   // 雨は織田の後ろから本陣へ：織田の背を押し、今川の顔に吹きつける（信長公記）
    // 谷あいの小川と、東の谷の村の水路（要件：竹林・小川・水路・村）
    waterSlow: true,   // 川を渡る間は遅く、馬はもっと遅い（terrain_tags.js の water。10/2）
    streams: [{ pts: [[-70, -150], [-52, -96], [-60, -40], [-80, 20]].map(fieldPathPoint), w: 1.8, depth: 0.9 }, { pts: [[100, 80], [124, 108], [150, 140]].map(fieldPathPoint), w: 1.6, depth: 0.8 }],
    // 谷の田と畦（A036）：道と本陣のまわりを除いて水を張る
    hail: true,
    fieldStage: 'seedling',   // 稲の育ちと水の有無を合わせる（細かな収穫時期は推定）
    paddy(wx, wz) {
      const x = localX(wx, wz), z = localZ(wx, wz);
      if (z > 110 || z < -76 || Math.abs(x) > 96 || Math.hypot(x - HONJIN.x, z - HONJIN.z) < 40 || (Math.abs(x) < 14 && z > 0)) return 0;
      if (distToPolyline(x, z, P1) < 5) return 0;
      if ((Math.floor(x / 20) + Math.floor(z / 16)) % 2 !== 0) return 0;
      const ex = Math.min(((x % 20) + 20) % 20, 20 - ((x % 20) + 20) % 20), ez = Math.min(((z % 16) + 16) % 16, 16 - ((z % 16) + 16) % 16);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.9) / 0.6));
    },
    groves: [{ ...fieldPoint(132, 96), r: 10, n: 22 }, { ...fieldPoint(112, 124), r: 8, n: 16 }, { ...fieldPoint(-60, -70), r: 16, n: 26 }, { ...fieldPoint(55, -20), r: 18, n: 30 }, { ...fieldPoint(-50, 20), r: 14, n: 18 }, { ...fieldPoint(HONJIN.x - 58, HONJIN.z - 6), r: 16, n: 30 }, { ...fieldPoint(HONJIN.x + 62, HONJIN.z + 6), r: 16, n: 30 }],
    // 本陣のまわりは踏み荒らされて泥（雨の後）
    tint(wx, wz, h, c) {
      const x = localX(wx, wz), z = localZ(wx, wz);
      const d = Math.hypot(x - HONJIN.x, z - HONJIN.z);
      if (d < 34) c.lerp({ r: 0.3, g: 0.26, b: 0.2 }, 0.45 * Math.min(1, (34 - d) / 12));
    },
  },
  setup(rt) {
    // 初陣の打撃・同時に打ち込む人数は共通設定を保つ。倒れた後の救済は使わない。
    rt.firstFights = false; rt.flags.rescued = true;
    const scenery = fieldScenery(rt);
    const W = scenery.world;
        // 中島砦
    for (let i = 0; i < 10; i++) {
      const a0 = (i / 10) * Math.PI * 2, a1 = ((i + 1) / 10) * Math.PI * 2;
      if (i === 5) continue;
      scenery.scene.add(palisade(W, [Math.sin(a0) * 15, 162 + Math.cos(a0) * 15, Math.sin(a1) * 15, 162 + Math.cos(a1) * 15], { h: 2.2 }));
    }
    scenery.scene.add(hut(W, -6, 166, 6, 4, 0.2));
    scenery.scene.add(yagura(W, 8, 170));
    for (const [x, z] of [[-10, 150], [10, 150], [-4, 176]]) scenery.scene.add(nobori(W, x, z, 'oda', 5.5));
    // 今川本陣：陣幕の内に床几と馬印、脇に旗竿・兵糧・馬の杭（義元と旗本は戦う兵で置く）
    const KT = nagashinojo.kit;
    KT.honjin(scenery, HONJIN.x, HONJIN.z, { mon: 'imagawa', w: 26, d: 18, gap: 10, people: false });
    // 遠景の村（東の谷。雨の中に茅葺きの屋根）
    KT.farVillage(scenery, 124, 110, { rot: Math.PI / 2, n: 6, fields: 8, seed: 3 });
    // 本陣の脇に兵糧の俵
    scenery.scene.add(tawara(W, HONJIN.x - 16, HONJIN.z + 4, 0.3, 6), tawara(W, HONJIN.x + 16, HONJIN.z - 3, -0.5, 5));
    for (const [x, z] of [[6, -106], [30, -106], [4, -128], [32, -128]]) scenery.scene.add(nobori(W, x, z, 'imagawa', 6));
    // 今川の赤鳥の幟：白地に朱の赤鳥（櫛の形）。本陣の奥に混ぜる
    customFlag('akadori', (g) => {
      g.save(); g.fillStyle = g.strokeStyle = '#a8281c';
      g.translate(64, 84);
      g.beginPath(); g.ellipse(0, -8, 34, 16, 0, Math.PI, 0); g.lineTo(34, 2); g.lineTo(-34, 2); g.closePath(); g.fill();
      for (let i = 0; i < 15; i++) { const x = -31 + i * 4.4; g.fillRect(x, 2, 2.4, 26); }
      g.fillStyle = '#e8e2d2'; g.beginPath(); g.ellipse(0, -8, 22, 8, 0, Math.PI, 0); g.fill();
      g.restore();
    });
    for (const [x, z] of [[12, -132], [26, -132], [-2, -118]]) scenery.scene.add(nobori(W, x, z, 'akadori', 6.5));
    for (const [x, z] of [[0, -96], [40, -92], [-22, -118], [18, -114]]) { scenery.scene.add(campfire(W, x, z)); rt.world.addFire(fieldX(x, z), fieldZ(x, z)); }
    scenery.scene.add(hut(W, -2, -104, 5, 3.5, 0.4, { wall: 0x857058 }));
    // 義元の塗輿：本陣の幕の内、床几の脇に据えてある
    rt.flags.koshi = koshi(W, HONJIN.x + 5, HONJIN.z - 3, 0.3);
    scenery.scene.add(rt.flags.koshi);

    // 味方の行軍（先手・一の組・自分の槍組・後備）
    const starts = [120, 138, 156, 172];
    const finals = [[-28, -52], [12, -52], [-8, -46], [-22, -38]];
    const specs = [
      { name: '織田の先手', n: 17 },
      { name: '織田の一の組', n: 18 },
      { name: '織田の槍組', n: 14 },
      { name: '織田の後備', n: 18 },
    ];
    rt.flags.cols = [];
    specs.forEach((sp, i) => {
      const sz = starts[i];
      const sx = sz > 140 ? 2 : 5;
      // 待機する隊の後列を横切らず、谷の出口で各隊の持ち場へ分かれる。
      const path = [[sx, sz], ...P1.filter(([, z]) => z < sz - 2 && z >= -30), [finals[i][0], -30], finals[i]];
      const g = allyGroup(rt, { fixed: true, fullStrength: true, noGuard: true, name: sp.name, anchor: fieldPoint(sx, sz), facing: Math.PI + FIELD_TURN, formation: 'column', spacing: 1.4, order: 'hold', speed: 3.0, morale: 100, noRout: true, fleeDir: fieldVector(0, 1) },
        [{ type: 'samurai', n: 1, o: { name: '' } }, { type: 'ashigaru', n: sp.n }]);
      g.path = path.map(fieldPathPoint);
      g.preRainStep = path.findIndex((q) => q[1] <= 30);
      g.rainStep = path.findIndex((q) => q[1] <= 0);
      g.leader = g.units[0];
      if (i === 2) {
        rt.flags.genpachi = g.units[0];
        rt.flags.yashichi = g.units[1];
        // 組頭と足軽にも、普通の兵と同じ死傷がある。
        rt.hostGroup = g;
      }
      if (i === 0) rt.flags.yohei = g.units[0];
      g.onArrive = (gg) => { gg.arrived = true; gg.order = 'hold'; gg.formation = 'yari'; gg.facing = Math.PI + FIELD_TURN; };
      rt.flags.cols.push(g);
    });
    // 信長の馬廻
    const nob = allyGroup(rt, { fixed: true, fullStrength: true, noGuard: true, name: '馬廻', anchor: fieldPoint(14, 176), facing: Math.PI + FIELD_TURN, formation: 'column', order: 'hold', speed: 3.3, noRout: true },
      [...(rt.G.lord ? [] : [{ type: 'busho', n: 1, o: { name: '織田信長', invuln: true, flag: 'eiraku', horse: true, haori: 0x7a1d14 } }]), { type: 'samurai', n: 1, o: { name: '服部小平太', flag: 'eiraku', invuln: true } }, { type: 'samurai', n: 1, o: { name: '毛利新介', flag: 'eiraku', invuln: true } }, { type: 'busho', n: 1, o: { name: '前田利家', flag: 'eiraku', invuln: true, horse: false } }, { type: 'busho', n: 1, o: { name: '木下雅楽助', flag: 'eiraku', invuln: true, horse: false } }, { type: 'busho', n: 1, o: { name: '中川金右衛門', flag: 'eiraku', invuln: true, horse: false } }, { type: 'samurai', n: 6, o: { flag: 'eiraku' } }]);
    nob.path = [[14, 176], [24, 176], [24, 144], [18, 130], [14, 100], [2, 70], [-12, 40], [-30, 0], [-44, -30]].map(fieldPathPoint);
    nob.onArrive = (g) => { g.order = 'hold'; g.formation = 'line'; g.facing = Math.PI + FIELD_TURN; };
    rt.flags.nob = nob;
    rt.flags.nobKill = [nob.units.find((u) => u.name === '服部小平太'), nob.units.find((u) => u.name === '毛利新介')];
    rt.flags.attackers = [...rt.flags.cols, nob];
    // 信長の馬印（金の扇）は、馬印持ちが信長の後ろについて運ぶ
    if (!rt.G.lord && nob.units[0]) rt.flags.uma = umaFollow(rt.world, rt.scene, nob.units[0], 'ogi');

    // 今川勢（休息中）
    const E = rt.flags.enemies = [];
    // 前の備えの無名の侍を一騎ずつ騎乗させる補完。討たれれば空馬が残る（実兵数は変えない）。
    E.push(enemyGroup(rt, { fixed: true, noGuard: true, faction: 'imagawa', formation: 'yari', spacing: 1.5, width: 12, anchor: fieldPoint(0, -96), facing: FIELD_TURN, morale: 85, fleeDir: fieldVector(0.2, -1), aggro: 7 }, [{ type: 'samurai', n: 1, o: { horse: true } }, { type: 'ashigaru', n: 14 }]));
    E.push(enemyGroup(rt, { fixed: true, noGuard: true, faction: 'imagawa', formation: 'yari', spacing: 1.5, width: 12, anchor: fieldPoint(40, -92), facing: (-0.4) + FIELD_TURN, morale: 85, fleeDir: fieldVector(0.6, -1), aggro: 7 }, [{ type: 'samurai', n: 1, o: { horse: true } }, { type: 'ashigaru', n: 10 }, { type: 'bow', n: 4 }]));
    E.push(enemyGroup(rt, { fixed: true, noGuard: true, faction: 'imagawa', formation: 'yari', spacing: 1.5, width: 12, anchor: fieldPoint(-22, -118), facing: (0.3) + FIELD_TURN, morale: 85, fleeDir: fieldVector(-0.5, -1), aggro: 7 }, [{ type: 'busho', n: 1, o: { name: '松井宗信' } }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12 }]));
    // 本陣の両脇と後方で休む組。近い敵へ備えを向ける。
    E.push(enemyGroup(rt, { fixed: true, noGuard: true, faction: 'imagawa', formation: 'yari', spacing: 1.5, width: 12, anchor: fieldPoint(40, -124), facing: (-0.8) + FIELD_TURN, morale: 85, fleeDir: fieldVector(0.6, -1), aggro: 7 }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12 }]));
    E.push(enemyGroup(rt, { fixed: true, noGuard: true, faction: 'imagawa', formation: 'yari', spacing: 1.5, width: 12, anchor: fieldPoint(-4, -134), facing: (0.2) + FIELD_TURN, morale: 85, fleeDir: fieldVector(-0.2, -1), aggro: 7 }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 11 }, { type: 'bow', n: 2 }]));
    const H = enemyGroup(rt, { fixed: true, noGuard: true, faction: 'imagawa', name: '義元の旗本', formation: 'ring', width: 12, anchor: fieldPoint(HONJIN.x, HONJIN.z + 2), facing: FIELD_TURN, morale: 100, fleeDir: fieldVector(0, -1), aggro: 6, noRout: true, spacing: 1.8 },
      [{ type: 'busho', n: 1, o: { name: '今川義元', invuln: true, noHead: true, flagScale: 1.4 } }, { type: 'busho', n: 1, o: { name: '山田新右衛門', horse: false } }, { type: 'samurai', n: 15 }]);
    rt.flags.yoshimoto = H.units[0];
    // 義元は主人公だけでなく味方の槍でも傷つく。首を挙げる筋は毛利新介へ結ぶ。
    H.units[0].allyOk = true;
    H.units[0].onWound = () => { rt.flags.yoshiDown = true; };
    rt.flags.hatamoto = H;
    H.guard = true;
    H.defMult = 1.2;
    for (const g of E) { g.guard = true; g.guardSight = 32; g.guardLeash = 12; }
    E.push(H);

    // 主君で遊ぶ時も、所在が確定していない者から義元の居場所を聞かせない。
    if (rt.G.lord) {
      rt.flags.nobSeen = true;
      rt.setPhase('brief');
      rt.world.setTime('day');
      rt.obj('honjin0', '今川の備えへかかれ', 'main');
      rt.say('織田信長', '首は取るな、討ち捨てにせよ。敵の備えを突き崩せ。――出るぞ', 4);
      rt.after(9, () => this.brief(rt));
    } else {
    rt.obj('talk', '組の旗のそばへ行き、組頭の下知を聞け', 'main');
    rt.marker('genpachi', unitPos(rt.flags.genpachi), '組頭・組の旗', { person: true });
    rt.addInteract('talk', unitPos(rt.flags.genpachi), '下知を聞く', () => this.brief(rt), { r: 3.5 });
    rt.setPhase('brief');
    rt.world.setTime('day');
    rt.say('組の足軽', `おう、${nm(rt)}。組頭のそばへ歩け。近づけば「下知を聞く」が出るぞ`, 4);
    }
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    rt.flags.hist = { honjin: 'HIST_B', oketaniTerrain: 'HIST_B', rain: 'HIST_A', nakajimaFort: 'HIST_B', distantArmies: 'GAME_C', takane: 'HIST_B', denrakutsubo: 'HIST_B', kamagaya: 'HIST_B', baggage: 'GAME_C', villageStream: 'GAME_C' };
    // 今川の小荷駄（本陣の北の窪みに荷車と俵。遠景の隊と荷）
    DA0(rt, W);
    // 本陣周辺六千のうち、戦う範囲の外にいる控えを軽く描く。大高の別働勢は置かない。
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => KT.farHost(rt, fieldX(x, z), fieldZ(x, z), w, d, count, facing + FIELD_TURN, armor, flag, seed, kind);
    rt.flags.imaDA = [DA(-20, -210, 70, 16, 300, 0, 0x3f2a24, 'imagawa', 3, 'mixed')];
    [[82, -180, 32, 16, 180, -0.3, 'spear'], [-72, -170, 30, 20, 160, 0.4, 'mixed']]
      .forEach(([x, z, w, d, n, f, kind], i) => rt.flags.imaDA.push(DA(x, z, w, d, kind === 'cavalry' ? 110 : n, f, i % 2 ? 0x3a3026 : 0x3f2a24, 'imagawa', 11 + i, kind)));
    // 織田の後詰（善照寺砦の方）
    rt.flags.jinSaku = DA(0, 232, 30, 40, 80, Math.PI, 0x2b3140, 'oda', 4, 'spear');
    // 織田の本隊（二千ほど）：行軍が始まると、組の後ろから山あいの道を続いてくる
    rt.flags.far = [];
    for (let i = 0; i < 8; i++) {
      const q = farArmy(rt, fieldX(0, 200), fieldZ(0, 200), 5, 12, 36, FIELD_TURN, 0x2b3140, i % 3 === 1 ? 'eiraku' : 'oda', 70 + i);
      const side = i % 2 ? 3 : -3;
      // 道の途中（組が待つ谷の手前）で止まる。組の待つ所を通り抜けて、戦う兵と重ならないように
      q.path = [[side, 200], ...P1.filter(([, z]) => z > -20).map(([x, z]) => [x + side, z]), [-36 + (i % 4) * 14, -18 + Math.floor(i / 4) * 12]];
      q.s = -i * 14;   // 間をあけて続く
      q.m.visible = false;
      rt.flags.far.push(q);
    }
    scenery.finish();
    buildBattleJin(rt);
    // 備え表の共通接続で槍列へ戻される旗本を、義元中心の囲みへ戻す。
    H.formation = 'ring'; H.leader = rt.flags.yoshimoto;
    for (let i = 0; i < H.units.length; i++) {
      const u = H.units[i], q = H.slotPos(i, H.initial);
      u.pos.x = q.x; u.pos.z = q.z; u.pos.y = rt.world.heightAt(q.x, q.z); u.mesh.position.copy(u.pos);
    }
    for (let i = 0; i < rt.flags.attackers.length; i++) {
      const g = rt.flags.attackers[i];
      g.yariRanks = 3; g.okeSide = [-12, 12, 0, -6, 4][i]; g.okeBack = i === 4 ? 9 : 3;
    }
  },

  // 軽い本隊は行軍だけを表す。接触域へは押し込まず、実兵と重ねない。
  moveFar(rt, dt) {
    if (rt.phase !== 'march' && !rt.flags.victory) return;
    for (const q of rt.flags.far) {
      if (!q.done) q.s += dt * 2.5;
      // 入れ物は隊ごとに一つ。毎コマ位置の物を作らない。
      const p = q.walk || (q.walk = { x: 0, z: 0, h: 0, end: false });
      let left = Math.max(0, q.s);
      for (let i = 1; i < q.path.length; i++) {
        const a = q.path[i - 1], b = q.path[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (left <= length || i === q.path.length - 1) {
          const k = length > 0 ? Math.min(1, left / length) : 1;
          p.x = a[0] + (b[0] - a[0]) * k; p.z = a[1] + (b[1] - a[1]) * k;
          p.h = Math.atan2(b[0] - a[0], b[1] - a[1]); p.end = left >= length && i === q.path.length - 1;
          break;
        }
        left -= length;
      }
      q.done = p.end; q.m.visible = q.s > 0;
      moveFar(rt, q, fieldX(p.x, p.z), fieldZ(p.x, p.z), (p.end ? rt.flags.victory ? 0 : Math.PI : p.h) + FIELD_TURN);
    }
  },
  brief(rt) {
    if (rt.over || rt.flags.ending || rt.phase !== 'brief' || rt.flags.briefed) return;
    rt.flags.briefed = true;
    rt.uninteract('talk'); rt.unmark('genpachi'); rt.objRemove('talk');
    if (!rt.G.lord) rt.say('組頭', '丸根と鷲津が落ちたとの知らせじゃ。殿に続くぞ', 4);
    if (!rt.G.lord) rt.say('組頭', '分捕りはならぬ。討ち捨てにせよとの下知じゃ。組の旗を離れるな', 4);
    rt.after(3, () => this.startMarch(rt));
  },
  startMarch(rt) {
    if (rt.over || rt.flags.ending || rt.phase !== 'brief') return;
    rt.setPhase('march');
    this.marchFlag(rt);
    for (const g of rt.flags.cols) { g.order = 'path'; g.formation = 'column'; g.colW = 2; }
    rt.after(6, () => { if (!rt.over && !rt.flags.ending && rt.phase === 'march') { rt.flags.nob.order = 'path'; rt.flags.nob.formation = 'column'; rt.flags.nob.colW = 2; } });
  },
  marchFlag(rt) {
    rt.obj('col', '組の旗について進め', 'main');
    rt.marker('genpachi', () => {
      const g = rt.hostGroup, s = g.stds && g.stds[0], u = s && s.userData.carrier;
      return u && u.alive ? u.pos : g.count ? g.center() : null;
    }, '組の旗');
  },
  update(rt, dt) {
    const F = rt.flags;
    if (F.uma) F.uma.update(dt);
    if (rt.over || F.ending || !rt.player.u.alive) return;
    if (rt.phase === 'brief' && rt.t > 20) this.brief(rt);
    this.moveFar(rt, dt);
    if (rt.phase === 'march') this.march(rt);
    else if (rt.phase === 'wait') this.wait(rt);
    else if (rt.phase === 'assault') this.assault(rt, dt);
  },
  march(rt) {
    const F = rt.flags, host = rt.hostGroup;
    if (!F.preRain && host.pathIdx >= host.preRainStep) { F.preRain = true; rt.world.setRainTarget(0.12); }
    if (!F.rain && host.pathIdx >= host.rainStep) {
      F.rain = true; rt.world.setRainTarget(1); rt.world.setTime('storm');
      rt.banner('急な雨'); rt.say('組の足軽', '前がよう見えん。旗について行け！', 3);
    }
    if (host.arrived && rt.t >= (F.marchNoticeAt || 0)) {
      F.marchNoticeAt = rt.t + 1;
      const late = F.cols.find((g) => g.count && !g.routed && !g.arrived && g.units.some((u) => u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget));
      rt.objProgress('col', late ? `${late.name}が谷を抜けるまで、組の旗の下で構えよ` : '組の旗の下で構えよ');
    }
    if (host.arrived && F.cols.every((g) => !g.count || g.routed || g.arrived || g.units.every((u) => !u.alive || u.gone || u.fleeing || u.woundOut || u.noTarget))) {
      rt.setPhase('wait'); rt.objRemove('col');
      rt.obj('wait', '雨が弱まるまで組のそばで構え、かかれの合図を待て', 'main');
      rt.say('組頭', '身を低くせよ。殿の合図を待つぞ', 3);
    }
  },
  wait(rt) {
    const F = rt.flags;
    rt.objProgress('wait', F.clear ? '雨足が弱まった。組の旗で、かかれの合図を待て' : '雨で前が見えぬ。組と身を低くし、旗のそばで構えよ');
    if (rt.pt > 11 && !F.clear) {
      F.clear = true; rt.world.setRainTarget(0); rt.world.setTime('after'); rt.world.addPuddles(30);
      rt.banner('雨が弱まった');
    }
    if (rt.pt > 15 && !F.kakare) {
      F.kakare = true; hush(2);
      rt.say('織田信長', 'かかれ、かかれ！', 3);
      rt.after(2, () => { sfx('horagai', 1); this.startAssault(rt); });
    }
  },
  startAssault(rt) {
    const F = rt.flags;
    if (rt.over || F.ending || rt.phase !== 'wait') return;
    rt.setPhase('assault'); rt.objRemove('col'); rt.objRemove('wait'); rt.objRemove('honjin0');
    rt.obj('attack', '谷を進む味方の旗につき、今川の備えを押せ。本陣は幕の口から寄せよ', 'main');
    const offs = [-24, 22, 0, -10];
    for (let i = 0; i < F.cols.length; i++) {
      const g = F.cols[i];
      if (!g.count || g.routed) continue;
      g.order = 'attack'; g.formation = 'yari'; g.seekRange = 32;
      g.anchor = fieldPoint(HONJIN.x + offs[i], HONJIN.z + 24 + i * 3);
      g.facing = Math.PI + FIELD_TURN; g.noRout = false;
    }
    // 馬廻も道から歩いて寄せる。信長を最前列へ単独で放り込まない。
    F.nob.order = 'attack'; F.nob.formation = 'yari'; F.nob.seekRange = 26;
    F.nob.anchor = fieldPoint(HONJIN.x, HONJIN.z + 30);
    F.nob.noRout = false;
  },
  assault(rt, dt) {
    const F = rt.flags, y = F.yoshimoto, p = rt.player.u.pos;
    if (F.ending) return;
    if (F.victory) {
      if (!F.returnGroup || !F.returnGroup.count || F.returnGroup.routed) F.returnGroup = F.attackers.find((g) => g.count && !g.routed);
      const host = F.returnGroup, c = host && host.count ? host.center() : null;
      if (!F.returnWarn && rt.t - F.returnT > 140) { F.returnWarn = true; rt.bark('帰る組から離れておる。旗へ戻らねば、帰還の任務を果たせぬ', true); }
      rt.objProgress('return', !c ? '残った組を探し、砦の方へ退け' : localZ(p.x, p.z) <= 100 ? `帰る旗まで ${Math.round(Math.hypot(c.x - p.x, c.z - p.z))}歩ほど・組と砦の方へ進め` : Math.hypot(c.x - p.x, c.z - p.z) >= 16 ? `帰る組の旗まで ${Math.round(Math.hypot(c.x - p.x, c.z - p.z))}歩ほど・旗へ戻れ` : '旗のそばに着いた。組が砦の方へ進むのを待て');
      if (c && localZ(p.x, p.z) > 100 && Math.hypot(c.x - p.x, c.z - p.z) < 16) {
        F.ending = true; rt.unmark('genpachi'); rt.objDone('return'); rt.tracker.main = true;
        rt.award((t) => t.side.push('勝った後も組と砦へ戻った'), '組と砦へ戻った'); rt.finish({}, 5);
      } else if (rt.t - F.returnT > 180) {
        F.ending = true; rt.objFail('return'); rt.tracker.main = false;
        rt.unmark('genpachi');
        rt.banner('組との帰還を果たせず'); rt.say('組頭', '残った者を集め、砦の方へ退け！', 3); rt.finish({}, 5);
      }
      return;
    }
    // 局地の変化は一秒に一度。段が替わっても兵は増やさず、生存隊が歩いて動く。
    F.tacticalT = (F.tacticalT || 0) - dt;
    if (F.tacticalT > 0) return;
    F.tacticalT = 1;
    if (rt.player.u.hp < rt.player.u.maxHp * 0.55 && !(F.guardWarnAt > rt.t)) {
      F.guardWarnAt = rt.t + 8;
      rt.bark('傷が深い。敵を向いて構え、味方の列へ下がれ', true);
    }
    let guards = 0;
    for (const u of F.hatamoto.units) if (u.alive && u !== y && !u.gone && !u.noTarget && !u.woundOut && !u.fleeing) guards++;
    if (!F.entered && Math.hypot(p.x - y.pos.x, p.z - y.pos.z) < 18) {
      F.entered = true;
      rt.obj('attack', '組とともに、義元を囲む旗本を崩せ', 'main');
    }
    // 本陣前の備えが崩れれば、馬廻が口へ寄せる。時間だけでは守りを破らない。
    if (!F.mainPush && (gone(F.enemies[0]) || gone(F.enemies[1]))) {
      F.mainPush = true;
      for (const g of F.attackers) if (g.count && !g.routed) {
        g.anchor = fieldPoint(HONJIN.x + g.okeSide, HONJIN.z + g.okeBack); g.seekRange = 28;
      }
    }
    // 旗本を減らされると、輿を捨て、囲みを保って陣の口から退く。実際に歩く。
    if (!F.koshiLeft && guards <= 8) {
      F.koshiLeft = true;
      if (sightPoint(rt, y.pos)) rt.bark('義元の旗本が囲みを保って退く。味方と押せ、一人で追うな');
      if (F.koshi) { F.koshi.rotation.z = 0.12; F.koshi.position.y -= 0.4; }
      const H = F.hatamoto;
      H.guard = false; H.order = 'path'; H.formation = 'ring'; H.speed = 1.4;
      H.path = [[18, -100], [50, -116], [86, -138]].map(fieldPathPoint); H.pathIdx = 0;
      H.onArrive = (g) => { g.order = 'hold'; };
    }
    if (F.entered && sightPoint(rt, y.pos) && Math.hypot(p.x - y.pos.x, p.z - y.pos.z) < 24) {
      let best = 0, angle = 0;
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        let clear = Math.PI;
        for (const u of F.hatamoto.units) {
          if (u === y || !u.alive || u.gone || u.fleeing || u.woundOut || u.noTarget) continue;
          const b = Math.atan2(u.pos.x - y.pos.x, u.pos.z - y.pos.z);
          clear = Math.min(clear, Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))));
        }
        if (clear > best) { best = clear; angle = a; }
      }
      const q = F.guardGap || (F.guardGap = { x: 0, z: 0 });
      q.x = y.pos.x + Math.sin(angle) * 5; q.z = y.pos.z + Math.cos(angle) * 5;
      const visible = best > 0.55 && sightPoint(rt, q) && !rt.army.wallBetween(p, -1, q);
      if (visible && !F.guardGapMarked) rt.marker('guardGap', () => F.guardGap, '囲みの切れ目・味方と押せ', { red: true });
      if (!visible && F.guardGapMarked) rt.unmark('guardGap');
      F.guardGapMarked = visible;
      if (F.koshiLeft && !F.guardTurnSaid) { F.guardTurnSaid = true; rt.bark('旗本は退いても向き直る。槍の向きを見て、味方と押せ'); }
    } else if (F.guardGapMarked) { rt.unmark('guardGap'); F.guardGapMarked = false; }
    const hat = F.nobKill[0], mor = F.nobKill[1];
    if (!F.entered) rt.objProgress('attack', F.mainPush ? '前の備は崩れた。味方の旗に続き、幕の口へ寄せよ' : '本陣の前の備を、味方と槍をそろえて押せ');
    if (F.entered) {
      const seenHat = hat && hat.alive && !hat.woundOut && !hat.fleeing && !hat.noTarget && sightPoint(rt, hat.pos);
      const seenMor = mor && mor.alive && !mor.woundOut && !mor.fleeing && !mor.noTarget && sightPoint(rt, mor.pos);
      if (seenHat && !F.hattoriMarked) rt.marker('hattori', unitPos(hat), '服部小平太（本陣で戦う）', { person: true });
      else if (!seenHat && F.hattoriMarked) rt.unmark('hattori');
      if (seenMor && !F.moriMarked) rt.marker('mori', unitPos(mor), '毛利新介（本陣へ寄せる）', { person: true });
      else if (!seenMor && F.moriMarked) rt.unmark('mori');
      F.hattoriMarked = !!seenHat; F.moriMarked = !!seenMor;
      rt.objProgress('attack', seenHat || seenMor ? F.koshiLeft ? '義元の囲みが退く。服部・毛利の旗と退き口へ寄せよ' : F.yoshiDown ? F.hattoriMet ? '毛利の手が届くまで、旗本を味方と押せ' : '服部の手が義元へ届くよう、幕の口を味方と押せ' : '服部・毛利の旗につき、義元の囲みの切れ目を押せ' : '味方と槍をそろえ、本陣の守りを崩せ');
    }
    if (F.mainPush) {
      for (const g of F.attackers) if (g.count && !g.routed) {
        g.anchor.x = y.pos.x + g.okeSide * FIELD_C + g.okeBack * FIELD_S; g.anchor.z = y.pos.z - g.okeSide * FIELD_S + g.okeBack * FIELD_C;
      }
    }
    if (hat && hat.alive && !hat.woundOut && !hat.fleeing && !hat.noTarget && Math.hypot(hat.pos.x - y.pos.x, hat.pos.z - y.pos.z) < 3 && !rt.army.wallBetween(hat.pos, 0, y.pos)) F.hattoriMet = true;
    // 深手、旗本の損失、服部の接触、毛利の到着がそろった時だけ討取りへ。
    if (F.yoshiDown && guards <= 6 && F.hattoriMet && mor && mor.alive && !mor.woundOut && !mor.fleeing && !mor.noTarget && Math.hypot(mor.pos.x - y.pos.x, mor.pos.z - y.pos.z) < 3 && !rt.army.wallBetween(mor.pos, 0, y.pos)) {
      y.invuln = false; rt.army.kill(y, mor);
    }
    if (!y.alive) { this.returnHome(rt); return; }
    let ready = 0;
    for (const g of F.attackers) if (g.count && !g.routed) ready += g.count;
    if (!ready || (F.koshiLeft && localX(y.pos.x, y.pos.z) > 80 && (!mor || !mor.alive || Math.hypot(mor.pos.x - y.pos.x, mor.pos.z - y.pos.z) > 15)) || rt.pt > 420) {
      F.ending = true; rt.tracker.main = false; rt.objFail('attack');
      rt.unmark('hattori'); rt.unmark('mori'); rt.unmark('guardGap');
      rt.banner('攻めを止める');
      rt.say('組頭', !ready ? '攻める備が崩れた。残った者を連れて下がれ！' : rt.pt > 420 ? '攻めが長引いた。敵の守りはまだ固い。組を下げよ！' : '義元の旗本に退かれた。深追いせず、組を下げよ！', 3); rt.finish({}, 5);
    }
  },
  returnHome(rt) {
    const F = rt.flags;
    rt.unmark('hattori'); rt.unmark('mori'); rt.unmark('guardGap');
    F.victory = true; F.returnT = rt.t; rt.objDone('attack'); rt.objRemove('attack');
    if (Math.hypot(rt.player.u.pos.x - F.yoshimoto.pos.x, rt.player.u.pos.z - F.yoshimoto.pos.z) < 40) rt.banner('今川義元、討ち取ったり', '毛利新介が首を挙げた');
    // 本陣崩壊の知らせは即座に全軍へ届かない。奥の隊ほど遅れて退く。
    F.enemies.forEach((g, i) => rt.after(2 + i * 3, () => { g.noRout = false; g.morale = 0; }));
    F.imaDA.forEach((m, i) => rt.after(8 + i * 5, () => m.rout({ hideAfter: Infinity })));
    for (let i = 0; i < F.far.length; i++) {
      const q = F.far[i];
      if (!q.m.visible) continue;
      q.path = [[localX(q.x, q.z), localZ(q.x, q.z)], ...q.path.slice().reverse(), [-28 + i * 8, 206 + (i % 2) * 16]];
      q.s = 0; q.done = false;
    }
    for (const g of F.attackers) if (g.count && !g.routed) {
      g.guard = false; g.order = 'path'; g.formation = 'column';
      g.path = [[18, -100], ...P1.slice().reverse()].map(fieldPathPoint); g.pathIdx = 0;
      g.onArrive = (q) => { q.order = 'hold'; };
    }
    F.returnGroup = rt.hostGroup.count && !rt.hostGroup.routed ? rt.hostGroup : F.attackers.find((g) => g.count && !g.routed);
    rt.obj('return', '帰る組の旗を離れず、中島砦の方へ戻れ', 'main');
    rt.say('組頭', '深追いはここまでじゃ。帰る組の旗について戻れ！', 4);
    rt.marker('genpachi', () => F.returnGroup && F.returnGroup.count ? F.returnGroup.center() : null, '帰る組の旗');
  },
  onKill(rt, v) {
    if (v.team === 1) rt.flags.ek = (rt.flags.ek || 0) + 1;
    else rt.flags.ak = (rt.flags.ak || 0) + 1;
  },
  onHead(rt) {
    if (!rt.G.lord) rt.violation('分捕りを禁じる下知に背いた', ['組頭', '首を置け。敵を突き崩せ！']);
  },
};

// 史料にない迂回の選択や、一人の足軽による全軍指揮を入れない。
okehazama.rts = true;
okehazama.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '今川軍', mon: 'imagawa' } };
// 参戦者は開始時の馬廻・旗本へ置いた。後から名前のある兵を足さない。
okehazama.date = (rt) => `永禄三年五月十九日　初夏・${sky(rt)}`;
// 見える局地戦の数。本陣から離れた大高・鳴海などの兵をここへ合算しない。
// 損害一人を何十人へ水増しせず、出陣時の目安を示す。
okehazama.force = () => ({ a: 2000, a0: 2000, b: 6000, b0: 6000 });
okehazama.history = '豪雨が弱まった後、織田勢は今川の備えを攻めた。『信長公記』では、義元の旗本は囲みを保って退き、何度も向き直って戦った。服部小平太が義元と戦って膝を斬られ、毛利新介が義元を討ち取った。織田の攻撃兵は二千に足らずという。本陣周辺の今川六千は後世の推定を参考にした目安で、全軍の数ではない。今川全軍は二万五千ともいい、公記の数とは異なる。両軍の備えの割り振り、細かな配置、小川、砦の形、短い待ち時間は推定復元。戦場の位置と接近路にも諸説がある。';

// 自分の組へ続く。物陰越しの敵・遠い敵を追わず、帰陣では旗へ戻る。
okehazama.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const F = b.flags, p = b.player, u = p.u;
  if (!u.alive) return;
  inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
  inp.guardHold = false;
  inp.leftPressed = false; inp.chargeHold = false;
  inp.runHeld = false;
  // 手綱を取る間は止まる。組への追従で走り抜けると、手綱取りが取り消される。
  if (p.catching || p.mountT > 0) return;
  if (b.phase === 'brief' && !F.briefed && !b.G.lord) {
    const q = F.genpachi.pos; goTo(p, inp, q.x, q.z, 2);
    if (Math.hypot(q.x - u.pos.x, q.z - u.pos.z) < 3) inp.e.add('KeyE');
    return;
  }
  const host = F.victory ? F.returnGroup : b.hostGroup.count ? b.hostGroup : F.attackers.find((g) => g.count && !g.routed);
  if (!host || !host.count) return;
  if (b.phase === 'assault' && !F.victory) {
    // 討ち取れない義元の一撃も受ける。攻める相手だけを探すと、構えずに打たれる。
    const threat = b.army.nearestEnemy(u, 10, (o) =>
      ((o.atk && !o.atk.bow && o.atk.target === u) ||
       (o.swing && !o.swing.done && o.swing.target === u) ||
       (o.charging && o.cv === 'in' && o.target === u)) &&
      Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos));
    const e = threat || strikeTarget(b, 10);
    if (e) {
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z), reach = p.weapon === 'sword' ? 1.9 : 2.8;
      // 打ち込み中は回り道で背を向けず、その場で受ける。
      if (!threat && d > reach * 0.85) goTo(p, inp, e.pos.x, e.pos.z, reach * 0.85);
      // 不死身の義元へ連打せず、周りの旗本の隙を突く。構えを解き、届く時だけ突く。
      patientStrike(p, inp, e, d);
      return;
    }
    // 敵が目の前にいない時だけ、組の近くの空馬へ寄る。帰陣の下知では寄り道しない。
    if (!p.mounted && b.army.looseHorses && !b.army.nearestEnemy(u, 6)) {
      const q = host.center();
      let horse = null, near = 15;
      for (const o of b.army.looseHorses) {
        if (!o.from || !o.h.parent || o.mode === 'fled') continue;
        const hp = o.h.position, d = Math.hypot(hp.x - u.pos.x, hp.z - u.pos.z);
        if (d < near && Math.hypot(hp.x - q.x, hp.z - q.z) < 16 && !b.army.wallBetween(u.pos, -1, hp)) { horse = o; near = d; }
      }
      if (horse) {
        goTo(p, inp, horse.h.position.x, horse.h.position.z, 2.5);
        if (near < 3.2) inp.k.add('KeyE');
        return;
      }
    }
  }
  const q = host.center(); goTo(p, inp, q.x, q.z, 4);
};

// 味方の鉄砲の一斉射：敵の組が鉄砲の前へ寄せた所で一度だけ「放て」。当たった組の士気を落とし、崩れやすくする
export function volleyAt(rt, key, guns, foes, o = {}) {
  const F = rt.flags; F.vol = F.vol || {};
  if (F.vol[key] || gone(guns)) return false;
  const gc = guns.center(), r = o.r || 32;
  const near = foes.filter((g) => !gone(g) && Math.hypot(g.center().x - gc.x, g.center().z - gc.z) < r);
  if (!near.length && !(o.until && rt.t > o.until)) return false;
  F.vol[key] = true;
  const hit = near.length ? near : foes.filter((g) => !gone(g));
  guns.order = 'attack'; guns.seekRange = r + 10;
  rt.say(o.who || '鉄砲頭', o.text || '引きつけたぞ。……放てえっ！', 3);
  rt.banner(o.title || '鉄砲、放て', o.sub || '味方の鉄砲が一斉に火を噴く');
  rt.army.play('volley', gc, 1.8);
  rt.after(0.5, () => rt.army.play('volley', gc, 1.2));
  for (const g of hit) { g.morale -= o.hit || 28; if (o.unpin) g.noRout = false; }
  rt.after(2.5, () => { if (o.then) rt.say(o.then[0], o.then[1], 3); });
  return true;
}

export { okehazama };
