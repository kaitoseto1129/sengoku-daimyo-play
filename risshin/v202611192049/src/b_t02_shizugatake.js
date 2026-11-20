// ======================================================================
// 豊臣編 2　賤ヶ岳の戦い（天正十一年四月二十日〜二十一日）。筋書きは docs/chapter2_toyotomi.md の「2. 賤ヶ岳の戦い」。
// 手本：kaito の対陣図（docs/battle_refs/t02_shizugatake_map.jpg・t02_shizugatake.md）。砦の位置と守将の名は図のとおり。
// 戦の型：砦＋山岳。主人公は賤ヶ岳の砦にいる羽柴方の侍大将。
// 段：①東の物見へ下り、中川の落ち武者を追う佐久間の追手を討つ ②砦の東の口で、寄せる佐久間勢を防ぐ（船で湖を渡った丹羽長秀が来援）
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
import { nobori, kagaribi, village, yagura, carryTorches, stumps } from './props.js';
import { placeGroup, placePlayer } from './b_opening.js';
import { distToPolyline } from './world.js';
import { rippleWater } from './world_water.js';
import { doruiLine } from './castle_parts.js';
import { liteMat } from './world_vegetation_materials.js';
import { victoryMoment } from './victory_moment.js';
import { sfx } from './audio.js';
import { withGuard } from './toyo_bot.js';
import { KILLS, STAGES, cut } from './stages.js';
import { KIT } from './b_nagashinojo.js';
import { KACCHU } from './kacchu_data.js';
import { goalsTick } from './hud_goals.js';
import { sightUnit } from './battle_sight.js';
import { farSight } from './far_sight.js';
// 15分の段（kaito 11/8 夜 docs/toyo15_plan_1108.md）：段の中身は t02_shizugatake/ に
import * as Open from './t02_shizugatake/open.js';
import { returnTurn, sevenSpears, epilogue } from './t02_shizugatake/turn.js';
import { flagTexture } from './textures.js';
import { T02_DEPTH } from './t02_shizugatake/depth.js';
import { depthRout } from './army_depth.js';
import { localClear } from './army_local_way.js';
import { VIEW } from './viewport.js';   // 11/17 K365：innerWidth を毎コマ読まない（札を書き換えた後の配置のやり直しを避ける）

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
useTerrain('dem_shizugatake', (d) => { dem = d; lakeMask = d ? buildLake(d) : null; FORT_H = null; OI_H = null; });
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
const CUT_WALL = [[-106, 233], [-114, 254], [-120, 267], [-128, 278], [-150, 282]];   // 両側を崖にする所（口から峠の手前まで）
const KAIDO = [[226, 400], [228, 330], [222, 236], [205, 150], [175, 60], [150, -20], [110, -100], [60, -160], [35, -250], [10, -330], [-10, -400]];   // 北国街道
const UPHILL = [[115, 252], [80, 262], [50, 266], [20, 266]];   // 木ノ本の西の黒田から賤ヶ岳の東の肩へ上がる道
const SHORE_W = [[-95, 205], [-112, 170], [-122, 130], [-135, 95], [-150, 55], [-165, 25]];   // 余呉湖の西の岸を北へ（盛政の退く道）
// 追撃の道は隊ごとに一度だけ組み、見回りのたびに配列を作らない。
const CHASE_WAYS = [0, 1, 2].map((i) => {
  const foot = [SHIGE.x + [8, 16, 2][i], SHIGE.z + [18, 26, 30][i]];
  return [...SHORE_W.filter(([, z]) => z > foot[1] + 6), foot];
});
// 岸の道の x（その z で。道より東＝湖の側かを見る）
const distX = (z) => { for (let i = 0; i + 1 < SHORE_W.length; i++) { const [ax, az] = SHORE_W[i], [bx, bz] = SHORE_W[i + 1]; if (z <= az && z >= bz) return ax + (bx - ax) * (az - z) / (az - bz); } return z > SHORE_W[0][1] ? SHORE_W[0][0] : SHORE_W[SHORE_W.length - 1][0]; };
const JOIN = { x: 20, z: 266 };                         // 秀吉の本隊と落ち合う所
const KATSUMASA = { x: -104, z: 228 };                   // 柴田勝政の殿（切通しの口）
const START = { x: -48, z: 300 };
// 11/10 改訂（docs/shizugatake_spec_1109.md）：大岩山は山上の陣城（柵・土塁・小門・陣幕・見張り台）。主人公はここで中川清秀と守り、後で外から奪い返す
const OI = { x: OIWA.x, z: OIWA.z, r: 11 };
const OI_GA = 0;                                          // 小門は南（賤ヶ岳の側）
const OI_GATE = { x: OI.x, z: OI.z + OI.r + 4 };          // 小門の外
const OI_SOUTH = { x: OI.x - 4, z: OI.z + 6 };            // 南の柵の内
const OI_WEST = { x: OI.x - 6, z: OI.z - 1 };             // 西の斜面の柵の内
const OI_HQ = { x: OI.x + 1, z: OI.z };                   // 中川の本陣（陣幕）の前
const OI_BACK = { x: OI.x - 8, z: OI.z + 50 };            // 退く先（振り返ると大岩山が見える）
// 11/18 cloud-06（cloud-24 の act bot 905秒：秀吉の小姓衆9人が砦の内の北 (74,93) で一点に重なって止まる＝小門へ向かう道が中川の本陣の陣幕 (76,100) に当たる）：
//   砦の内の北半分にいる備は、陣幕の西を回ってから小門の道へ入る
// 11/19 04:55 クラウド持ち主（夜50-32 act bot 653秒：小姓衆7人が陣幕の北 (75,94) で一点に重なる＝陣幕の北から西の脇 (69,101) へ斜めに向かうと陣幕 (76,95・幅7奥4) の角に当たる）：
//   陣幕より北で西の角より東に居る備は、先に北西の角の外 (70,92) へ出てから西の脇を下る（本人のピンと同じ道）
const oiWestFirst = (g) => { const c = g?.center?.(); if (!(c && Math.hypot(c.x - OI.x, c.z - OI.z) < OI.r + 1 && c.z < OI.z + 3)) return []; const w = [[OI.x - 6, OI.z + 1], [OI.x - 4, OI.z + 7]]; return c.z < OI.z - 3.5 && c.x > OI.x - 4 ? [[OI.x - 5, OI.z - 8], ...w] : w; };
const OI_EXIT = [[OI.x, OI.z + 6], [OI.x, OI.z + 19], [OI.x + 28, OI.z + 22], [OI.x + 28, OI.z - 25]]; // 南の小門から東を回る陸道
const SAKU_LINE = { x: OI.x - 8, z: OI.z - 40 };          // 大岩山の北で盛政が備を立て直す所
const SHIBA_FRONT = { x: 58, z: 22 };                     // 柴田の先手と当たる所（岩崎山の南）
const MAEDA_LOOK = { x: -160, z: -30 }; // 茂山の北東の肩。前田隊の陣払いを間近で見る
// 余呉湖を横切らず、北の岸を往復する。
const NORTH_SHORE = [[100, -100], [-90, -100], [MAEDA_LOOK.x, MAEDA_LOOK.z]];
const NORTH_BACK = [[-90, -100], [100, -100], [SHIBA_FRONT.x, SHIBA_FRONT.z]];
const NORTH_OUT = [[SAKU_LINE.x, SAKU_LINE.z], ...NORTH_SHORE];
const KATSUIE = { x: 96, z: -118 };                       // 遠くに見える勝家の旗本（北国街道）
const SAKU_START = { x: -114, z: 162 };                   // 盛政の勢が山を下りて来た所（余呉湖の西の岸）
// 盛政は湖の西の岸を南へ下り、賤ヶ岳の真下で東へ折れて大岩山へ（初めはどの砦を狙うか分からない）
const SAKU_WAY = [[-104, 186], [-95, 205], [-60, 230], [-22, 228], [10, 192], [32, 150], [46, 120]];
const OIWA_WAY = [[LOOK.x, LOOK.z], [20, 228], [45, 180], [OI.x - 2, OI_GATE.z + 2]];

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
let FORT_H = null, OI_H = null;
function height(x, z) {
  let h = natural(x, z);
  // 山頂の砦は平らに削る
  const df = Math.hypot(x - FORT.x, z - FORT.z);
  if (df < FORT.r + 10) { if (FORT_H === null) FORT_H = natural(FORT.x, FORT.z) - 0.6; h += (FORT_H - h) * (1 - sstep(FORT.r, FORT.r + 10, df)); }
  const dq = Math.hypot(x - OI.x, z - OI.z);
  if (dq < OI.r + 9) { if (OI_H === null) OI_H = natural(OI.x, OI.z) - 0.4; h += (OI_H - h) * (1 - sstep(OI.r + 1, OI.r + 9, dq)); }
  // 飯浦の切通し：峠を道幅だけ掘り下げる（276m の峠を 262m まで）
  const dc = distToPolyline(x, z, CUT);
  if (dc < 6) h = Math.min(h, h + (toY(262) - h) * (1 - sstep(2.2, 6, dc)));
  // 11/6 critic60（十1・二1）：口から峠までの道は、両側を切り立てた切通し（道を一段掘り、脇の土を盛って崖にする）
  const dk = distToPolyline(x, z, CUT_WALL);
  if (dk < 9) { const cut = 1 - sstep(2.4, 3.4, dk), bank = sstep(2.6, 3.6, dk) * (1 - sstep(6, 9, dk)); h += -0.9 * cut + 2.6 * bank; }
  // 余呉湖：岸で水面、湖の底は水面の 1.6 下。湖の楕円の内の陸は水面より上に
  if (inLakeBox(x, z)) {
    const k = sstep(0.3, 0.7, lakeAt(x, z));
    h = Math.max(h, WY + 0.25) * (1 - k) + (WY - 1.6) * k;
  }
  return h;
}

// 水の板：余呉湖（楕円）と琵琶湖（西の岸の外）。描く数は二つ
function waterMeshes(rt) {
  // 11/5 check60（八1）：一色の板に見えた。余呉湖は「鏡湖」と呼ばれる静かな湖面。川と同じ作りで空を映し、風のさざ波で砕く（流れの筋は描かない）
  const mat = rippleWater(liteMat({ color: 0x3e5258, roughness: 0.16, metalness: 0, envMapIntensity: 0.9 }), 0.4, 0.9, 2.6, rt.world.hemi?.color, false, null, null, false, true);
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
// 柴田方は二つ雁金の旗。羽柴方の旗は 'oda' の兵も含めて全部、天正十一年の五三桐に染め替える（world.armyFlagKinds。豊臣編に織田の旗を出さない・kaito AQ4）
// 11/5 check60：佐久間盛政の手は佐久間の丸に三引両、丹羽長秀の隊は直違（家ごとの旗。柴田の旗は勝家の一門と勝政の手だけ）
const SHIBATA = { faction: 'nobukatsu', flag: 'kari' };
const SAKUMA = { faction: 'nobukatsu', flag: 'sakuma' };
const NIWA = 'sujikai';
const HASHIBA = 'kiri53';
// 11/18 クラウド持ち主：中川清秀の砦・本陣・隊は中川クルス（花クルスで推した。山崎の中川と同じ）。前は羽柴の桐を借りていて、大岩山が誰の砦か見分けられなかった
const NAKA = 'kurusu';
// 陣形の塊：槍の足軽を主に、鉄砲・徒歩侍を混ぜる（兵の割合の決まりに寄せる）
const foeList = (n, o = {}) => {
  const s = Math.max(1, Math.round(n * 0.12)), g = Math.max(1, Math.round(n * 0.14));
  return [{ type: 'ashigaru', n: Math.max(1, n - s - g), o: { flagScale: 1, ...o } }, { type: 'samurai', n: s, o }, { type: 'gun', n: g, o }];
};
const live = (g) => !!g && g.units.some((u) => u.alive && !u.gone);
// 敗走・退却・負傷離脱した兵を、まだ戦う数に含めない（倒れた負傷兵を探し回らせない）
const nLive = (g) => (!g || g.routed || g.order === 'retreat' ? 0 : g.units.reduce((n, u) => n + (u.alive && !u.gone && !u.fleeing && !u.noTarget && !u.downed && !u.woundOut && !u.rearWound ? 1 : 0), 0));
// 逃げた兵・戦えなくなった兵を、まだ道を塞ぐ殿として数えない。
const shoreLeft = (groups) => (groups || []).reduce((n, g) => n + (g.routed || g.order === 'retreat' ? 0 : g.units.reduce((s, u) => s + (u.alive && !u.gone && !u.fleeing && !u.noTarget && !u.downed && !u.woundOut && !u.rearWound ? 1 : 0), 0)), 0);
// 柵や倒れた負傷兵を守備兵・寄せ手に数えない。
const nearCount = (rt, team, p, r) => rt.army.units.reduce((n, u) => n + (u.alive && !u.gone && !u.isStruct && !u.civ && !u.fleeing && !u.noTarget && !u.downed && !u.woundOut && !u.rearWound && u.team === team && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < r ? 1 : 0), 0);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// 段を離れた後や敗北後に、古い知らせ・柵の破壊・追手の追加を実行しない。
function phaseAfter(rt, sec, fn) {
  const phase = rt.flags.phase;
  rt.after(sec, () => {
    if (!rt.over && !rt.flags.ending && rt.flags.phase === phase) fn();
  });
}
const MOUTH = { x: FORT.x + FORT.r + 4, z: FORT.z };     // 賤ヶ岳の砦の東の口（柵の切れ目）
const DAWN_AT = { x: -82, z: 256 };                      // 夜明けに主人公が立つ所（砦の西の肩。切通しの口まで三十五歩ほど）
// 目標（goals5.js が並べる。段の一行は場所と行い。四つの段だけ。「敵を何人討つ」で埋めない・stageGoalsOnly。携帯の横で一行に収まる長さ）
// 11/5 check60：844 の横で九字ほどで二行に折れた（写真）。九字までに縮める
// 11/6 critic60（十1・三1）：だれを討つ・だれを追うかを書く。夜の美濃大返しも段にする（本陣で秀吉を迎える）
// 11/10 改訂（docs/shizugatake_spec_1109.md）：砦を守る側から、奪い返す側へ。十三の段（携帯の横で一行に収まる長さ）
// 赤い▼を付ける敵：本人を狙う者（四十m 内）と二十五m 内の敵から近い七人（岩石城・根白坂・上田と同じ形。コマごとに一度だけ選ぶ）
function shizuFoeSign(rt, u) {
  const me = rt.player.u, p = me.pos;
  if (rt._triT !== rt.t) {
    rt._triT = rt.t; const near = rt._triNear || (rt._triNear = new Set()); near.clear();
    const c = rt._triCand || (rt._triCand = []); c.length = 0;
    // 11/19 05:30 クラウド持ち主 ⑥（345秒 東の口から肩への写真：本人を狙う佐久間の兵が十七人いて▼が十七並び、兵より印が目立った）：
    //   三木と同じく、本人を狙う者も同じ候補に入れて近い順に七つまで。四十m より遠い狙い手は外す
    for (const v of rt.army.units) { if (!v.alive || v.team === me.team || v.isStruct) continue; const d = (v.pos.x - p.x) ** 2 + (v.pos.z - p.z) ** 2; const aim = v.target === me || v.atk?.target === me; if (d < 625 || aim && d < 1600) c.push(d, v); }
    for (let k = 0; k < 7 && c.length; k++) { let bi = 0; for (let j = 2; j < c.length; j += 2) if (c[j] < c[bi]) bi = j; near.add(c[bi + 1]); c.splice(bi, 2); }
  }
  return rt._triNear.has(u);
}
const STAGE_TEXT = ['東の物見で砦の並びを見る', '東の物見で佐久間勢の行き先を見る', '大岩山の中川殿へ加勢に走る', '大岩山の南柵を守る', '大岩山の西斜面へ兵を回す', '中川殿の本陣へ合わさる',
  '中川隊と大岩山の南へ退く', '賤ヶ岳の砦まで下がる', '東の肩で戻った秀吉を迎える', '大岩山を取り返す', '大岩山の北で佐久間の備を押し返す', '茂山で前田勢の退きを見る', '岩崎山の南で柴田の先手を押す'];
const STAGE_PLACE = ['東の物見', '東の物見', '大岩山の小門', '南の柵', '西の斜面', '中川の本陣', '大岩山の南の坂', '砦の東の口', '東の肩の道', '大岩山', '大岩山の北', '茂山の北東の肩', '岩崎山の南'];
const STAGE_AT = [0.5, 0.8, 1, 1.3, 1.6, 1.8, 2, 2.3, 2.6, 3, 3.5, 3.7, 4];
const STAGE_POINTS = [LOOK, LOOK, OI_GATE, OI_SOUTH, OI_WEST, OI_HQ, OI_BACK, MOUTH, JOIN, OI, SAKU_LINE, MAEDA_LOOK, SHIBA_FRONT];
const ST = (p) => STAGE_TEXT[STAGE_AT.indexOf(p)];
const stageIx = (p) => { let i = 0; for (let k = 0; k < STAGE_AT.length; k++) if ((p || 0) >= STAGE_AT[k]) i = k; return i; };
const HONJIN = { x: FORT.x + 6, z: FORT.z + 2 };          // 夜に張る秀吉の本陣の前（砦の中）
// 11/5 check60 fix3（時代考証）：天正十一年の先懸けの衆は百〜三百石の若い小姓・馬廻。共通の表の具足は大名になった後の物
//   （清正の長烏帽子形兜と題目の旗・正則の大水牛脇立・嘉明の富士山形・名を書いた指物）なので、この戦では使わない。
//   黒漆の頭形・筋兜に立物なし、威だけ人ごとに替え（同じ姿を二人作らない）、指物は主の羽柴の旗
const KOSHO = ['加藤清正', '福島正則', '脇坂安治', '加藤嘉明', '平野長泰', '片桐且元', '糟屋武則'];
const KOSHO_LACE = [0x232c40, 0x6a4026, 0x9a2e20, 0x5a5650, 0x8a6a3a, 0x3a3226, 0x6a3a2a];
const SHIZU_KACCHU = Object.fromEntries(KOSHO.map((name, i) => [name, { ...KACCHU[name], bowl: i % 2 ? 'suji' : 'zunari', crest: 'none', doStyle: 'okegawa',
  armor: i % 3 === 1 ? 0x2e2620 : 0x1c1a1a, helm: i % 3 === 1 ? 0x2e2620 : 0x1c1a1a, lace: KOSHO_LACE[i], odo: KOSHO_LACE[i],
  haori: 0, menpo: 0, fur: 0, horo: 0, skinDo: undefined, kusazuriBands: undefined, doLaceBands: undefined, flag: HASHIBA, mon: 'none', lac: 'kuro', ref: '' }]));
// 11/6 check60 fix4（時代考証）：秀吉の馬藺の後立と馬毛、利家の金鯰尾と金小札は、伝来の品が安土桃山の後の物で、天正十一年の着用は裏付けがない。
//   秀吉は筋兜・立物なし・黒漆に白糸の威、利家は筋兜・黒漆・毛引威（ほかの戦の復元と同じ考え）。盛政の指物は佐久間の旗（共通の表は織田）
Object.assign(SHIZU_KACCHU, {
  // 清正の後年の仏胴指定を若い小姓の具足へ持ち込まない。
  '加藤清正': { ...SHIZU_KACCHU['加藤清正'], plateDo: null },
  '羽柴秀吉': { ...KACCHU['羽柴秀吉'], crest: 'none', armor: 0x22201c, helm: 0x16120f, fur: 0, haori: 0, menpo: 0, horo: 0, mon: 'none', preserveLace: true, haidateGold: false, flag: HASHIBA, ref: '' },
  '前田利家': { ...KACCHU['前田利家'], bowl: 'suji', crest: 'none', doStyle: 'kebiki', armor: 0x22241e, helm: 0x22241e, lace: 0x554732, odo: 0x554732,
    goldKozane: false, suneateGold: false, suneateColor: 0x22241e, lac: 'kuro', haori: 0, menpo: 0, fur: 0, horo: 0, flag: 'maeda', ref: '' },
  // 盛政の所用品は未確認。甘棠院伝来の縹糸威最上胴丸具足を手本にした復元（docs/generals_look_1108/佐久間盛政.md）。
  '佐久間盛政': { ...KACCHU['佐久間盛政'], bowl: 'suji', crest: 'none', doStyle: 'sugake',
    armor: 0x24221f, helm: 0x24221f, lace: 0x3c5a8a, odo: 0x3c5a8a, lac: 'kuro',
    haori: 0, menpo: 0, mon: 'sakuma', flag: SAKUMA.flag, ref: '' },
});

// 11/6 check60 六度目（九1・九3・十二1）：共通の任務札は今の一行だけ・両軍の棒は止めてある・敵の▼は近い数人まで。
//   この戦では目標の札（hud_goals）で①〜④を始めから並べ、両軍の残りの棒と数を上に出し、四十 m 内の見える敵の残りにも赤い▼を付ける（箕作・真田丸と同じ作り）。
const SZ_BOARD_CSS = `
/* 行き先は画面の内外とも▼一つ。共通の矢印の形をこの戦へ持ち込まない。 */
html:root body #hud.shizu-goals #goal-sign .gs-tag i { clip-path:polygon(0 0,100% 0,50% 100%) !important; }
html:root body #hud#hud#hud.shizu-goals #armybar:not([hidden]) { display:grid !important; visibility:visible !important; opacity:1 !important; }
html:root body #hud#hud#hud.shizu-goals #armybar .clock { visibility:hidden !important; }
html:root body:has(#intro:not([hidden]) > .card) #hud#hud#hud.shizu-goals :is(#armybar, #h-prog) { visibility:hidden !important; }
html:root body #hud#hud#hud.shizu-goals #h-prog#h-prog.goal-mode > :not(.pg-goals) { display:none !important; }
html:root body #hud#hud#hud.shizu-goals #h-prog#h-prog.goal-mode > .pg-goals { display:block !important; }
html:root body #hud#hud#hud.shizu-goals #h-prog#h-prog.goal-mode {
 left:auto !important; right:calc(12px + env(safe-area-inset-right, 0px)) !important; transform:none !important;
 width:auto !important; min-width:0 !important; max-width:min(300px, 40vw) !important; box-sizing:border-box;
 padding:7px 11px 8px 9px !important; background:rgba(14,12,10,.7) !important; border:none !important; border-radius:6px !important;
}
html:root body #hud#hud#hud.shizu-goals #h-prog#h-prog.goal-mode .pg-goals li { display:flex !important; white-space:normal !important; color:#e6dfd2 !important; font-size:14px !important; }
${Array.from({ length: STAGE_TEXT.length - 4 }, (_, k) => `html:root body #hud#hud#hud.shizu-goals[data-shizu-window="${k}"] #h-prog#h-prog.goal-mode .pg-goals li:nth-child(n+${k + 6})${k ? `, html:root body #hud#hud#hud.shizu-goals[data-shizu-window="${k}"] #h-prog#h-prog.goal-mode .pg-goals li:nth-child(-n+${k})` : ''} { display:none !important; }`).join('\n')}
html:root body #hud#hud#hud.shizu-goals #h-prog#h-prog.goal-mode .pg-goals li span { color:inherit !important; background:none !important; }
html:root body #hud#hud#hud.shizu-goals #h-prog#h-prog.goal-mode .pg-goals li.now { color:#fff !important; }
html:root body #hud#hud#hud.shizu-goals #h-prog#h-prog.goal-mode .pg-goals li.done { color:#cfc9bc !important; }
html:root body #hud#hud#hud.shizu-goals #h-prog#h-prog.goal-mode .pg-goals h3 { display:none !important; }
/* 段が変わる時の中央の青い札は右上の任務と同じ字で、874×402 では左下の命の札に重なり戦場の三分の一を食っていた（11/11 見回り せ）。青い札は出さない。 */
html:root body #hud#hud#hud.shizu-goals #center-call .cc.blue { display:none !important; }
html:root body #hud#hud#hud.shizu-goals #center-call .cc { max-width:100%; box-sizing:border-box; padding:4px 6px; font-size:16px; line-height:1.35; letter-spacing:0; }
/* 番号は共通の本文に含まれる。二重の番号で本文の幅を削らない。 */
html:root body #hud#hud#hud#hud.shizu-goals #h-prog#h-prog.goal-mode .pg-goals li::before { content:none !important; }
@media (max-height:500px) {
 html:root body #hud#hud#hud#hud.shizu-goals #h-prog#h-prog.goal-mode {
  top:calc(8px + env(safe-area-inset-top,0px)) !important; bottom:auto !important;
  width:min(300px,36vw) !important; max-width:36vw !important; padding:6px 8px !important;
 }
 html:root body #hud#hud#hud#hud.shizu-goals #h-prog#h-prog.goal-mode .pg-goals li {
  font-size:13px !important; line-height:1.25 !important; gap:5px !important;
 }
 html:root body #hud#hud#hud#hud.shizu-goals #h-prog#h-prog.goal-mode .pg-goals li.now {
  font-size:16px !important; line-height:1.3 !important; padding:2px 0 !important;
 }
}`;
function shizuBoard(rt) {
  const hud = rt.hud;
  if (!hud?.root || typeof document === 'undefined') return;
  hud.root.classList.add('shizu-goals');
  const style = document.createElement('style');
  style.textContent = SZ_BOARD_CSS;
  document.head.appendChild(style);
  const progress = hud.progress;
  hud.progress = function (battle) {
    const out = progress.call(this, battle);
    if (battle === rt && this.prog && !rt.over) {
      // 十三段の順序を保ち、今の段と次の行いを五つまで並べる。
      // 終盤は最後の五つを残し、達成済みの四件だけで次の行いを隠さない。
      // 11/18 K358：共通の札が今の段の一行だけになった後も窓をずらし続け、④から先は右上の任務が消えていた（874×402 の写真）。並びが五つ以下の時は窓をずらさない
      // 11/17 K358 iMac n-k15：行が一つの時は窓を当てない（二つの枝を合わせた）
      const rows = hud.root.querySelectorAll('#h-prog .pg-goals li').length;
      const many = (this.prog.querySelectorAll?.('.pg-goals li').length || rows) > 5;
      const windowAt = many ? String(Math.min(stageIx(rt.flags.phase), STAGE_TEXT.length - 5)) : '0';
      if (rows <= 1) { if (hud.root.hasAttribute('data-shizu-window')) hud.root.removeAttribute('data-shizu-window'); }
      else if (hud.root.getAttribute('data-shizu-window') !== windowAt) hud.root.setAttribute('data-shizu-window', windowAt);
      // 一行の任務札の作り（missionSingleLine）は残し、目標の札を描く時だけ外す
      const def = rt.def, one = def.missionSingleLine;
      def.missionSingleLine = false;
      try { goalsTick(this.prog, rt); } finally { def.missionSingleLine = one; }
    }
    return out;
  };
  // 11/6 critic60（五2）：両軍の数は共通の棒の数（.n）一つだけ。ここで棒の脇に二つ目を書かない
  // 敵の兵には頭上に赤い▼（九3）。印は使い回し、見通しは兵ごとに三分の一秒おき
  const foeMarks = hud.foeMarks, tris = [], box = document.createElement('div'), v = new THREE.Vector3();
  // 印だけを置く透明な原点。画面全体を札の領域として扱わせない。
  box.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:none';
  box.setAttribute('aria-hidden', 'true');
  hud.root.appendChild(box);
  hud.foeMarks = function (battle) {
    const out = foeMarks.call(this, battle);
    if (battle !== rt) return out;
    const me = rt.player.u;
    const on = me.alive && !rt.over && !rt.choice && !this.introWaiting && !rt.player.camShot && !this.bigmap && !this.root.classList.contains('photo');
    const rects = on ? this.hudRects() : null;
    let n = 0;
    if (on) for (const u of rt.army.units) {
      // 密集しても八十人目で切らず、見える敵全員に所属の印を付ける。
      // 印の要素は tris に残して使い回す。
      // 前田勢と勝政の残兵は攻撃対象から外しても敵のまま。共通の名札が出ない者にも所属の▼を残す。
      if (!u.alive || u.gone || u.dying || u.woundOut || u.rearWound || u.downed || u.isStruct || u.civ || u.team === me.team || u.team > 1 || (u._nearSignOn && !u.noTarget) ||
          u.mesh?.visible === false || u.camHidden || (u.pos.x - me.pos.x) ** 2 + (u.pos.z - me.pos.z) ** 2 > 4900) continue;   // 11/6 critic60（九3）：七十 m 内の見える敵は全員
      // 11/18 20:35 持ち主 ⑥（560秒の写真：大岩山の北で赤い▼が十あまり並び、兵より印が目立った）：岩石城・根白坂と同じく、本人を狙う敵と二十五m 内の近い六人だけ
      if (!shizuFoeSign(rt, u)) continue;
      if (!(u._szSeenAt > rt.t - .34 && u._szSeenAt <= rt.t)) { u._szSeen = sightUnit(rt, u); u._szSeenAt = rt.t; }
      if (!u._szSeen) continue;
      v.set(u.pos.x, u.pos.y + (u.mounted ? 3.2 : 2.25), u.pos.z).project(rt.camera);
      if (v.z < -1 || v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue;
      // 共通の▼と同じ余白で、任務札・人数・命の棒に補助の印を重ねない。
      const px = (v.x + 1) * VIEW.w / 2, py = (1 - v.y) * VIEW.h / 2;
      let under = false;
      for (const r of rects || []) if (px > r.left - 24 && px < r.right + 24 && py > r.top - 4 && py < r.bottom + 28) { under = true; break; }
      if (under) continue;
      // 11/18 クラウド k365-cloud-07（K374 提出前の画面の崩れ潰し）：▼が画面の上や左右の端からはみ出す所には出さない（丈20px・幅の半分）
      { const ex = (v.x + 1) * VIEW.w / 2, ey = (1 - v.y) * VIEW.h / 2; if (ey < 22 || ex < 12 || ex > VIEW.w - 12) continue; }
      let el = tris[n];
      if (!el) {
        el = tris[n] = document.createElement('span');
        el.textContent = '▼';
        el.style.cssText = 'position:absolute;left:0;top:0;color:#ff4a2e;font-size:18px;line-height:1;-webkit-text-stroke:1px #2a0d06;text-shadow:0 1px 2px #000;pointer-events:none';
        box.appendChild(el);
      }
      n++;
      el.hidden = false;
      el.style.transform = `translate(${px.toFixed(1)}px,${py.toFixed(1)}px) translate(-50%,-100%)`;
    }
    for (let i = n; i < tris.length; i++) tris[i].hidden = true;
    return out;
  };
  const dispose = rt.dispose;
  rt.dispose = function () {
    hud.foeMarks = foeMarks; hud.progress = progress; box.remove();
    if (hud.prog) hud.prog.classList.remove('goal-mode');
    hud.root.classList.remove('shizu-goals'); hud.root.removeAttribute('data-shizu-window'); style.remove();
    return dispose.call(this);
  };
}

// bot の道：柵の輪（中心 C・半径 R・口の向き ga）の内外をまたぐ時は口を通り、外で輪を横切る時は輪の外を回る。要らなければ null
function fortWay(u, q, C, R, ga) {
  const uIn = dist(u, C) < R + 1, qIn = dist(q, C) < R - 0.5;
  const gIn = { x: C.x + Math.sin(ga) * (R - 3), z: C.z + Math.cos(ga) * (R - 3) }, gOut = { x: C.x + Math.sin(ga) * (R + 6), z: C.z + Math.cos(ga) * (R + 6) };
  if (uIn && !qIn) return dist(u, gIn) < 2.5 || dist(u, gOut) < dist(gIn, gOut) - 1 ? (dist(u, gOut) < 2.5 ? null : gOut) : gIn;
  if (uIn) return null;
  const t = qIn ? gOut : q;
  // 口へ寄った後は内側まで進む。外側の点から三歩離れただけで
  // 外周回りへ戻すと、口の外と内の判定の間で往復し続ける。
  const dx = u.x - C.x, dz = u.z - C.z;
  const along = dx * Math.sin(ga) + dz * Math.cos(ga);
  const across = dx * Math.cos(ga) - dz * Math.sin(ga);
  if (qIn && (dist(u, gOut) < 3 || along < R + 6 && along > R - 3 && Math.abs(across) < 3)) return gIn;
  const vx = t.x - u.x, vz = t.z - u.z, L2 = vx * vx + vz * vz || 1;
  const k = Math.max(0, Math.min(1, ((C.x - u.x) * vx + (C.z - u.z) * vz) / L2));
  if (Math.hypot(u.x + vx * k - C.x, u.z + vz * k - C.z) < R + 2.5) {
    const a1 = Math.atan2(u.x - C.x, u.z - C.z), a2 = Math.atan2(t.x - C.x, t.z - C.z);
    const da = Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)), a = a1 + Math.sign(da) * Math.min(Math.abs(da), 0.6);
    return { x: C.x + Math.sin(a) * (R + 7), z: C.z + Math.cos(a) * (R + 7) };
  }
  return qIn ? gOut : null;
}

const t02_shizugatake = {
  stackAllAttack: true, // 11/18 よ：act bot 311秒 中川清秀の本陣11人が attack のまま (79,95) に重なる★★。狙い無しで重なる attack 組を渦に散らす
  quietArmyCalls: true,   // 11/17 K358 iMac n-k15：中央の「味方が総崩れ」「敵が横から回り込む」「味方が追撃に移った」を出さない（場面が変わって味方の数が落ちた時に崩れと出た・字の札は出さない決まり）
  // 十三の段を、実際の入口から順に作り直す（続きから始める時。前の段は声と時の約束を出さずに流す）
  checkpointStep: (rt) => rt.flags.phase,
  resumeSteps: [
    [0.5, function (rt) { rt.flags.holdPlayer = false; Open.startOpen(rt, this.ctx(rt)); }],
    [0.8, 'march'], [1, 'relief'], [1.3, 'south'], [1.6, 'west'], [1.8, 'hq'], [2, 'fall'], [2.3, 'backline'],
    [2.6, 'returnHide'], [3, 'retake'], [3.5, 'pushSaku'], [3.7, 'watchMaeda'], [4, 'pushShibata'],
  ],
  noCouriers: true,
  // 11/6 六度目（時代考証）：共通の使番の「加藤清正殿の備え、前方にて陣を移す」を出さない（天正十一年の小姓は備を持たない。段の知らせは台詞で足りる）
  noAllyReports: true,
  noTaisho: true,
  noReserve: true,
  frontlineDensity: false,
  // 奥の乱戦の補い（front_fill）は置かない：史実でいない所に軍勢を置かない・見せかけの軍勢を出さない（kaito AP10・AQ6）
  noFrontFill: true,
  // 新手の中心だけ歩けても、横陣の端が大岩山の急斜面に落ちると
  // 本陣へ向かったまま止まる。備の幅と、前線までの歩ける道を先に調べる。
  reserveOk(rt, p, foe) {
    const W = rt.world, me = rt.player?.u;
    if (!me) return false;
    // 11/18 クラウド持ち主：奪還の後、味方の新手が大岩山の北の柵の外 (73,87)(75,78)(74,93) に置かれ、柵の内の持ち場へ向かって
    //   一点に重なり止まった（act bot 617・653・905秒）。奪還より後は砦と柵の周り24m に新手を置かない
    if (rt.flags.phase >= 3 && Math.hypot(p.x - OI.x, p.z - OI.z) < OI.r + 13) return false;
    // 11/18 クラウド持ち主：段10「大岩山を取り返す」で、東の肩から大岩山へ下る道の途中 (43,200)(54,157) に敵の新手が40〜49人湧き、
    //   本人が100〜240秒そこで斬り合って段10 が長引いた（act bot 1113秒）。佐久間勢は砦に居る。段10 の敵の新手は砦から50m の内だけ
    if (foe && rt.flags.phase >= 2.6 && rt.flags.phase <= 3 && Math.hypot(p.x - OI.x, p.z - OI.z) > 50) return false;
    // 11/18 07:55 クラウド持ち主：act bot 322秒（段8 退く）敵の新手3人が大岩山の小門の下 (70,122) に置かれ、attack のまま隊速0で20秒止まった。
    //   落ちた砦の急な裾（砦から30m の内）へ退く段の敵の新手を置かない（佐久間勢は砦の内に居る）
    if (foe && rt.flags.phase >= 2 && rt.flags.phase < 2.6 && Math.hypot(p.x - OI.x, p.z - OI.z) < 30) return false;
    // 11/18 クラウドサ五：中学生 bot 151秒（③加勢に走る間）新手11人が本人から290m 南の (84,392) に置かれ、行き先無しで一点に重なった。reserveOk を持つ戦は共通の「印より遠くへ置かない」が外れるので、本人から110m の内だけに絞る
    if (Math.hypot(p.x - me.pos.x, p.z - me.pos.z) > 110) return false;
    const h = W.heightAt(p.x, p.z);
    for (let dx = -9; dx <= 9; dx += 3) for (let dz = -9; dz <= 9; dz += 3) {
      const x = p.x + dx, z = p.z + dz;
      if (Math.abs(W.heightAt(x, z) - h) > 3 || !W.walkable(x, z, h)) return false;
    }
    return localClear(rt.army, { x: p.x, z: p.z, y: h }, me.pos, true);
  },
  enemyTactics: false,
  // 七段の敵と援軍は段ごとの下知で動かす。「秀吉を迎える」で敵を本陣へ呼ばず、丹羽の控えも引き出さない。
  noGoalFoe: true,
  noFieldMap: true,
  // 11/6 九3：両軍の棒は出す（shizuBoard）。hideArmyPeek を外す
  missionSingleLine: true,
  goalsAllRows: true,
  // 11/5 check60（三3）：右上の一行に段の番号（①〜④）を付けて戦の間ずっと出す。始めの台詞の間も①を出す（「味方の旗へ」に替わらない）
  missionHeading: (rt) => { const i = stageIx(rt.flags.phase); return '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬'[i] + STAGE_TEXT[i]; },
  hidePlayerSign: true,       // 足元の白い輪は出さない（意味の分からない印・標準 五2。本人は縁の光で分かる）
  hideMissionDots: true, hideGuideSteps: true,
  // 行き先は黄色の印一つだけ（ついていく相手の青い印は出さない・kaito AL）。敵は頭上の▼
  noLeaderFollow: true, nearbyAllySignLimit: 0,
  foeMarks: true,
  enemyTriangleSigns: true,
  foeMarkRange: 70,
  enemySignVisible: (rt, u) => shizuFoeSign(rt, u),   // 共通の▼も同じ六人だけ（11/18 20:35 持ち主）
  // 11/6 九3：味方の名のある将（桑山・丹羽・小姓衆）の名を、近づかなくても出す（既定の 18 では遊んで一度も見えない将がいた）
  nameRange: 60,
  missionPinCaption: '',
  noGroundGuide: true,        // 11/18 持ち主：300秒の大岩山で本人の足元に金の輪と太い白い矢印（hud_ground.js の地面の案内・K172 に反する）→ 描かない。行き先は頭上の▼だけ
  goalSignNoFootArrow: true, // 11/18 20:10 持ち主：450秒の写真でまだ足元の輪の中に▼へ向く白い矢印（goal_sign.js の足元の矢印）→ 描かない
  noTravelArrow: true,        // 同じく足元・画面の端の道の矢印も描かない（hud_travel.js）
  goalSignOnly: true,         // 11/4 jin：行き先は頭上の金の▼一つだけ（持ち場の旗・輪・地面の矢印を重ねない。AP12・BH6）
  goalSignTriangle: true,     // 画面の内外とも矢印に替えず、行き先の▼一つに揃える。
  goalSignNoLabel: true,      // ▼の上に字を出さない（kaito 10/23）
  noGoalCount: true,          // 討つ相手への画面の端の赤い矢印も出さない（BH6・印は真上の▼一つ）
  stageGoalsOnly: true,       // 目標は段の四つだけ（「敵を何人討つ」「深手を負わずに勝つ」を足さない。AW3）
  noHatamotoMass: true,       // 将の後ろの軽い作りの備を置かない（AA・AF）
  // 画面の真ん中の札は、時が飛ぶ所（夜明け）と終わりだけ（kaito AT7・Simple）
  //   11/5 check60（標準 五3'）：名のある将を討った時の「〇〇、討ち取ったり」も大きく短く出す
  bannerAllowed: (rt, t) => rt.over || !!rt.flags.ending || /^四月二十(一)?日|討ち取ったり$/.test(t),
  // 兵の声の家の名：羽柴方は羽柴（豊臣の姓は天正十四年から。天正十一年は羽柴）・柴田方は柴田（信勝方と出さない）
  speakerHouse: { oda: '羽柴', nobukatsu: '柴田' },
  playerAtkMax: 4,
  // 15分の七段（11/8 夜）：斬り合いの段が増え、一度に受ける槍は命の四割まで・一息ごと（山崎・長久手と同じ口）
  playerTaken: 0.5,
  meleeGrace: { rate: 0.05, burst: 0.4, interval: 1.2 },
  closeCombatAssist: true,
  autoTargetCamera: true,
  steadyMeleeCamera: true,   // 斬り合いで敵を選び直しても、視点を勝手に回さない。
  compactIntro: true,
  // 顔を覚えていない時も、黒い人影を出さず、撮れた本人の顔だけを一度出す。
  waitForPortrait: true,
  // 11/6 九度目（critic60 五4）：共通の溜め（十五秒）で、始まってから十六秒も台詞が出ず霧の野を見るだけだった。煙と桑山の声が開戦の溜め
  prelude: false,
  introText: () => '柴田勝家と羽柴秀吉が、余呉湖のまわりの山に砦を築いて睨み合う。秀吉は美濃の大垣にいる。前の砦を守るのは中川清秀・高山右近・桑山重晴。賤ヶ岳の東の物見から、砦の並びを見届けよ。',
  minutes: 15,
  pacingCap: 1260,   // 11/14 クラウド：段が十三。段3 が長引いた act の回で段13 の途中（941 秒〜）に十八分の刻限で失敗した。二十一分へ
  expectMin: 15,             // 進み具合の棒は十五分で（11/8 夜）
  depth: T02_DEPTH,           // 軍勢の厚み・陣立て（t02_shizugatake/depth.js）
  // 11/18 クラウドせ：大岩山の段（加勢に走る〜砦が落ちる）は味方の新手を出さない。act bot で新手の生き残り1〜3人が
  //   大岩山の斜面 (80,116)(113,170)(76,169) で attack のまま20秒止まるのが10〜36回出た。史実でも中川の砦へ援けは届かず落ちた（加勢は主人公の組だけ）。
  // 11/18 cloud-06（iMac の長・連絡帳 951）：③「加勢に走る」（phase 1）まで止めると、走る道で本人ひとりが斬り合い③が93→190〜240秒に延びた。止めるのは砦に着いた後（④南の柵〜）だけ
  reserveNoAlly: (rt) => rt.flags.phase >= 1.3 && rt.flags.phase < 2.3,
  lethal: { max: 2, firstAt: 200, gap: 120 },   // 命懸けの戦場（docs/lethal_howto.md）
  fearKind: { kind: 'fort_raid', note: '砦が急襲され、大岩山が落ちる', w: { losses: 1.2, honjin: 1.3, iso: 1.3 }, line: '砦が危ない！' },
  // 11/18 持ち主（⑥）：物見の方を向くと目の前が砦の南東の柵で▼が隠れた。初めは砦の東の口（出る道）を向く
  spawn: { x: START.x, z: START.z, heading: Math.atan2(FORT.x + FORT.r - START.x, FORT.z - START.z) },
  // 物見へ下りる間は、目線を余呉湖の向こうの燃える大岩山へ上げる（坂の法と杉だけを写さない。共通の口）
  // 物見では佐久間の勢へ、退く時と勝った後は大岩山へ目線を上げる（共通の口・前方の内だけ効く）
  camLookAt: (rt) => {
    const F = rt.flags;
    if (F.phase === 0.8 && live(F.saku)) { const c = F.saku.center(); return { x: c.x, z: c.z, up: 2 }; }
    if (F.phase === 2 || F.ending) return { x: OI.x, z: OI.z, up: 3 };
    return null;
  },
  world: {
    // 11/19 cloud-06（cloud-20・act bot 572秒／自分の act 657秒：本人が大岩山の砦の内の北 (77,90) で、北岸の道の角 (100,-100) へ直に向かい北の柵に当たって止まった）：
    //   bot の歩み（playbot goTo）は印でなくこの道を使う。本人が砦の内か脇に居て行き先が砦より北の時だけ、印と同じ順（陣幕の西→南の小門→東を回る→北へ）に回る。ほかの兵は触らない
    moveWay(army, u, want) {
      if (!u?.isPlayer || !want) return want;
      const x = u.pos.x, z = u.pos.z, dO = Math.hypot(x - OI.x, z - OI.z);
      if (dO > 40 || want.z > OI.z - OI.r - 4) return want;
      const q = u._shzWay || (u._shzWay = { x: 0, z: 0, botRadius: 2 });
      if (dO < OI.r + 1) {
        if (z < OI.z - 3.5) { if (x > OI.x - 4) { q.x = OI.x - 5; q.z = OI.z - 8; } else { q.x = OI.x - 6; q.z = OI.z + 2; } }
        else { q.x = OI.x; q.z = OI.z + OI.r + 3; }
        return q;
      }
      if (z > OI.z + 4 && x < OI.x + 24) { q.x = OI.x + 28; q.z = OI.z + 22; return q; }
      if (x >= OI.x + 20 && z > OI.z - 25) { q.x = OI.x + 28; q.z = OI.z - 25; return q; }
      return want;
    },
    mountainFormation: true, // 待機中の持ち場と回り込みも、山腹を歩ける範囲に収める。
    noFake: true,   // 11/13 K285（kaito「本物の兵しか映したらいけない」）：絵だけの兵を作らない。映る兵は全員 戦の中の本物
    // 11/6 九度目（描いて遊んだ）：霧 0.25 では物見から百八十歩先の燃える大岩山も、⑤の岸から湖も霞んで見えなかった。四月二十日は晴れ（大返しの道は日のあるうちに駆けた）。朝霧を置かない
    //   （world は mist が有れば朝の靄の空・地の霧・山の靄を一揃えで掛け、値を半分にしても写真で変わらなかった）
    seed: 1583, time: 'day', mist: 0,
    slopeFenceTilt: true, // 傷んだ柵も、山腹の両端の根元を地面に残して傾ける。
    // 11/8 陣立ての見せ場（幟の林）：大岩山の佐久間の三つの備（先手・二陣・本陣）は物見から百二十〜二百三十歩。描く遠さを二百五十歩へ（霧は幟と山肌だけ薄くする）
    landmarkViewFar: 250,
    // 11/6 八度目（critic60 二1・十一4）：地を這う霧で物見から燃える大岩山・④の岸から余呉湖が見えなかった。湖の靄を薄く残す
    groundMistScale: 0.15, groundHalf: 400, moveLim: 392,
    namedKacchu: SHIZU_KACCHU,   // 先懸けの衆は天正十一年の小姓の姿（上の SHIZU_KACCHU）
    height,
    armyFlagKinds: { oda: HASHIBA, toyotomi: HASHIBA },
    paths: [{ pts: KAIDO, w: 3.5 }, { pts: CUT, w: 2.5 }, { pts: UPHILL, w: 2.5 }, { pts: SHORE_W, w: 2.5 }, { pts: OIWA_WAY, w: 2.5 }, { pts: OI_EXIT, w: 2.5 }, { pts: NORTH_OUT, w: 2.5 }, { pts: NORTH_BACK, w: 2.5 }],
    clear: (x, z) => Math.hypot(x - FORT.x, z - FORT.z) < FORT.r + 6 || distToPolyline(x, z, KAIDO) < 6 || distToPolyline(x, z, CUT) < 4
      || distToPolyline(x, z, SHORE_W) < 5 || distToPolyline(x, z, UPHILL) < 4 || dist({ x, z }, KINOMOTO) < 22 || distToPolyline(x, z, [[FORT.x, FORT.z], [LOOK.x, LOOK.z], [26, 218]]) < 9
      || distToPolyline(x, z, [[FORT.x, FORT.z], [DAWN_AT.x, DAWN_AT.z], [KATSUMASA.x, KATSUMASA.z]]) < 8
      || distToPolyline(x, z, OI_EXIT) < 5 || distToPolyline(x, z, NORTH_OUT) < 6 || distToPolyline(x, z, NORTH_BACK) < 6
      || Math.hypot(x - OI.x, z - OI.z) < OI.r + 12 || distToPolyline(x, z, OIWA_WAY) < 6 || distToPolyline(x, z, [[OI.x, OI.z], [SAKU_LINE.x, SAKU_LINE.z], [SHIBA_FRONT.x, SHIBA_FRONT.z]]) < 7
      // 11/6 九度目：物見の目の前の杉で、燃える大岩山が隠れた。物見から大岩山へ七十歩の目通しを空ける
      || distToPolyline(x, z, [[LOOK.x, LOOK.z], [LOOK.x + (OIWA.x - LOOK.x) * 0.4, LOOK.z + (OIWA.z - LOOK.z) * 0.4]]) < 10,
    trees: 1300, tufts: 2600,
    // 山は杉と雑木、湖と川の低い田（余呉川の谷・木ノ本）は木を置かない
    // 11/6 critic60（二1・八3）：④の岸の道から余呉湖が見えるよう、岸の道の両脇は木を置かない
    //   11/6 九度目（描いて遊んだ）：岸の道と湖の間の杉で、⑤の岸から湖が一度も見えなかった。道から湖までの西の帯は木を置かない
    treeDensity: (x, z) => (inLakeBox(x, z) && lakeAt(x, z) > 0.05 ? 0 : distToPolyline(x, z, SHORE_W) < 13 ? 0
      : x < LAKE.x - 40 && z < 215 && z > 0 && Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz) < 1.45 && x > distX(z) ? 0 : height(x, z) < 0.5 ? 0 : height(x, z) < toY(128) ? 0.08 : 1.15),
    groves: [{ x: -92, z: 318, r: 14, n: 22, kind: 'sugi' }, { x: 104, z: 132, r: 14, n: 20 }],
    fleeOut: (x, z, team) => team === 1 && z < -120,
  },

  // 行き先は段ごとに一つの決まった場所（kaito AW3「目標の場所は固定」）
  missionPin(rt) {
    const F = rt.flags, q = F.pin || (F.pin = { x: 0, z: 0, r: 6, hide: 6 });
    if (!rt.player.u.alive || F.ending) return null;
    // 開始の下知を待つ間も、次に歩く場所の印を途切れさせない。
    const phase = F.phase || 0.5;
    const P = STAGE_POINTS[stageIx(phase)];
    if (!P) return null;
    q.x = P.x; q.z = P.z;
    // 本陣は味方と陣幕が並ぶため八歩で合流。未到着のまま印を消さない。
    const post = phase === 1.3 || phase === 1.6 || phase === 1.8;
    q.r = phase === 1.8 ? 8 : post ? 5 : 6;
    q.hide = q.hideDistance = post ? 3 : 6;
    q.label = STAGE_PLACE[stageIx(phase)];
    // 11/18 cloud-06（中学生の bot：砦の口に着いて30秒、印も敵も無く迷った）：口に着いて追手がまだ坂の下なら、印を一番近い追手へ移す（迎えに出られる）
    if (phase === 2.3 && F.mouthFight == null && Math.hypot(rt.player.u.pos.x - MOUTH.x, rt.player.u.pos.z - MOUTH.z) < 22) {
      let best = null, bd = 1e9; const pp = rt.player.u.pos;
      for (const g of F.groups) if (g.kind4 === 'raid' && g.bornT >= F.pt) for (const u of g.units) if (u.alive && !u.fleeing && !u.downed) { const d = Math.hypot(u.pos.x - pp.x, u.pos.z - pp.z); if (d < bd && d < 70) { bd = d; best = u; } }
      if (best) { q.x = best.pos.x; q.z = best.pos.z; q.label = '佐久間の追手'; }
    }
    // 11/19 cloud-06（中学生 bot：段8「砦まで下がる」で印は東の口の52m 先・近くに敵なしのまま三十秒迷った。台詞はこの戦では鳴らない）：
    //   東の口から遠い間は、大岩山への山道（OIWA_WAY）を逆にたどり、本人より東の口に近い次の曲がり角を印にする（絵で道を示す）
    if (phase === 2.3 && F.mouthFight == null) {
      const pp = rt.player.u.pos, dm = Math.hypot(pp.x - MOUTH.x, pp.z - MOUTH.z);
      if (dm > 30) {
        for (const w of [[OIWA_WAY[2][0], OIWA_WAY[2][1]], [OIWA_WAY[1][0], OIWA_WAY[1][1]], [LOOK.x, LOOK.z]]) {
          const dw = Math.hypot(w[0] - MOUTH.x, w[1] - MOUTH.z);
          if (dw < dm - 6 && Math.hypot(w[0] - pp.x, w[1] - pp.z) > 10) { q.x = w[0]; q.z = w[1]; break; }
        }
      }
    }
    // 救援先だけを直に指すと、物見から山腹を横切ってしまう。
    // 既にある山道の曲がり角を順に示し、小門に着くまで斜面へ誘わない。
    if (phase === 1) {
      const pos = rt.player.u.pos;
      if (dist(pos, OI_GATE) < 16 || dist(pos, OI) < OI.r + 8) F.reliefPinIx = OIWA_WAY.length;
      // 11/18 cloud-06：曲がり角 (45,180) の手前十一〜十三歩の藪で足が止まり、十歩の内に入れず③が三百秒を超えた（act bot の居場所の記録）。角を過ぎた事にするのは十四歩の内で
      while (F.reliefPinIx < OIWA_WAY.length && Math.hypot(pos.x - OIWA_WAY[F.reliefPinIx][0], pos.z - OIWA_WAY[F.reliefPinIx][1]) < 14) F.reliefPinIx++;
      if (F.reliefPinIx < OIWA_WAY.length - 1) {
        q.x = OIWA_WAY[F.reliefPinIx][0]; q.z = OIWA_WAY[F.reliefPinIx][1]; q.label = '大岩山への山道';
      }
    }
    // 湖越しの目的地を直接指さず、主人公にも備と同じ北岸の道を示す。
    if ((phase === 3.7 || phase === 4) && F.northPath) {
      const pos = rt.player.u.pos, path = F.northPath;
      if (dist(pos, P) < 18) F.northPinIx = path.length;
      while (F.northPinIx < path.length && Math.hypot(pos.x - path[F.northPinIx][0], pos.z - path[F.northPinIx][1]) < 12) F.northPinIx++;
      // 11/18 クラウド持ち主：最後の段で本人が既に東 (66,-65) に居るのに、北岸の道の西の端 (-90,-100) を指し、150m 戻らせてまた東へ歩かせた（act bot 段13 166〜229秒）。
      //   次の角が今の角より近い時は、今の角を過ぎた事にする
      while (F.northPinIx < path.length - 1) {
        const [ax, az] = path[F.northPinIx], [bx, bz] = path[F.northPinIx + 1];
        if (Math.hypot(pos.x - bx, pos.z - bz) < Math.hypot(ax - bx, az - bz)) F.northPinIx++; else break;
      }
      if (F.northPinIx < path.length - 1) {
        q.x = path[F.northPinIx][0]; q.z = path[F.northPinIx][1]; q.label = '余呉湖の北岸';
      }
    }
    // 11/18 夜50-19：段11 の後に本人が大岩山の柵の内に残ると、北の柵へ向かって歩き続け、最後の段が500秒止まって時の上限で負けた（act bot 0524 の跡 (70,91)）。
    //   柵の内に居る間と小門を出た直後は、南の小門から東を回る道（OI_EXIT・備と同じ道）を順に指す
    if (phase >= 3.5) {
      const pos = rt.player.u.pos;
      if (dist(pos, OI) < OI.r + 1) F.oiExitIx = 0;
      if (F.oiExitIx != null) {
        while (F.oiExitIx < OI_EXIT.length && Math.hypot(pos.x - OI_EXIT[F.oiExitIx][0], pos.z - OI_EXIT[F.oiExitIx][1]) < 7) F.oiExitIx++;
        if (F.oiExitIx < OI_EXIT.length) { q.x = OI_EXIT[F.oiExitIx][0]; q.z = OI_EXIT[F.oiExitIx][1]; q.label = '大岩山の小門'; }
        else F.oiExitIx = null;
        // 11/19 クラウド持ち主（act bot 段13 647・726秒：本人が砦の内の北 (77,90) から小門の道へ直に向かい中川の陣幕 (76,95・幅7奥4) に当たって止まる）：
        //   陣幕より北に居る間は、備と同じく陣幕の西を回る（北西の角の外→西の脇→小門の道）
        if (F.oiExitIx === 0 && dist(pos, OI) < OI.r + 1 && pos.z < OI.z - 3.5) {
          if (pos.x > OI.x - 4) { q.x = OI.x - 5; q.z = OI.z - 8; } else { q.x = OI.x - 6; q.z = OI.z + 2; }
        } else if (F.oiExitIx === 0 && dist(pos, OI) < OI.r + 1 && pos.x < OI.x - 3 && pos.z < OI.z + 1) { q.x = OI.x - 6; q.z = OI.z + 2; }
      }
    }
    return q;
  },

  setup(rt) {
    const F = rt.flags, W = rt.world;
    F.phase = 0; F.kills = 0; F.allyLost = 0; F.groups = []; F.holdPlayer = true; F.fortBad = 0;
    // 11/19 08:35 クラウド持ち主（act bot「25〜52人を無傷で討った」・受け流し37〜92回・傷0の回）：田野・関ヶ原と同じ型。
    //   大岩山を取り返す段から（段10〜13）、受け流された衆（組）の次の刃は六秒の間、受け流せず構えで受ける（気力が減り浅い傷・崩れれば入る）。敵の数・強さ・一太刀の重さは変えない
    { const P = rt.player, td = P.takeDamage; if (typeof td === 'function') P.takeDamage = function (a, s) {
      const sk = (rt.flags.phase || 0) >= 3 && s && !s.isStruct && s.team === 1 && this.u.hitKind !== 'gun' && this.u.hitKind !== 'arrow', sg = sk && s.group;
      const p0 = rt.stats?.parries || 0, g0 = this.guardT;
      const np = sk && Math.max(s._shzParT || 0, sg?._shzParT || 0) > rt.t && this.guard;
      if (np) this.guardT = Math.max(g0 || 0, 9);
      const d = td.call(this, a, s);
      if (np && this.guardT === 9) this.guardT = g0;
      if (sk && (rt.stats?.parries || 0) > p0) { s._shzParT = rt.t + 6; if (sg) sg._shzParT = rt.t + 6; }
      return d; }; }
    // 11/5 check60（五1）：一騎打ちの「相手の隙を突け」は bannerAllowed を通らずに出る説明の札。この戦では出さない（共通の直しは real_common.md へ）
    rt.duelBannerShown = true;
    shizuBoard(rt);
    waterMeshes(rt);
    // ---- 賤ヶ岳の砦（桑山重晴）：柵の輪（東に口）・篝火・幟・南東の隅の櫓 ----
    F.fortWall = ringWall(rt, FORT.x, FORT.z, FORT.r, { team: 0, hp: 600, gapAt: Math.PI / 2, gapW: 0.7, name: '賤ヶ岳の砦の柵' });
    // 11/5 check60（時代考証）：陣城は柵だけでなく、掻き揚げた土塁の法（切岸）で囲む。東の口（虎口）だけ土を盛らない
    //   地面の格子（5.5）では細い堀を掘れないので、柵のすぐ外に外へ落ちる土塁の法を回す（弾よけにもなる）
    const bank = [];
    for (let i = 0; i <= 22; i++) { const a = Math.PI / 2 + 0.5 + (i / 22) * (Math.PI * 2 - 1); bank.push([FORT.x + Math.sin(a) * (FORT.r + 0.5), FORT.z + Math.cos(a) * (FORT.r + 0.5)]); }
    doruiLine(rt, bank, { w: 3.4, h: 0.9, name: '賤ヶ岳の砦の土塁' });
    for (const [dx, dz] of [[FORT.r + 3, -5], [FORT.r + 3, 5], [-8, -6], [6, 8]]) rt.scene.add(kagaribi(W, FORT.x + dx, FORT.z + dz));
    for (const [dx, dz] of [[-6, -10], [8, -11], [-11, 6]]) rt.scene.add(nobori(W, FORT.x + dx, FORT.z + dz, HASHIBA, 5));
    rt.scene.add(yagura(W, FORT.x + 5, FORT.z + 9, { mon: HASHIBA, team: 0 }));   // 南東の隅（東の口から北を見る目線をふさがない）
    // ---- 対陣図の砦の並び：幟で示す（羽柴方は桐・柴田方は雁金・前田は梅鉢・岩崎山は守将 高山右近の七曜〔11/18 クラウド〕）。大岩山と岩崎山は陥落時に佐久間の旗へ替える ----
    const flags = [[TAGAMI, HASHIBA], [HIGASHINO, 'hori'], [DOGI, HASHIBA], [SHINMEI, HASHIBA], [OIWA, NAKA], [IWASAKI, 'shichiyo'],
      [SHIGE, 'maeda'], [GYOICHI, SAKUMA.flag], [BESSHO, 'maeda']];
    F.fallenFortFlags = []; F.maedaCampFlags = [];
    for (const [p, k] of flags) for (const [dx, dz] of [[0, 0], [-5, 3], [5, 3]]) {
      // 大岩山の幟は置き先をずらしてから地面の高さを取る。後で横へ動かすと山腹で浮く。
      const z = p.z + dz + (p === OIWA ? 6 : 0);
      const guard = nobori(W, p.x + dx, z, k, 7);
      rt.scene.add(guard);
      // 利家・利長の備と一緒に、茂山だけでなく別所山の陣の旗も払う。
      if (p === SHIGE || p === BESSHO) F.maedaCampFlags.push(guard);
      if (p === OIWA || p === IWASAKI) {
        // 陥落前は羽柴方、陥落後は占領した佐久間の幟（岩崎山は捨てるだけで旗を残さない）。奪い返すと羽柴へ戻す
        const sakuma = p === OIWA ? nobori(W, p.x + dx, z, SAKUMA.flag, 7) : null;
        if (sakuma) { sakuma.visible = false; rt.scene.add(sakuma); }
        // 中川の討死の後に取り返した大岩山は羽柴の桐（中川クルスは戻さない）
        const retake = p === OIWA ? nobori(W, p.x + dx, z, HASHIBA, 7) : null;
        if (retake) { retake.visible = false; rt.scene.add(retake); }
        F.fallenFortFlags.push({ guard, sakuma, retake, oiwa: p === OIWA });
      }
    }
    // 11/8 陣立ての見せ場（幟の林。docs/army_depth_1106.md「兵数より旗」）：大岩山を落とした佐久間勢は、霧と尾根の坂で兵が見えなかった。
    //   大岩山から賤ヶ岳へ、先手・二陣・本陣の三つの備を幟の塊で縦に並べる（奥ほど幟が多い）。幟と足元の山肌だけ霧を抑える。並びと本数は推定
    {
      const forest = [], at = (k) => ({ x: OIWA.x + (LOOK.x - OIWA.x) * k, z: OIWA.z + (LOOK.z - OIWA.z) * k });
      for (const [c, rows, cols, gap] of [[at(0.55), 2, 4, 4], [at(0.3), 2, 4, 4.5], [{ x: OIWA.x - 6, z: OIWA.z + 8 }, 2, 5, 4]]) {
        for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
          // 列は物見へ向けて横に並べ、後ろの段は半分ずらす（幟が重ならない）
          const side = (q - (cols - 1) / 2 + (r % 2) * 0.5) * gap, back = r * 5;
          const x = c.x + 0.88 * side + 0.47 * back, z = c.z + 0.47 * side - 0.88 * back;
          if (lakeAt(x, z) > 0.05) continue;
          const f = nobori(W, x, z, SAKUMA.flag, 7);
          f.rotation.y = Math.atan2(LOOK.x - x, LOOK.z - z);
          rt.scene.add(f); forest.push(f);
        }
      }
      farSight(forest, { cap: 0.3, from: 45, to: 90, far: 250, W, ground: { x: at(0.3).x, z: at(0.3).z, r: 110 } });
      for (const f of forest) f.visible = false;   // 佐久間の備の幟は大岩山が落ちてから（burnOiwa）
      F.sakuForest = forest;
    }
    // 木ノ本の宿と飯浦の浦の家並み（遠景）
    if (!W.outsideNearView(KINOMOTO.x, KINOMOTO.z, 140)) rt.scene.add(village(W, KINOMOTO.x - 14, KINOMOTO.z, { n: 6, r: 14, seed: 1583 }));
    if (!W.outsideNearView(IIURA.x, IIURA.z, 60)) rt.scene.add(village(W, IIURA.x + 4, IIURA.z - 6, { n: 4, r: 10, seed: 1584 }));
    // ---- 大岩山と岩崎山は②で落ちて燃える（burnOiwa）。初めは中川・高山の砦のまま ----
    Open.fortArmies(rt, { TAGAMI, HIGASHINO, DOGI, SHINMEI, GYOICHI, BESSHO, SHIGE, OIWA });
    // ---- 佐久間盛政の本隊（八千ほど）：大岩山の砦の跡に居座る本物の塊。見せかけの軍勢は置かない（kaito AF・AQ6） ----
    //   盛政は旗本の侍に囲まれ、前に出ない（討てない）。後の段で湖の西の岸を退く
    F.saku = enemyGroup(rt, { ...SAKUMA, name: '佐久間盛政の本隊', anchor: { ...SAKU_START }, facing: Math.PI * 0.9, fleeDir: { x: -0.3, z: -1 }, width: 8, morale: 90,
      order: 'hold', aggro: 0, seekRange: 0, noAI: true, noRout: true, dmgMult: 0.4 },
    [{ type: 'samurai', n: 4, o: { flag: SAKUMA.flag } }, ...foeList(26, { flag: SAKUMA.flag })]);
    F.saku.kind4 = 'main'; F.groups.push(F.saku);
    // 11/7 critic60（五2・十三3「盛政が一度も見えない」）：盛政と旗本二騎は本隊の前の小さな組。①で物見の下（四十ほど）まで馬を進め、
    //   名と姿を見せて下知する（討てない・打ちかからない）。後の段は本隊と一緒に動く
    F.mori = enemyGroup(rt, { ...SAKUMA, name: '佐久間盛政の旗本', anchor: { x: SAKU_START.x - 6, z: SAKU_START.z - 10 }, facing: Math.PI * 0.9, fleeDir: { x: -0.3, z: -1 }, width: 3, morale: 99,
      order: 'hold', aggro: 0, seekRange: 0, noAI: true, noRout: true, dmgMult: 0.3 },
    [{ type: 'busho', n: 1, o: { name: '佐久間盛政', invuln: true, horse: true, flag: SAKUMA.flag } }, { type: 'cavalry', n: 2, o: { flag: SAKUMA.flag } }]);
    F.mori.kind4 = 'main'; F.groups.push(F.mori);
    // ---- 砦の守り（桑山重晴の手。千ほど） ----
    F.fortG = allyGroup(rt, { name: '桑山の手', fullStrength: true, anchor: { x: FORT.x + 7, z: FORT.z }, facing: Math.PI / 2, width: 5, aggro: 14, order: 'hold', noRout: true },
      [{ type: 'busho', n: 1, o: { name: '桑山重晴', invuln: true, horse: true } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 4 }]);
    // 前田隊は開戦時から茂山に置く。遠景もこの隊を読み、陣払いの後に別の隊を残さない。
    F.maedaG = enemyGroup(rt, { faction: 'nobukatsu', flag: 'maeda', name: '前田利家の隊', anchor: { x: SHIGE.x - 4, z: SHIGE.z - 24 }, facing: 0, fleeDir: { x: 0, z: -1 }, width: 5, morale: 90,
      order: 'hold', aggro: 0, seekRange: 0, noAI: true },
    [{ type: 'busho', n: 1, o: { name: '前田利家', invuln: true, horse: true, flag: 'maeda' } }, { type: 'samurai', n: 3, o: { flag: 'maeda' } }, { type: 'ashigaru', n: 10, o: { flag: 'maeda', flagScale: 1 } }]);
    F.maedaG.kind4 = 'maeda'; F.groups.push(F.maedaG);
    // 11/18 クラウド持ち主：遠くの間引き（depth_reserve.js pruneFar）が前田・桑山の兵を外すたびに初めの数を減らし、後で戻った兵で「人数が初めより多い」（act bot 19〜28回）になっていた。
    //   前田は陣払いを絵で見せる隊、桑山は砦の守りで、どちらも十数人。間引かず本物のまま置く
    for (const g of [F.maedaG, F.fortG]) for (const u of g?.units || []) u.keepReal = true;
    for (const u of F.maedaG.units) u.noTarget = true;
    this.buildOiwa(rt);
    phaseAfter(rt, 1.2, () => { if (!rt.over && !F.ending && F.phase === 0) { F.holdPlayer = false; Open.startOpen(rt, this.ctx(rt)); } });
  },

  // 段の中身（t02_shizugatake/*.js）へ渡す道具
  ctx(rt) {
    return { TEXT: STAGE_TEXT, LOOK, OIWA, MOUTH, SAKUMA, JOIN, OI, foeList, live, nLive, next: () => this.march(rt) };
  },
  // 段に入る：前の段を済にし、今の段の一行を出す
  enter(rt, phase) {
    const F = rt.flags;
    if (F.phase >= 0.5) rt.objDone('s' + stageIx(F.phase));
    F.phase = phase; F.pt = rt.t; F.k0 = F.kills;
    rt.obj('s' + stageIx(phase), ST(phase), 'main');
    // 11/18 K365 iMac n-k15（越前の K365 クラウドに倣う）：K360⑦の後、大岩山の加勢で囲まれて倒れた（act bot 336秒）。段が変わるたびに息を整え、命を八割五分まで戻す（傷の重さは変えない）
    { const me = rt.player?.u; if (me?.alive && me.maxHp) me.hp = Math.max(me.hp, me.maxHp * 0.85); }
  },
  // 大岩山の陣城：柵の輪（南に小門）・土塁・見張り台・中川の陣幕と旗・篝火。守る中川の隊（中川は前で指揮する。HP の大将にしない）
  buildOiwa(rt) {
    const F = rt.flags, W = rt.world;
    F.oiWall = ringWall(rt, OI.x, OI.z, OI.r, { team: 0, hp: 500, gapAt: OI_GA, gapW: 0.9, name: '大岩山の砦の柵' });
    const bank = [];
    for (let i = 0; i <= 20; i++) { const a = OI_GA + 0.6 + (i / 20) * (Math.PI * 2 - 1.2); bank.push([OI.x + Math.sin(a) * (OI.r + 0.6), OI.z + Math.cos(a) * (OI.r + 0.6)]); }
    doruiLine(rt, bank, { w: 3.2, h: 0.8, name: '大岩山の砦の土塁' });
    // 11/18 持ち主：大岩山は中川清秀の砦。見張り台と本陣の陣幕の紋も羽柴の桐でなく中川のクルス（旗と同じ）
    rt.scene.add(yagura(W, OI.x + 7, OI.z + 5, { mon: NAKA, team: 0 }));
    // 11/18 持ち主：幅7mの幕に既定の口6mでは前の袖が0.5mの切れ端になり、口の手盾の列は長さが負で内向きになった→口を3mに（袖2m・手盾1.8m）。
    //   狭い砦なので幕の外の馬繋ぎ・俵・竿・鍋は置かない（compact。馬繋ぎ (82.5,96〜104) が見張り台 (82,105) に刺さっていた）
    KIT.honjin(rt, OI.x + 1, OI.z - 5, { mon: NAKA, people: false, fire: false, w: 7, d: 4, gap: 3, compact: true, noUma: true, yoroi: false });
    for (const [dx, dz] of [[-4, 9], [4, 9], [-8, -3]]) rt.scene.add(kagaribi(W, OI.x + dx, OI.z + dz));
    F.nakaFlag = nobori(W, OI.x + 5, OI.z - 2, NAKA, 7.5);
    rt.scene.add(F.nakaFlag);
    F.naka = allyGroup(rt, { name: '中川清秀の本陣', fullStrength: true, anchor: { ...OI_HQ }, facing: Math.PI, width: 3, aggro: 8, seekRange: 10, order: 'hold', noRout: true, noAI: true, keepMoveOrder: true },
      [{ type: 'busho', n: 1, o: { name: '中川清秀', invuln: true, horse: false, flag: NAKA } }, { type: 'samurai', n: 3, o: { flag: NAKA } }]);
    F.nakaH = allyGroup(rt, { name: '中川清秀の隊', fullStrength: true, anchor: { x: OI_HQ.x - 1, z: OI_HQ.z + 3 }, facing: Math.PI, width: 5, aggro: 8, seekRange: 10, order: 'hold', noRout: true, noAI: true, keepMoveOrder: true },
      [{ type: 'ashigaru', n: 10, o: { flagScale: 1, flag: NAKA } }, { type: 'gun', n: 3, o: { flag: NAKA } }]);
    F.nakaU = F.naka.units.find((u) => u.type === 'busho');
  },
  // 柵を倒す（向き a0 ± w の内の区画。壊れた所は戦の終わりまで残り、後の奪還の入口になる）
  breakOiwa(rt, a0, w, n = 9) {
    let k = 0;
    for (const s of rt.flags.oiWall || []) {
      if (!s.alive || k >= n) continue;
      const mx = (s.seg[0] + s.seg[2]) / 2 - OI.x, mz = (s.seg[1] + s.seg[3]) / 2 - OI.z;
      const d = Math.atan2(Math.sin(Math.atan2(mx, mz) - a0), Math.cos(Math.atan2(mx, mz) - a0));
      if (Math.abs(d) > w) continue;
      s.alive = false; s.hp = 0; s.hitFrom = { x: OI.x + mx * 2, z: OI.z + mz * 2 };
      rt.army.structFall(s);
      k++;
    }
    if (k) rt.army.play('toki', { x: OI.x + Math.sin(a0) * 16, z: OI.z + Math.cos(a0) * 16 }, 1.0);
    return k;
  },
  oiFlags(rt, side) {
    for (const f of rt.flags.fallenFortFlags || []) {
      if (f.oiwa) { f.guard.visible = false; if (f.sakuma) f.sakuma.visible = side === 'sakuma'; if (f.retake) f.retake.visible = side === 'hashiba'; }
      // 岩崎山は高山隊が放棄した砦。大岩山だけの奪還で旗を戻さない。
      else if (side !== 'hashiba') f.guard.visible = false;
    }
    for (const f of rt.flags.sakuForest || []) f.visible = side === 'sakuma';
  },
  // 山腹で一枚の柵を回したまま残すと、斜面の下側へ宙に突き出す。
  // 倒れる動きの後は、各杭・丸太を地面の高さに合わせた破れ跡へ替える。
  settleWalls(rt, walls) {
    for (const s of walls || []) {
      if (s.alive || !s.mesh || s.stumps) continue;
      if (s.shizuFellAt == null) s.shizuFellAt = rt.t;
      if (rt.t - s.shizuFellAt < 0.9) continue;
      s.mesh.visible = false;
      s.stumps = stumps(rt.world, s.seg, { rails: true });
      rt.scene.add(s.stumps);
    }
  },
  // 寄せ手の一組（槍・鉄砲）。出所から行き先へ登り、着けば近くを攻める
  wave(rt, name, from, to, list, o = {}) {
    const F = rt.flags;
    // 11/18 夜50-19：act bot 8戦の受けた傷が0〜48（侍は0）で、寄せ手の一太刀が軽く、斬り合いの怖さが無かった。新手の打ちを他の戦の並み（0.4〜0.6）の0.45へ・坂の追手は0.26→0.36
    const g = enemyGroup(rt, { ...SAKUMA, name, anchor: { ...from }, facing: Math.atan2(to.x - from.x, to.z - from.z), fleeDir: { x: -0.4, z: -1 }, width: 5, morale: 85, dmgMult: o.dmg ?? 0.45, noRout: true, noAI: true,
      order: 'move', dest: { ...to }, speed: o.speed || 3.4, aggro: 8, seekRange: 10 }, list);
    // 柵前では隊列を保って攻める。「攻撃」の後列の歩み寄りで、
    // 狙う枠の無い兵まで同じ敵の一点へ集まり、騎馬と槍が重なるのを防ぐ。
    g.onArrive = (q) => {
      q.anchor = { ...q.dest }; q.dest = null; q.focus = null; q.onArrive = null;
      q.order = 'hold'; q.seekRange = o.seek || 26; q.aggro = 16;
      // 着いた後は柵に沿って横へ広がる（二十人が5列の幅のまま柵の前の一点に重なって止まらない。11/18 bot 136秒）
      q.width = Math.max(q.width || 5, Math.min(9, Math.ceil(q.units.length / 3)));
    };
    g.kind4 = o.kind || 'raid'; g.bornT = rt.t; F.groups.push(g);
    return g;
  },
  // ② 佐久間が動く：遠くの柴田の砦で旗が動き、大勢が湖の西の岸を下りて来る。どの砦を狙うかは、まだ分からない
  march(rt) {
    const F = rt.flags, W = rt.world;
    this.enter(rt, 0.8);
    try {
      F.sakuCol = W.addDistantArmy({ x: GYOICHI.x + 40, z: GYOICHI.z + 60, w: 12, d: 30, count: 260, facing: Math.PI * 0.9, armor: 0x2a2420, flagTex: flagTexture(SAKUMA.flag), mon: SAKUMA.flag, seed: 15851, team: 1, kind: 'mixed', host: false, farFill: true });
      phaseAfter(rt, 1, () => { try { F.sakuCol?.moveTo(SAKU_START.x - 20, SAKU_START.z - 70, 70); } catch (e) { /* 遠景 */ } });
    } catch (e) { F.sakuCol = null; }
    rt.army.play('horagai', { x: SAKU_START.x, z: SAKU_START.z - 40 }, 1.0);
    phaseAfter(rt, 0.4, () => rt.say('物見', '行市山の旗が動いた！　……少ない。いや、後ろから続々と下りて来る', 3.4));
    phaseAfter(rt, 4.6, () => rt.say('使番', '佐久間盛政勢、山を下ります！', 3));
    phaseAfter(rt, 8.4, () => rt.say('桑山重晴', 'どの砦を狙うておる。湖の西の岸を見張れ', 3));
    for (const g of [F.saku, F.mori]) if (live(g)) {
      let i = 0;
      const step = (q) => {
        if (F.phase >= 2 || F.ending) { q.onArrive = null; return; }
        if (i >= SAKU_WAY.length) { q.order = 'hold'; q.onArrive = null; return; }
        const [x, z] = SAKU_WAY[i++];
        q.order = 'move'; q.dest = { x: x + (q === F.mori ? -6 : 0), z: z + (q === F.mori ? 6 : 0) }; q.onArrive = step;
      };
      g.speed = 4.6; g.aggro = 0; g.seekRange = 0; g.focus = null; g.march = true;
      // 行軍中は攻撃対象から外すが、兵の到着は数える。除くと最初の曲がり角で止まる。
      g.arriveNoncombat = true;
      for (const u of g.units) u.noTarget = true;   // 行軍の間は遠くを通るだけ（主人公の行き先の坂で斬り合いにしない）
      step(g);
    }
  },
  tickMarch(rt) {
    const F = rt.flags, st = rt.t - F.pt, c = live(F.saku) ? F.saku.center() : null;
    // 物見を離れて待つだけで「行き先を見る」を果たさない。
    // 11/18 夜50-19：中学生 bot が物見の十二歩の外を歩き回り、②が152秒（44→196秒）かかった。九十秒たてば物見に居なくても使番の急報で③へ
    if (dist(rt.player.u.pos, LOOK) >= 12 && st <= 90) return;
    // 11/18 21:30 持ち主：列は (-60,230) から岸沿いに真東へ向く。-30 を越えるまで待つと上限の四十五秒に当たり「見て分かる」前に急報で進んでいた（描かずの通し 74秒 x-33）。-45 で東へ折れたと見る
    const turned = c && c.x > -45 && c.z < 236 && dist(rt.player.u.pos, LOOK) < 12;
    // 賤ヶ岳の真下で東へ折れた時に、狙いが分かる
    if (!F.turned && (turned || st > 45)) {   // 11/18 クラウドサ五：中学生 bot が261秒に「印も無く30秒何も起きない」と迷った。物見で待つ上限を70→45秒に
      F.turned = true;
      // 道で止まった時の救いは使番の知らせ。起きていない旋回を目撃したと言わない。
      rt.say(turned ? '物見' : '使番', turned ? '東へ折れた……大岩山だ！' : '佐久間勢、大岩山を狙うとの急報！　中川殿へ加勢を！', 3);
      phaseAfter(rt, 3.2, () => { if (!rt.over && !F.ending && F.phase === 0.8) rt.say('桑山重晴', '中川殿が危ない。加勢に走れ！', 2.8); });
      phaseAfter(rt, 3.6, () => { if (!rt.over && !F.ending && F.phase === 0.8) this.relief(rt); });
    }
  },
  // ③ 大岩山へ走る。着く前に戦はもう始まっている（逃げて来る手負い・逆へ走る使番・遠くの鉄砲）
  relief(rt) {
    const F = rt.flags;
    if (F.phase >= 1) return;
    this.enter(rt, 1);
    F.reliefPinIx = 0;
    try { F.sfar?.oiwa?.go?.(); } catch (e) { /* 遠景 */ }
    rt.army.play('gun', { x: OI.x - 20, z: OI.z + 20 }, 1.2);
    // 11/18 クラウド持ち主（⑥写真 90秒）：山道を駆け上がる間、目当ての大岩山に揉み合いの気配が無く静かな砦に見えた→南の柵の上に鉄砲の白い煙を二本（砦が落ちると黒煙に替わる）
    for (const [dx, dz, size] of [[-12, 13, 3.2], [-4, 15, 2.6]]) { const x = OI.x + dx, z = OI.z + dz; try { rt.world.addSmokeColumn?.(x, rt.world.heightAt(x, z) + 4, z, { size }); } catch (e) { /* 煙 */ } }
    // 11/18 クラウドサ五（⑥写真の残り「③の山道で本人の周りに兵が無い」）：桑山の足軽5人が本人と同じ山道を大岩山の小門まで駆ける（戦わず走るだけ・門の外で止まる）
    try {
      const px = rt.player?.pos?.x ?? START.x, pz = rt.player?.pos?.z ?? START.z;
      F.escortG = allyGroup(rt, { name: '桑山の足軽', fullStrength: true, anchor: { x: px + 3, z: pz - 4 }, facing: Math.atan2(OIWA_WAY[1][0] - px, OIWA_WAY[1][1] - pz), width: 3, aggro: 0, seekRange: 0, order: 'move', dest: { x: OIWA_WAY[3][0], z: OIWA_WAY[3][1] }, speed: 3.4, noAI: true, noRout: true },
        [{ type: 'ashigaru', n: 5, o: { flag: null } }]);
      F.escortG.arriveNoncombat = true;
      F.escortG.onArrive = (q) => { q.anchor = { ...q.dest }; q.order = 'hold'; q.dest = null; q.onArrive = null; };
    } catch (e) { /* 供回り */ }
    // 11/19 cloud-06（K281・司令塔：90秒に本人から30〜60m の敵の本物が0）：大岩山へ駆ける山道の中ほど（OIWA_WAY の二つ目と三つ目の間）に
    //   佐久間の物見を一組（5人・刃軽め・崩れやすい）。本人を見たら斬りかかる（段10の物見と同じ手）。兵の総数はほぼ変えない
    try {
      const [a1, a2] = [OIWA_WAY[1], OIWA_WAY[2]], sx = (a1[0] + a2[0]) / 2, sz = (a1[1] + a2[1]) / 2;
      F.reliefScout = enemyGroup(rt, { ...SAKUMA, name: '佐久間の物見', anchor: { x: sx + 6, z: sz }, facing: Math.atan2(a1[0] - a2[0], a1[1] - a2[1]), width: 3, morale: 35, dmgMult: 0.3, order: 'hold', aggro: 30, seekRange: 34 },
        [{ type: 'samurai', n: 1, o: { flag: SAKUMA.flag } }, ...foeList(4, { flag: SAKUMA.flag })]);
      F.groups.push(F.reliefScout);
    } catch (e) { /* 物見 */ }
    // 南の坂から正面の槍が柵へ寄る（主人公が着く前から柵で揉み合う）
    // 11/15 K338（天王寺・岡山の出来へ）：先手は騎馬の将が馬で先に立ち、騎馬が槍の前を駆けて柵へ押し寄せる（拝郷家嘉は佐久間の先手の将。大岩山攻めの手）
    F.wA = this.wave(rt, '佐久間の先手', { x: OI.x - 34, z: OI.z + 18 }, { x: OI.x - 10, z: OI.z + 11 }, [{ type: 'busho', n: 1, o: { name: '拝郷家嘉', horse: true, hat: 'kabuto_m', flag: SAKUMA.flag } }, { type: 'cavalry', n: 3, o: { flag: SAKUMA.flag } }, ...foeList(18, { flag: SAKUMA.flag })], { seek: 14 });
    // 手負いの兵が坂を賤ヶ岳へ逃げて来る（主人公の脇を通る）
    F.hurtG = allyGroup(rt, { name: '中川の手負い', fullStrength: true, anchor: { x: 52, z: 168 }, facing: -2.4, width: 3, aggro: 0, seekRange: 0, order: 'move', dest: { ...MOUTH }, speed: 2.2, noAI: true, noRout: true },
      [{ type: 'ashigaru', n: 4, o: { flag: null } }]);
    // 攻撃対象から外した手負いも到着を数え、退避先で止まる。
    // 移動命令を残すと、口に着いても行軍を続けてしまう。
    F.hurtG.arriveNoncombat = true;
    F.hurtG.onArrive = (q) => { q.anchor = { ...q.dest }; q.order = 'hold'; q.dest = null; q.onArrive = null; };
    for (const u of F.hurtG.units) { u.hp = Math.min(u.hp, u.maxHp * 0.4); u.noTarget = true; }
    phaseAfter(rt, 5, () => rt.say('中川の足軽', '大岩山は持たぬ……南の柵に槍が取り付いた！', 3));
    phaseAfter(rt, 14, () => { if (F.phase === 1) rt.say('使番', '桑山様へ！　中川様より、加勢を乞うとの由！', 3); });
  },
  // ④ 南の柵を守る（外の柵が破れ始める）
  south(rt) {
    const F = rt.flags;
    this.enter(rt, 1.3);
    for (const g of [F.naka, F.nakaH]) if (live(g)) { g.anchor = { x: OI_SOUTH.x + (g === F.naka ? 3 : 0), z: OI_SOUTH.z - (g === F.naka ? 3 : 0) }; g.aggro = 10; g.seekRange = 9; }
    rt.say('中川清秀', '来たか！　南の柵じゃ。槍を揃えて押し返せ！', 3);
    // 11/18 夜50-19：③の道中に出た味方の新手（12人）が、④に入ると相手を見失い、山道の角の下 (64,178) で attack のまま60秒止まった（act bot 0907・0912・0918 の三回とも）。
    //   ④に入った時、残る味方の新手は山道を小門の外まで登り、そこで柵の外を支える（砦の内へは入れない）
    for (const g of rt.army.groups || []) if (g && g.team === 0 && g.name === '味方の新手' && live(g)) {
      const c = g.center(), way = OIWA_WAY.filter((p) => p[1] < c.z - 4);
      g.focus = null; g.order = 'path'; g.path = [[c.x, c.z], ...way.map((p) => [...p]), [OI_GATE.x + 3, OI_GATE.z + 8]]; g.pathIdx = 1;
      g.formation = 'column'; g.colW = 2; g.keepMoveOrder = true; g.aggro = 6; g.seekRange = 8;
      g.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: OI_GATE.x + 3, z: OI_GATE.z + 8 }; q.aggro = 12; q.seekRange = 14; q.formation = 'line'; };
    }
    phaseAfter(rt, 16, () => { if (F.phase === 1.3 && this.breakOiwa(rt, -0.7, 0.35, 2)) rt.say('中川の家臣', '外の柵が破れた！', 2.4); });
  },
  // ⑤ 西の斜面へ兵を回す（側面の山道から別の手が登る）
  west(rt) {
    const F = rt.flags;
    this.enter(rt, 1.6);
    F.wB = this.wave(rt, '佐久間の別手', { x: OI.x - 40, z: OI.z - 6 }, { x: OI.x - 14, z: OI.z - 1 }, [{ type: 'cavalry', n: 2, o: { flag: SAKUMA.flag } }, ...foeList(13, { flag: SAKUMA.flag })], { seek: 14 });   // 11/15 K338：別手も厚く、騎馬を先に
    for (const g of [F.naka, F.nakaH]) if (live(g)) g.anchor = { x: OI_WEST.x + (g === F.naka ? 3 : 0), z: OI_WEST.z };
    rt.say('中川清秀', '西の山道からも登って来るぞ！　兵を回せ！', 3);
    phaseAfter(rt, 14, () => { if (F.phase === 1.6 && this.breakOiwa(rt, -1.5, 0.3, 2)) rt.say('中川の家臣', '南の守りが破られた！　西の柵も揺らいでおる！', 2.8); });
  },
  // ⑥ 中川の本陣へ合わさる（後ろ寄りから鉄砲。小門の脇が破れ、土塁の内に敵）
  hq(rt) {
    const F = rt.flags;
    this.enter(rt, 1.8);
    F.hqJoined = null;
    for (const g of [F.naka, F.nakaH]) if (live(g)) g.anchor = { x: OI_HQ.x, z: OI_HQ.z + (g === F.naka ? 0 : 3) };
    // 11/18 cloud-06（指示書 shizugatake_spec_1109 の 17「土塁の内に敵→本陣の周りで最後の守り」・200秒の写真で陣幕の内に兵4・寄せ手は陣幕の外で見えなかった）：
    //   鉄砲の寄せは北の柵の外で止めず、北の尾根から土塁の内の本陣の北の脇まで踏み込ませる（数と強さは同じ）
    F.wC = this.wave(rt, '佐久間の鉄砲', { x: OI.x + 14, z: OI.z - 38 }, { x: OI.x + 5, z: OI.z - 7 }, [{ type: 'gun', n: 6, o: { flag: SAKUMA.flag } }, { type: 'ashigaru', n: 4, o: { flag: SAKUMA.flag } }], { seek: 12 });
    rt.army.play('gun', { x: OI.x + 10, z: OI.z - 30 }, 1.4);
    rt.say('中川清秀', '後ろの尾根に鉄砲じゃ！　本陣へ寄れ、まとまって守れ！', 3);
    phaseAfter(rt, 10, () => { if (F.phase === 1.8 && this.breakOiwa(rt, 0.35, 0.25, 2)) rt.say('中川の家臣', '小門が破られた！　土塁の内に敵が！', 2.8); });
  },
  // 一瞬「救える」と見せた後、盛政の本隊が入る
  sakuIn(rt) {
    const F = rt.flags;
    if (F.sakuIn) return;
    F.sakuIn = rt.t;
    rt.say('中川清秀', '押し返したか……', 2);
    phaseAfter(rt, 2.4, () => rt.say('中川の家臣', '新手じゃ！　玄蕃の本隊が南の坂を登って参る！', 3));
    phaseAfter(rt, 6, () => { if (live(F.mori)) rt.say('佐久間盛政', '鬼玄蕃はこれにあり。大岩山を揉み潰せ', 3); });
    for (const g of [F.saku, F.mori]) if (live(g)) {
      if (g === F.saku) for (const u of g.units) u.noTarget = false;
      g.march = false; g.onArrive = null; g.order = 'move'; g.speed = 3.6;
      g.dest = g === F.mori ? { x: OI.x - 10, z: OI.z + 24 } : { x: OI.x - 2, z: OI.z + 10 };
      g.onArrive = g === F.saku ? (q) => { q.order = 'attack'; q.aggro = 12; q.seekRange = 16; } : (q) => { q.order = 'hold'; };
      if (g === F.saku) { g.aggro = 6; g.seekRange = 8; }
    }
    this.breakOiwa(rt, -0.35, 0.3, 2);
  },
  // ⑦ 中川隊と退く：中川は兵を退かせるため最後まで残る。少し離れて振り返ると、中川の旗が倒れる
  fall(rt) {
    const F = rt.flags;
    this.enter(rt, 2);
    rt.say('中川清秀', 'これまでじゃ。わしは残る。兵を連れて退け！', 3.2);
    phaseAfter(rt, 3.6, () => rt.say('中川清秀', '振り向くな。賤ヶ岳で生きて槍を振るえ', 3));
    // 中川と侍だけが本陣に残り、足軽と鉄砲は主人公と坂を下る
    if (live(F.nakaH)) {
      const g = F.nakaH;
      g.order = 'move'; g.dest = { ...OI_BACK }; g.speed = 3.4; g.aggro = 3; g.seekRange = 4; g.focus = null;
      g.onArrive = (q) => { q.order = 'move'; q.dest = { x: MOUTH.x + 4, z: MOUTH.z - 6 }; q.onArrive = (r) => { r.order = 'hold'; r.aggro = 8; r.seekRange = 9; }; };
    }
    if (live(F.naka)) { F.naka.anchor = { ...OI_HQ }; F.naka.aggro = 12; F.naka.seekRange = 8; }
    if (!F.sakuIn) this.sakuIn(rt);
  },
  lookBack(rt) {
    const F = rt.flags;
    if (F.lookedBack) return;
    F.lookedBack = rt.t;
    // 敗北や再開後に、前の戦の討死・旗の交替・次の任務を動かさない。
    const after = (sec, fn) => phaseAfter(rt, sec, () => { if (!rt.over && !F.ending && F.phase === 2) fn(); });
    // 旗の交替は操作中に起こす。振り返る向きは主人公に任せる。
    after(1.8, () => {
      // 中川の旗が倒れる（長い死のムービーは出さない）
      const f = F.nakaFlag;
      let k = 0;
      const tip = () => { if (!f) return; k = Math.min(1, k + 0.12); f.rotation.z = 1.45 * k * k; if (k < 1) after(0.08, tip); };
      tip();
      for (const u2 of F.naka?.units || []) if (u2.alive && !u2.gone) { u2.invuln = false; rt.army.kill(u2); }
      rt.army.play('toki', { x: OI.x, z: OI.z }, 1.4);
    });
    after(3.2, () => rt.say('使番', '中川瀬兵衛様、討死！', 3));
    after(6.2, () => {
      // 守っていた所が敵の拠点に：大岩山の旗が羽柴から佐久間へ
      this.oiFlags(rt, 'sakuma');
      rt.world.addSmokeColumn?.(OI.x + 3, rt.world.heightAt(OI.x + 3, OI.z - 4) + 5, OI.z - 4, { size: 5, black: true });
      rt.world.addFire(OI.x + 6, OI.z - 6, { size: 2.6, h: 0.3, blackSmoke: true });
      rt.say('桑山重晴', '大岩山に佐久間の旗が上がった……', 2.8);
    });
    after(9.6, () => this.backline(rt));
  },
  // ⑧ 次の守りの線（賤ヶ岳の砦の東の口）まで下がる。岩崎山の高山隊も退き、桑山は残る
  backline(rt) {
    const F = rt.flags;
    if (F.phase >= 2.3) return;
    if (!F.lookedBack) { F.lookedBack = rt.t; this.oiFlags(rt, 'sakuma'); for (const u2 of F.naka?.units || []) if (u2.alive && !u2.gone) { u2.invuln = false; rt.army.kill(u2); } if (F.nakaFlag) F.nakaFlag.rotation.z = 1.45; }
    this.enter(rt, 2.3);
    rt.world.setTime('dusk');
    this.withdrawTakayama(rt);
    F.waves = 0;
    F.mouthFight = null; F.mouthRetreat = null;
    try { F.sfar?.oiwa?.rout?.('A', { from: 0, hideAfter: 30, minFight: 1 }); } catch (e) { /* 遠景 */ }
    // 大岩山に入った寄せ手は砦に居座る（後で奪い返す相手）
    for (const g of [F.wA, F.wB, F.wC, F.saku]) if (live(g)) { g.order = 'hold'; g.focus = null; g.onArrive = null; g.anchor = g === F.saku ? { x: OI.x - 6, z: OI.z + 4 } : { x: OI.x + (g === F.wC ? 5 : -3), z: OI.z + (g === F.wA ? 4 : -2) }; g.aggro = 8; g.seekRange = 9; g.kind4 = 'oiwa'; }
    if (live(F.mori)) { F.mori.order = 'move'; F.mori.dest = { x: OI.x - 4, z: OI.z + 2 }; F.mori.onArrive = (q) => { q.order = 'hold'; }; }
    rt.say('桑山重晴', '賤ヶ岳の東の口まで下がれ。退く者を拾え！', 3);
    // 11/19 cloud-06（中学生 bot：段8 で印52m・敵なしのまま三十秒迷った。台詞は鳴らない）：桑山の足軽四人が本人の少し前から東の口へ駆け、退く道を絵で見せる
    try {
      const pp = rt.player.u.pos, ax = MOUTH.x - pp.x, az = MOUTH.z - pp.z, al = Math.hypot(ax, az) || 1;
      F.backRun = allyGroup(rt, { name: '退く桑山の足軽', fullStrength: true, anchor: { x: pp.x + ax / al * 7, z: pp.z + az / al * 7 }, facing: Math.atan2(ax, az), width: 2, aggro: 0, seekRange: 0, order: 'move', dest: { x: MOUTH.x - 4, z: MOUTH.z + 3 }, speed: 3.8, noAI: true, noRout: true },
        [{ type: 'ashigaru', n: 4, o: { flag: null } }]);
      F.backRun.arriveNoncombat = true;
      F.backRun.path = [[OIWA_WAY[2][0], OIWA_WAY[2][1]], [OIWA_WAY[1][0], OIWA_WAY[1][1]], [LOOK.x, LOOK.z], [MOUTH.x - 4, MOUTH.z + 3]].filter((w) => Math.hypot(w[0] - MOUTH.x, w[1] - MOUTH.z) < al - 4);
      if (F.backRun.path.length) { F.backRun.order = 'path'; F.backRun.pathIdx = 0; }
      F.backRun.onArrive = (q) => { q.anchor = { x: MOUTH.x - 4, z: MOUTH.z + 3 }; q.order = 'hold'; q.dest = null; q.path = null; q.onArrive = null; };
      for (const u of F.backRun.units) u.noTarget = true;
    } catch (e) { /* 退く足軽 */ }
    phaseAfter(rt, 8, () => { if (F.phase === 2.3) { rt.say('使番', '岩崎山の高山様、砦を捨てて退かれまする！', 3); this.oiFlags(rt, 'sakuma'); } });
    phaseAfter(rt, 14, () => { if (F.phase === 2.3) rt.say('桑山重晴', '賤ヶ岳は退かぬ。ここで支えるぞ', 2.8); });
    // 追手が坂を上がって来る（二度）
    const w = (x, z, n) => {
      F.waves++;
      const g = this.wave(rt, '佐久間の追手', { x, z }, { x: MOUTH.x + 5, z: MOUTH.z - 3 }, foeList(n, { flag: SAKUMA.flag }), { seek: 22, speed: 3.4, dmg: 0.48 });
      g.keepMoveOrder = true;
      // 急な北斜面を直登せず、物見の肩から東の口へ登る。
      const arrive = g.onArrive, mouth = g.dest;
      g.dest = { ...LOOK };
      g.onArrive = (q) => { q.order = 'move'; q.dest = mouth; q.onArrive = arrive; };
      rt.army.play('horagai', { x, z }, 0.9);
      rt.army.play('toki', { x, z }, 0.9);
    };
    // 丹羽は東の口の内側で砦を支え、反攻の先頭には出ない。
    F.niwaG = allyGroup(rt, { name: '丹羽長秀の隊', fullStrength: true, anchor: { x: FORT.x + 5, z: FORT.z + 5 }, facing: Math.PI / 2, width: 4, aggro: 2, seekRange: 4, order: 'hold', noRout: true, noAI: true },
      [{ type: 'busho', n: 1, o: { name: '丹羽長秀', invuln: true, flag: NIWA } }, { type: 'samurai', n: 3, o: { flag: NIWA } }, { type: 'ashigaru', n: 8, o: { flag: NIWA } }, { type: 'gun', n: 4, o: { flag: NIWA } }]);
    rt.say('桑山重晴', '琵琶湖を渡った丹羽殿の加勢じゃ。東の口を支えよ！', 3);
    // 11/18 08:55 クラウド持ち主：act bot 段8 が84秒・本人の討ち取り0（一の追手が10秒・二の追手が34秒に出て、口へ着くのが遅い）。
    //   追手を5秒・22秒に早め、口での揉み合いを段の初めに寄せる（数と強さは変えない）
    phaseAfter(rt, 5, () => { if (F.phase === 2.3) w(18, 236, 9); });
    phaseAfter(rt, 22, () => { if (F.phase === 2.3) w(4, 250, 9); });
  },
  // ⑨ 秀吉の大返し：遠くに大量の旗と土煙。逃げていた羽柴の兵が振り返る
  returnHide(rt) {
    const F = rt.flags, W = rt.world;
    this.enter(rt, 2.6);
    W.setTime('night');
    rt.award((t) => t.side.push('大岩山から兵を連れて退き、賤ヶ岳を支えた'), '賤ヶ岳を支えた');
    returnTurn(rt, this.ctx(rt));
    for (const [x, z] of [[214, 214], [200, 160], [184, 100]]) W.addSmokeColumn?.(x, W.heightAt(x, z) + 3, z, { size: 7 });
    F.hide = allyGroup(rt, { name: '羽柴秀吉の旗本', fullStrength: true, anchor: { x: UPHILL[0][0], z: UPHILL[0][1] }, facing: -1.6, width: 5, aggro: 4, seekRange: 6, order: 'move', dest: { x: JOIN.x + 10, z: JOIN.z + 6 }, speed: 4.4, noRout: true, noAI: true, keepMoveOrder: true },
      [{ type: 'busho', n: 1, o: { name: '羽柴秀吉', invuln: true, horse: true } }, { type: 'samurai', n: 8, o: { keep: true } }, { type: 'gun', n: 2, o: { keep: true } }]);
    F.hide.honjin = true;
    F.hide.arriveNoncombat = true; // 攻撃対象から外した旗本も、実際の到着人数に数える。
    for (const u of F.hide.units) { u.invuln = true; u.noTarget = true; }
    F.hideU = F.hide.units.find((u) => u.type === 'busho');
    F.hide.onArrive = (q) => {
      q.anchor = { ...q.dest }; q.order = 'hold'; q.fixed = true; q.aggro = 0; q.seekRange = 0; q.onArrive = null;
      // 大返しの騎馬を降り、本陣で旗本に守られる。反攻の先頭へは出さない。
      const u = F.hideU;
      if (u) {
        rt.army.setMounted(u, false);
        u._crouch = true; u._nest = true;
        KIT.honjin(rt, u.pos.x, u.pos.z, { mon: HASHIBA, people: false, fire: true, noUma: true, yoroi: false });
      }
      F.hideArrived = true;
    };
    F.yari = allyGroup(rt, { name: '秀吉の小姓衆', fullStrength: true, anchor: { x: UPHILL[1][0], z: UPHILL[1][1] + 4 }, facing: -1.6, width: 4, aggro: 6, speed: 4.6, order: 'move', dest: { x: JOIN.x - 2, z: JOIN.z - 8 }, noRout: true },
      [...KOSHO.map((name) => ({ type: 'samurai', n: 1, o: { name, invuln: true, horse: true, flag: HASHIBA } })), { type: 'ashigaru', n: 10 }, { type: 'gun', n: 2 }]);
    F.uma = allyGroup(rt, { name: '羽柴の先手', fullStrength: true, anchor: { x: UPHILL[0][0] + 6, z: UPHILL[0][1] + 6 }, facing: -1.6, width: 5, aggro: 6, speed: 4.4, order: 'move', dest: { x: JOIN.x + 14, z: JOIN.z - 12 }, noRout: true },
      [{ type: 'samurai', n: 5 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 5 }, { type: 'bow', n: 2 }]);
    for (const g of [F.yari, F.uma]) { g.noAI = true; g.keepMoveOrder = true; g.onArrive = (q) => { q.order = 'hold'; }; }
    // 松明は旗本と先手の六人だけ。共通の追従処理を使い、夜明けに消す。
    const fireAt = W.fires.length;
    F.returnTorches = carryTorches(W, [...F.hide.units.slice(1, 4), ...F.uma.units.slice(0, 3)], { size: 0.5 });
    F.returnTorchFires = W.fires.slice(fireAt);
    phaseAfter(rt, 0.6, () => rt.say('使番', '秀吉様、お戻りです！　大垣より十三里、北国街道に旗が続いておりまする！', 3.4));
    phaseAfter(rt, 4.6, () => rt.say('桑山重晴', '皆、振り返れ。筑前様の旗じゃ！', 2.8));
    phaseAfter(rt, 8.4, () => rt.say('中川の足軽', '……殿の弔い合戦じゃ', 2.6));
    phaseAfter(rt, 12, () => rt.say('桑山重晴', '東の肩の道へ下り、筑前様を迎えよ', 2.8));
    // 11/17 K355（センゴク一統記の賤ヶ岳）：大返しの道の村々は松明を灯し、握り飯と水を並べて旗を通した。玄蕃は勝家の「引け」を聞かず大岩山に留まった
    phaseAfter(rt, 15.4, () => rt.say('秀吉の旗本', '道の村々が松明と握り飯を出してくれた。おかげで夜通し駆けられたわ', 3));
    phaseAfter(rt, 19, () => rt.say('使番', '柴田様は玄蕃殿に「引け」と幾度も使いを出されたとか。玄蕃殿はまだ大岩山に居座っておりまする', 3.6));
    this.withdrawRaid(rt);
  },
  // 打ち切った追手は実際に坂を退く。古い経路や到着処理で東の口へ戻さない。
  withdrawRaid(rt) {
    for (const g of rt.flags.groups) if (g.kind4 === 'raid' && live(g)) {
      g.order = 'retreat'; g.focus = null; g.onArrive = null; g.path = null;
      g.dest = { x: 40, z: 170 }; g.aggro = 0; g.seekRange = 0; g.kind4 = 'gone';
      for (const u of g.units) u.noTarget = true;
    }
  },
  // ⑩ 大岩山を取り返す：朝に内から守った柵を、今度は外から攻める。朝に破れた所が入口
  retake(rt) {
    const F = rt.flags, W = rt.world;
    this.enter(rt, 3);
    // 11/18 クラウド持ち主：迎えの段に置かれた敵の新手が、段10 の始めに東の肩の下 (36,207) で放たれ80〜160秒道を塞いだ（POSLOG）。
    //   佐久間勢は大岩山に居る。砦から60m より外の新手は砦の北へ退かせる
    for (const g of [...(F._dr?.E || []), ...rt.army.groups.filter((q) => q.isReserve && q.team === 1)]) {
      if (!g?.units || g.routed) continue;
      const c = g.center?.(); if (!c || dist(c, OI) <= 60) continue;
      if (F._dr?.E) { const i = F._dr.E.indexOf(g); if (i >= 0) F._dr.E.splice(i, 1); }
      g.stay = false; g.order = 'retreat'; g.focus = null; g.dest = { x: SAKU_LINE.x, z: SAKU_LINE.z - 20 }; g.aggro = 0; g.seekRange = 0;
      for (const u of g.units) { u.noTarget = true; u.fleeing = true; }
    }
    if (!F.oiFell) { F.oiFell = true; this.breakOiwa(rt, -0.7, 0.35, 2); this.breakOiwa(rt, -1.5, 0.3, 2); this.breakOiwa(rt, 0.35, 0.25, 2); this.breakOiwa(rt, -0.35, 0.3, 2); this.oiFlags(rt, 'sakuma'); }
    W.setTime('morning');
    if (F.returnTorches) {
      for (const f of F.returnTorchFires || []) if (W.fires.includes(f)) W.removeFire(f);
      F.returnTorches = null;
      F.returnTorchFires = null;
    }
    // 11/19 cloud-06（中学生 bot：段10 の始めに本人が大岩山から260m 離れた (-68,313) にいて、道の起伏で進めず63〜80秒迷った）：
    //   夜明けの幕で時が飛ぶ間に、大岩山から遠い時（九十歩より外）は、本人と連れの組を大岩山の小門の七十歩手前（東の肩からの道の上）へ移す
    {
      const PU = rt.player.u, far = Math.hypot(PU.pos.x - OI_GATE.x, PU.pos.z - OI_GATE.z);
      if (far > 90) {
        const sx = 43, sz = 200, ux = sx - OI_GATE.x, uz = sz - OI_GATE.z, ul = Math.hypot(ux, uz) || 1;
        const tx = OI_GATE.x + ux / ul * 70, tz = OI_GATE.z + uz / ul * 70;
        const place = (u, x, z) => { u.pos.set(x, W.heightAt(x, z), z); u.mesh?.position.copy(u.pos); u.moveTo = null; u.target = null; if (u.vel) u.vel.x = u.vel.z = 0; };
        rt.cutT = rt.t;   // 暗転の間の置き直し（audit が「兵が飛んだ」に数えない）
        place(PU, tx, tz);
        PU.heading = Math.atan2(OI_GATE.x - tx, OI_GATE.z - tz); rt.player.yaw = PU.heading;
        let k = 0;
        for (const g of [...(rt.squadGroups || []), F.yari, F.uma]) {
          if (!g?.units) continue;
          let i = 0;
          for (const u of g.units) if (u.alive && !u.gone && u !== PU) { place(u, tx + ux / ul * (4 + k * 3 + Math.floor(i / 4) * 1.6) + (i % 4 - 1.5) * 1.6, tz + uz / ul * (4 + k * 3 + Math.floor(i / 4) * 1.6)); i++; }
          if (g.anchor) { g.anchor.x = tx + ux / ul * (4 + k * 3); g.anchor.z = tz + uz / ul * (4 + k * 3); }
          k += Math.ceil(i / 4) + 1;
        }
      }
    }
    rt.banner('四月二十一日　夜明け', '大岩山を取り返せ');
    // 11/19 cloud-06（受け持ちの質・中学生 bot：段10 は東の肩から大岩山の柵まで約74秒、誰とも会わずに走るだけで「迷っていた80秒」）：
    //   道の半ばに佐久間の物見を一組だけ置く（4人・刃は軽く・士気は低く崩れやすい）。前の新手40〜49人で段が延びた事があるので数は増やさない
    {
      const P0 = rt.player.u.pos, mx = P0.x + (OI_GATE.x - P0.x) * 0.5, mz = P0.z + (OI_GATE.z - P0.z) * 0.5;
      if (Math.hypot(OI_GATE.x - P0.x, OI_GATE.z - P0.z) > 40) {
        F.retakeScout = enemyGroup(rt, { ...SAKUMA, name: '佐久間の物見', anchor: { x: mx, z: mz }, facing: Math.atan2(P0.x - mx, P0.z - mz), width: 3, morale: 35, dmgMult: 0.3, order: 'attack', aggro: 22, seekRange: 26 },
          [{ type: 'samurai', n: 1, o: { flag: SAKUMA.flag } }, ...foeList(3, { flag: SAKUMA.flag })]);
        F.groups.push(F.retakeScout);
        // 物見は道の半ば（本人から四十歩あまり）に居て、気づく間合い（二十六歩）に届かず寄って来なかった（中学生 bot 559秒・印は86m 先で30秒）。
        //   初めから本人の方へ歩かせ、着いたら斬りかかる
        const g = F.retakeScout;
        g.order = 'move'; g.speed = 3.4; g.dest = { x: P0.x + (mx - P0.x) * 0.35, z: P0.z + (mz - P0.z) * 0.35 };
        g.onArrive = (q) => { q.order = 'attack'; q.aggro = 30; q.seekRange = 34; };
      }
    }
    // 佐久間は急ごしらえで砦を使う：旗だけ替わり、柵は破れたまま。砦の内の守り
    const inFort = [F.wA, F.wB, F.wC].reduce((n, g) => n + nLive(g), 0);
    F.gar = enemyGroup(rt, { ...SAKUMA, name: '大岩山の佐久間勢', anchor: { x: OI.x, z: OI.z + 2 }, facing: 0, fleeDir: { x: -0.3, z: -1 }, width: 5, morale: 85, dmgMult: 0.38, noRout: true, noAI: true, order: 'hold', aggro: 10, seekRange: 12 },
      foeList(Math.max(6, 16 - inFort), { flag: SAKUMA.flag }));
    F.gar.kind4 = 'oiwa'; F.groups.push(F.gar);
    for (const g of [F.saku, F.mori]) if (live(g)) {
      // 北の柵は健在。占領軍も南の小門から東へ回り、北の備へ合わさる。
      // 旗本は小門の外に控えているので、砦の内へ引き返させない。
      const exit = dist(g.center(), OI) < OI.r + 3 ? [...oiWestFirst(g), ...OI_EXIT] : OI_EXIT.slice(1);
      const end = [SAKU_LINE.x + (g === F.mori ? -6 : 0), SAKU_LINE.z - (g === F.mori ? 8 : 0)];
      this.allyMarch(g, [...exit, end], false);
      g.colW = 1; // 小門の退き道は狭い。一列で抜ける（小姓衆の重なり止まり）
      g.keepMoveOrder = true; g.arriveNoncombat = true;
      g.speed = 3; g.aggro = 0; g.seekRange = 0;
      g.onArrive = (q) => {
        q.order = 'hold'; q.path = null; q.onArrive = null;
        q.formation = 'line'; q.roadColumn = false; q.followColumnRoad = false;
        q.aggro = F.phase >= 3.5 ? 12 : 8; q.seekRange = F.phase >= 3.5 ? 16 : 10;
      };
    }
    for (const [g, dx, dz] of [[F.yari, -3, 2], [F.uma, 6, 6]]) if (live(g)) {
      // 11/19 03:25 クラウド持ち主（⑥写真 440秒：大岩山へ駆け上がる本人の周りに味方が見えず、小姓衆・先手が二十〜五十歩後ろ）：本人の駆け足に近い 4.4 で並んで寄せる
      g.order = 'move'; g.speed = 4.4; g.dest = { x: OI_GATE.x + dx, z: OI_GATE.z + dz }; g.path = null;
      g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 24; q.aggro = 14; };
    }
    phaseAfter(rt, 2, () => rt.say('羽柴秀吉', '中川の弔い合戦じゃ。大岩山を取り返せ！', 3));
    phaseAfter(rt, 6, () => rt.say('中川の足軽', '南の柵は昨日破れたままじゃ。あそこから入れる！', 3));
    // 11/18 cloud-06（中学生の bot：大岩山まで136m 走る間に30秒、印だけで何も起きず迷った）：走る道の途中に砦の上の鉄砲と組頭の声を置く（筋は変えない）
    phaseAfter(rt, 16, () => { if (F.phase === 3) { rt.army.play?.('gun', { x: OI.x, z: OI.z - 4 }, 1.2); rt.say('組頭', '砦の上から撃って来おる！　竹束の陰を伝って走れ！', 2.8); } });
    phaseAfter(rt, 28, () => { if (F.phase === 3) rt.say('足軽', '佐久間の旗が砦に立っておる……許せぬ！', 2.6); });
    rt.army.play('toki', { ...OI_BACK }, 1.2);
    sfx('taiko', 0.9); sfx('horagai', 0.9);
    sevenSpears(rt, this.ctx(rt), 'oiwa');
  },
  inFortFoes(rt) {
    // 盛政の退く旗本や倒れた負傷兵を、奪還を阻む守備兵に数えない。
    return rt.army.units.reduce((n, u) => n + (u.team === 1 && u.alive && !u.gone && !u.fleeing && !u.noTarget && !u.downed && !u.woundOut && !u.rearWound && !u.isStruct && !u.civ && dist(u.pos, OI) < OI.r + 5 ? 1 : 0), 0);
  },
  // 大岩山の残る守備兵へ退く下知を出す。奪還の打ち切りでも同じ退路を使う。
  withdrawOiwa(rt) {
    const F = rt.flags;
    // 旗だけ替えて砦内の斬り合いを残さない。
    for (const g of [F.wA, F.wB, F.wC, F.gar]) if (live(g)) {
      if (g.kind4 === 'flee' && (g.order === 'retreat' || g.retreatOnly && g.order === 'path')) continue;
      // 北の柵を直線で横切らず、破れた南の小門から東を回って退く。
      g.order = 'path'; g.focus = null; g.dest = null;
      g.path = OI_EXIT.map((p) => [...p]); g.pathIdx = 0;
      g.retreatOnly = true; g.arriveNoncombat = true;
      g.formation = 'column'; g.colW = 2; g.roadColumn = true; g.followColumnRoad = true;
      g.onArrive = (q) => {
        q.order = 'retreat'; q.path = null; q.onArrive = null;
        q.dest = { x: SAKU_LINE.x, z: SAKU_LINE.z - 20 };
      };
      g.speed = 3.4;
      g.aggro = 0; g.seekRange = 0; g.kind4 = 'flee';
      for (const u of g.units) u.noTarget = true;
    }
    F.sfar?.oiwa?.rout?.('B', { from: 0, hideAfter: 30 });
  },
  // 岩崎山を放棄した高山隊も実際に退く。大岩山の奪還で元の砦へ戻さない。
  withdrawTakayama(rt) {
    const D = rt.flags.depth?.A;
    const s = D?.sonae.find((q) => q.id === 'takayama');
    if (!s || s.gone) return;
    depthRout(D, s);
    // 軽い軍勢の退却描画は続け、考えの側では戦線から離脱させる。
    // 通常の敗走の二十五秒後の再編で、放棄した岩崎山へ引き返させない。
    s.gone = true;
  },
  // ⑪ 佐久間を押し返す：盛政はすぐ逃げず、大岩山の北で備を立て直して抗う
  pushSaku(rt) {
    const F = rt.flags;
    this.enter(rt, 3.5);
    F.sakuFight = null;
    F.sakuRetreat = null;
    F.sakuJoined = null;
    this.withdrawOiwa(rt);
    this.oiFlags(rt, 'hashiba');
    rt.award((t) => t.side.push('大岩山を取り返した'), '大岩山を取り返した');
    rt.army.play('toki', { ...OI }, 1.3);
    rt.say('福島正則', '大岩山、取り返したり！', 2.6);
    phaseAfter(rt, 3.2, () => rt.say('佐久間盛政', '退くな。備を立て直せ。鬼玄蕃の槍はまだ折れぬ', 3));
    if (live(F.saku)) {
      // 奪還が早く済んでも、まだ小門を出ている本隊の道を消さない。
      // 要だけ北へ移すと、生きた兵は残る柵へ直進して詰まる。
      if (F.saku.order !== 'path') {
        F.saku.order = 'hold'; F.saku.aggro = 12; F.saku.seekRange = 16;
      }
      F.saku.dmgMult = 0.36; F.saku.kind4 = 'saku';
    }
    // 北の柵は残っている。砦内で戦った備は南の小門でまとまり、東から北へ回る。
    for (const [g, dx, dz] of [[F.yari, -4, 8], [F.uma, 6, 10]]) if (live(g)) {
      this.allyMarch(g, [...oiWestFirst(g), ...OI_EXIT, [SAKU_LINE.x + dx, SAKU_LINE.z + dz]], !oiWestFirst(g).length);
      // 槍隊と騎馬が同じ小門を同じ速さで出ると退き道で重なり止まる。騎馬は一歩遅らせ、小門の道は一列で抜ける。
      g.colW = 1;
      if (g === F.uma) g.speed = 3.3;
      g.shizuExiting = true;
    }
  },
  // 盛政を押し返した備と、湖の北の陸道から茂山へ。主人公が来るまで前田を消さない。
  // 11/18 05:25 クラウド持ち主：act bot「簡単すぎ・もっと強い奴と斬り合いたい」（受けた傷24前後）。最後の段で、先手の毛受勝照が
  //   本人の十二歩内に来たら名乗って一騎打ちを挑む（史実：勝家の馬印を預かり身代わりに討死した将）。一度きり・本人の命が六割を切っていれば挑まない
  // 金幣の持ち手は毛受の二歩後ろを歩き、斬り合わず狙われない（数にも入れない）。毛受が討たれたら馬印も倒れる。
  //   兵は一コマ二人ずつ出るので、出るまで毎コマ探す。先手は noAI のため、供の持ち場（officerGuard）では付いて来なかった
  menjoUma(rt) {
    const F = rt.flags, m = F.kmU;
    if (!F.kmG || !m) return;
    let b = F.kmUmaB;
    if (!b) {
      b = F.kmG.units.find((u) => u.alive && !u.name && u.look?.uma === 'gohei');
      if (!b) return;
      F.kmUmaB = b; b.isUma = b.isStandard = true; b.noTarget = true; b.invuln = true; F.kmUmaP = { x: 0, z: 0 };
      // 11/18 08:55 クラウド持ち主：874×402 の肩越しで金幣が小さく見分けにくい（0825 の写真）。この一本だけ1.4倍にし、頭上の槍の林より高く立てる
      //   （馬印は竿四〜五m が並。形と材質は使い回し、拡げるのは置き場の大きさだけ）
      if (b.uma) { b.uma.scale.setScalar(1.4); b.uma.updateMatrix(); }
    }
    if (!b.alive || b.gone) return;
    if (!m.alive || m.gone) { b.invuln = false; b.noTarget = false; rt.army.kill(b); return; }
    const h = m.heading || 0, p = F.kmUmaP;
    p.x = m.pos.x - Math.sin(h) * 2.2; p.z = m.pos.z - Math.cos(h) * 2.2;
    b.target = null; b.atk = null; b.watch = null;
    b.moveTo = Math.hypot(b.pos.x - p.x, b.pos.z - p.z) > 0.8 ? p : null;
  },
  menjoDuel(rt) {
    const F = rt.flags, P = rt.player?.u, u = F.kmU, g = F.kmG;
    if (!P || !u || !g) return;
    const d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z);
    if (F.menjoOn) {
      if (u.alive && P.alive && d < 24 && (rt.army.duel || rt.t - F.menjoOn < 3)) return;
      if (rt.army.duel && rt.army.duel.foe === u) rt.army.duelEnd(false, '');
      u.duelOpponent = false; if (g.focus === P) g.focus = null; F.menjoOn = 0; return;
    }
    if (F.menjoDone || !u.alive || u.invuln || u.fleeing || !P.alive || P.downed || P.hp < P.maxHp * 0.6 || rt.army.duel || d > 12) return;
    F.menjoDone = true; F.menjoOn = rt.t;
    u.duelOpponent = true; u.dmg *= 1.5; g.focus = P;
    rt.say('毛受勝照', '修理亮が馬印、この毛受勝照が預かった！　羽柴の若武者、来い！', 3.5);
  },
  watchMaeda(rt) {
    // 通常の撃退でも残兵を下げる。刻限で打ち切った時だけ退かせると、
    // 次の見回り中も本隊が北岸へ向かう味方を追い、合流を妨げる。
    for (const g of [rt.flags.saku, rt.flags.mori]) if (live(g)) {
      g.order = 'retreat'; g.focus = null; g.onArrive = null; g.path = null;
      g.dest = { x: 20, z: -300 }; g.speed = 2.8; g.kind4 = 'flee';
      g.aggro = 0; g.seekRange = 0;
      for (const u of g.units) u.noTarget = true;
    }
    this.enter(rt, 3.7);
    rt.say('使番', '茂山の梅鉢が揺れておりまする。湖の北の岸から、前田勢の動きを見届けよ', 3.4);
    this.northMarch(rt, NORTH_SHORE, false);
  },
  northMarch(rt, path, attack) {
    const F = rt.flags;
    F.northPath = path; F.northIx = 0; F.northPinIx = 0;
    // 11/18 K365 iMac n-k15：前田の段を岸の途中で切り上げた時、④の戻り道で本人が岸の西の端までいったん戻ってから東へ歩き直し、最後の段が240〜350秒かかった。
    //   本人が次の点の方にもう近い点（通り越した点）は飛ばす
    { const me = rt.player?.u?.pos; if (me) while (F.northIx < path.length - 1) { const a = path[F.northIx], b2 = path[F.northIx + 1]; if (Math.hypot(me.x - b2[0], me.z - b2[1]) < Math.hypot(a[0] - b2[0], a[1] - b2[1])) F.northIx++; else break; } F.northPinIx = F.northIx; }
    for (const g of [F.yari, F.uma]) if (live(g)) {
      // 主人公が先に佐久間を崩しても、まだ小門を出ている備の退路を上書きしない。
      const exit = g.shizuExiting && g.order === 'path' ? g.path : null, at = g.pathIdx;
      this.allyMarch(g, path, attack, !exit);
      if (exit) { g.path = [...exit, ...path.map((p) => [...p])]; g.pathIdx = at; }
      g.shizuExiting = false;
    }
  },
  allyMarch(g, path, attack, trim = false) {
    // 横隊の持ち場が柵や湖へはみ出すと後列待ちを繰り返す。道に沿う二列で進む。
    // 障害物よけが道へ点を挿すので、道順は隊ごとに一度だけ複製する。
    g.focus = null; g.dest = null; g.order = 'path';
    // 11/18 クラウド持ち主：最後の段で備が既に北岸の東に居ても、道の西の端 (-90,-100) へ150m 戻ってから東へ歩き直していた（本人も付いて行き段13が166〜229秒）。
    //   次の角が今の角より近い所から歩き出す
    let from = 0;
    const c = g.center?.() || g.anchor;
    while (trim && from < path.length - 1 && Math.hypot(c.x - path[from + 1][0], c.z - path[from + 1][1]) < Math.hypot(path[from][0] - path[from + 1][0], path[from][1] - path[from + 1][1])) from++;
    g.path = [[g.anchor.x, g.anchor.z], ...path.slice(from).map((p) => [...p])]; g.pathIdx = 1;
    g.formation = 'column'; g.colW = 2; g.roadColumn = true; g.followColumnRoad = true;
    g.speed = 4; g.aggro = 3; g.seekRange = 4;
    g.onArrive = (q) => {
      q.order = attack ? 'attack' : 'hold'; q.formation = 'line';
      q.roadColumn = false; q.followColumnRoad = false; q.shizuExiting = false;
      q.aggro = attack ? 14 : 3; q.seekRange = attack ? 28 : 4;
    };
  },
  // 前田利家の離脱：昔から知る前田の梅鉢の旗が戦の場を離れる
  maedaLeave(rt) {
    const F = rt.flags;
    if (F.maedaGo) return;
    this.withdrawMaeda(rt);
    rt.say('使番', '茂山の前田勢、陣を払うて退きまする！', 3);
    phaseAfter(rt, 3.4, () => rt.say('羽柴秀吉', '又左が退いたか……。柴田と前田まで分かれたな', 3));
    phaseAfter(rt, 7, () => rt.say('佐久間盛政', '前田殿が退いたじゃと……。退け、退け', 3));
    phaseAfter(rt, 9, () => this.pushShibata(rt));
  },
  withdrawMaeda(rt) {
    const F = rt.flags;
    F.maedaGo = rt.t;
    // 11/18 21:30 持ち主：本人は茂山の肩（MAEDA_LOOK）で間近に見ているのに、梅鉢の幟六本が一度に消えた。陣を払う形に、一本ずつ抜いて傾け、二秒後に消す
    (F.maedaCampFlags || []).forEach((f, i) => {
      rt.after(0.7 * i, () => { f.rotation.z = (i % 2 ? -1 : 1) * 0.4; });
      rt.after(2 + 0.7 * i, () => { f.visible = false; });
    });
    // 利家だけを退かせると、別所山の利長の備が前田勢の離脱後も残る。
    // 高山隊と同じく退却描画を始め、再編して持ち場へ戻るのを止める。
    const D = F.depth?.B, s = D?.sonae.find((q) => q.id === 'toshinaga');
    if (s && !s.gone) { depthRout(D, s); s.gone = true; }
    if (live(F.maedaG)) {
      F.maedaG.order = 'retreat'; F.maedaG.focus = null; F.maedaG.onArrive = null; F.maedaG.path = null;
      F.maedaG.dest = { x: GONGEN.x, z: GONGEN.z - 60 }; F.maedaG.speed = 1.6;
    }
  },
  // ⑬ 柴田軍の崩れ：前田が退き、佐久間が孤立。柴田の先手と当たる。遠くに勝家
  pushShibata(rt) {
    const F = rt.flags;
    if (rt.over || F.ending || F.phase >= 4) return;
    if (!F.maedaGo) this.withdrawMaeda(rt); // 続きから再開する時も、前田隊を茂山へ戻さない。
    this.enter(rt, 4);
    F.shibataFight = null;
    F.shibataJoined = null;
    // 行市山から下った遠景の列も、本隊と同じ下知で崩れる。
    F.sakuCol?.rout?.({ hideAfter: 30 });
    rt.award((t) => { t.special = { label: '大岩山の北で佐久間の備を押し返した', pts: 15 }; }, '佐久間の備を押し返した');
    for (const g of [F.saku, F.mori]) if (live(g)) { g.order = 'retreat'; g.focus = null; g.onArrive = null; g.path = null; g.dest = { x: 20, z: -300 }; g.speed = g === F.mori ? 4 : 2.8; g.kind4 = 'flee'; for (const u of g.units) u.noTarget = true; }
    F.kmG = enemyGroup(rt, { ...SHIBATA, name: '柴田勝家の先手', anchor: { ...SHIBA_FRONT }, facing: 0.1, fleeDir: { x: 0, z: -1 }, width: 6, morale: 92, dmgMult: 0.42, noRout: true, noAI: true, formation: 'line', order: 'hold', aggro: 12, seekRange: 16 },
      [{ type: 'busho', n: 1, o: { name: '毛受勝照', horse: true, flag: SHIBATA.flag } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 1, o: { uma: 'gohei', flag: null, weapon: 'none', dmg: 0 } }, ...foeList(16)]);
    // 11/18 クラウド持ち主（本物らしさ）：毛受は勝家の金幣（金の御幣）の馬印を乞い受け、身代わりに林谷山で討死した（太閤記・賤ヶ岳合戦記）。
    //   勝家の旗本でなく毛受の先手に金幣を立てる（形は units_flags.js の gohei・西光寺伝来の伝勝家所用による復元）。持ち手は斬り合わず将の後ろに付く
    F.kmG.kind4 = 'km'; F.groups.push(F.kmG);
    F.kmU = F.kmG.units.find((u) => u.type === 'busho');
    this.menjoUma(rt);
    F.kat = enemyGroup(rt, { ...SHIBATA, name: '柴田勝家の旗本', anchor: { ...KATSUIE }, facing: 0.2, fleeDir: { x: 0, z: -1 }, width: 4, morale: 99, noRout: true, noAI: true, order: 'hold', aggro: 0, seekRange: 0 },
      [{ type: 'busho', n: 1, o: { name: '柴田勝家', invuln: true, horse: true, flag: SHIBATA.flag } }, { type: 'samurai', n: 6, o: { flag: SHIBATA.flag } }]);
    for (const u of F.kat.units) { u.invuln = true; u.noTarget = true; }
    F.kat.kind4 = 'kat'; F.groups.push(F.kat);
    this.northMarch(rt, NORTH_BACK, true);
    rt.army.play('horagai', { ...KATSUIE }, 0.9);
    rt.say('使番', '柴田の先手、北国街道より下って参りまする。後ろに修理亮の旗！', 3.2);
    phaseAfter(rt, 4, () => rt.say('羽柴秀吉', '柴田の備を押せ。大軍が崩れるのは今ぞ', 3));
    phaseAfter(rt, 10, () => rt.say('古い足軽', '稲生では柴田の槍に押されたもんじゃが……今はこっちが押しておる', 3.4));
    // 11/18 K306・K355（センゴク一統記10巻 VOL.87）：両軍が村々に「敵が崩れた時に追い首を取れば恩賞」と触れ、見物の衆が峰に集まっていた
    phaseAfter(rt, 15, () => rt.say('使番', '殿のお触れじゃ！　崩れた柴田の追い首、一つにつき恩賞を取らす！', 3.2));
    phaseAfter(rt, 19.5, () => rt.say('足軽', '峰の上に見物の村の衆が鈴なりじゃ。首を数えに来ておるのか', 3));
    sevenSpears(rt, this.ctx(rt), 'push');
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v && v.team === 0 && !v.isPlayer && !v.isStruct && !v.civ) F.allyLost = (F.allyLost || 0) + 1;
    if (v && v.team === 1 && !v.isStruct && !v.civ) F.kills++;
    if (v && v === F.kmU && !F.kmBanner) { F.kmBanner = true; rt.banner('毛受勝照、討ち取ったり', ''); }
  },

  update(rt, dt) {
    const F = rt.flags;
    if (rt.over || !F.phase) return;
    const P = rt.player.u;
    F.returnTorches?.update();
    // 初めの数の下げ止めは毎コマ（四分の一秒ごとでは、残兵を寄せた直後の数えに先に当たった）
    for (const g of rt.army.groups || []) if (g?.initial && g.initial < g.count) g.initial = g.count;   // 前田・桑山など、どの備でも起きた（厚みの表の置き換えが共通）
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.25;
    // 11/18 クラウド持ち主：act bot「前田利家の隊 16/9・14/9 が初めより多い（28回）」。遠くで遠景に置き換えた兵の分だけ初めの数が減り、生きた数より下になる→初めの数を今の数より下げない
    this.settleWalls(rt, F.oiWall);
    this.settleWalls(rt, F.fortWall);
    // 11/19 08:25 クラウド持ち主：act bot 0806 の163秒（段5）、山道を小門へ登る味方の新手が (116,152) で道の次の点 (105,152) の十一m 手前に隊速0のまま20秒立った。
    //   道を歩く味方の新手が八秒で一m も動かなければ、その点は着いた事にして次の点へ（最後の点なら持ち場に着いた事に）
    for (const g of rt.army.groups || []) if (g && g.team === 0 && g.name === '味方の新手' && live(g) && g.order === 'path' && Array.isArray(g.path)) {
      const c = g.center(), w = g._stP;
      if (!c) continue;
      if (!w || w.i !== g.pathIdx || Math.hypot(c.x - w.x, c.z - w.z) > 1) { g._stP = { x: c.x, z: c.z, t: rt.t, i: g.pathIdx }; continue; }
      if (rt.t - w.t < 8) continue;
      g._stP = null;
      g.tailTol = Math.max(g.tailTol || 0, 20);   // 列の後ろの遅れで先頭が待ち続けない
      if (g.pathIdx < g.path.length - 1) g.pathIdx++;
      else if (g.onArrive) { const f = g.onArrive; g.onArrive = null; f(g); }
    }
    // 11/19 06:10 クラウド持ち主（K324 の残り）：act bot 582秒、前を埋める味方の新手が (9,-42) から (71,2) の敵へ attack のまま隊速0で20秒止まった。
    //   大岩山を取り返した後の段で、味方の新手が八秒で一m も動かず六m 内に敵が居なければ、本人の脇まで道で歩かせる（そこで持ち場を守る）
    if (F.phase >= 3) {
      for (const g of rt.army.groups || []) if (g && g.team === 0 && g.name === '味方の新手' && live(g) && g.order !== 'path') {
        const c = g.center(), w = g._stW;
        if (!w || Math.hypot(c.x - w.x, c.z - w.z) > 1) { g._stW = { x: c.x, z: c.z, t: rt.t }; continue; }
        if (rt.t - w.t < 8) continue;
        g._stW = null;
        let foeNear = false; for (const u of rt.army.units) if (u.alive && u.team === 1 && !u.fleeing && Math.abs(u.pos.x - c.x) < 6 && Math.abs(u.pos.z - c.z) < 6) { foeNear = true; break; }
        if (foeNear) continue;
        const d = Math.hypot(c.x - P.pos.x, c.z - P.pos.z) || 1, to = { x: P.pos.x + (c.x - P.pos.x) / d * 8, z: P.pos.z + (c.z - P.pos.z) / d * 8 };
        g.focus = null; g.order = 'path'; g.path = [[c.x, c.z], [to.x, to.z]]; g.pathIdx = 1; g.keepMoveOrder = true;
        g.onArrive = (q) => { q.order = 'hold'; q.anchor = { ...to }; q.aggro = 14; q.seekRange = 16; };
      }
    }
    // 勝鬨の直前に倒れた柵も接地させる。任務の進行だけを止める。
    if (F.ending) return;
    const st = rt.t - F.pt, pp = P.pos;
    // 11/18 16:00 クラウド持ち主：act bot 428秒「丹羽長秀の隊の侍が (-28,293) で20秒立つ」＝この駆け寄りが砦の東の口を支える丹羽（考え無し noAI）を口の外へ連れ出し、attack のまま戻れなかった。丹羽は駆け寄らせない
    // 11/17 K358 iMac n-k15（長：味方の厚みで囲みを割る）：大岩山の加勢で佐久間の先手の足軽に囲まれて倒れた（act bot 654秒）。本人が三人より多く囲まれたら、四十五歩の内の味方の組（二つまで）が駆け寄る
    { let n = 0; for (const u of rt.army.units) if (u.alive && u.team === 1 && !u.fleeing && Math.abs(u.pos.x - pp.x) < 5 && Math.abs(u.pos.z - pp.z) < 5 && Math.hypot(u.pos.x - pp.x, u.pos.z - pp.z) < 4.5) n++;
      if (n >= 3) for (const { g } of rt.army.groups.filter((g) => g.team === 0 && g !== F.niwaG && !g.isPlayerSquad && !g.routed && !g.civ && !g.honjin && g.count >= 4).map((g) => { const c = g.center(); return { g, d: c ? Math.hypot(c.x - pp.x, c.z - pp.z) : 1e9 }; }).filter((x) => x.d < 45 && x.d > 3).sort((a, b) => a.d - b.d).slice(0, 2)) if (!(g._rescueT > rt.t)) { g._rescueT = rt.t + 6; g.order = 'move'; g.dest = { x: pp.x, z: pp.z }; g.path = null; g.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; q.aggro = 12; q.seekRange = 16; }; } }
    // 退き切った兵は遠い所でだけ去らせる
    for (const g of F.groups) {
      if (!live(g) || !(g.kind4 === 'flee' || g.kind4 === 'gone') || g.order !== 'retreat') continue;
      for (const u of g.units) if (u.alive && !u.gone && dist(u.pos, pp) > 80) rt.army.despawn(u);
    }
    // 倒れた直後も退却兵は動かすが、持ち場の達成や勝利へは進めない。
    // 命が尽きてから共通の負傷・討死処理が入るまでの一コマも含める。
    if (!P.alive || P.hp <= 0) return;
    // 負け：賤ヶ岳の砦の中に敵が六人より多く、味方が一人以下のまま十二秒（下がって守る段）
    if (F.phase === 2.3) {
      const foes = nearCount(rt, 1, FORT, FORT.r + 3), friends = nearCount(rt, 0, FORT, FORT.r + 3);
      F.fortBad = foes >= 6 && friends <= 1 ? F.fortBad + 0.25 : 0;
      if (F.fortBad > 12) { this.lose(rt, '賤ヶ岳の砦を奪われた'); return; }
    }
    const near = (q, r) => dist(pp, q) < r;
    // 南柵は小門の前で寄せ手を受けても守備に含める。
    // 本陣は陣幕や護衛の外縁でも合流できるが、柵の外からは達成にしない。
    // 11/18 K365 iMac n-k15：寄せ手が柵沿いに広がった後は、持ち場の周りに敵が絶えず、本人は持ち場の手前で斬り合い続けて五歩の内に入れなかった（南柵・西斜面が240秒止まった）。持ち場の十二歩の内で戦っていれば守りに着いたとする
    if (F.phase === 1.3 && (near(OI_SOUTH, 12) || near(OI_GATE, 12)) || F.phase === 1.6 && near(OI_WEST, 12)) F.reachedPost = F.phase;
    // 11/18 K365 iMac n-k15：本陣の周りも敵が絶えず、八歩の内に入れず二分待って進んでいた。砦の内で本陣の十四歩の内なら合流したとする
    if (F.phase === 1.8 && near(OI_HQ, 14) && near(OI, OI.r - 0.5) && !rt.army.wallBetween(pp, -1, OI_HQ)) {
      F.reachedPost = F.phase;
      if (F.hqJoined == null) F.hqJoined = rt.t;
    }
    // 11/18 れ：主人公が南柵・西斜面の柵まで行かず手前で戦い続けると段4が225秒以上止まり、そのまま鉄砲で倒れた。三分で到着とみなす
    if ((F.phase === 1.3 || F.phase === 1.6) && st > 180 && F.reachedPost !== F.phase) F.reachedPost = F.phase;
    const raidLeft = () => F.groups.reduce((n, g) => n + (g.kind4 === 'raid' && g.bornT >= F.pt ? nLive(g) : 0), 0);
    if (F.phase === 3.5 || F.phase === 4 || F.pressGs) this.pressPlayer(rt);
    switch (F.phase) {
      case 0.5: Open.tickOpen(rt, 0.25, this.ctx(rt)); if (F.sawForts) F.saw = true; return;
      case 0.8: this.tickMarch(rt); return;
      // 大岩山へ着くまで（時だけでは進まない）
      // 11/18 K365 iMac n-k15 とクラウドい：道中の斬り合いで門に着くのが遅れ、この段が190〜640秒かかった。150秒を過ぎ大岩山の九十歩の内か、200秒を過ぎれば柵の段へ
      // 11/18 夜50-19：道中で寄せ手と斬り合うと、大岩山の九十歩の内でも110秒待って段3 が111秒かかった（act bot 0535）。九十歩の内なら80秒・五十歩の内なら60秒で柵の段へ
      case 1: if (near(OI_GATE, 16) || near(OI, OI.r + 8) || (st > 60 && near(OI, 50)) || (st > 80 && near(OI, 90)) || st > 200) this.south(rt); return;
      // 南の柵：正面の槍を崩すか、柵で一分揉み合えば西へ
      // 11/18 K365 iMac n-k15：本人が持ち場に着けず、南柵の段で740秒止まり時の上限に当たった（act bot）。110秒を過ぎれば着いていなくても進む（1.6 も同じ）・本陣の合流は80秒で
      // 11/18 クラウド持ち主：右上の数が 10/10 に届いても、本人が柵の外で斬り合っていると段が 130〜180秒動かなかった（act bot 三回とも）。数が届いたら場所を問わず進める
      // 11/19 04:10 クラウド持ち主：act bot 898秒の回で段4 110秒（討ち2）・段5 109秒（討ち4）が時の上限まで動かず一戦が15分に→上限 110→85秒・110→90秒（敵の強さはそのまま）
      // 11/19 08:40 クラウド持ち主（act bot 0821・0829 で段4・段5 が上限の85・90秒に当たる回が三つ・一戦 715〜795秒）：85→75秒・90→75秒
      case 1.3: if (st > 75) { this.west(rt); return; } if (st > 20 && ((F.reachedPost === F.phase && ((near(OI, OI.r + 6) && (nLive(F.wA) <= 4 || st > 70)) || st > 150)) || (nLive(F.wA) <= 4 && near(OI, OI.r + 40)))) this.west(rt); return;   // 11/17 ル三：主人公が柵から遠いと段4が464秒かかった。150秒で西へ
      case 1.6: if (st > 75) { this.hq(rt); return; } if (st > 18 && ((F.reachedPost === F.phase && ((near(OI, OI.r + 6) && (nLive(F.wB) <= 3 || st > 60)) || st > 130)) || (nLive(F.wB) <= 3 && near(OI, OI.r + 40)))) this.hq(rt); return;
      case 1.8:
        // 合流前に本隊を突入させ、持ち場への道を乱戦で塞がない。
        // 鉄砲隊の全滅は求めず、合流して守った後に本隊の圧力で退く。
        if (F.hqJoined == null && st > 50) F.hqJoined = rt.t;   // 11/18 05:00 クラウド持ち主：段6 が170秒の回（act bot 0434）。80→60秒・陥落の待ち90→55秒   // 11/17 ル三：主人公が本陣から遠いと段6が658秒止まった。二分で合流とみなす
        // 11/18 クラウド持ち主：柵のすぐ外で寄せ手と斬り合う本人を二分待たせていた（act bot 段6 175秒）。柵の二十五歩の内で45秒戦えば合流とみなす
        if (F.hqJoined == null && st > 45 && near(OI, OI.r + 25)) F.hqJoined = rt.t;
        if (F.hqJoined != null && !F.sakuIn && (nLive(F.wC) <= 3 || st > 35)) this.sakuIn(rt);
        if (F.hqJoined != null && rt.t - F.hqJoined > 8 && F.sakuIn && rt.t - F.sakuIn > 22 && (near(OI, OI.r + 25) || rt.t - F.sakuIn > 40)) this.fall(rt);   // 11/19 03:05 クラウド持ち主：本人が砦から遠いと段6 が上限の115秒（act bot 0249）。60→50秒・55→40秒
        return;
      // 退く：指定した南の坂へ下がってから陥落を見届ける。北の敵陣へ出ても達成にしない。
      case 2:
        // 11/19 01:30 クラウド持ち主（K324 段7 が24〜85秒・坂の印の十歩の内へ入らないと時の上限が無く止まる）：四十秒で三十歩の内・六十秒で場所を問わず振り返らせる
        if (!F.lookedBack && ((st > 4 && near(OI_BACK, 10)) || (st > 40 && near(OI_BACK, 30)) || st > 60)) this.lookBack(rt);
        return;
      // 東の口：二度の追手を退け（口で揉み合うか追手を減らす）、口にいれば帰還へ
      case 2.3:
        // 11/18 K365 iMac n-k15：act bot 911秒の回で段8・10・11が100〜125秒ずつ。追手の退き110→80秒・160→130秒、取り返す段110→80秒、前田前の線110→90秒・140→115秒（敵の強さはそのまま）
        if (F.mouthFight == null && near(MOUTH, 22) && nearCount(rt, 1, MOUTH, 30) > 0) F.mouthFight = rt.t;
        // 口の外で味方が追手を全て退けた時も、到着した主人公を待たせ続けない。
        // 坂で足止めされた追手も、時だけで「守った」にせず退却を見せてから次へ。
        if (F.waves >= 2 && near(MOUTH, 22) && st > 50) {
          if (F.mouthRetreat) {
            if (rt.t - F.mouthRetreat > 4) this.returnHide(rt);
          } else if (raidLeft() === 0 || F.mouthFight != null && raidLeft() <= 4) this.returnHide(rt);
          // 斬り合いの長引きと、坂で登れない追手の両方に上限を設ける。
          // 時間だけで達成にせず、実際に退く下知と四秒の退却を挟む。
          // 11/18 cloud-06（中学生の bot：口に着いて30秒、印も敵も無く迷った）：口で斬り合いが始まらないまま待つのは七十秒まで（130→70）
          // 11/19 01:10 クラウド持ち主（K324 段8 が78〜116秒で一戦の中で一番長い）：口で斬り合ってからの上限80→60秒（敵の強さはそのまま）
          // 11/19 02:05 クラウド持ち主（act bot 段8 が77〜110秒・一戦646秒で4〜7分を超える）：60→45秒・70→55秒（敵の数と強さはそのまま）
          // 11/19 06:30 クラウド持ち主（K324 段8 が83〜90秒・一戦610〜746秒で一番長い段のまま）：45→35秒・55→48秒。代わりに追手の一太刀 0.36→0.48（act bot「簡単すぎる」受けた傷4〜48）
          // 11/19 08:00 クラウド持ち主（act bot 0751 段8 が102秒・一戦668秒）：口へ着くのが遅く斬り合いが段の六十秒過ぎに始まると35秒を足して百秒になる→斬り合い中でも段の七十秒で退かせる
          else if (F.mouthFight != null ? (rt.t - F.mouthFight > 35 || st > 70) : st > 48) {
            F.mouthRetreat = rt.t;
            this.withdrawRaid(rt);
            rt.say('物見', '佐久間の追手、坂を下って退きまする！', 3);
          }
        }
        return;
      case 2.6: {
        // 旗本の横陣の持ち場が斜面に掛かっても、秀吉と護衛が実際に
        // 東の肩へ着けば迎えられる。要だけの先着や時間だけでは進めない。
        const hide = F.hide, lord = F.hideU;
        if (!F.hideArrived && hide?.dest && hide.onArrive && lord?.alive && !lord.gone && !lord.downed &&
            dist(lord.pos, hide.dest) < 8 && hide.units.reduce((n, u) => n + (u.alive && !u.gone && !u.downed && !u.woundOut && dist(u.pos, hide.dest) < 12 ? 1 : 0), 0) >= 4) hide.onArrive(hide);
        // 11/19 03:10 クラウド持ち主（act bot 0254 段9 が100〜107秒・肩の下で追手と斬り合う間に秀吉の旗本が着かない）：五十五秒で着いたとし、七十五秒で場所を問わず迎える
        if (!F.hideArrived && st > 55 && hide?.onArrive && lord && dist(lord.pos, hide.dest) < 30) hide.onArrive(hide);
        const came = F.hideArrived || st > 55;
        // 夜の光へ移る秒と、秀吉本人の到着を待って迎える。
        // 11/18 23:10 クラウド持ち主（一戦が10分を超える・4〜7分の決まり）：台詞は22.6秒で済むので、待ちを四十五→三十秒に（act bot 段9 49秒）
        if ((near(JOIN, 14) && came && st > 30) || st > 75) { if (!F.metHide) { F.metHide = true; rt.say('羽柴秀吉', 'よう生きて戻った。玄蕃め、深入りしおったわ', 3); phaseAfter(rt, 3.4, () => { if (!rt.over && !F.ending && F.phase === 2.6) this.retake(rt); }); } }
        return;
      }
      case 3:
        // 11/18 K365 iMac n-k15：味方の備がそろわず、取り返す段で380〜400秒止まり時の上限で負けた（act bot）。210秒を過ぎ、本人が砦の二十五歩の内で戦っていれば佐久間勢は北へ退く
        // 11/19 01:00 クラウド持ち主（K324 一戦13分＝act bot 778秒・段10 89秒・段11 99秒）：退く下知を80→60秒
        // 11/19 08:10 クラウド持ち主（act bot 0754 段10 が53〜111秒・一戦629〜715秒）：退く下知 60→50秒・本人が遠い時 120→90秒
        if (!F.oiRetreat && st > 50 && near(OI, OI.r + 40)) { F.oiRetreat = rt.t; this.withdrawOiwa(rt); rt.say('物見', '大岩山の佐久間勢、北へ退きまする！', 3); }
        // 11/17 クラウドル三：主人公が大岩山から遠いと上の上限（st>110）が効かず、段10 が381秒かかって刻限に当たった（act bot 1260秒失敗）。四分たてば味方の勢で退く下知を出す
        // 11/19 02:25 クラウド持ち主（act bot 837秒の回で段10 が199秒・本人が砦の五十歩の外）：四分→二分
        // 11/19 08:35 クラウド持ち主（act bot 0821 段10 が97〜99秒の回が二つ・本人が砦の五十歩の外）：九十→七十秒
        if (!F.oiRetreat && st > 70 && !near(OI, OI.r + 4)) { F.oiRetreat = rt.t; this.withdrawOiwa(rt); rt.say('物見', '大岩山の佐久間勢、北へ退きまする！', 3); }
        else if (F.oiRetreat && rt.t - F.oiRetreat > 8 && !near(OI, OI.r + 4)) this.pushSaku(rt);
        // 11/18 K365 iMac n-k15：柵の周りに敵が絶えず、砦の四歩の内に入れず取り返す段が110〜230秒かかった。十二歩の内で戦っていれば砦に取り付いたとする
        if (near(OI, OI.r + 12) && st > 15) {
          if (F.oiRetreat) {
            if (rt.t - F.oiRetreat > 4) this.pushSaku(rt);
          } else if (this.inFortFoes(rt) <= 3) this.pushSaku(rt);
          // 柵に詰まった残兵だけで奪還を止めない。備も着いてから退く下知を出す。
          else if (st > 60 && nearCount(rt, 0, OI, OI.r + 12) >= 4) {
            F.oiRetreat = rt.t;
            this.withdrawOiwa(rt);
            rt.say('物見', '大岩山の佐久間勢、北へ退きまする！', 3);
          }
        }
        return;
      case 3.5: {
        // 小門を回って来る備を待つ。主人公の先着と経過時間だけでは「押し返した」にしない。
        const joined = nearCount(rt, 0, SAKU_LINE, 35) >= 4;
        if (joined && near(SAKU_LINE, 30) && nearCount(rt, 1, SAKU_LINE, 30) > 0 && F.sakuFight == null) F.sakuFight = rt.t;
        // 前の砦戦で減った人数だけでは、まだ対陣していない備を押し返したことにしない。
        // 生きた備とは八秒以上向き合う。取り残された敵には合流後の上限で退く下知を出す。
        const left = nLive(F.saku), fought = F.sakuFight != null ? rt.t - F.sakuFight : 0;
        if (!F.maedaGo && joined && near(SAKU_LINE, 30)) {
          if (F.sakuJoined == null) F.sakuJoined = rt.t;
          if (F.sakuRetreat != null) {
            if (rt.t - F.sakuRetreat > 4) this.watchMaeda(rt);
          } else if (left === 0 || fought >= 8 && (left <= 14 || fought > 100)) this.watchMaeda(rt);
          // 持ち場から離れた残兵では交戦の時計が始まらない。
          // 備と主人公が着いてからの上限でも下知を出し、退く姿を挟む。
          // 11/18 05:00 クラウド持ち主：そろってから130秒待つと段11 が162〜241秒になった（act bot 0434・0438）。80秒へ
          else if (rt.t - F.sakuJoined > 45) {   // 11/19 クラウド持ち主（K324）：80→60秒／02:20 段11 が59〜84秒で一戦が10分を超える：60→45秒
            F.sakuRetreat = rt.t;
            for (const g of [F.saku, F.mori]) if (live(g)) {
              g.order = 'retreat'; g.focus = null; g.onArrive = null; g.path = null;
              g.dest = { x: 20, z: -300 }; g.speed = 2.8; g.kind4 = 'flee';
              for (const u of g.units) u.noTarget = true;
            }
            rt.say('使番', '佐久間の備、北へ下がりまする！', 3);
          }
        }
        // 11/18 クラウド：味方四人が線にそろわず、この段で500秒止まって時の上限に当たった（act bot 754→1260秒）。
        // 160秒を過ぎ本人が線の40歩の内なら、備がそろわなくても佐久間勢は退く（柴田の段と同じ上限）
        // 11/18 04:30 クラウド持ち主：act bot 820秒の回で備がそろわず、この段が上限の167秒かかった（他の回は14秒）。上限を110秒へ（そろった時の130秒より短く）
        // 11/18 05:00 クラウド持ち主：備がそろっても本人が線の30〜40歩の外だと、どの上限にも当たらず止まった。140秒を過ぎれば場所もそろいも問わず退く
        if (!F.maedaGo && ((!joined && st > 55 && near(SAKU_LINE, 40)) || st > 70 || F.sakuRetreat != null && !(joined && near(SAKU_LINE, 30)))) {
          if (F.sakuRetreat == null) {
            F.sakuRetreat = rt.t;
            for (const g of [F.saku, F.mori]) if (live(g)) {
              g.order = 'retreat'; g.focus = null; g.onArrive = null; g.path = null;
              g.dest = { x: 20, z: -300 }; g.speed = 2.8; g.kind4 = 'flee';
              for (const u of g.units) u.noTarget = true;
            }
            rt.say('使番', '佐久間の備、北へ下がりまする！', 3);
          } else if (rt.t - F.sakuRetreat > 4) this.watchMaeda(rt);
        }
        return;
      }
      case 3.7:
        // 11/17 K358 iMac n-k15：茂山の肩まで270歩歩いて見て、柴田の前へ220歩戻るので戦が15分を越えた。茂山の梅鉢は湖の岸の道の角（肩から95歩の内）から見える。そこへ着けば陣払いを見届けたとする。着けなくても四十五秒で使番が陣払いを知らせる（大岩山から岸の角まで二百歩あり、段の大半が歩くだけだった）
        if (!F.maedaGo && (near(MAEDA_LOOK, 18) || (st > 20 && near(MAEDA_LOOK, 95)) || st > 45)) this.maedaLeave(rt);
        return;
      case 4:
        if (F.katOut) { if (rt.t - F.katOut > 6) this.win(rt); return; }
        this.menjoUma(rt);
        this.menjoDuel(rt);
        if (F.shibataJoined == null && near(SHIBA_FRONT, 30) && nearCount(rt, 0, SHIBA_FRONT, 35) >= 4) F.shibataJoined = rt.t;
        if (F.shibataFight == null && near(SHIBA_FRONT, 30) && nearCount(rt, 0, SHIBA_FRONT, 35) >= 4 && nearCount(rt, 1, SHIBA_FRONT, 35) > 0) F.shibataFight = rt.t;
        // 主人公だけが先着した時は、備が追いつくまで総崩れにしない。
        // 11/18 K365 iMac n-k15：味方四人がそろわず最後の段で時の上限に当たった（act bot 1260秒）。160秒を過ぎ、本人が柴田の前の四十歩の内にいれば退く
        // 11/18 04:30 クラウド持ち主：act bot 793秒の回で最後の段が上限の167秒かかった（他の回は57〜91秒）。上限を110秒へ
        // 11/18 05:00 クラウド持ち主：本人が柴田の前の四十歩の外にいると、どの上限にも当たらず止まった。150秒を過ぎれば場所を問わず総崩れへ
        // 11/18 K365 iMac n-k15：main 取り込み後 894秒（段11 119秒・段13 157秒）。前田前の線80/100秒・柴田の前90/120秒（敵そのまま）
        // 11/19 クラウド持ち主（K324 段13 60〜97秒）：90→75秒・120→105秒
        if ((st > 75 && near(SHIBA_FRONT, 40)) || st > 105 || near(SHIBA_FRONT, 30) && nearCount(rt, 0, SHIBA_FRONT, 35) >= 4 && st > 25 && (nLive(F.kmG) <= 4 || F.shibataFight != null && rt.t - F.shibataFight > 90 || F.shibataJoined != null && rt.t - F.shibataJoined > 110)) {   // 11/17 K358 iMac n-k15：130→90秒・160→110秒（最後の段が180〜240秒で戦が15分を越えた）
          F.katOut = rt.t;
          this.routShibataDepth(rt);
          rt.say('柴田勝家', '……退け。北ノ庄へ退け', 3);
          phaseAfter(rt, 3.2, () => rt.say('羽柴秀吉', '深追いはならぬ。勝家は北ノ庄で詰める', 3));
          for (const g of [F.kat, F.kmG]) if (live(g)) { g.order = 'retreat'; g.focus = null; g.onArrive = null; g.path = null; g.dest = { x: g.center().x, z: -330 }; g.speed = 2.6; g.kind4 = 'flee'; for (const u of g.units) u.noTarget = true; }
          for (const g of [F.yari, F.uma]) if (live(g)) { g.order = 'hold'; g.anchor = { x: g.center().x, z: g.center().z }; g.focus = null; g.onArrive = null; }
        }
        return;
    }
  },

  // 11/19 07:20 クラウド持ち主（K324 の残り：act bot「41人を無傷で討った」「手応えがスカスカ・もっと強い奴と斬り合いたい」）：
  //   段11（佐久間の立て直し）・段13（柴田の前）で、本人の二十二歩の内に足軽の居る敵の組を一つ本人へ向ける（十五秒・間に六秒・有岡と同じ型）。
  //   退く組・逃げる組・鉄砲弓・勝家の旗本は向けない。人数はそのまま
  pressPlayer(rt) {
    const F = rt.flags, me = rt.player.u;
    if (!me.alive || me.invuln || rt.t < (F.pressAt || 0)) return;
    F.pressAt = rt.t + 2;
    const on = F.phase === 3.5 || F.phase === 4, cur = F.pressGs || [];
    if (on && cur.length && cur.every((p) => p.g.focus === me && p.g.order === 'attack' && !p.g.routed) && rt.t < F.pressEnd) return;
    for (const p of cur) {
      const g = p.g;
      if (g.dmgMult === p.up) g.dmgMult = p.dmg;
      if (g.focus === me) { g.focus = null; if (!g.routed && g.order === 'attack') g.order = p.order; }
    }
    if (cur.length) F.pressNext = rt.t + 6;
    F.pressGs = null; F.pressG = null;
    if (!on || rt.t < (F.pressNext || 0)) return;
    // 11/19 07:20 クラウド持ち主（act bot 603秒「26人を無傷で討った」・受け流し44回）：前から来る一組は bot が皆受け流す。
    //   一つ目と向きが百度より離れた（脇・後ろの）二つ目の組も向け、挟んで打たせる（二十八歩の内）
    const pick = (r, away) => {
      let best = null, bd = r, bu = null;
      for (const g of rt.army.groups) {
        if (g.team !== 1 || g.routed || g.civ || g.focus || g.order === 'retreat' || g.kind4 === 'flee' || g.kind4 === 'gone' || g === F.kat || /本陣|旗本/.test(g.name || '')) continue;
        for (const u of g.units) {
          if (!u.alive || u.gone || u.fleeing || u.noTarget || u.mounted || u.type === 'gun' || u.type === 'bow' || u.type === 'busho') continue;
          const dx = u.pos.x - me.pos.x, dz = u.pos.z - me.pos.z, d = Math.hypot(dx, dz);
          if (d >= bd || d < 0.1) continue;
          if (away && (dx * away.x + dz * away.z) / d > -0.17) continue;
          bd = d; best = g; bu = { x: dx / d, z: dz / d };
        }
      }
      return best && { g: best, dir: bu };
    };
    const one = pick(22, null);
    if (!one) return;
    const two = pick(28, one.dir);
    F.pressGs = [];
    for (const { g } of two && two.g !== one.g ? [one, two] : [one]) {
      // 向けた十五秒だけ、その組の刃を六割増し（上限0.7・一戦の受けた傷が9の回があった）。離す時に戻す
      const p = { g, order: g.order, dmg: g.dmgMult, up: Math.min(0.7, (g.dmgMult ?? 1) * 1.6) };
      g.focus = me; g.order = 'attack'; g.seekRange = Math.max(g.seekRange || 0, 30); g.dmgMult = p.up;
      F.pressGs.push(p);
    }
    F.pressG = one.g; F.pressEnd = rt.t + 15;
  },

  // 近くの先手だけでなく、北の予備・本陣の軽い備も同じ下知で崩れる。
  routShibataDepth(rt) {
    const V = rt.flags.depth, D = V?.B;
    if (!D) return;
    D.broken = true; // 北ノ庄へ退いた備を勝鬨の間に再編させない。
    for (const s of D.sonae) depthRout(D, s);
    // 本陣の座る／立つ／騎乗の姿は備とは別の描画。実際に退く勝家と二重に残さない。
    for (let i = V.honjin.length - 1; i >= 0; i--) {
      const h = V.honjin[i];
      if (h.D !== D) continue;
      for (const g of Object.values(h.pose)) g.visible = false;
      V.honjin.splice(i, 1);
    }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    this.routShibataDepth(rt);
    F.ending = true;
    rt.objDone('s' + stageIx(F.phase));
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '大岩山を取り返し、柴田軍を崩した', pts: 20 }; }, '柴田軍を崩した');
    rt.player.u.invuln = true;
    for (const g of F.groups) if (live(g) && g.units[0]?.team === 1) {
      // 小門から退く途中の残兵は、勝鬨でも北の柵へ向け直さない。
      if (g.retreatOnly && g.order === 'path' && g.path) continue;
      // 勝鬨の間も戦場は動く。古い到着処理で攻撃へ戻さず、既に退く隊の道は保つ。
      if (g.order !== 'retreat' || !g.dest) g.dest = { x: g.center().x, z: -300 };
      g.order = 'retreat'; g.focus = null; g.onArrive = null; g.path = null;
      g.aggro = 0; g.seekRange = 0; g.speed = 3.4;
      for (const u of g.units) u.noTarget = true;
    }
    victoryMoment(rt, '勝');
    // 勝鬨の間も操作した向きを保ち、大岩山は自分で振り返って見られる。
    const sec = epilogue(rt, this.ctx(rt));
    // finish は直ちに over を立て、終幕の台詞も共通の音声も止める。
    // 操作できる戦場で知らせを聞き終えてから、結果へ移る。
    rt.after(sec, () => { if (!rt.over) rt.finish({ scriptedEnd: true }, 0); });
  },
  lose(rt, why) {
    const F = rt.flags;
    if (F.ending || !rt.canFailMission()) return;
    F.ending = true;
    rt.objFail('s' + stageIx(F.phase));
    rt.tracker.main = false;
    rt.banner('果たせず', why);
    rt.finish({ failureReason: why }, 4);
  },

  // 退く途中は打ち込みの直前だけ受け、敵へ詰めずに退路を進む。
  botGuardFlee: (b) => b.flags.phase === 2 || b.flags.phase === 3.7 || b.flags.phase === 2.3 && dist(b.player.u.pos, MOUTH) >= 22,
  // bot：近い敵を突き、いなければ段の行き先へ（砦の柵は口を通る）
  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    if (F.holdPlayer || F.ending || !u.alive) return;
    // 柵越しの敵を追うと、南柵から西斜面・本陣へ移れず壁に向かって立ち続ける。
    const ok = (o) => o.alive && !o.gone && !o.fleeing && !o.invuln && !o.noTarget && !o.downed && !o.woundOut && !o.rearWound && !o.isStruct && !o.civ && Math.abs(o.pos.y - u.pos.y) < 4 && !b.army.wallBetween(u.pos, -1, o.pos);
    const prev = p.botStrikeFoe;
    const e = this.botGuardFlee(b) ? null
      : prev?.alive && ok(prev) && p.botStrikeUntil > p.time && dist(prev.pos, u.pos) < 2.8 ? prev : b.army.nearestEnemy(u, F.phase === 1 ? 3.5 : 9, ok);   // ③加勢に走る間は、道の脇の敵を追わずに大岩山へ（遊ぶ人と同じ。11/18 cloud-06）
    if (e) {
      const d = dist(e.pos, u.pos);
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
      patientStrike(p, inp, e, d, true);
      return;
    }
    inp.guardHold = false;
    // 湖の北の道は隊と同じ順に通る。水面へ一直線に走らせない。
    if ((F.phase === 3.7 || F.phase === 4) && F.northPath) {
      while (F.northIx < F.northPath.length) {
        const [x, z] = F.northPath[F.northIx];
        if (Math.hypot(u.pos.x - x, u.pos.z - z) < 7) { F.northIx++; continue; }
        // 行き先のピンと同じ：次の角が今の角より近ければ今の角を過ぎた事にする（西の端へ戻らない）
        const nx = F.northPath[F.northIx + 1];
        if (nx && Math.hypot(u.pos.x - nx[0], u.pos.z - nx[1]) < Math.hypot(x - nx[0], z - nx[1])) { F.northIx++; continue; }
        goTo(p, inp, x, z, 2); return;
      }
    }
    const q = b.def.missionPin(b);
    if (!q) return;
    // 11/18 cloud-06（act bot の居場所：③で (57,147) の斜面に百五十秒、中川の本陣・道の脇の敵と押し合って止まった）：
    //   ③の間に五秒で一歩も進まなければ、行き先へ向かう向きの横（左右を交互）へ六歩外して回り込む（遊ぶ人と同じ。試し役の頭だけ）
    if (F.phase === 1) {
      const k = b.szStuck || (b.szStuck = { x: u.pos.x, z: u.pos.z, t: b.t, side: 1, until: 0, to: null });
      if (Math.hypot(u.pos.x - k.x, u.pos.z - k.z) > 1) { k.x = u.pos.x; k.z = u.pos.z; k.t = b.t; }
      else if (b.t - k.t > 5 && b.t > k.until) {
        const dx = q.x - u.pos.x, dz = q.z - u.pos.z, l = Math.hypot(dx, dz) || 1;
        k.side = -k.side; k.until = b.t + 3; k.t = b.t;
        k.to = { x: u.pos.x + (dx / l) * 3 - (dz / l) * 6 * k.side, z: u.pos.z + (dz / l) * 3 + (dx / l) * 6 * k.side };
      }
      if (k.to && b.t < k.until) { goTo(p, inp, k.to.x, k.to.z, 1); return; }
    }
    for (const [C, R, ga] of [[FORT, FORT.r, Math.PI / 2], [OI, OI.r, OI_GA]]) {
      const w = fortWay(u.pos, q, C, R, ga);
      if (w) { goTo(p, inp, w.x, w.z, 1.5); return; }
    }
    goTo(p, inp, q.x, q.z, 2);
  },
};

// 11/18 クラウドり（賤ヶ岳 act bot 824秒 羽柴の先手14人が path のまま (79,93) に55組重なる）：小さな path の組も重なれば渦に散らす
t02_shizugatake.stackPath = true;
t02_shizugatake.sides = { a: { name: '羽柴軍', mon: HASHIBA }, b: { name: '柴田軍', mon: SHIBATA.flag } };
// 兵の数：柴田方およそ三万・羽柴方は集まった後でおよそ五万（docs/battle_refs/t02_shizugatake.md）
//   11/6 十二1：羽柴方も討たれた味方の数で減る（棒が動かないと形勢が見えない）。一人を四十人ほどの備の損に見立てる
t02_shizugatake.force = (rt) => {
  // 無傷の落ち武者も夜に場から去ると alive=false になるため、討死の知らせで数える。
  const lost = rt.flags.allyLost || 0;
  // 討死はこの戦で集計済み。共通の表示で援軍・退去の人数を重ねて補正しない。
  return { a: Math.max(0, 50000 - lost * 40), a0: 50000, b: Math.max(0, 30000 - (rt.flags.kills || 0) * 40), b0: 30000, casualtiesCounted: true };
};
t02_shizugatake.date = (rt) => (rt.flags.phase >= 3 ? '天正十一年四月二十一日　夜明け' : '天正十一年四月二十日');
t02_shizugatake.history = '天正十一年、羽柴秀吉と柴田勝家は、近江の余呉湖のまわりの砦に分かれて睨み合った。北の行市山・別所山・茂山には佐久間盛政・前田利家ら柴田方、南の堂木山・神明山・東野山・岩崎山・大岩山・賤ヶ岳・田上山には羽柴方が入った。\n'
  + '四月二十日、佐久間盛政は行市山から余呉湖の西を回り込み、大岩山の砦を攻め落とした。守っていた中川清秀は討ち死にし、岩崎山の高山右近も退いた。賤ヶ岳の砦は、琵琶湖を渡って来た丹羽長秀の加勢で持ちこたえた。\n'
  + '大垣にいた秀吉はこれを聞き、十三里（およそ五十二キロ）の道を夜までに駆け戻った（美濃大返し。五時間ほどという数は秀吉方の書の言い分）。盛政は大岩山に居座り（勝家の退けの命に従わなかったと伝わる）、勝家の本隊から離れて孤立した。\n'
  + '二十一日の夜明け、秀吉は湖の西の岸を退く佐久間勢を追い、飯浦の切通しの辺りで殿の柴田勝政を討った。茂山の前田利家が戦の場を離れると、柴田勢は総崩れとなった。\n'
  + '佐久間盛政は落ちのびたが、のちに捕らえられた。勝家は越前の北ノ庄城へ退き、数日の後に城とともに果てた。この日に手柄を立てた福島正則・加藤清正らは、のちに「賤ヶ岳の七本槍」と呼ばれた。';

// 目標の並び（goals5.js）。段の一行は場所と行いで書く。「敵を何人討つ」は共通の一つだけ（AR の 1）
const st = (n) => (rt) => (rt.flags.phase ?? 0) >= n;
STAGES.t02_shizugatake = STAGE_TEXT.map((t, i) => (i ? [t, st(STAGE_AT[i])] : [t]));
// 倒す数（kaito 11/2 O）：右上の任務の一行に「（倒した数／倒す数）」。段が進む判定と同じ数え方（stages.js）
KILLS.t02_shizugatake = (rt) => {
  const F = rt.flags, P = F.phase;
  if (F.ending) return null;
  // 本陣への合流で、柵の外の鉄砲隊を討ちに出るよう促さない。
  const g = P === 1.3 ? F.wA : P === 1.6 ? F.wB : P === 3.5 ? F.saku : P === 4 ? F.kmG : null;
  if (!g) return null;
  // 負傷離脱・敗走も進行判定と同じ数え方にし、未達の人数表示のまま次へ進ませない。
  return cut(g.units.length, nLive(g), P === 1.6 ? 3 : P === 3.5 ? 14 : 4);
};
withGuard(t02_shizugatake);

export { t02_shizugatake };
