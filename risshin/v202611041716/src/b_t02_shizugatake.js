// ======================================================================
// 豊臣編 2　賤ヶ岳の戦い（天正十一年四月二十日〜二十一日）。筋書きは docs/chapter2_toyotomi.md の「2. 賤ヶ岳の戦い」。
// 手本：kaito の対陣図（docs/battle_refs/t02_shizugatake_map.jpg・t02_shizugatake.md）。砦の位置と守将の名は図のとおり。
// 戦の型：砦＋山岳。主人公は賤ヶ岳の砦にいる羽柴方の侍大将。
// 段：①東の物見へ下り、中川の落ち武者を追う佐久間の追手を討つ ②砦の東の口で、寄せる佐久間勢を防ぐ（丹羽長秀が飯浦から来援）
//     （夜の美濃大返しは時を飛ばし、真ん中に次の目標）③二十一日の夜明け、飯浦の切通しの口で殿の柴田勝政を討つ（秀吉は賤ヶ岳の本陣に残る）
//     ④前田隊が茂山を払い、余呉湖の西の岸を茂山の麓まで追う
// 負け方：賤ヶ岳の砦が奪われる（一つ目は主人公が討たれる）。遊んで八分ほど。
// 座標：x が東、z が南（北が −z）。ゲームの 1 は実の 8m。原点は北緯35.528・東経136.198（標高の格子の真ん中）。
// 地形は国土地理院の標高（asset_dem_shizugatake.js。tools/dem.mjs の shizugatake、±3200m・25m）をそのまま 1/8 に縮めて使う（高さは 1/10）。
//   琵琶湖の水面（84m）を高さ 0 に置く。余呉湖（133m）は標高の格子の平らな水面を塗りつぶしで拾い、水の板を張る。
// ======================================================================
import * as THREE from 'three';
import { useTerrain } from './asset_manifest.js';
import { demSample } from './dem.js';
import { enemyGroup, allyGroup, ringWall, gauss } from './bhelp.js';
import { nobori, kagaribi, village, yagura } from './props.js';
import { placeGroup, placePlayer } from './b_opening.js';
import { distToPolyline } from './world.js';
import { victoryMoment } from './victory_moment.js';
import { sfx } from './audio.js';
import { withGuard } from './toyo_bot.js';
import { KILLS, STAGES, downTo } from './stages.js';
import { KIT } from './b_nagashinojo.js';

// ---- 標高（国土地理院） ----
const XY = 8, BIWA = 84, YOGO = 132.95, VS = 0.1;      // 高さは 1/10（水平の 1/8 より少し潰す。実の 30〜40 度の法を兵が上り下りできる傾きに）
const toY = (m) => (m - BIWA) * VS;
const WY = toY(YOGO);                                     // 余呉湖の水面の高さ（約 6.1）
let dem = null, lakeMask = null;
// 余呉湖：湖の真ん中の格子から、水面の高さ ±0.5m で続く所を塗りつぶす（北の同じ高さの田は、続いていないので入らない）
function buildLake(d) {
  const bin = d.data instanceof Int16Array ? null : atob(d.data);
  const n = d.n, a = d.data instanceof Int16Array ? d.data : new Int16Array(n * n);
  if (bin) for (let i = 0; i < n * n; i++) a[i] = (bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)) << 16 >> 16;
  const at = (gx, gz) => Math.round((gz * XY + d.range) / d.step) * n + Math.round((gx * XY + d.range) / d.step);
  const s = at(-40, 60), v0 = a[s], m = new Uint8Array(n * n), st = [s];
  m[s] = 1;
  while (st.length) {
    const k = st.pop(), i = k % n, j = (k / n) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const I = i + di, J = j + dj;
      if (I < 1 || J < 1 || I >= n - 1 || J >= n - 1) continue;
      const q = J * n + I;
      if (!m[q] && Math.abs(a[q] - v0) <= 5) { m[q] = 1; st.push(q); }
    }
  }
  // 25m の格子の段々が岸に出ないよう、二度ならす（0〜1 の小数に）
  let f = Float32Array.from(m);
  for (let pass = 0; pass < 2; pass++) {
    const o = new Float32Array(n * n);
    for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
      const k = j * n + i;
      o[k] = (f[k] * 4 + f[k - 1] + f[k + 1] + f[k - n] + f[k + n]) / 8;
    }
    f = o;
  }
  return f;
}
useTerrain('dem_shizugatake', (d) => { dem = d; lakeMask = d ? buildLake(d) : null; FORT_H = null; });
function lakeAt(x, z) {
  if (!lakeMask) return Math.max(0, Math.min(1, (1.15 - Math.hypot((x + 40) / 70, (z - 70) / 130)) * 4));
  const n = dem.n, fx = (x * XY + dem.range) / dem.step, fz = (z * XY + dem.range) / dem.step;
  const i = Math.max(0, Math.min(n - 2, Math.floor(fx))), j = Math.max(0, Math.min(n - 2, Math.floor(fz))), tx = fx - i, tz = fz - j;
  const g = (I, J) => lakeMask[J * n + I];
  return (g(i, j) * (1 - tx) + g(i + 1, j) * tx) * (1 - tz) + (g(i, j + 1) * (1 - tx) + g(i + 1, j + 1) * tx) * tz;
}

// ---- 場所（ゲームの座標。標高の山頂・湖・谷から拾った） ----
const LAKE = { x: -41, z: 70, rx: 80, rz: 145 };          // 余呉湖を覆う楕円（水の板）
const FORT = { x: -56, z: 306, r: 14 };                  // 賤ヶ岳の砦（山頂 421m。守将 桑山重晴）
const LOOK = { x: -12, z: 258 };                         // 賤ヶ岳の北東の肩の物見（大岩山・岩崎山・余呉湖が見える）
const OIWA = { x: 75, z: 100 };                          // 大岩山の砦（中川清秀。274m）
const IWASAKI = { x: 62, z: -3 };                        // 岩崎山の砦（高山右近）
const TAGAMI = { x: 300, z: 190 };                       // 田上山の砦（羽柴秀長）
const KINOMOTO = { x: 222, z: 236 };                     // 木ノ本（羽柴軍の補給の地）
const HIGASHINO = { x: 250, z: -150 };                   // 東野山の砦（堀秀政）
const DOGI = { x: -78, z: -147 };                        // 堂木山の砦（木下一元）
const SHINMEI = { x: -162, z: -109 };                    // 神明山の砦（木村隼人正）
const SHIGE = { x: -170, z: 15 };                        // 茂山（前田利家の隊）
const GONGEN = { x: -205, z: -85 };                      // 権現坂
const GYOICHI = { x: -306, z: -285 };                    // 行市山の肩（佐久間盛政の陣。山頂 660m は格子の北の外）
const BESSHO = { x: -216, z: -334 };                     // 別所山（前田利家・利長）
const IIURA = { x: -184, z: 322 };                       // 飯浦（琵琶湖の岸）
const CUT = [[-108, 236], [-114, 254], [-120, 267], [-128, 278], [-150, 282], [-170, 292], [-182, 316]];   // 飯浦の切通し（峠は 276m）
const KAIDO = [[226, 400], [228, 330], [222, 236], [205, 150], [175, 60], [150, -20], [110, -100], [60, -160], [35, -250], [10, -330], [-10, -400]];   // 北国街道
const UPHILL = [[115, 252], [80, 262], [50, 266], [20, 266]];   // 木ノ本の西の黒田から賤ヶ岳の東の肩へ上がる道
const SHORE_W = [[-95, 205], [-112, 170], [-122, 130], [-135, 95], [-150, 55], [-165, 25]];   // 余呉湖の西の岸を北へ（盛政の退く道）
const JOIN = { x: 20, z: 266 };                          // 秀吉の本隊と落ち合う所
const KATSUMASA = { x: -104, z: 228 };                   // 柴田勝政の殿（切通しの口）
const START = { x: -48, z: 300 };

// ---- 地形 ----
const sstep = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const inLakeBox = (x, z) => Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz) < 1.05;
function natural(x, z) {
  if (!dem) return 4 + 36 * gauss(x, z, FORT.x, FORT.z, 2 * 70 * 70) + 20 * gauss(x, z, OIWA.x, OIWA.z, 2 * 40 * 40) + Math.max(0, -x - 150) * 0.2;
  const m = demSample(dem, x * XY, z * XY) + dem.min;
  let h = toY(m);
  if (m < 84.6) h -= 1.4 * sstep(84.6, 84.0, m);         // 琵琶湖の底
  else h = Math.max(h, 0.18);
  return h;
}
let FORT_H = null;
function height(x, z) {
  let h = natural(x, z);
  // 山頂の砦は平らに削る
  const df = Math.hypot(x - FORT.x, z - FORT.z);
  if (df < FORT.r + 10) { if (FORT_H === null) FORT_H = natural(FORT.x, FORT.z) - 0.6; h += (FORT_H - h) * (1 - sstep(FORT.r, FORT.r + 10, df)); }
  // 飯浦の切通し：峠を道幅だけ掘り下げる（276m の峠を 262m まで）
  const dc = distToPolyline(x, z, CUT);
  if (dc < 6) h = Math.min(h, h + (toY(262) - h) * (1 - sstep(2.2, 6, dc)));
  // 余呉湖：岸で水面、湖の底は水面の 1.6 下。湖の楕円の内の陸は水面より上に
  if (inLakeBox(x, z)) {
    const k = sstep(0.3, 0.7, lakeAt(x, z));
    h = Math.max(h, WY + 0.25) * (1 - k) + (WY - 1.6) * k;
  }
  return h;
}

// 水の板：余呉湖（楕円）と琵琶湖（西の岸の外）。描く数は二つ
function waterMeshes(rt) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x3e5258, roughness: 0.16, metalness: 0.25 });
  const yogo = new THREE.CircleGeometry(1, 56);
  yogo.rotateX(-Math.PI / 2); yogo.scale(LAKE.rx, 1, LAKE.rz);
  const biwa = new THREE.PlaneGeometry(280, 270);
  biwa.rotateX(-Math.PI / 2);
  for (const [g, x, y, z, name] of [[yogo, LAKE.x, WY, LAKE.z, '余呉湖'], [biwa, -260, 0.08, 265, '琵琶湖']]) {
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z); m.name = name; m.receiveShadow = true;
    m.matrixAutoUpdate = false; m.updateMatrix();
    rt.scene.add(m);
  }
}

// ---- 兵の装い ----
// 柴田方は二つ雁金の旗。羽柴方の旗は 'oda' の兵も含めて全部 'toyotomi' に染め替える（world.armyFlagKinds。豊臣編に織田の旗を出さない・kaito AQ4）
const SHIBATA = { faction: 'nobukatsu', flag: 'kari' };
const HASHIBA = 'toyotomi';
// 陣形の塊：槍の足軽を主に、鉄砲・徒歩侍を混ぜる（兵の割合の決まりに寄せる）
const foeList = (n, o = {}) => {
  const s = Math.max(1, Math.round(n * 0.12)), g = Math.max(1, Math.round(n * 0.14));
  return [{ type: 'ashigaru', n: Math.max(1, n - s - g), o: { flagScale: 1, ...o } }, { type: 'samurai', n: s, o }, { type: 'gun', n: g, o }];
};
const live = (g) => !!g && g.units.some((u) => u.alive && !u.gone);
const nLive = (g) => (g ? g.units.filter((u) => u.alive && !u.gone).length : 0);
const nearCount = (rt, team, p, r) => rt.army.units.reduce((n, u) => n + (u.alive && !u.gone && u.team === team && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < r ? 1 : 0), 0);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const MOUTH = { x: FORT.x + FORT.r + 4, z: FORT.z };     // 賤ヶ岳の砦の東の口（柵の切れ目）
const DAWN_AT = { x: -82, z: 256 };                      // 夜明けに主人公が立つ所（砦の西の肩。切通しの口まで三十五歩ほど）
// 目標（goals5.js が並べる。段の一行は場所と行い。四つの段だけ。「敵を何人討つ」で埋めない・stageGoalsOnly。携帯の横で一行に収まる長さ）
const STAGE_TEXT = ['東の物見へ下り、佐久間の追手を討つ', '砦の東の口で、寄せる佐久間勢を防ぐ', '切通しの口で、殿の柴田勝政を討つ', '湖の西の岸を、茂山の麓まで追う'];

const t02_shizugatake = {
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  frontlineDensity: false,
  // 奥の乱戦の補い（front_fill）は置かない：史実でいない所に軍勢を置かない・見せかけの軍勢を出さない（kaito AP10・AQ6）
  noFrontFill: true,
  enemyTactics: false,
  noFieldMap: true,
  hideArmyPeek: true,
  missionSingleLine: true,
  hideMissionDots: true, hideGuideSteps: true,
  // 行き先は黄色の印一つだけ（ついていく相手の青い印は出さない・kaito AL）。敵は頭上の▼
  noLeaderFollow: true, nearbyAllySignLimit: 0,
  foeMarks: true,
  enemyTriangleSigns: true,
  foeMarkRange: 30,
  missionPinCaption: '',
  goalSignOnly: true,         // 11/4 jin：行き先は頭上の金の▼一つだけ（持ち場の旗・輪・地面の矢印を重ねない。AP12・BH6）
  goalSignNoLabel: true,      // ▼の上に字を出さない（kaito 10/23）
  noGoalCount: true,          // 討つ相手への画面の端の赤い矢印も出さない（BH6・印は真上の▼一つ）
  stageGoalsOnly: true,       // 目標は段の四つだけ（「敵を何人討つ」「深手を負わずに勝つ」を足さない。AW3）
  noHatamotoMass: true,       // 将の後ろの軽い作りの備を置かない（AA・AF）
  // 画面の真ん中の札は、時が飛ぶ所（夜明け）と終わりだけ（kaito AT7・Simple）
  bannerAllowed: (rt, t) => rt.over || !!rt.flags.ending || /^四月二十一日/.test(t),
  // 兵の声の家の名：羽柴方は豊臣（＝味方の兵）・柴田方は柴田（信勝方と出さない）
  speakerHouse: { oda: '豊臣', nobukatsu: '柴田' },
  playerAtkMax: 4,
  closeCombatAssist: true,
  autoTargetCamera: true,
  compactIntro: true,
  introText: () => '柴田勝家と羽柴秀吉が、余呉湖のまわりの砦で睨み合う。秀吉は大垣にいる。賤ヶ岳の砦から、大岩山に上がる煙が見えた。',
  minutes: 8,
  spawn: { x: START.x, z: START.z, heading: Math.atan2(LOOK.x - START.x, LOOK.z - START.z) },
  // 物見へ下りる間は、目線を余呉湖の向こうの燃える大岩山へ上げる（坂の法と杉だけを写さない。共通の口）
  camLookAt: (rt) => (rt.flags.phase <= 1 && !rt.flags.saw ? { x: OIWA.x, z: OIWA.z + 30, up: 2 } : null),
  world: {
    seed: 1583, time: 'day', mist: 0.25, groundHalf: 400, moveLim: 392,
    height,
    armyFlagKinds: { oda: HASHIBA },
    paths: [{ pts: KAIDO, w: 3.5 }, { pts: CUT, w: 2.5 }, { pts: UPHILL, w: 2.5 }, { pts: SHORE_W, w: 2.5 }],
    clear: (x, z) => Math.hypot(x - FORT.x, z - FORT.z) < FORT.r + 6 || distToPolyline(x, z, KAIDO) < 6 || distToPolyline(x, z, CUT) < 4
      || distToPolyline(x, z, SHORE_W) < 5 || distToPolyline(x, z, UPHILL) < 4 || dist({ x, z }, KINOMOTO) < 22 || distToPolyline(x, z, [[FORT.x, FORT.z], [LOOK.x, LOOK.z], [26, 218]]) < 9
      || distToPolyline(x, z, [[FORT.x, FORT.z], [DAWN_AT.x, DAWN_AT.z], [KATSUMASA.x, KATSUMASA.z]]) < 8,
    trees: 1300, tufts: 2600,
    // 山は杉と雑木、湖と川の低い田（余呉川の谷・木ノ本）は木を置かない
    treeDensity: (x, z) => (inLakeBox(x, z) && lakeAt(x, z) > 0.05 ? 0 : height(x, z) < 0.5 ? 0 : height(x, z) < toY(128) ? 0.08 : 1.15),
    groves: [{ x: -92, z: 318, r: 14, n: 22, kind: 'sugi' }, { x: -150, z: 60, r: 16, n: 24, kind: 'sugi' }, { x: 60, z: 120, r: 14, n: 20 }],
    fleeOut: (x, z, team) => team === 1 && z < -120,
  },

  // 行き先は段ごとに一つの決まった場所（kaito AW3「目標の場所は固定」）
  missionPin(rt) {
    const F = rt.flags, q = F.pin || (F.pin = { x: 0, z: 0, r: 6, hide: 6 });
    if (!rt.player.u.alive || F.ending) return null;
    const P = F.phase === 1 ? LOOK : F.phase === 2 ? MOUTH : F.phase === 3 ? KATSUMASA : F.phase === 4 ? SHIGE : null;
    if (!P) return null;
    q.x = P.x; q.z = P.z;
    return q;
  },

  setup(rt) {
    const F = rt.flags, W = rt.world;
    F.phase = 0; F.kills = 0; F.groups = []; F.holdPlayer = true; F.fortBad = 0;
    waterMeshes(rt);
    // ---- 賤ヶ岳の砦（桑山重晴）：柵の輪（東に口）・篝火・幟・南東の隅の櫓 ----
    F.fortWall = ringWall(rt, FORT.x, FORT.z, FORT.r, { team: 0, hp: 600, gapAt: Math.PI / 2, gapW: 0.7, name: '賤ヶ岳の砦の柵' });
    for (const [dx, dz] of [[FORT.r + 3, -5], [FORT.r + 3, 5], [-8, -6], [6, 8]]) rt.scene.add(kagaribi(W, FORT.x + dx, FORT.z + dz));
    for (const [dx, dz] of [[-6, -10], [8, -11], [-11, 6]]) rt.scene.add(nobori(W, FORT.x + dx, FORT.z + dz, HASHIBA, 5));
    rt.scene.add(yagura(W, FORT.x + 5, FORT.z + 9, { mon: HASHIBA, team: 0 }));   // 南東の隅（東の口から北を見る目線をふさがない）
    // ---- 対陣図の砦の並び：幟で示す（羽柴方は桐・柴田方は雁金・前田は梅鉢）。大岩山と岩崎山は、もう佐久間の旗 ----
    const flags = [[TAGAMI, HASHIBA], [HIGASHINO, HASHIBA], [DOGI, HASHIBA], [SHINMEI, HASHIBA], [OIWA, SHIBATA.flag], [IWASAKI, SHIBATA.flag],
      [SHIGE, 'maeda'], [GYOICHI, SHIBATA.flag], [BESSHO, 'maeda']];
    for (const [p, k] of flags) for (const [dx, dz] of [[0, 0], [-5, 3], [5, 3]]) rt.scene.add(nobori(W, p.x + dx, p.z + dz, k, 7));
    // 木ノ本の宿と飯浦の浦の家並み（遠景）
    if (!W.outsideNearView(KINOMOTO.x, KINOMOTO.z, 140)) rt.scene.add(village(W, KINOMOTO.x - 14, KINOMOTO.z, { n: 6, r: 14, seed: 1583 }));
    if (!W.outsideNearView(IIURA.x, IIURA.z, 60)) rt.scene.add(village(W, IIURA.x + 4, IIURA.z - 6, { n: 4, r: 10, seed: 1584 }));
    // ---- 大岩山と岩崎山が燃える（四月二十日の朝。盛政が落とした） ----
    for (const p of [OIWA, IWASAKI]) {
      W.addFire(p.x, p.z, { size: 2.6, h: 0.4, blackSmoke: true });
      W.addSmokeColumn?.(p.x + 3, W.heightAt(p.x, p.z) + 4, p.z, { size: 4, black: true });
    }
    // ---- 佐久間盛政の本隊（八千ほど）：大岩山の砦の跡に居座る本物の塊。見せかけの軍勢は置かない（kaito AF・AQ6） ----
    //   盛政は旗本の侍に囲まれ、前に出ない（討てない）。後の段で湖の西の岸を退く
    F.saku = enemyGroup(rt, { ...SHIBATA, name: '佐久間盛政の本隊', anchor: { x: OIWA.x - 8, z: OIWA.z + 14 }, facing: Math.PI * 0.85, fleeDir: { x: -0.3, z: -1 }, width: 8, morale: 90,
      order: 'hold', aggro: 0, seekRange: 0, noRout: true, dmgMult: 0.4 },
    [{ type: 'busho', n: 1, o: { name: '佐久間盛政', invuln: true, horse: true, flag: SHIBATA.flag } }, { type: 'samurai', n: 6 }, ...foeList(26)]);
    F.saku.kind4 = 'main'; F.groups.push(F.saku);
    // ---- 砦の守り（桑山重晴の手。千ほど） ----
    F.fortG = allyGroup(rt, { name: '桑山の手', fullStrength: true, anchor: { x: FORT.x + 7, z: FORT.z }, facing: Math.PI / 2, width: 5, aggro: 14, order: 'hold', noRout: true },
      [{ type: 'busho', n: 1, o: { name: '桑山重晴', invuln: true, horse: true } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 4 }]);
    // ---- 戦の前の会話：秀吉と柴田の対立・砦の並びの対陣・盛政の大岩山急襲（battle_events_1101） ----
    const L = [['桑山重晴', '大岩山から煙が上がっておる。柴田と睨み合うて一月、何が起きた', 0.6],
      ['物見', '行市山の佐久間玄蕃の勢、夜のうちに余呉湖の西を回り、大岩山を落とした由。中川殿の兵が逃げて来る', 4.0],
      ['桑山重晴', '東の物見へ下り、中川の兵を追う佐久間の手を討て', 7.6]];
    for (const [who, s, t] of L) rt.after(t, () => rt.say(who, s, 3));
    rt.after(9.6, () => { F.holdPlayer = false; this.phase1(rt); });
  },

  // ① 東の物見へ下り、中川の落ち武者を追う佐久間の追手を討つ
  phase1(rt) {
    const F = rt.flags;
    F.phase = 1; F.pt = rt.t; F.k0 = F.kills;
    rt.obj('s1', STAGE_TEXT[0], 'main');
    sfx('taiko', 0.6);
    F.nakaG = allyGroup(rt, { name: '中川の落ち武者', fullStrength: true, anchor: { x: 10, z: 232 }, facing: -2.4, width: 3, aggro: 0, order: 'move', dest: { ...MOUTH }, speed: 2.4, noRout: true },
      [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5 }]);
    // 追手は物見の下で落ち武者に追いつき、物見の前で止まって戦う（行き先の物見へ着けば、そこに敵がいる）
    F.chaseG = enemyGroup(rt, { ...SHIBATA, name: '佐久間の追手', anchor: { x: 26, z: 218 }, facing: -2.4, fleeDir: { x: 1, z: -1 }, width: 5, morale: 70, dmgMult: 0.42,
      order: 'attack', dest: { x: LOOK.x + 6, z: LOOK.z - 6 }, seekRange: 24, aggro: 14, speed: 2.5 }, foeList(14));
    F.chaseG.kind4 = 'raid'; F.groups.push(F.chaseG);
    // 桑山の手から一組が主人公と一緒に物見へ下りる（主人公だけで当たらない・kaito AP5）
    F.scoutG = allyGroup(rt, { name: '桑山の物見の組', fullStrength: true, anchor: { x: START.x + 8, z: START.z - 10 }, facing: 2.4, width: 4, aggro: 14, seekRange: 26, order: 'move', dest: { x: LOOK.x + 2, z: LOOK.z - 2 }, speed: 3.4, noRout: true },
      [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 2 }]);
    F.scoutG.onArrive = (q) => { q.order = 'attack'; q.seekRange = 30; };
    rt.army.play('toki', { x: 26, z: 218 }, 1.0);
  },
  // ② 砦の東の口で、湖の南の岸から上がる盛政の手を防ぐ。桑山は退こうとし、丹羽長秀が飯浦から来る
  phase2(rt) {
    const F = rt.flags;
    rt.objDone('s1');
    rt.award((t) => t.side.push('大岩山の急をいち早く知らせた'), '佐久間の追手を討った');
    F.phase = 2; F.pt = rt.t; F.k0 = F.kills; F.waves = 0;
    if (live(F.chaseG)) { F.chaseG.order = 'retreat'; F.chaseG.dest = { x: 30, z: 200 }; F.chaseG.speed = 2.6; F.chaseG.kind4 = 'gone'; }
    rt.after(0.6, () => rt.say('中川の家臣', '殿は大岩山でお討死……。佐久間の勢、すぐそこまで', 3));
    rt.after(4.2, () => rt.say('桑山重晴', 'この砦の兵では支えきれぬ。退くか……', 3));
    rt.after(7.8, () => rt.say('丹羽長秀', '飯浦から湖を渡って参った。賤ヶ岳を捨ててはならぬ。東の口を固めよ', 3.4));
    rt.obj('s2', STAGE_TEXT[1], 'main');
    // 盛政の本隊は大岩山から湖の南東の岸へ寄せ、そこから手を出す（寄せ手の出所が見える）
    F.saku.order = 'move'; F.saku.dest = { x: -6, z: 214 }; F.saku.speed = 2; F.saku.onArrive = (q) => { q.order = 'hold'; };
    // 丹羽長秀の隊（二千ほど）：飯浦の切通しを上がって砦の西へ
    F.niwaG = allyGroup(rt, { name: '丹羽長秀の隊', fullStrength: true, anchor: { x: -118, z: 268 }, facing: 0.6, width: 5, aggro: 10, order: 'move', dest: { x: FORT.x - 10, z: FORT.z - 12 }, speed: 2.6, noRout: true },   // 砦の北西の外（柵の口は東だけ。中へ入れずに詰まらない）
      [{ type: 'busho', n: 1, o: { name: '丹羽長秀', invuln: true, horse: true } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 3 }]);
    F.niwaG.onArrive = (q) => { q.order = 'hold'; q.aggro = 18; };
    // 物見の組も東の口へ戻って並ぶ
    if (live(F.scoutG)) { F.scoutG.order = 'move'; F.scoutG.dest = { x: MOUTH.x - 2, z: MOUTH.z - 6 }; F.scoutG.onArrive = (q) => { q.order = 'hold'; q.aggro = 16; }; }
    // 寄せ手は東の口へ向かって登る（北と北東から。三度）
    const wave = (x, z, n) => {
      const g = enemyGroup(rt, { ...SHIBATA, name: '佐久間の手', anchor: { x, z }, facing: Math.atan2(MOUTH.x - x, MOUTH.z - z), fleeDir: { x: 0, z: -1 }, width: 5, morale: 75, dmgMult: 0.55,
        order: 'move', dest: { x: MOUTH.x + 3, z: MOUTH.z }, seekRange: 16, aggro: 10, speed: 2.8 }, foeList(n));
      // 坂を東の口まで登り切ってから斬りかかる（途中で脇へ逸れない）
      g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 24; q.aggro = 14; };
      g.kind4 = 'raid'; F.groups.push(g); F.waves++;
      rt.army.play('toki', { x, z }, 1.1);
    };
    // 11/4 jin：盛政の勢は賤ヶ岳の手の数倍（八千対千ほど）。寄せ手を厚くし、桑山が退きかけた苦しさを出す（AQ10）
    rt.after(3, () => wave(-30, 238, 16));
    rt.after(24, () => { if (F.phase === 2) wave(-38, 232, 16); });
    rt.after(46, () => { if (F.phase === 2) wave(-28, 226, 18); });
  },
  // 夜（美濃大返し）を飛ばして二十一日の夜明けへ。真ん中に次の目標を出し、皆を切通しの口の手前に揃える
  dawn(rt) {
    const F = rt.flags, W = rt.world;
    rt.objDone('s2');
    rt.award((t) => t.side.push('賤ヶ岳の砦を守り通した'), '賤ヶ岳の砦を守った');
    // 二十日の寄せ手は退いた（場から下げる）
    for (const g of F.groups) if (g !== F.saku && live(g)) for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u);
    if (live(F.nakaG)) for (const u of F.nakaG.units) if (u.alive && !u.gone) rt.army.despawn(u);
    W.setTime('morning');
    rt.banner('四月二十一日　夜明け', '切通しの口の柴田勝政を討て');
    // 秀吉は大垣から駆け戻り、賤ヶ岳の砦に本陣を置く（総大将は前に出ず、旗本の侍に守られる）
    placePlayer(rt, DAWN_AT.x, DAWN_AT.z, Math.atan2(KATSUMASA.x - DAWN_AT.x, KATSUMASA.z - DAWN_AT.z));
    //   11/4 jin（AV7・AV18・AT3）：砦の中に陣幕を張り、秀吉は床几に座る。旗本は陣幕の中と前で動かず、討たれない
    KIT.honjin(rt, FORT.x - 3, FORT.z + 3, { mon: HASHIBA, people: false, fire: false, w: 12, d: 9 });
    F.hide = allyGroup(rt, { name: '羽柴秀吉の旗本', fullStrength: true, anchor: { x: FORT.x - 3, z: FORT.z + 2 }, facing: -2.5, width: 5, aggro: 4, seekRange: 6, order: 'hold', noRout: true, fixed: true },
      [{ type: 'busho', n: 1, o: { name: '羽柴秀吉', invuln: true, horse: false } }, { type: 'samurai', n: 10, o: { keep: true } }, { type: 'ashigaru', n: 4, o: { flagScale: 1, keep: true } }, { type: 'gun', n: 3, o: { keep: true } }]);
    F.hide.honjin = true;
    for (const u of F.hide.units) { u.invuln = true; u.noTarget = true; }
    F.hideU = F.hide.units.find((u) => u.type === 'busho');
    if (F.hideU) F.hideU._crouch = true;
    // 七本槍（秀吉の小姓衆）と馬廻・丹羽の隊が、主人公と並んで切通しの口へかかる
    F.yari = allyGroup(rt, { name: '七本槍', fullStrength: true, anchor: { x: DAWN_AT.x + 6, z: DAWN_AT.z + 4 }, facing: -2.5, width: 5, aggro: 12, speed: 3.4, order: 'hold', noRout: true },
      [...['加藤清正', '福島正則', '脇坂安治', '加藤嘉明', '平野長泰', '片桐且元', '糟屋武則'].map((name) => ({ type: 'samurai', n: 1, o: { name, invuln: true, horse: true } })), { type: 'ashigaru', n: 10 }, { type: 'gun', n: 2 }]);   // 名のある者は馬上（AY7）
    F.uma = allyGroup(rt, { name: '羽柴の先手', fullStrength: true, anchor: { x: DAWN_AT.x + 12, z: DAWN_AT.z + 10 }, facing: -2.5, width: 6, aggro: 12, speed: 3.2, order: 'hold', noRout: true },
      [{ type: 'samurai', n: 5 }, { type: 'ashigaru', n: 20 }, { type: 'gun', n: 6 }, { type: 'bow', n: 2 }]);   // 秀吉の本隊は一万五千ほど。殿の勝政より厚く（AQ10）
    if (live(F.niwaG)) placeGroup(rt, F.niwaG, DAWN_AT.x - 4, DAWN_AT.z + 12);
    if (live(F.scoutG)) placeGroup(rt, F.scoutG, DAWN_AT.x - 6, DAWN_AT.z - 2);
    // 殿：柴田勝政（三千ほど。切通しの口で踏みとどまる）
    F.kmG = enemyGroup(rt, { ...SHIBATA, name: '柴田勝政の殿', anchor: { ...KATSUMASA }, facing: 0.7, fleeDir: { x: -0.3, z: -1 }, width: 6, morale: 95, dmgMult: 0.5,
      noRout: true, formation: 'line', order: 'hold', aggro: 14, fixed: true },
    [{ type: 'busho', n: 1, o: { name: '柴田勝政', hat: 'kabuto_m', horse: true, flag: SHIBATA.flag } }, { type: 'samurai', n: 3 }, ...foeList(20)]);
    F.kmG.kind4 = 'km'; F.groups.push(F.kmG);
    F.kmU = F.kmG.units.find((u) => u.type === 'busho');
    if (F.kmU) F.kmU.maxHp = F.kmU.hp = 110;
    // 盛政の本隊は湖の西の岸を北へ退く（盛政は落ちのびる＝討てない）。後ろの一隊が岸の道を塞ぐ
    placeGroup(rt, F.saku, SHORE_W[2][0], SHORE_W[2][1]);
    F.saku.order = 'retreat'; F.saku.dest = { ...SHIGE }; F.saku.speed = 0.6; F.saku.kind4 = 'flee';
    F.mmG = enemyGroup(rt, { ...SHIBATA, name: '佐久間盛政の後備', anchor: { x: SHORE_W[1][0], z: SHORE_W[1][1] }, facing: 2.6, fleeDir: { x: -0.3, z: -1 }, width: 5, morale: 70, dmgMult: 0.4,
      order: 'retreat', dest: { ...SHIGE }, speed: 0.6, aggro: 0 }, foeList(14));
    F.mmG.kind4 = 'flee'; F.groups.push(F.mmG);
    rt.after(0.4, () => rt.say('使番', '殿が大垣より十三里を駆け戻られた。賤ヶ岳に御本陣', 3));
    rt.after(4.0, () => rt.say('羽柴秀吉', '玄蕃は退くぞ。まず切通しの口の殿を破れ', 3.2));
    rt.after(7.6, () => rt.say('加藤清正', '一番槍はわしがもらう', 2.6));
    rt.after(1.5, () => this.phase3(rt));
  },
  // ③ 飯浦の切通しの口で、殿の柴田勝政を討つ。味方の隊も皆、口へかかる
  phase3(rt) {
    const F = rt.flags;
    F.phase = 3; F.pt = rt.t; F.k0 = F.kills;
    rt.obj('s3', STAGE_TEXT[2], 'main');
    for (const [g, sp] of [[F.yari, 4.2], [F.uma, 3.8], [F.niwaG, 3.6], [F.scoutG, 3.8]]) if (live(g)) {
      g.order = 'move'; g.speed = sp; g.dest = { x: KATSUMASA.x + 4 + Math.random() * 4, z: KATSUMASA.z + 6 }; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 34; };
    }
    rt.army.play('toki', { ...DAWN_AT }, 1.2);
    sfx('taiko', 0.9);
  },
  // ④ 前田隊が茂山を払い、柴田軍は総崩れ。湖の西の岸を北へ追う
  phase4(rt) {
    const F = rt.flags;
    rt.objDone('s3');
    rt.award((t) => { t.special = { label: '切通しの口で柴田勝政の殿を破った', pts: 15 }; }, '柴田勝政の殿を破った');
    F.phase = 4; F.pt = rt.t; F.k0 = F.kills;
    rt.obj('s4', STAGE_TEXT[3], 'main');
    for (const g of [F.kmG, F.mmG, F.saku]) if (live(g)) { g.order = 'retreat'; g.dest = { ...GONGEN }; g.speed = 2.2; g.kind4 = 'flee'; }
    // 前田利家の隊：戦わずに茂山の陣を払い、権現坂から北へ去る（討てない）
    F.maedaG = enemyGroup(rt, { faction: 'nobukatsu', flag: 'maeda', name: '前田利家の隊', anchor: { x: SHIGE.x + 6, z: SHIGE.z + 4 }, facing: 0, fleeDir: { x: 0, z: -1 }, width: 5, morale: 90,
      order: 'retreat', dest: { x: GONGEN.x, z: GONGEN.z - 40 }, speed: 1.8, aggro: 0, seekRange: 0 },
    [{ type: 'busho', n: 1, o: { name: '前田利家', invuln: true, horse: true, flag: 'maeda' } }, { type: 'samurai', n: 3, o: { flag: 'maeda' } }, { type: 'ashigaru', n: 10, o: { flag: 'maeda', flagScale: 1 } }]);
    F.maedaG.kind4 = 'maeda'; F.groups.push(F.maedaG);
    for (const u of F.maedaG.units) u.noTarget = true;
    rt.after(1.5, () => rt.say('使番', '茂山の前田勢、陣を払うて退きまする', 3));
    rt.after(5, () => rt.say('佐久間盛政', '又左が退いたじゃと……。権現坂まで退け', 3));
    rt.after(8.5, () => rt.say('福島正則', '岸の道を追え、茂山まで押し込め', 2.8));
    // 岸の道で振り向いて踏みとどまる柴田勢（二つの塊）
    F.chase5 = [[-128, 112, 12], [-148, 62, 12]].map(([x, z, n]) => {
      const g = enemyGroup(rt, { ...SHIBATA, name: '柴田勢', anchor: { x, z }, facing: 2.8, fleeDir: { x: -0.3, z: -1 }, width: 5, morale: 60, dmgMult: 0.36,
        order: 'hold', seekRange: 18, aggro: 10, speed: 2.6 }, foeList(n));
      g.kind4 = 'way'; F.groups.push(g);
      return g;
    });
    for (const g of [F.yari, F.uma, F.niwaG, F.scoutG]) if (live(g)) { g.order = 'move'; g.speed = 3.6; g.dest = { x: -130, z: 120 }; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 40; }; }
    F.push2 = false;
  },

  onKill(rt, v) { if (v && v.team === 1) rt.flags.kills++; },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending || !F.phase) return;
    const P = rt.player.u;
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.25;
    if (rt.t > 760) { this.lose(rt, '柴田勢を取り逃がした'); return; }
    const st = rt.t - F.pt;
    // 退く隊は 9m で振り向いて戦う。退き切った者は遠い所でだけ去らせる
    for (const g of F.groups) {
      if (!live(g)) continue;
      let near = Infinity;
      for (const u of g.units) {
        if (!u.alive || u.gone) continue;
        if (g.order === 'retreat' && F.phase >= 4 && u.pos.z < -40 && dist(u.pos, P.pos) > 70) { rt.army.despawn(u); continue; }
        near = Math.min(near, dist(u.pos, P.pos));
      }
      if (g.kind4 === 'flee' && g !== F.saku && g.order === 'retreat' && near < 9) { g.order = 'attack'; g.focus = P; g.aggro = 12; g.speed = 3; }
    }
    // 負け：砦の中に敵が六人より多く、味方が一人以下のまま十二秒（①②）
    if (F.phase <= 2) {
      const foes = nearCount(rt, 1, FORT, FORT.r + 3), friends = nearCount(rt, 0, FORT, FORT.r + 3);
      F.fortBad = foes >= 6 && friends <= 1 ? F.fortBad + 0.25 : 0;
      if (F.fortBad > 12) { this.lose(rt, '賤ヶ岳の砦を奪われた'); return; }
    }
    if (F.phase === 1) {
      if (!F.saw && dist(P.pos, LOOK) < 12) { F.saw = true; rt.say('物見', '大岩山も岩崎山も、柴田の旗にござる', 2.8); }
      if (!live(F.chaseG) || nLive(F.chaseG) <= 3 || st > 160) this.phase2(rt);
      return;
    }
    if (F.phase === 2) {
      // 三度の寄せ手を退ければ夜へ（柵に寄って残る数人は数えない）
      const left = F.groups.reduce((n, g) => n + (g.kind4 === 'raid' ? nLive(g) : 0), 0);
      if ((F.waves >= 3 && left <= 6) || st > 180) { F.phase = 2.5; this.dawn(rt); }
      return;
    }
    if (F.phase === 3) {
      if (!F.kmU?.alive || nLive(F.kmG) <= 3 || st > 200) this.phase4(rt);
      return;
    }
    if (F.phase === 4) {
      // 勝ち：岸の道の柴田勢を崩して茂山の麓まで追う
      const left = F.chase5.reduce((s, g) => s + nLive(g), 0);
      // 岸の一つ目の塊が崩れたら、味方の隊も茂山の麓へ押し出す（主人公だけが行き先へ行かない・BK1）
      if (!F.push2 && nLive(F.chase5[0]) <= 3) {
        F.push2 = true;
        for (const g of [F.yari, F.uma, F.niwaG, F.scoutG]) if (live(g)) { g.order = 'move'; g.speed = 3.6; g.dest = { x: SHIGE.x + 14, z: SHIGE.z + 22 }; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 40; }; }
      }
      // 11/4 jin：一戦を七分ほどに収める（岸の柴田勢を崩して茂山へ近づけば勝ち）
      if ((left <= 4 && dist(P.pos, SHIGE) < 110) || (st > 110 && dist(P.pos, SHIGE) < 130) || st > 170) this.win(rt);
    }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objDone('s4');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '余呉湖の西の岸で柴田軍を追い崩した', pts: 20 }; }, '柴田軍を追い崩した');
    rt.player.u.invuln = true;
    for (const g of F.groups) if (live(g) && g.units[0]?.team === 1) { g.order = 'retreat'; g.dest = { x: g.center().x, z: -200 }; g.speed = 3.4; }
    rt.banner('柴田軍は総崩れ', '勝家は北ノ庄へ退いた');
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
    rt.objFail('s' + Math.max(1, Math.floor(F.phase)));
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
        : b.army.nearestEnemy(u, 9, ok);
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
    const dF = dist(u.pos, FORT);
    if (q && dF < FORT.r + 9 && dist(q, FORT) > FORT.r + 2) {
      const atMouth = Math.abs(u.pos.z - FORT.z) < 3 && u.pos.x > FORT.x + FORT.r - 5;
      const inside = dF < FORT.r + 1.5 && !b.army.wallBetween(u.pos, -1, FORT);
      if (inside) { goTo(p, inp, FORT.x + FORT.r + (atMouth ? 7 : -3), FORT.z, 1.5); return; }
      const vx = q.x - u.pos.x, vz = q.z - u.pos.z, L2 = vx * vx + vz * vz || 1;
      const k = Math.max(0, Math.min(1, ((FORT.x - u.pos.x) * vx + (FORT.z - u.pos.z) * vz) / L2));
      if (Math.hypot(u.pos.x + vx * k - FORT.x, u.pos.z + vz * k - FORT.z) < FORT.r + 2) {
        const a1 = Math.atan2(u.pos.x - FORT.x, u.pos.z - FORT.z), a2 = Math.atan2(q.x - FORT.x, q.z - FORT.z);
        const da = Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)), a = a1 + Math.sign(da) * Math.min(Math.abs(da), 0.6);
        goTo(p, inp, FORT.x + Math.sin(a) * (FORT.r + 7), FORT.z + Math.cos(a) * (FORT.r + 7), 1.5);
        return;
      }
    }
    // ④は岸の道に沿って北へ
    if (F.phase === 4 && q && u.pos.z > 180) { goTo(p, inp, -104, 176, 3); return; }
    if (q) goTo(p, inp, q.x, q.z, 2);
  },
};

t02_shizugatake.sides = { a: { name: '羽柴軍', mon: HASHIBA }, b: { name: '柴田軍', mon: SHIBATA.flag } };
// 兵の数：柴田方およそ三万・羽柴方は集まった後でおよそ五万（docs/battle_refs/t02_shizugatake.md）
t02_shizugatake.force = (rt) => ({ a: 50000, a0: 50000, b: Math.max(0, 30000 - (rt.flags.kills || 0) * 40), b0: 30000 });
t02_shizugatake.date = (rt) => (rt.flags.phase >= 2.5 ? '天正十一年四月二十一日　夜明け' : '天正十一年四月二十日　初夏');
t02_shizugatake.history = '天正十一年、羽柴秀吉と柴田勝家は、近江の余呉湖のまわりの砦に分かれて睨み合った。北の行市山・別所山・茂山には佐久間盛政・前田利家ら柴田方、南の堂木山・神明山・東野山・岩崎山・大岩山・賤ヶ岳・田上山には羽柴方が入った。\n'
  + '四月二十日、佐久間盛政は行市山から余呉湖の西を回り込み、大岩山の砦を攻め落とした。守っていた中川清秀は討ち死にし、岩崎山の高山右近も退いた。賤ヶ岳の砦は、琵琶湖を渡って来た丹羽長秀の加勢で持ちこたえた。\n'
  + '大垣にいた秀吉はこれを聞き、およそ五十二キロの道をわずかな時で駆け戻った（美濃大返し）。勝家は盛政に退くよう命じたが、盛政は大岩山に居座り、勝家の本隊から離れて孤立した。\n'
  + '二十一日の夜明け、秀吉は湖の西の岸を退く佐久間勢を追い、飯浦の切通しの辺りで殿の柴田勝政を討った。茂山の前田利家が戦の場を離れると、柴田勢は総崩れとなった。\n'
  + '佐久間盛政は落ちのびたが、のちに捕らえられた。勝家は越前の北ノ庄城へ退き、数日の後に城とともに果てた。この日に手柄を立てた福島正則・加藤清正らは、のちに「賤ヶ岳の七本槍」と呼ばれた。';

// 目標の並び（goals5.js）。段の一行は場所と行いで書く。「敵を何人討つ」は共通の一つだけ（AR の 1）
const st = (n) => (rt) => (rt.flags.phase ?? 0) >= n;
STAGES.t02_shizugatake = STAGE_TEXT.map((t, i) => (i ? [t, st(i + 1)] : [t]));
// 倒す数（kaito 11/2 O）：右上の任務の一行に「（倒した数／倒す数）」。段が進む判定と同じ数え方（stages.js）
KILLS.t02_shizugatake = (rt) => {
  const F = rt.flags;
  return F.ending ? null : F.phase === 1 ? downTo([F.chaseG], 3) : F.phase === 3 ? downTo([F.kmG], 3) : F.phase === 4 ? downTo(F.chase5, 4) : null;
};
withGuard(t02_shizugatake);

export { t02_shizugatake };
