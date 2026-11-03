// ======================================================================
// 豊臣編 2　賤ヶ岳の戦い（天正十一年四月二十一日の夜明け）。筋書きは docs/chapter2_toyotomi.md の「2. 賤ヶ岳の戦い」。
// 戦の型：砦＋山岳（尾根と砦を取り合う）。主人公は秀吉の旗本の侍大将。七本槍の若者と並んで尾根を駆け下りる。
// 段：①夜の道を松明で駆け、賤ヶ岳の砦に入る ②夜明け、尾根を退く佐久間勢に追いすがる
//     ③尾根の上で柴田勝政の殿を崩す ④余呉湖の西を北へ押し、前田勢が退くのを見て柴田の本陣へ迫る
// 負け方：賤ヶ岳の砦が奪われる（一つ目は主人公が討たれる）。遊んで六分ほど。
// 座標：x が東、z が南（北が −z）。ゲームの 1 は実の 8m に縮めた（余呉湖・賤ヶ岳・権現坂を一枚に収める）。
// 地形は手書きの山の形に、国土地理院の標高（asset_dem_shizugatake.js。tools/dem.mjs の shizugatake）の細かい起伏を足す。
// ======================================================================
import * as THREE from 'three';
import { useTerrain } from './asset_manifest.js';
import { demDetail } from './dem.js';
import { enemyGroup, allyGroup, ringWall, gauss } from './bhelp.js';
import { nobori, kagaribi } from './props.js';
import { distToPolyline } from './world.js';
import { victoryMoment } from './victory_moment.js';
import { sfx } from './audio.js';
import { withGuard } from './toyo_bot.js';
import { MEM_TIGHT } from './settings.js';

let dem = null;
useTerrain('dem_shizugatake', (d) => { dem = d; });

// ---- 場所（ゲームの座標） ----
// 標高の格子（中心 北緯35.52・東経136.188）の実の m を 1/8 に縮め、DEM_O だけずらす：ゲーム = 実/8 + DEM_O。
// 実の位置：賤ヶ岳の頂 (440,1560)・余呉湖の中心 (500,-250)・大岩山 (1520,-120)・湖の西の尾根 (-880,-180)。
const DEM_XY = 8, DEM_O = { x: -75, z: -5 };
const LAKE = { x: -12, z: -36, rx: 62, rz: 95 };         // 余呉湖
const FORT = { x: -20, z: 190, r: 17 };                  // 賤ヶ岳の砦（山頂）
const START = { x: 45, z: 228 };                         // 木之本から上がる道の途中（前は 80,250 の坂の下で、始めの25秒は目の前の山の法しか写らなかった）
const RIDGE = [[-20, 190], [-55, 150], [-85, 105], [-108, 55], [-122, 5], [-125, -60], [-110, -130], [-85, -200]];
const ROAD = [[150, 300], [110, 270], [80, 250], [45, 228], [15, 205], [-8, 194]];
const SAKUMA = [[-50, 152], [-74, 118], [-94, 84], [-108, 50]];   // 尾根を退く佐久間勢
const KATSUMASA = { x: -122, z: 8 };                     // 柴田勝政の殿
const HONJIN = { x: -84, z: -204 };                      // 柴田の本陣の旗（行市山・狐塚の方）
const MORIMASA = { x: -104, z: -152 };                   // 突き出た佐久間盛政の本隊（権現坂の下）
const MAEDA = { x: -52, z: -176 };                       // 前田利家の隊（茂山の方。戦わずに陣を払う）
const WAY4 = [{ x: -124, z: -66, n: 8 }, { x: -108, z: -136, n: 8 }];
const REAL_CAP = 150;

// ---- 地形 ----
const sstep = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const lakeD = (x, z) => Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
// 尾根の高さ：山頂の 44 から北の権現坂へ 20 まで下がる
function ridgeAt(x, z) {
  let best = Infinity, t = 0, acc = 0, total = 0;
  for (let i = 0; i < RIDGE.length - 1; i++) total += Math.hypot(RIDGE[i + 1][0] - RIDGE[i][0], RIDGE[i + 1][1] - RIDGE[i][1]);
  for (let i = 0; i < RIDGE.length - 1; i++) {
    const [ax, az] = RIDGE[i], [bx, bz] = RIDGE[i + 1], L = Math.hypot(bx - ax, bz - az);
    const k = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (L * L)));
    const d = Math.hypot(x - (ax + (bx - ax) * k), z - (az + (bz - az) * k));
    if (d < best) { best = d; t = (acc + L * k) / total; }
    acc += L;
  }
  return { d: best, h: 36 - 18 * t };
}
function natural(x, z) {
  let h = 5 + 2.4 * Math.sin(x * 0.031 + 0.7) * Math.cos(z * 0.027) + 1.4 * Math.sin(x * 0.07 - z * 0.05);
  const R = ridgeAt(x, z);
  h += R.h * Math.exp(-((R.d / 60) ** 2));               // 尾根（肩はなだらかに。兵が上り下りできる傾き）
  h += 22 * (1 - sstep(0, 150, Math.hypot(x - FORT.x, z - FORT.z)));   // 賤ヶ岳の山頂の盛り上がり
  h += Math.max(0, -x - 170) * 0.28;                     // 西の山並み（行市山の方）
  h += 24 * gauss(x, z, 115, -20, 2 * 36 * 36);          // 大岩山
  h += 16 * gauss(x, z, 100, 62, 2 * 30 * 30);           // 岩崎山
  if (dem) h += demDetail(dem, x, z, { xy: DEM_XY, ox: DEM_O.x, oz: DEM_O.z, scale: 0.08, win: 80 }) * (1 - sstep(0.9, 1.25, 2.2 - lakeD(x, z)));
  return h;
}
let FORT_H = null;
function height(x, z) {
  let h = natural(x, z);
  // 山頂の砦は平らに削る
  const df = Math.hypot(x - FORT.x, z - FORT.z);
  if (df < FORT.r + 10) { if (FORT_H === null || FORT_H.dem !== dem) FORT_H = { dem, h: natural(FORT.x, FORT.z) }; h += (FORT_H.h - h) * (1 - sstep(FORT.r, FORT.r + 10, df)); }
  // 余呉湖：岸で 0、湖の底は −4
  const ld = lakeD(x, z);
  if (ld < 1.35) h = h * sstep(0.95, 1.35, ld) + (-4 + 4 * sstep(0.6, 0.98, ld)) * (1 - sstep(0.95, 1.35, ld));
  else h = Math.max(h, 0.3);                               // 湖の外に水面を出さない
  return h;
}

// 余呉湖の水面：楕円の板一枚（描く数は一つ。湖の底は地面が −4 まで下がり、岸で板の下へ潜る）
function lakeMesh(rt) {
  const geo = new THREE.CircleGeometry(1, 48);
  geo.rotateX(-Math.PI / 2); geo.scale(LAKE.rx * 1.02, 1, LAKE.rz * 1.02);
  const mat = new THREE.MeshStandardMaterial({ color: 0x3e5258, roughness: 0.18, metalness: 0.25 });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(LAKE.x, -1, LAKE.z); m.name = '余呉湖'; m.receiveShadow = true;
  m.matrixAutoUpdate = false; m.updateMatrix();
  rt.scene.add(m);
}

// ---- 兵の装い ----
const SHIBATA = { faction: 'nobukatsu', flag: 'kari' };
const foeList = (n, o = {}) => [{ type: 'ashigaru', n: Math.max(1, n - 3), o: { flagScale: 1, ...o } }, { type: 'samurai', n: 2, o }, { type: 'gun', n: 1, o }];
const aliveReal = (rt) => rt.army.units.reduce((n, u) => n + (u.alive && !u.gone && u.type !== 'porter' ? 1 : 0), 0);
const live = (g) => !!g && g.units.some((u) => u.alive && !u.gone);
const nearCount = (rt, team, p, r) => rt.army.units.reduce((n, u) => n + (u.alive && !u.gone && u.team === team && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < r ? 1 : 0), 0);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

const t02_shizugatake = {
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  frontlineDensity: false,
  enemyTactics: false,
  noFieldMap: true,
  hideArmyPeek: true,
  missionSingleLine: true,
  foeMarks: true,
  enemyTriangleSigns: true,
  foeMarkRange: 30,
  missionPinCaption: '',
  playerAtkMax: 4,
  closeCombatAssist: true,
  autoTargetCamera: true,
  compactIntro: true,
  introText: () => '佐久間盛政が大岩山の砦を落とした。大垣から駆け戻った秀吉について、夜のうちに賤ヶ岳の砦へ入る。',
  minutes: 6,
  spawn: { x: START.x, z: START.z, heading: -Math.PI / 2 - 0.4 },
  // 砦へ上がる坂は急で、肩越しの目線だと目の前の法しか写らない。砦に入るまでは、坂の上の砦の前の斬り合いへ目線を上げる（共通の口）
  camLookAt: (rt) => (rt.flags.phase <= 1 ? { x: -1, z: 202, up: 2 } : null),
  world: {
    seed: 1583, time: 'night', mist: 0.35, groundHalf: 320, moveLim: 300,
    height,
    paths: [{ pts: ROAD, w: 3 }, { pts: RIDGE, w: 3 }],
    clear: (x, z) => Math.hypot(x - FORT.x, z - FORT.z) < FORT.r + 6 || distToPolyline(x, z, RIDGE) < 6 || distToPolyline(x, z, ROAD) < 5 || Math.hypot(x - HONJIN.x, z - HONJIN.z) < 24,
    trees: 700, tufts: 2400,
    treeDensity: (x, z) => (lakeD(x, z) < 1.08 ? 0 : distToPolyline(x, z, RIDGE) < 12 ? 0.25 : 1.1),
    groves: [{ x: 30, z: 150, r: 16, n: 26, kind: 'sugi' }, { x: -185, z: -27, r: 18, n: 30 }, { x: 40, z: 290, r: 16, n: 22 }],
    fleeOut: (x, z, team) => team === 1 && z < -290,
  },

  missionPin(rt) {
    const F = rt.flags, q = F.pin || (F.pin = { x: 0, z: 0, r: 6, hide: 6 });
    if (!rt.player.u.alive || F.ending) return null;
    const P = F.phase === 1 ? FORT : F.phase === 2 ? { x: SAKUMA[3][0], z: SAKUMA[3][1] } : F.phase === 3 ? (F.kmU?.alive ? F.kmU.pos : KATSUMASA) : (F.mmU?.alive ? F.mmU.pos : MORIMASA);
    q.x = P.x; q.z = P.z;
    return q;
  },

  setup(rt) {
    const F = rt.flags, W = rt.world;
    F.phase = 0; F.kills = 0; F.groups = []; F.holdPlayer = true; F.fortBad = 0;
    lakeMesh(rt);
    // ---- 賤ヶ岳の砦：柵の輪（東に口）・篝火・幟 ----
    F.fortWall = ringWall(rt, FORT.x, FORT.z, FORT.r, { team: 0, hp: 600, gapAt: Math.PI / 2, gapW: 0.7, name: '賤ヶ岳の砦の柵' });
    for (const [dx, dz] of [[FORT.r + 3, -5], [FORT.r + 3, 5], [-8, -6], [6, 8]]) rt.scene.add(kagaribi(W, FORT.x + dx, FORT.z + dz));
    for (const [dx, dz] of [[-6, -10], [8, -12], [-12, 6]]) rt.scene.add(nobori(W, FORT.x + dx, FORT.z + dz, 'oda', 5));
    // 柴田の本陣の幟（遠くから見える行き先）
    for (const [dx, dz] of [[0, 0], [-6, 3], [6, 3]]) rt.scene.add(nobori(W, HONJIN.x + dx, HONJIN.z + dz, SHIBATA.flag, 7));
    // ---- 遠景の大軍 ----
    F.far = {
      hashiba: W.addDistantArmy({ x: 70, z: 250, w: 40, d: 30, count: 260, facing: -Math.PI / 2, armor: 0x24221f, team: 0, mon: 'oda', seed: 15831 }),
      sakuma: W.addDistantArmy({ x: 110, z: -10, w: 44, d: 26, count: 260, facing: Math.PI, armor: 0x2e2a24, team: 1, mon: SHIBATA.flag, seed: 15832 }),
      maeda: W.addDistantArmy({ x: -40, z: -300, w: 50, d: 24, count: 240, facing: 0, armor: 0x2e2a24, team: 1, mon: 'maeda', seed: 15833 }),
    };
    for (const g of Object.values(F.far)) if (g && g.army) g.army.noWake = true;
    // 砦の東の法で、佐久間の手が砦の柵へ寄せて桑山の手と斬り合う（史実：盛政は大岩山を落とした勢いで賤ヶ岳の砦にも寄せた）。
    //   木之本の道から上がる始めの25秒に、坂の上の砦の東の柵の前の夜の斬り合いが見える（坂が急で、砦の高さより下は写らない）。軽い作りだけ。夜明けに佐久間が退く
    F.front = W.addClash({ x: -1, z: 202, facing: -1.35, w: MEM_TIGHT ? 24 : 30, gap: 2.2, bw: 4, seed: 15834, noWake: true, noRout: true, killRate: 0.006, maxDrift: 1.2, corpses: MEM_TIGHT ? 8 : 18,
      A: { flag: SHIBATA.flag, armor: 0x2e2a24, count: MEM_TIGHT ? 80 : 130, flagRate: 0.5 },
      B: { flag: 'oda', armor: 0x24221f, count: MEM_TIGHT ? 60 : 100, flagRate: 0.4, guns: true },
      host: MEM_TIGHT ? false : undefined,
      play: (k, q, v) => rt.army.play(k, q, v * 0.5), smoke: (x, y, z, sx, sz) => rt.army.smoke(x, y, z, sx, sz) });
    // ---- 砦の守り（桑山重晴の手）と、主人公の脇の七本槍 ----
    F.fortG = allyGroup(rt, { name: '桑山の手', fullStrength: true, anchor: { x: FORT.x, z: FORT.z }, facing: Math.PI / 2, width: 4, aggro: 14, order: 'hold', noRout: true },
      [{ type: 'samurai', n: 1, o: { name: '桑山重晴', invuln: true } }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 2 }]);
    F.yari = allyGroup(rt, { name: '七本槍', fullStrength: true, anchor: { x: START.x - 12, z: START.z - 6 }, facing: -Math.PI / 2 - 0.4, width: 4, aggro: 10, speed: 4.4, order: 'hold', noRout: true },
      [{ type: 'samurai', n: 1, o: { name: '加藤清正', invuln: true } }, { type: 'samurai', n: 1, o: { name: '福島正則', invuln: true } }, { type: 'samurai', n: 1, o: { name: '脇坂安治', invuln: true } },
        // 紙（battle_events_1101）：七本槍の残る四人も頭上の名で並べる（ag_bushou_armor_v2 の残り。具足は kacchu_required.js）
        { type: 'samurai', n: 1, o: { name: '加藤嘉明', invuln: true } }, { type: 'samurai', n: 1, o: { name: '平野長泰', invuln: true } },
        { type: 'samurai', n: 1, o: { name: '片桐且元', invuln: true } }, { type: 'samurai', n: 1, o: { name: '糟屋武則', invuln: true } }, { type: 'ashigaru', n: 4 }]);
    F.yari.ai = true;
    // 秀吉の旗本（主人公と賤ヶ岳へ上がる）と、木之本を固める秀長の隊
    F.hide = allyGroup(rt, { name: '羽柴秀吉の旗本', fullStrength: true, anchor: { x: START.x - 5, z: START.z + 4 }, facing: -Math.PI / 2 - 0.4, width: 3, aggro: 6, seekRange: 10, order: 'hold', noRout: true },
      [{ type: 'busho', n: 1, o: { name: '羽柴秀吉', invuln: true, horse: true } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 3 }]);
    F.hide.ai = true;
    F.naga = allyGroup(rt, { name: '羽柴秀長の隊', fullStrength: true, anchor: { x: START.x - 3, z: START.z - 9 }, facing: -Math.PI / 2 - 0.4, width: 4, aggro: 6, seekRange: 10, order: 'hold', noRout: true },
      [{ type: 'busho', n: 1, o: { name: '羽柴秀長', invuln: true, horse: true } }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 4 }]);
    // ---- 戦の前の会話 ----
    // 秀吉と柴田の対立・砦の並びの対陣・盛政の大岩山急襲と中川清秀の討死・秀吉の大返し（battle_events_1101）
    const L = [['使番', '大岩山の砦、佐久間玄蕃に落とされましてござる。中川清秀殿、お討死', 0.6], ['羽柴秀吉', '玄蕃め、深入りしおったわ。大垣から今宵のうちに戻るぞ', 3.8],
      ['羽柴秀長', '柴田と睨み合うた砦の並び、木之本はわしが固める。兄者は賤ヶ岳へ', 7.0], ['加藤清正', '一番槍はわしがもらう', 10.4]];
    for (const [who, s, t] of L) rt.after(t, () => rt.say(who, s, 3));
    rt.after(12.8, () => { F.holdPlayer = false; this.phase1(rt); });
  },

  // ① 夜の道を松明で駆け、賤ヶ岳の砦に入る。佐久間の手が砦へ寄せる
  phase1(rt) {
    const F = rt.flags;
    F.phase = 1; F.pt = rt.t;
    F.yari.ai = false; F.hide.ai = false;   // 大将の頭に任せると order が 'attack' に戻され、主人公の前を駆けない
    rt.obj('s1', '賤ヶ岳の山の砦に入り、羽柴の陣に加わる', 'main');
    F.yari.order = 'move'; F.yari.dest = { x: FORT.x + 6, z: FORT.z }; F.yari.speed = 3;
    F.hide.order = 'move'; F.hide.dest = { x: FORT.x - 4, z: FORT.z + 4 }; F.hide.speed = 3.2;
    sfx('taiko', 0.8);
    const raid = (x, z, n) => {
      const g = enemyGroup(rt, { ...SHIBATA, name: '佐久間の手', anchor: { x, z }, facing: Math.PI, fleeDir: { x: 0, z: -1 }, width: 4, morale: 70, dmgMult: 0.5,
        order: 'attack', dest: { x: FORT.x, z: FORT.z }, seekRange: 30, aggro: 12, speed: 2.6 }, foeList(n));
      g.kind4 = 'raid'; F.groups.push(g);
      rt.army.play('toki', { x, z }, 1.1);
    };
    rt.after(4, () => raid(FORT.x + 30, FORT.z - 40, 8));
    rt.after(40, () => { if (F.phase === 1) raid(FORT.x + 10, FORT.z - 50, 8); });
  },
  // ② 夜明け。尾根を退く佐久間勢を追う
  phase2(rt) {
    const F = rt.flags;
    rt.objDone('s1');
    rt.award((t) => t.side.push('夜のうちに賤ヶ岳の砦に入った'), '賤ヶ岳の砦に入った');
    F.phase = 2; F.pt = rt.t; F.k0 = F.kills;
    F.yari.ai = true; F.hide.ai = true;
    rt.world.setTime('morning');
    rt.banner('夜明け', '佐久間勢が尾根を退く');
    rt.after(0.8, () => rt.say('羽柴秀吉', '玄蕃が退くぞ。尾根を追い崩せ', 3));
    rt.after(4.2, () => rt.say('福島正則', '虎之助に遅れるな、かかれっ', 2.6));
    rt.after(8, () => rt.say('羽柴秀吉', '玄蕃は大岩山に突き出たまま、勝家の本隊から離れておる。孤立した今こそ叩け', 3.6));
    rt.obj('s2', '北の尾根を退く佐久間盛政の隊を追う', 'main');
    F.yari.order = 'move'; F.yari.dest = { x: SAKUMA[1][0], z: SAKUMA[1][1] };
    F.yari.onArrive = (q) => { q.order = 'attack'; q.seekRange = 40; };
    if (F.far.sakuma) F.far.sakuma.moveTo(-60, 90, 4, { back: true });
    F.front?.rout?.('A', { hideAfter: 30 });
    if (F.far.hashiba) F.far.hashiba.moveTo(-20, 190, 4);
    F.sakumaG = SAKUMA.map(([x, z], i) => {
      const g = enemyGroup(rt, { ...SHIBATA, name: '佐久間勢', anchor: { x, z }, facing: Math.PI, fleeDir: { x: 0, z: -1 }, width: 4, morale: 60, dmgMult: 0.45,
        order: 'retreat', dest: { x: -150, z: -110 }, speed: 0.9 + i * 0.1, aggro: 0 }, foeList(i % 2 ? 7 : 6));
      g.kind4 = 'flee'; F.groups.push(g);
      return g;
    });
    sfx('taiko', 0.9);
  },
  // ③ 尾根の上で柴田勝政の殿を崩す
  phase3(rt) {
    const F = rt.flags;
    rt.objDone('s2');
    rt.award((t) => t.side.push('退く佐久間勢に追いすがった'), '佐久間勢に追いすがった');
    F.phase = 3; F.pt = rt.t;
    rt.obj('s3', '尾根の北の柴田勝政の殿（約15人）を崩す', 'main');
    F.kmG = enemyGroup(rt, { ...SHIBATA, name: '柴田勝政の殿', anchor: { x: KATSUMASA.x, z: KATSUMASA.z }, facing: Math.PI, fleeDir: { x: 0, z: -1 }, width: 5, morale: 95, dmgMult: 0.5,
      noRout: true, formation: 'line', order: 'hold', aggro: 18 },
    [{ type: 'busho', n: 1, o: { name: '柴田勝政', hat: 'kabuto_m', flag: SHIBATA.flag } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 8, o: { flagScale: 1 } }, { type: 'gun', n: 2 }]);
    F.kmG.kind4 = 'km'; F.groups.push(F.kmG);
    F.kmU = F.kmG.units.find((u) => u.type === 'busho');
    if (F.kmU) F.kmU.maxHp = F.kmU.hp = 110;
    F.yari.order = 'move'; F.yari.dest = { x: KATSUMASA.x + 4, z: KATSUMASA.z + 10 };
    F.yari.onArrive = (q) => { q.order = 'attack'; q.seekRange = 30; };
    rt.say('加藤清正', '殿の旗じゃ。あれを崩せば、玄蕃は止まらぬ', 3);
  },
  // ④ 前田勢が退く。余呉湖の西を北へ、柴田の本陣へ
  phase4(rt) {
    const F = rt.flags;
    rt.objDone('s3');
    rt.award((t) => { t.special = { label: '尾根で柴田勝政の殿を崩した', pts: 15 }; }, '柴田勝政の殿を崩した');
    F.phase = 4; F.pt = rt.t;
    for (const g of [F.kmG, ...(F.sakumaG || [])]) if (live(g)) { g.order = 'retreat'; g.dest = { x: -150, z: -300 }; g.speed = 3.2; }
    rt.banner('前田勢、陣を払う', '佐久間盛政の隊が取り残された');
    if (F.far.maeda) F.far.maeda.moveTo(-40, -420, 5, { back: true });
    // 前田利家の隊：戦わずに陣を払って北へ去る（離れる・消極）
    F.maedaG = enemyGroup(rt, { faction: 'nobukatsu', flag: 'maeda', name: '前田利家の隊', anchor: { ...MAEDA }, facing: Math.PI, fleeDir: { x: 0, z: -1 }, width: 4, morale: 90,
      order: 'retreat', dest: { x: -40, z: -330 }, speed: 1.6, aggro: 0, seekRange: 0 },
    [{ type: 'busho', n: 1, o: { name: '前田利家', invuln: true, horse: true, flag: 'maeda' } }, { type: 'samurai', n: 1, o: { flag: 'maeda' } }, { type: 'ashigaru', n: 5, o: { flag: 'maeda', flagScale: 1 } }]);
    F.maedaG.kind4 = 'maeda'; F.groups.push(F.maedaG);
    for (const u of F.maedaG.units) u.noTarget = true;
    // 突き出た佐久間盛政の本隊（勝ち＝これを叩く）
    F.mmG = enemyGroup(rt, { ...SHIBATA, name: '佐久間盛政の隊', anchor: { ...MORIMASA }, facing: Math.PI, fleeDir: { x: 0, z: -1 }, width: 5, morale: 90, dmgMult: 0.5,
      formation: 'line', order: 'hold', aggro: 20, seekRange: 30 },
    [{ type: 'busho', n: 1, o: { name: '佐久間盛政', invuln: true, horse: true, flag: SHIBATA.flag } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 8, o: { flagScale: 1 } }, { type: 'gun', n: 2 }]);
    F.mmG.kind4 = 'mm'; F.groups.push(F.mmG);
    F.mmU = F.mmG.units.find((u) => u.type === 'busho');
    rt.after(1.5, () => rt.say('羽柴秀吉', '又左が退いたぞ。取り残された玄蕃を叩け', 3));
    rt.after(5, () => rt.say('佐久間盛政', '前田が退いたじゃと……。ここで退けば柴田の家が終わる。踏みとどまれ', 3.6));
    rt.obj('s4', '北の尾根に突き出た佐久間盛政の隊を叩く', 'main');
    F.way = [];
    F.yari.order = 'move'; F.yari.dest = { x: MORIMASA.x + 4, z: MORIMASA.z + 14 };
    F.yari.onArrive = (q) => { q.order = 'attack'; q.seekRange = 34; };
  },
  spawnWay(rt, w, i) {
    const g = enemyGroup(rt, { ...SHIBATA, name: '柴田勢', anchor: { x: w.x, z: w.z }, facing: Math.PI, fleeDir: { x: 0, z: -1 }, width: 4, morale: 75, dmgMult: 0.45,
      order: 'attack', seekRange: 26, aggro: 14, speed: 2.8 }, foeList(w.n));
    g.kind4 = 'way'; rt.flags.groups.push(g);
    rt.army.play('toki', w, 1.1);
    return g;
  },
  spawnHonjin(rt) {
    const F = rt.flags;
    F.honG = enemyGroup(rt, { ...SHIBATA, name: '柴田の旗本', anchor: { x: HONJIN.x, z: HONJIN.z + 4 }, facing: Math.PI, fleeDir: { x: 0, z: -1 }, width: 5, morale: 90, dmgMult: 0.5,
      noRout: true, formation: 'line', order: 'hold', aggro: 18 },
    [{ type: 'busho', n: 1, o: { name: '柴田勝家', invuln: true, horse: true, flag: SHIBATA.flag } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 7, o: { flagScale: 1 } }, { type: 'gun', n: 2 }]);
    F.honG.kind4 = 'hon'; F.groups.push(F.honG);
  },

  onKill(rt, v) { if (v && v.team === 1) rt.flags.kills++; },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending || !F.phase) return;
    const P = rt.player.u;
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.25;
    if (rt.t > 600) { this.lose(rt, '柴田勢を取り逃がした'); return; }
    const st = rt.t - F.pt, n = aliveReal(rt);
    // 退く隊は 10m で振り向いて戦う。退き切った者は遠い所でだけ去らせる
    for (const g of F.groups) {
      if (!live(g)) continue;
      let near = Infinity;
      for (const u of g.units) {
        if (!u.alive || u.gone) continue;
        if (g.order === 'retreat' && u.pos.z < -280 && dist(u.pos, P.pos) > 70) { rt.army.despawn(u); continue; }
        near = Math.min(near, dist(u.pos, P.pos));
      }
      if (g.kind4 === 'flee' && g.order === 'retreat' && F.phase === 2 && near < 10) { g.order = 'attack'; g.focus = P; g.aggro = 12; g.speed = 3; }
    }
    if (F.phase === 1) {
      // 七本槍と旗本は主人公の少し前を駆ける（独りで馬を駆けさせない。軍勢が画面に写る）
      const dF = dist(P.pos, FORT);
      if (dF > 14) for (const [g, ahead, side] of [[F.yari, 30, -4], [F.hide, 22, 5]]) {
        const k = ahead / dF, fx = (FORT.x - P.pos.x) / dF, fz = (FORT.z - P.pos.z) / dF;
        // 行き先を動かすたびに合図の待ち（約1秒）が入り直す。毎回変えると一歩も出ないので、離れた時だけ据え直す
        const nx = P.pos.x + (FORT.x - P.pos.x) * k - fz * side, nz = P.pos.z + (FORT.z - P.pos.z) * k + fx * side;
        if (!g.dest || Math.hypot(g.dest.x - nx, g.dest.z - nz) > 7) g.dest = { x: nx, z: nz };
        g.order = 'move'; g.speed = 4.2;
      }
      // 負け：砦の中に敵が六人より多く、味方が一人以下のまま十二秒
      const foes = nearCount(rt, 1, FORT, FORT.r + 3), friends = nearCount(rt, 0, FORT, FORT.r + 3);
      F.fortBad = foes >= 6 && friends <= 1 ? F.fortBad + 0.25 : 0;
      if (F.fortBad > 12) { this.lose(rt, '賤ヶ岳の砦を奪われた'); return; }
      if (dist(P.pos, FORT) < FORT.r + 2 || st > 150) {
        rt.say('桑山重晴', 'よう来てくだされた。砦は持ちこたえましたぞ', 2.6);
        this.phase2(rt);
      }
      return;
    }
    if (F.phase === 2) {
      const done = F.kills - F.k0 >= 10 || P.pos.z < SAKUMA[3][1] + 4 || !F.sakumaG.some(live) || st > 90;
      if (done) this.phase3(rt);
      return;
    }
    if (F.phase === 3) {
      const left = F.kmG.units.filter((u) => u.alive && !u.gone).length;
      // 長引けば殿は崩れる（勝政の手が尾根の奥へ流れて寄れない時も、次の段へ）
      if (!F.kmU?.alive || left <= 3 || (st > 100 && dist(P.pos, KATSUMASA) < 40) || st > 130) this.phase4(rt);
      return;
    }
    if (F.phase === 4) {
      WAY4.forEach((w, i) => { if (!F.way[i] && dist(P.pos, w) < 80 && n < REAL_CAP - w.n) F.way[i] = this.spawnWay(rt, w, i); });
      if (!F.honG && dist(P.pos, HONJIN) < 110 && n < REAL_CAP - 13) this.spawnHonjin(rt);
      // 勝ち：突き出た佐久間盛政の隊を叩く（三人を切る）。長引いた時は盛政の前に詰めていれば崩れる
      const left = F.mmG.units.filter((u) => u.alive && !u.gone).length;
      F.mmN = Math.max(F.mmN || 0, left); rt.objProgress('s4', `${Math.min(F.mmN - left, F.mmN - 3)}／${F.mmN - 3}`);
      //   尾根の道で柴田勢に足を止められても、三分近く斬り合えば盛政の隊は前田の退きに崩れる（時間切れで負けにしない）
      if (left <= 3 || (st > 120 && dist(P.pos, MORIMASA) < 40) || st > 170) this.win(rt);
    }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objDone('s4');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '突き出た佐久間盛政の隊を叩いた', pts: 20 }; }, '佐久間盛政の隊を叩いた');
    rt.player.u.invuln = true;
    for (const g of F.groups) if (live(g)) { g.order = 'retreat'; g.dest = { x: g.center().x, z: -330 }; g.speed = 3.4; }
    rt.banner('佐久間盛政の隊が崩れ、柴田勢は総崩れ', '勝家は北ノ庄へ退いた');
    victoryMoment(rt, '勝');
    // ---- 戦の後の会話 ----
    const L = [['柴田勝家', '玄蕃も又左も……。これまでか。北ノ庄へ退け', 0.4], ['福島正則', '勝家は越前へ退きましたぞ', 3.6], ['羽柴秀吉', '七本の槍に、もう一本あったな', 6.6], ['羽柴秀吉', '今日から部将じゃ。兵を預ける', 9.6]];
    for (const [who, s, t] of L) rt.after(t, () => rt.say(who, s, 2.8));
    rt.finish({ scriptedEnd: true }, 13);
  },
  lose(rt, why) {
    const F = rt.flags;
    if (F.ending || !rt.canFailMission()) return;
    F.ending = true;
    rt.objFail('s' + F.phase);
    rt.tracker.main = false;
    rt.banner('果たせず', why);
    rt.finish({ failureReason: why }, 4);
  },

  // bot：近い敵を突き、いなければ段の行き先へ
  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    if (F.holdPlayer || F.ending || !u.alive) return;
    const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 4;
    const prev = p.botStrikeFoe;
    const e = prev?.alive && ok(prev) && p.botStrikeUntil > p.time && dist(prev.pos, u.pos) < 2.8 ? prev
      : F.phase === 3 && F.kmU?.alive && ok(F.kmU) && dist(F.kmU.pos, u.pos) < 10 ? F.kmU
        : b.army.nearestEnemy(u, F.phase === 1 ? 5 : 8, ok);
    if (e) {
      const d = dist(e.pos, u.pos);
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
      patientStrike(p, inp, e, d, true);
      return;
    }
    inp.guardHold = false;
    const q = b.def.missionPin(b);
    // 砦の柵の内から外の行き先へは、東の口を通って出る（柵へ真っすぐ当たって止まらない）
    //   口を出たら、柵の外を回って行き先の側へ（行き先への筋が柵の輪を横切る間）
    const dF = dist(u.pos, FORT);
    if (q && dF < FORT.r + 9 && dist(q, FORT) > FORT.r + 2) {
      const atMouth = Math.abs(u.pos.z - FORT.z) < 3 && u.pos.x > FORT.x + FORT.r - 5;
      // 柵の際に立つ時は、砦の真ん中との間に柵があるかで内か外かを見る
      const inside = dF < FORT.r + 1.5 && !b.army.wallBetween(u.pos, -1, FORT);
      if (inside) { goTo(p, inp, FORT.x + FORT.r + (atMouth && dF > FORT.r - 1 ? 7 : -3), FORT.z, 1.5); return; }
      const vx = q.x - u.pos.x, vz = q.z - u.pos.z, L2 = vx * vx + vz * vz || 1;
      const k = Math.max(0, Math.min(1, ((FORT.x - u.pos.x) * vx + (FORT.z - u.pos.z) * vz) / L2));
      if (Math.hypot(u.pos.x + vx * k - FORT.x, u.pos.z + vz * k - FORT.z) < FORT.r + 2) {
        const a1 = Math.atan2(u.pos.x - FORT.x, u.pos.z - FORT.z), a2 = Math.atan2(q.x - FORT.x, q.z - FORT.z);
        const da = Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)), a = a1 + Math.sign(da) * Math.min(Math.abs(da), 0.6);
        goTo(p, inp, FORT.x + Math.sin(a) * (FORT.r + 7), FORT.z + Math.cos(a) * (FORT.r + 7), 1.5);
        return;
      }
    }
    if (q) goTo(p, inp, q.x, q.z, 2);
  },
};

t02_shizugatake.sides = { a: { name: '羽柴軍', mon: 'oda' }, b: { name: '柴田軍', mon: SHIBATA.flag } };
t02_shizugatake.force = (rt) => ({ a: 50000, a0: 50000, b: Math.max(0, 30000 - (rt.flags.kills || 0) * 40), b0: 30000 });
t02_shizugatake.date = () => '天正十一年四月二十一日　夜明け・初夏';
t02_shizugatake.history = '天正十一年四月二十日、柴田勝家方の佐久間盛政は余呉湖の東の大岩山の砦を攻め落とし、中川清秀は討ち死にした。\n'
  + '大垣にいた羽柴秀吉はこれを聞き、およそ五十二キロの道をわずかな時で駆け戻った（美濃大返し）。\n'
  + '二十一日の夜明け、秀吉は賤ヶ岳から退く佐久間勢を追い崩し、殿の柴田勝政の隊も崩れた。前田利家が戦の場を離れると、柴田勢は総崩れとなった。\n'
  + '佐久間盛政は落ちのびたが、のちに捕らえられた。勝家は越前の北ノ庄城へ退き、数日の後に城とともに果てた。この日に手柄を立てた福島正則・加藤清正らは、のちに「賤ヶ岳の七本槍」と呼ばれた。\n'
  + '戦の場の広さ・人数の分け方・会話は遊びのための推定である。';

// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
withGuard(t02_shizugatake);

export { t02_shizugatake };
