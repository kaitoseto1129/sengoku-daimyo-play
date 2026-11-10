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
import { nobori, kagaribi, village, yagura, carryTorches } from './props.js';
import { placeGroup, placePlayer } from './b_opening.js';
import { distToPolyline } from './world.js';
import { rippleWater } from './world_water.js';
import { doruiLine } from './castle_parts.js';
import { liteMat } from './world_vegetation_materials.js';
import { victoryMoment } from './victory_moment.js';
import { sfx } from './audio.js';
import { withGuard } from './toyo_bot.js';
import { KILLS, STAGES, downTo, cut } from './stages.js';
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
// 柴田方は二つ雁金の旗。羽柴方の旗は 'oda' の兵も含めて全部 'toyotomi' に染め替える（world.armyFlagKinds。豊臣編に織田の旗を出さない・kaito AQ4）
// 11/5 check60：佐久間盛政の手は佐久間の丸に三引両、丹羽長秀の隊は直違（家ごとの旗。柴田の旗は勝家の一門と勝政の手だけ）
const SHIBATA = { faction: 'nobukatsu', flag: 'kari' };
const SAKUMA = { faction: 'nobukatsu', flag: 'sakuma' };
const NIWA = 'sujikai';
const HASHIBA = 'toyotomi';
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
const MOUTH = { x: FORT.x + FORT.r + 4, z: FORT.z };     // 賤ヶ岳の砦の東の口（柵の切れ目）
const DAWN_AT = { x: -82, z: 256 };                      // 夜明けに主人公が立つ所（砦の西の肩。切通しの口まで三十五歩ほど）
// 目標（goals5.js が並べる。段の一行は場所と行い。四つの段だけ。「敵を何人討つ」で埋めない・stageGoalsOnly。携帯の横で一行に収まる長さ）
// 11/5 check60：844 の横で九字ほどで二行に折れた（写真）。九字までに縮める
// 11/6 critic60（十1・三1）：だれを討つ・だれを追うかを書く。夜の美濃大返しも段にする（本陣で秀吉を迎える）
// 11/10 改訂（docs/shizugatake_spec_1109.md）：砦を守る側から、奪い返す側へ。十三の段（携帯の横で一行に収まる長さ）
const STAGE_TEXT = ['東の物見で砦の並びを見る', '佐久間勢の行き先を見る', '大岩山の中川殿へ加勢に走る', '南の柵を守る', '西の斜面へ兵を回す', '中川殿の本陣へ合わさる',
  '中川隊と退く', '賤ヶ岳の砦まで下がる', '戻った秀吉を迎える', '大岩山を取り返す', '佐久間の備を押し返す', '茂山で前田勢の退きを見る', '柴田の先手を押す'];
const STAGE_PLACE = ['東の物見', '東の物見', '大岩山の小門', '南の柵', '西の斜面', '中川の本陣', '大岩山の南の坂', '砦の東の口', '東の肩の道', '大岩山', '大岩山の北', '茂山の北東の肩', '岩崎山の南'];
const STAGE_AT = [0.5, 0.8, 1, 1.3, 1.6, 1.8, 2, 2.3, 2.6, 3, 3.5, 3.7, 4];
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
      // 七つの順序を保ち、今の段を含む五つだけを並べる。
      const windowAt = String(Math.max(0, stageIx(rt.flags.phase) - 4));
      if (hud.root.getAttribute('data-shizu-window') !== windowAt) hud.root.setAttribute('data-shizu-window', windowAt);
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
  box.style.cssText = 'position:absolute;inset:0;pointer-events:none';
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
      if (n >= 80) break;
      // 前田勢と勝政の残兵は攻撃対象から外しても敵のまま。共通の名札が出ない者にも所属の▼を残す。
      if (!u.alive || u.gone || u.dying || u.woundOut || u.rearWound || u.downed || u.isStruct || u.civ || u.team === me.team || u.team > 1 || (u._nearSignOn && !u.noTarget) ||
          u.mesh?.visible === false || u.camHidden || (u.pos.x - me.pos.x) ** 2 + (u.pos.z - me.pos.z) ** 2 > 4900) continue;   // 11/6 critic60（九3）：七十 m 内の見える敵は全員
      if (!(u._szSeenAt > rt.t - .34 && u._szSeenAt <= rt.t)) { u._szSeen = sightUnit(rt, u); u._szSeenAt = rt.t; }
      if (!u._szSeen) continue;
      v.set(u.pos.x, u.pos.y + (u.mounted ? 3.2 : 2.25), u.pos.z).project(rt.camera);
      if (v.z < -1 || v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue;
      // 共通の▼と同じ余白で、任務札・人数・命の棒に補助の印を重ねない。
      const px = (v.x + 1) * innerWidth / 2, py = (1 - v.y) * innerHeight / 2;
      let under = false;
      for (const r of rects || []) if (px > r.left - 24 && px < r.right + 24 && py > r.top - 4 && py < r.bottom + 28) { under = true; break; }
      if (under) continue;
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
  if (qIn && dist(u, gOut) < 3) return gIn;
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
  // 11/6 九3：味方の名のある将（桑山・丹羽・小姓衆）の名を、近づかなくても出す（既定の 18 では遊んで一度も見えない将がいた）
  nameRange: 60,
  missionPinCaption: '',
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
  // 11/6 九度目（critic60 五4）：共通の溜め（十五秒）で、始まってから十六秒も台詞が出ず霧の野を見るだけだった。煙と桑山の声が開戦の溜め
  prelude: false,
  introText: () => '柴田勝家と羽柴秀吉が、余呉湖のまわりの山に砦を築いて睨み合う。秀吉は美濃の大垣にいる。前の砦を守るのは中川清秀・高山右近・桑山重晴。賤ヶ岳の東の物見から、砦の並びを見届けよ。',
  minutes: 15,
  expectMin: 15,             // 進み具合の棒は十五分で（11/8 夜）
  depth: T02_DEPTH,           // 軍勢の厚み・陣立て（t02_shizugatake/depth.js）
  lethal: { max: 2, firstAt: 200, gap: 120 },   // 命懸けの戦場（docs/lethal_howto.md）
  fearKind: { kind: 'fort_raid', note: '砦が急襲され、大岩山が落ちる', w: { losses: 1.2, honjin: 1.3, iso: 1.3 }, line: '砦が危ない！' },
  spawn: { x: START.x, z: START.z, heading: Math.atan2(LOOK.x - START.x, LOOK.z - START.z) },
  // 物見へ下りる間は、目線を余呉湖の向こうの燃える大岩山へ上げる（坂の法と杉だけを写さない。共通の口）
  // 物見では佐久間の勢へ、退く時と勝った後は大岩山へ目線を上げる（共通の口・前方の内だけ効く）
  camLookAt: (rt) => {
    const F = rt.flags;
    if (F.phase === 0.8 && live(F.saku)) { const c = F.saku.center(); return { x: c.x, z: c.z, up: 2 }; }
    if (F.phase === 2 || F.ending) return { x: OI.x, z: OI.z, up: 3 };
    return null;
  },
  world: {
    // 11/6 九度目（描いて遊んだ）：霧 0.25 では物見から百八十歩先の燃える大岩山も、⑤の岸から湖も霞んで見えなかった。四月二十日は晴れ（大返しの道は日のあるうちに駆けた）。朝霧を置かない
    //   （world は mist が有れば朝の靄の空・地の霧・山の靄を一揃えで掛け、値を半分にしても写真で変わらなかった）
    seed: 1583, time: 'day', mist: 0,
    // 11/8 陣立ての見せ場（幟の林）：大岩山の佐久間の三つの備（先手・二陣・本陣）は物見から百二十〜二百三十歩。描く遠さを二百五十歩へ（霧は幟と山肌だけ薄くする）
    landmarkViewFar: 250,
    // 11/6 八度目（critic60 二1・十一4）：地を這う霧で物見から燃える大岩山・④の岸から余呉湖が見えなかった。湖の靄を薄く残す
    groundMistScale: 0.15, groundHalf: 400, moveLim: 392,
    namedKacchu: SHIZU_KACCHU,   // 先懸けの衆は天正十一年の小姓の姿（上の SHIZU_KACCHU）
    height,
    armyFlagKinds: { oda: HASHIBA },
    paths: [{ pts: KAIDO, w: 3.5 }, { pts: CUT, w: 2.5 }, { pts: UPHILL, w: 2.5 }, { pts: SHORE_W, w: 2.5 }, { pts: OIWA_WAY, w: 2.5 }, { pts: NORTH_OUT, w: 2.5 }, { pts: NORTH_BACK, w: 2.5 }],
    clear: (x, z) => Math.hypot(x - FORT.x, z - FORT.z) < FORT.r + 6 || distToPolyline(x, z, KAIDO) < 6 || distToPolyline(x, z, CUT) < 4
      || distToPolyline(x, z, SHORE_W) < 5 || distToPolyline(x, z, UPHILL) < 4 || dist({ x, z }, KINOMOTO) < 22 || distToPolyline(x, z, [[FORT.x, FORT.z], [LOOK.x, LOOK.z], [26, 218]]) < 9
      || distToPolyline(x, z, [[FORT.x, FORT.z], [DAWN_AT.x, DAWN_AT.z], [KATSUMASA.x, KATSUMASA.z]]) < 8
      || distToPolyline(x, z, NORTH_OUT) < 6 || distToPolyline(x, z, NORTH_BACK) < 6
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
    const P = { 0.5: LOOK, 0.8: LOOK, 1: OI_GATE, 1.3: OI_SOUTH, 1.6: OI_WEST, 1.8: OI_HQ, 2: OI_BACK, 2.3: MOUTH, 2.6: JOIN, 3: OI, 3.5: SAKU_LINE, 3.7: MAEDA_LOOK, 4: SHIBA_FRONT }[phase];
    if (!P) return null;
    q.x = P.x; q.z = P.z;
    q.label = STAGE_PLACE[stageIx(phase)];
    return q;
  },

  setup(rt) {
    const F = rt.flags, W = rt.world;
    F.phase = 0; F.kills = 0; F.allyLost = 0; F.groups = []; F.holdPlayer = true; F.fortBad = 0;
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
    // ---- 対陣図の砦の並び：幟で示す（羽柴方は桐・柴田方は雁金・前田は梅鉢）。大岩山と岩崎山は陥落時に佐久間の旗へ替える ----
    const flags = [[TAGAMI, HASHIBA], [HIGASHINO, 'hori'], [DOGI, HASHIBA], [SHINMEI, HASHIBA], [OIWA, HASHIBA], [IWASAKI, HASHIBA],
      [SHIGE, 'maeda'], [GYOICHI, SAKUMA.flag], [BESSHO, 'maeda']];
    F.fallenFortFlags = []; F.maedaCampFlags = [];
    for (const [p, k] of flags) for (const [dx, dz] of [[0, 0], [-5, 3], [5, 3]]) {
      const guard = nobori(W, p.x + dx, p.z + dz, k, 7);
      rt.scene.add(guard);
      if (p === SHIGE) F.maedaCampFlags.push(guard);
      if (p === OIWA || p === IWASAKI) {
        // 陥落前は羽柴方、陥落後は占領した佐久間の幟（岩崎山は捨てるだけで旗を残さない）。奪い返すと羽柴へ戻す
        const sakuma = p === OIWA ? nobori(W, p.x + dx, p.z + dz + 6, SAKUMA.flag, 7) : null;
        if (p === OIWA) guard.position.z += 6;
        if (sakuma) { sakuma.visible = false; rt.scene.add(sakuma); }
        F.fallenFortFlags.push({ guard, sakuma, oiwa: p === OIWA });
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
    for (const u of F.maedaG.units) u.noTarget = true;
    this.buildOiwa(rt);
    rt.after(1.2, () => { F.holdPlayer = false; Open.startOpen(rt, this.ctx(rt)); });
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
  },
  // 大岩山の陣城：柵の輪（南に小門）・土塁・見張り台・中川の陣幕と旗・篝火。守る中川の隊（中川は前で指揮する。HP の大将にしない）
  buildOiwa(rt) {
    const F = rt.flags, W = rt.world;
    F.oiWall = ringWall(rt, OI.x, OI.z, OI.r, { team: 0, hp: 500, gapAt: OI_GA, gapW: 0.9, name: '大岩山の砦の柵' });
    const bank = [];
    for (let i = 0; i <= 20; i++) { const a = OI_GA + 0.6 + (i / 20) * (Math.PI * 2 - 1.2); bank.push([OI.x + Math.sin(a) * (OI.r + 0.6), OI.z + Math.cos(a) * (OI.r + 0.6)]); }
    doruiLine(rt, bank, { w: 3.2, h: 0.8, name: '大岩山の砦の土塁' });
    rt.scene.add(yagura(W, OI.x + 7, OI.z + 5, { mon: HASHIBA, team: 0 }));
    KIT.honjin(rt, OI.x + 1, OI.z - 5, { mon: HASHIBA, people: false, fire: false, w: 7, d: 4, noUma: true, yoroi: false });
    for (const [dx, dz] of [[-4, 9], [4, 9], [-8, -3]]) rt.scene.add(kagaribi(W, OI.x + dx, OI.z + dz));
    F.nakaFlag = nobori(W, OI.x + 5, OI.z - 2, HASHIBA, 7.5);
    rt.scene.add(F.nakaFlag);
    F.naka = allyGroup(rt, { name: '中川清秀の本陣', fullStrength: true, anchor: { ...OI_HQ }, facing: Math.PI, width: 3, aggro: 8, seekRange: 10, order: 'hold', noRout: true, noAI: true, keepMoveOrder: true },
      [{ type: 'busho', n: 1, o: { name: '中川清秀', invuln: true, horse: false } }, { type: 'samurai', n: 3 }]);
    F.nakaH = allyGroup(rt, { name: '中川清秀の隊', fullStrength: true, anchor: { x: OI_HQ.x - 1, z: OI_HQ.z + 3 }, facing: Math.PI, width: 5, aggro: 8, seekRange: 10, order: 'hold', noRout: true, noAI: true, keepMoveOrder: true },
      [{ type: 'ashigaru', n: 10, o: { flagScale: 1 } }, { type: 'gun', n: 3 }]);
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
      if (f.oiwa) { f.guard.visible = side === 'hashiba'; if (f.sakuma) f.sakuma.visible = side === 'sakuma'; }
      else if (side !== 'hashiba' || rt.flags.phase >= 3.5) f.guard.visible = side === 'hashiba';
    }
    for (const f of rt.flags.sakuForest || []) f.visible = side === 'sakuma';
  },
  // 寄せ手の一組（槍・鉄砲）。出所から行き先へ登り、着けば近くを攻める
  wave(rt, name, from, to, list, o = {}) {
    const F = rt.flags;
    const g = enemyGroup(rt, { ...SAKUMA, name, anchor: { ...from }, facing: Math.atan2(to.x - from.x, to.z - from.z), fleeDir: { x: -0.4, z: -1 }, width: 5, morale: 85, dmgMult: o.dmg ?? 0.36, noRout: true, noAI: true,
      order: 'move', dest: { ...to }, speed: o.speed || 3.4, aggro: 8, seekRange: 10 }, list);
    g.onArrive = (q) => { q.order = 'attack'; q.seekRange = o.seek || 18; q.aggro = 14; };
    g.kind4 = o.kind || 'raid'; g.bornT = rt.t; F.groups.push(g);
    return g;
  },
  // ② 佐久間が動く：遠くの柴田の砦で旗が動き、大勢が湖の西の岸を下りて来る。どの砦を狙うかは、まだ分からない
  march(rt) {
    const F = rt.flags, W = rt.world;
    this.enter(rt, 0.8);
    try {
      F.sakuCol = W.addDistantArmy({ x: GYOICHI.x + 40, z: GYOICHI.z + 60, w: 12, d: 30, count: 260, facing: Math.PI * 0.9, armor: 0x2a2420, flagTex: flagTexture(SAKUMA.flag), mon: SAKUMA.flag, seed: 15851, team: 1, kind: 'mixed', host: false, farFill: true });
      rt.after(1, () => { try { F.sakuCol?.moveTo(SAKU_START.x - 20, SAKU_START.z - 70, 70); } catch (e) { /* 遠景 */ } });
    } catch (e) { F.sakuCol = null; }
    rt.army.play('horagai', { x: SAKU_START.x, z: SAKU_START.z - 40 }, 1.0);
    rt.after(0.4, () => rt.say('物見', '行市山の旗が動いた！　……少ない。いや、後ろから続々と下りて来る', 3.4));
    rt.after(4.6, () => rt.say('使番', '佐久間盛政勢、山を下ります！', 3));
    rt.after(8.4, () => rt.say('桑山重晴', 'どの砦を狙うておる。湖の西の岸を見張れ', 3));
    for (const g of [F.saku, F.mori]) if (live(g)) {
      let i = 0;
      const step = (q) => {
        if (F.phase >= 2 || F.ending) { q.onArrive = null; return; }
        if (i >= SAKU_WAY.length) { q.order = 'hold'; q.onArrive = null; return; }
        const [x, z] = SAKU_WAY[i++];
        q.order = 'move'; q.dest = { x: x + (q === F.mori ? -6 : 0), z: z + (q === F.mori ? 6 : 0) }; q.onArrive = step;
      };
      g.speed = 4.6; g.aggro = 0; g.seekRange = 0; g.focus = null; g.march = true;
      for (const u of g.units) u.noTarget = true;   // 行軍の間は遠くを通るだけ（主人公の行き先の坂で斬り合いにしない）
      step(g);
    }
  },
  tickMarch(rt) {
    const F = rt.flags, st = rt.t - F.pt, c = live(F.saku) ? F.saku.center() : null;
    // 賤ヶ岳の真下で東へ折れた時に、狙いが分かる
    if (!F.turned && (c && c.x > -30 && c.z < 236 || st > 70)) {
      F.turned = true;
      rt.say('物見', '東へ折れた……大岩山だ！', 3);
      rt.after(3.2, () => rt.say('桑山重晴', '中川殿が危ない。加勢に走れ！', 2.8));
      rt.after(3.6, () => this.relief(rt));
    }
  },
  // ③ 大岩山へ走る。着く前に戦はもう始まっている（逃げて来る手負い・逆へ走る使番・遠くの鉄砲）
  relief(rt) {
    const F = rt.flags;
    if (F.phase >= 1) return;
    this.enter(rt, 1);
    try { F.sfar?.oiwa?.go?.(); } catch (e) { /* 遠景 */ }
    rt.army.play('gun', { x: OI.x - 20, z: OI.z + 20 }, 1.2);
    // 南の坂から正面の槍が柵へ寄る（主人公が着く前から柵で揉み合う）
    F.wA = this.wave(rt, '佐久間の先手', { x: OI.x - 34, z: OI.z + 18 }, { x: OI.x - 10, z: OI.z + 11 }, foeList(14, { flag: SAKUMA.flag }), { seek: 14 });
    // 手負いの兵が坂を賤ヶ岳へ逃げて来る（主人公の脇を通る）
    F.hurtG = allyGroup(rt, { name: '中川の手負い', fullStrength: true, anchor: { x: 52, z: 168 }, facing: -2.4, width: 3, aggro: 0, seekRange: 0, order: 'move', dest: { ...MOUTH }, speed: 2.2, noAI: true, noRout: true },
      [{ type: 'ashigaru', n: 4, o: { flag: null } }]);
    for (const u of F.hurtG.units) { u.hp = Math.min(u.hp, u.maxHp * 0.4); u.noTarget = true; }
    rt.after(5, () => rt.say('中川の足軽', '大岩山は持たぬ……南の柵に槍が取り付いた！', 3));
    rt.after(14, () => { if (F.phase === 1) rt.say('使番', '桑山様へ！　中川様より、加勢を乞うとの由！', 3); });
  },
  // ④ 南の柵を守る（外の柵が破れ始める）
  south(rt) {
    const F = rt.flags;
    this.enter(rt, 1.3);
    for (const g of [F.naka, F.nakaH]) if (live(g)) { g.anchor = { x: OI_SOUTH.x + (g === F.naka ? 3 : 0), z: OI_SOUTH.z - (g === F.naka ? 3 : 0) }; g.aggro = 10; g.seekRange = 9; }
    rt.say('中川清秀', '来たか！　南の柵じゃ。槍を揃えて押し返せ！', 3);
    rt.after(16, () => { if (F.phase === 1.3 && this.breakOiwa(rt, -0.7, 0.35, 2)) rt.say('中川の家臣', '外の柵が破れた！', 2.4); });
  },
  // ⑤ 西の斜面へ兵を回す（側面の山道から別の手が登る）
  west(rt) {
    const F = rt.flags;
    this.enter(rt, 1.6);
    F.wB = this.wave(rt, '佐久間の別手', { x: OI.x - 40, z: OI.z - 6 }, { x: OI.x - 14, z: OI.z - 1 }, foeList(10, { flag: SAKUMA.flag }), { seek: 14 });
    for (const g of [F.naka, F.nakaH]) if (live(g)) g.anchor = { x: OI_WEST.x + (g === F.naka ? 3 : 0), z: OI_WEST.z };
    rt.say('中川清秀', '西の山道からも登って来るぞ！　兵を回せ！', 3);
    rt.after(14, () => { if (F.phase === 1.6 && this.breakOiwa(rt, -1.5, 0.3, 2)) rt.say('中川の家臣', '南の守りが破られた！　西の柵も揺らいでおる！', 2.8); });
  },
  // ⑥ 中川の本陣へ合わさる（後ろ寄りから鉄砲。小門の脇が破れ、土塁の内に敵）
  hq(rt) {
    const F = rt.flags;
    this.enter(rt, 1.8);
    for (const g of [F.naka, F.nakaH]) if (live(g)) g.anchor = { x: OI_HQ.x, z: OI_HQ.z + (g === F.naka ? 0 : 3) };
    F.wC = this.wave(rt, '佐久間の鉄砲', { x: OI.x + 14, z: OI.z - 38 }, { x: OI.x + 6, z: OI.z - 19 }, [{ type: 'gun', n: 6, o: { flag: SAKUMA.flag } }, { type: 'ashigaru', n: 4, o: { flag: SAKUMA.flag } }], { seek: 12 });
    rt.army.play('gun', { x: OI.x + 10, z: OI.z - 30 }, 1.4);
    rt.say('中川清秀', '後ろの尾根に鉄砲じゃ！　本陣へ寄れ、まとまって守れ！', 3);
    rt.after(10, () => { if (F.phase === 1.8 && this.breakOiwa(rt, 0.35, 0.25, 2)) rt.say('中川の家臣', '小門が破られた！　土塁の内に敵が！', 2.8); });
  },
  // 一瞬「救える」と見せた後、盛政の本隊が入る
  sakuIn(rt) {
    const F = rt.flags;
    if (F.sakuIn) return;
    F.sakuIn = rt.t;
    rt.say('中川清秀', '押し返したか……', 2);
    rt.after(2.4, () => rt.say('中川の家臣', '新手じゃ！　玄蕃の本隊が南の坂を登って参る！', 3));
    rt.after(6, () => { if (live(F.mori)) rt.say('佐久間盛政', '鬼玄蕃はこれにあり。大岩山を揉み潰せ', 3); });
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
    rt.after(3.6, () => rt.say('中川清秀', '振り向くな。賤ヶ岳で生きて槍を振るえ', 3));
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
    // 旗の交替は操作中に起こす。振り返る向きは主人公に任せる。
    rt.after(1.8, () => {
      // 中川の旗が倒れる（長い死のムービーは出さない）
      const f = F.nakaFlag;
      let k = 0;
      const tip = () => { if (!f) return; k = Math.min(1, k + 0.12); f.rotation.z = 1.45 * k * k; if (k < 1) rt.after(0.08, tip); };
      tip();
      for (const u2 of F.naka?.units || []) if (u2.alive && !u2.gone) { u2.invuln = false; rt.army.kill(u2); }
      rt.army.play('toki', { x: OI.x, z: OI.z }, 1.4);
    });
    rt.after(3.2, () => rt.say('使番', '中川瀬兵衛様、討死！', 3));
    rt.after(6.2, () => {
      // 守っていた所が敵の拠点に：大岩山の旗が羽柴から佐久間へ
      this.oiFlags(rt, 'sakuma');
      rt.world.addSmokeColumn?.(OI.x + 3, rt.world.heightAt(OI.x + 3, OI.z - 4) + 5, OI.z - 4, { size: 5, black: true });
      rt.world.addFire(OI.x + 6, OI.z - 6, { size: 2.6, h: 0.3, blackSmoke: true });
      rt.say('桑山重晴', '大岩山に佐久間の旗が上がった……', 2.8);
    });
    rt.after(9.6, () => this.backline(rt));
  },
  // ⑧ 次の守りの線（賤ヶ岳の砦の東の口）まで下がる。岩崎山の高山隊も退き、桑山は残る
  backline(rt) {
    const F = rt.flags;
    if (F.phase >= 2.3) return;
    if (!F.lookedBack) { F.lookedBack = rt.t; this.oiFlags(rt, 'sakuma'); for (const u2 of F.naka?.units || []) if (u2.alive && !u2.gone) { u2.invuln = false; rt.army.kill(u2); } if (F.nakaFlag) F.nakaFlag.rotation.z = 1.45; }
    this.enter(rt, 2.3);
    rt.world.setTime('dusk');
    F.waves = 0;
    try { F.sfar?.oiwa?.rout?.('A', { from: 0, hideAfter: 30, minFight: 1 }); } catch (e) { /* 遠景 */ }
    // 大岩山に入った寄せ手は砦に居座る（後で奪い返す相手）
    for (const g of [F.wA, F.wB, F.wC, F.saku]) if (live(g)) { g.order = 'hold'; g.focus = null; g.onArrive = null; g.anchor = g === F.saku ? { x: OI.x - 6, z: OI.z + 4 } : { x: OI.x + (g === F.wC ? 5 : -3), z: OI.z + (g === F.wA ? 4 : -2) }; g.aggro = 8; g.seekRange = 9; g.kind4 = 'oiwa'; }
    if (live(F.mori)) { F.mori.order = 'move'; F.mori.dest = { x: OI.x - 4, z: OI.z + 2 }; F.mori.onArrive = (q) => { q.order = 'hold'; }; }
    rt.say('桑山重晴', '賤ヶ岳の東の口まで下がれ。退く者を拾え！', 3);
    rt.after(8, () => { if (F.phase === 2.3) { rt.say('使番', '岩崎山の高山様、砦を捨てて退かれまする！', 3); this.oiFlags(rt, 'sakuma'); } });
    rt.after(14, () => { if (F.phase === 2.3) rt.say('桑山重晴', '賤ヶ岳は退かぬ。ここで支えるぞ', 2.8); });
    // 追手が坂を上がって来る（二度）
    const w = (x, z, n) => {
      F.waves++;
      const g = this.wave(rt, '佐久間の追手', { x, z }, { x: MOUTH.x + 5, z: MOUTH.z - 3 }, foeList(n, { flag: SAKUMA.flag }), { seek: 22, speed: 3.4, dmg: 0.26 });
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
    rt.after(10, () => { if (F.phase === 2.3) w(18, 236, 9); });
    rt.after(34, () => { if (F.phase === 2.3) w(4, 250, 9); });
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
    rt.after(0.6, () => rt.say('使番', '秀吉様、お戻りです！　大垣より十三里、北国街道に旗が続いておりまする！', 3.4));
    rt.after(4.6, () => rt.say('桑山重晴', '皆、振り返れ。筑前様の旗じゃ！', 2.8));
    rt.after(8.4, () => rt.say('中川の足軽', '……殿の弔い合戦じゃ', 2.6));
    rt.after(12, () => rt.say('桑山重晴', '東の肩の道へ下り、筑前様を迎えよ', 2.8));
    // 東の口に残った追手は退く
    for (const g of F.groups) if (g.kind4 === 'raid' && live(g)) { g.order = 'retreat'; g.focus = null; g.onArrive = null; g.dest = { x: 40, z: 170 }; g.aggro = 0; g.seekRange = 0; g.kind4 = 'gone'; }
  },
  // ⑩ 大岩山を取り返す：朝に内から守った柵を、今度は外から攻める。朝に破れた所が入口
  retake(rt) {
    const F = rt.flags, W = rt.world;
    this.enter(rt, 3);
    if (!F.oiFell) { F.oiFell = true; this.breakOiwa(rt, -0.7, 0.35, 2); this.breakOiwa(rt, -1.5, 0.3, 2); this.breakOiwa(rt, 0.35, 0.25, 2); this.breakOiwa(rt, -0.35, 0.3, 2); this.oiFlags(rt, 'sakuma'); }
    W.setTime('morning');
    if (F.returnTorches) {
      for (const f of F.returnTorchFires || []) if (W.fires.includes(f)) W.removeFire(f);
      F.returnTorches = null;
      F.returnTorchFires = null;
    }
    rt.banner('四月二十一日　夜明け', '大岩山を取り返せ');
    // 佐久間は急ごしらえで砦を使う：旗だけ替わり、柵は破れたまま。砦の内の守り
    const inFort = [F.wA, F.wB, F.wC].reduce((n, g) => n + nLive(g), 0);
    F.gar = enemyGroup(rt, { ...SAKUMA, name: '大岩山の佐久間勢', anchor: { x: OI.x, z: OI.z + 2 }, facing: 0, fleeDir: { x: -0.3, z: -1 }, width: 5, morale: 85, dmgMult: 0.38, noRout: true, noAI: true, order: 'hold', aggro: 10, seekRange: 12 },
      foeList(Math.max(6, 16 - inFort), { flag: SAKUMA.flag }));
    F.gar.kind4 = 'oiwa'; F.groups.push(F.gar);
    for (const g of [F.saku, F.mori]) if (live(g)) { g.order = 'move'; g.focus = null; g.dest = { x: SAKU_LINE.x + (g === F.mori ? -6 : 0), z: SAKU_LINE.z - (g === F.mori ? 8 : 0) }; g.speed = 3; g.aggro = 0; g.seekRange = 0; g.onArrive = (q) => { q.order = 'hold'; q.aggro = 8; q.seekRange = 10; }; }
    for (const [g, dx, dz] of [[F.yari, -3, 2], [F.uma, 6, 6]]) if (live(g)) {
      g.order = 'move'; g.speed = 3.4; g.dest = { x: OI_GATE.x + dx, z: OI_GATE.z + dz }; g.path = null;
      g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 24; q.aggro = 14; };
    }
    rt.after(2, () => rt.say('羽柴秀吉', '中川の弔い合戦じゃ。大岩山を取り返せ！', 3));
    rt.after(6, () => rt.say('中川の足軽', '南の柵は昨日破れたままじゃ。あそこから入れる！', 3));
    rt.army.play('toki', { ...OI_BACK }, 1.2);
    sfx('taiko', 0.9); sfx('horagai', 0.9);
    sevenSpears(rt, this.ctx(rt), 'oiwa');
  },
  inFortFoes(rt) {
    // 盛政の退く旗本や倒れた負傷兵を、奪還を阻む守備兵に数えない。
    return rt.army.units.reduce((n, u) => n + (u.team === 1 && u.alive && !u.gone && !u.fleeing && !u.noTarget && !u.downed && !u.woundOut && !u.rearWound && !u.isStruct && !u.civ && dist(u.pos, OI) < OI.r + 5 ? 1 : 0), 0);
  },
  // ⑪ 佐久間を押し返す：盛政はすぐ逃げず、大岩山の北で備を立て直して抗う
  pushSaku(rt) {
    const F = rt.flags;
    this.enter(rt, 3.5);
    this.oiFlags(rt, 'hashiba');
    rt.award((t) => t.side.push('大岩山を取り返した'), '大岩山を取り返した');
    rt.army.play('toki', { ...OI }, 1.3);
    rt.say('福島正則', '大岩山、取り返したり！', 2.6);
    rt.after(3.2, () => rt.say('佐久間盛政', '退くな。備を立て直せ。鬼玄蕃の槍はまだ折れぬ', 3));
    if (live(F.saku)) { F.saku.order = 'hold'; F.saku.anchor = { ...SAKU_LINE }; F.saku.aggro = 12; F.saku.seekRange = 16; F.saku.dmgMult = 0.36; F.saku.kind4 = 'saku'; }
    for (const [g, dx, dz] of [[F.yari, -4, 8], [F.uma, 6, 10]]) if (live(g)) {
      g.order = 'move'; g.speed = 3.4; g.dest = { x: SAKU_LINE.x + dx, z: SAKU_LINE.z + dz }; g.path = null;
      g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 26; q.aggro = 14; };
    }
  },
  // 盛政を押し返した備と、湖の北の陸道から茂山へ。主人公が来るまで前田を消さない。
  watchMaeda(rt) {
    this.enter(rt, 3.7);
    rt.say('使番', '茂山の梅鉢が揺れておりまする。湖の北の岸から、前田勢の動きを見届けよ', 3.4);
    this.northMarch(rt, NORTH_SHORE, false);
  },
  northMarch(rt, path, attack) {
    const F = rt.flags;
    F.northPath = path; F.northIx = 0;
    for (const g of [F.yari, F.uma]) if (live(g)) {
      g.focus = null; g.order = 'path'; g.path = path; g.pathIdx = 0; g.speed = 4;
      g.aggro = 3; g.seekRange = 4;
      g.onArrive = (q) => { q.order = attack ? 'attack' : 'hold'; q.aggro = attack ? 14 : 3; q.seekRange = attack ? 28 : 4; };
    }
  },
  // 前田利家の離脱：昔から知る前田の梅鉢の旗が戦の場を離れる
  maedaLeave(rt) {
    const F = rt.flags;
    if (F.maedaGo) return;
    this.withdrawMaeda(rt);
    rt.say('使番', '茂山の前田勢、陣を払うて退きまする！', 3);
    rt.after(3.4, () => rt.say('羽柴秀吉', '又左が退いたか……。柴田と前田まで分かれたな', 3));
    rt.after(7, () => rt.say('佐久間盛政', '前田殿が退いたじゃと……。退け、退け', 3));
    rt.after(9, () => this.pushShibata(rt));
  },
  withdrawMaeda(rt) {
    const F = rt.flags;
    F.maedaGo = rt.t;
    for (const f of F.maedaCampFlags || []) f.visible = false;
    if (live(F.maedaG)) { F.maedaG.order = 'retreat'; F.maedaG.dest = { x: GONGEN.x, z: GONGEN.z - 60 }; F.maedaG.speed = 1.6; }
  },
  // ⑬ 柴田軍の崩れ：前田が退き、佐久間が孤立。柴田の先手と当たる。遠くに勝家
  pushShibata(rt) {
    const F = rt.flags;
    if (F.phase >= 4) return;
    if (!F.maedaGo) this.withdrawMaeda(rt); // 続きから再開する時も、前田隊を茂山へ戻さない。
    this.enter(rt, 4);
    rt.award((t) => { t.special = { label: '大岩山の北で佐久間の備を押し返した', pts: 15 }; }, '佐久間の備を押し返した');
    for (const g of [F.saku, F.mori]) if (live(g)) { g.order = 'retreat'; g.focus = null; g.onArrive = null; g.dest = { x: 20, z: -300 }; g.speed = g === F.mori ? 4 : 2.8; g.kind4 = 'flee'; for (const u of g.units) u.noTarget = true; }
    F.kmG = enemyGroup(rt, { ...SHIBATA, name: '柴田勝家の先手', anchor: { ...SHIBA_FRONT }, facing: 0.1, fleeDir: { x: 0, z: -1 }, width: 6, morale: 92, dmgMult: 0.42, noRout: true, noAI: true, formation: 'line', order: 'hold', aggro: 12, seekRange: 16 },
      [{ type: 'busho', n: 1, o: { name: '毛受勝照', horse: true, flag: SHIBATA.flag } }, { type: 'samurai', n: 3 }, ...foeList(16)]);
    F.kmG.kind4 = 'km'; F.groups.push(F.kmG);
    F.kmU = F.kmG.units.find((u) => u.type === 'busho');
    F.kat = enemyGroup(rt, { ...SHIBATA, name: '柴田勝家の旗本', anchor: { ...KATSUIE }, facing: 0.2, fleeDir: { x: 0, z: -1 }, width: 4, morale: 99, noRout: true, noAI: true, order: 'hold', aggro: 0, seekRange: 0 },
      [{ type: 'busho', n: 1, o: { name: '柴田勝家', invuln: true, horse: true, flag: SHIBATA.flag } }, { type: 'samurai', n: 6, o: { flag: SHIBATA.flag } }]);
    for (const u of F.kat.units) { u.invuln = true; u.noTarget = true; }
    F.kat.kind4 = 'kat'; F.groups.push(F.kat);
    for (const [g, dx, dz] of [[F.yari, -6, 10], [F.uma, 8, 12]]) if (live(g)) {
      g.order = 'move'; g.speed = 3.6; g.dest = { x: SHIBA_FRONT.x + dx, z: SHIBA_FRONT.z + dz }; g.path = null;
      g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 28; q.aggro = 14; };
    }
    this.northMarch(rt, NORTH_BACK, true);
    rt.army.play('horagai', { ...KATSUIE }, 0.9);
    rt.say('使番', '柴田の先手、北国街道より下って参りまする。後ろに修理亮の旗！', 3.2);
    rt.after(4, () => rt.say('羽柴秀吉', '柴田の備を押せ。大軍が崩れるのは今ぞ', 3));
    rt.after(10, () => rt.say('古い足軽', '稲生では柴田の槍に押されたもんじゃが……今はこっちが押しておる', 3.4));
    sevenSpears(rt, this.ctx(rt), 'push');
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v && v.team === 0 && !v.isPlayer && !v.isStruct && !v.civ) F.allyLost = (F.allyLost || 0) + 1;
        if (v && v.team === 1) F.kills++;
    if (v && v === F.kmU && !F.kmBanner) { F.kmBanner = true; rt.banner('毛受勝照、討ち取ったり', ''); }
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending || !F.phase) return;
    const P = rt.player.u;
    F.returnTorches?.update();
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.25;
    const st = rt.t - F.pt, pp = P.pos;
    // 退き切った兵は遠い所でだけ去らせる
    for (const g of F.groups) {
      if (!live(g) || !(g.kind4 === 'flee' || g.kind4 === 'gone') || g.order !== 'retreat') continue;
      for (const u of g.units) if (u.alive && !u.gone && dist(u.pos, pp) > 80) rt.army.despawn(u);
    }
    // 負け：賤ヶ岳の砦の中に敵が六人より多く、味方が一人以下のまま十二秒（下がって守る段）
    if (F.phase === 2.3) {
      const foes = nearCount(rt, 1, FORT, FORT.r + 3), friends = nearCount(rt, 0, FORT, FORT.r + 3);
      F.fortBad = foes >= 6 && friends <= 1 ? F.fortBad + 0.25 : 0;
      if (F.fortBad > 12) { this.lose(rt, '賤ヶ岳の砦を奪われた'); return; }
    }
    const near = (q, r) => dist(pp, q) < r;
    // 同じ砦の中に居続けただけで、西の斜面や本陣まで果たした事にしない。
    if (F.phase === 1.3 && near(OI_SOUTH, 5) || F.phase === 1.6 && near(OI_WEST, 5) || F.phase === 1.8 && near(OI_HQ, 5)) F.reachedPost = F.phase;
    const raidLeft = () => F.groups.reduce((n, g) => n + (g.kind4 === 'raid' && g.bornT >= F.pt ? nLive(g) : 0), 0);
    switch (F.phase) {
      case 0.5: Open.tickOpen(rt, 0.25, this.ctx(rt)); if (F.sawForts) F.saw = true; return;
      case 0.8: this.tickMarch(rt); return;
      // 大岩山へ着くまで（時だけでは進まない）
      case 1: if (near(OI_GATE, 16) || near(OI, OI.r + 8)) this.south(rt); return;
      // 南の柵：正面の槍を崩すか、柵で一分揉み合えば西へ
      case 1.3: if (F.reachedPost === F.phase && near(OI, OI.r + 6) && st > 20 && (nLive(F.wA) <= 4 || st > 70)) this.west(rt); return;
      case 1.6: if (F.reachedPost === F.phase && near(OI, OI.r + 6) && st > 18 && (nLive(F.wB) <= 3 || st > 60)) this.hq(rt); return;
      case 1.8:
        if (!F.sakuIn && (nLive(F.wC) <= 3 || st > 35)) this.sakuIn(rt);
        if (F.reachedPost === F.phase && F.sakuIn && rt.t - F.sakuIn > 22 && near(OI, OI.r + 8)) this.fall(rt);
        return;
      // 退く：大岩山から三十ほど離れたら振り返る
      case 2:
        if (!F.lookedBack && st > 4 && (dist(pp, OI) > 30 || near(OI_BACK, 10))) this.lookBack(rt);
        else if (!F.lookedBack && st > 70) this.lookBack(rt);
        return;
      // 東の口：二度の追手を退け（口で揉み合うか追手を減らす）、口にいれば帰還へ
      case 2.3:
        if (!F.mouthFight && near(MOUTH, 22) && nearCount(rt, 1, MOUTH, 30) > 0) F.mouthFight = true;
        // 口の外で味方が追手を全て退けた時も、到着した主人公を待たせ続けない。
        if (F.waves >= 2 && near(MOUTH, 22) && st > 50 && (raidLeft() === 0 || F.mouthFight && (raidLeft() <= 4 || st > 110))) this.returnHide(rt);
        return;
      case 2.6: {
        const came = F.hideArrived;
        // 夜の光へ移る四十五秒と、秀吉本人の到着を待って迎える。
        if (near(JOIN, 14) && came && st > 45) { if (!F.metHide) { F.metHide = true; rt.say('羽柴秀吉', 'よう生きて戻った。玄蕃め、深入りしおったわ', 3); rt.after(3.4, () => this.retake(rt)); } }
        return;
      }
      case 3:
        if (near(OI, OI.r + 4) && this.inFortFoes(rt) <= 3 && st > 15) this.pushSaku(rt);
        return;
      case 3.5:
        if (!F.maedaGo && near(SAKU_LINE, 30) && (nLive(F.saku) <= 14 || st > 100)) this.watchMaeda(rt);
        return;
      case 3.7:
        if (!F.maedaGo && near(MAEDA_LOOK, 18)) this.maedaLeave(rt);
        return;
      case 4:
        if (F.katOut) { if (rt.t - F.katOut > 6) this.win(rt); return; }
        // 主人公だけが先着した時は、備が追いつくまで総崩れにしない。
        if (near(SHIBA_FRONT, 30) && nearCount(rt, 0, SHIBA_FRONT, 35) >= 4 && st > 25 && (nLive(F.kmG) <= 4 || st > 130)) {
          F.katOut = rt.t;
          rt.say('柴田勝家', '……退け。北ノ庄へ退け', 3);
          rt.after(3.2, () => rt.say('羽柴秀吉', '深追いはならぬ。勝家は北ノ庄で詰める', 3));
          for (const g of [F.kat, F.kmG]) if (live(g)) { g.order = 'retreat'; g.focus = null; g.onArrive = null; g.dest = { x: g.center().x, z: -330 }; g.speed = 2.6; g.kind4 = 'flee'; for (const u of g.units) u.noTarget = true; }
          for (const g of [F.yari, F.uma]) if (live(g)) { g.order = 'hold'; g.anchor = { x: g.center().x, z: g.center().z }; g.focus = null; g.onArrive = null; }
        }
        return;
    }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objDone('s' + stageIx(F.phase));
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '大岩山を取り返し、柴田軍を崩した', pts: 20 }; }, '柴田軍を崩した');
    rt.player.u.invuln = true;
    for (const g of F.groups) if (live(g) && g.units[0]?.team === 1) { g.order = 'retreat'; g.dest = { x: g.center().x, z: -300 }; g.speed = 3.4; }
    victoryMoment(rt, '勝');
    // 勝鬨の間も操作した向きを保ち、大岩山は自分で振り返って見られる。
    const sec = epilogue(rt, this.ctx(rt));
    rt.finish({ scriptedEnd: true }, sec);
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

  // bot：近い敵を突き、いなければ段の行き先へ（砦の柵は口を通る）
  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    if (F.holdPlayer || F.ending || !u.alive) return;
    const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 4;
    const prev = p.botStrikeFoe;
    const e = F.phase === 2 || F.phase === 3.7 ? null
      : prev?.alive && ok(prev) && p.botStrikeUntil > p.time && dist(prev.pos, u.pos) < 2.8 ? prev : b.army.nearestEnemy(u, 9, ok);
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
        goTo(p, inp, x, z, 2); return;
      }
    }
    const q = b.def.missionPin(b);
    if (!q) return;
    for (const [C, R, ga] of [[FORT, FORT.r, Math.PI / 2], [OI, OI.r, OI_GA]]) {
      const w = fortWay(u.pos, q, C, R, ga);
      if (w) { goTo(p, inp, w.x, w.z, 1.5); return; }
    }
    goTo(p, inp, q.x, q.z, 2);
  },
};

t02_shizugatake.sides = { a: { name: '羽柴軍', mon: HASHIBA }, b: { name: '柴田軍', mon: SHIBATA.flag } };
// 兵の数：柴田方およそ三万・羽柴方は集まった後でおよそ五万（docs/battle_refs/t02_shizugatake.md）
//   11/6 十二1：羽柴方も討たれた味方の数で減る（棒が動かないと形勢が見えない）。一人を四十人ほどの備の損に見立てる
t02_shizugatake.force = (rt) => {
  // 無傷の落ち武者も夜に場から去ると alive=false になるため、討死の知らせで数える。
  const lost = rt.flags.allyLost || 0;
  return { a: Math.max(0, 50000 - lost * 40), a0: 50000, b: Math.max(0, 30000 - (rt.flags.kills || 0) * 40), b0: 30000 };
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
  return P === 1.3 ? downTo([F.wA], 4) : P === 1.6 ? downTo([F.wB], 3) : P === 1.8 ? downTo([F.wC], 3) : P === 3.5 ? downTo([F.saku], 14) : P === 4 ? downTo([F.kmG], 4) : null;
};
withGuard(t02_shizugatake);

export { t02_shizugatake };
