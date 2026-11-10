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
import { nobori, kagaribi, village, yagura } from './props.js';
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
import { nightTurn, sevenSpears, epilogue, tickMeet, nightRaidLeft } from './t02_shizugatake/turn.js';
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
// 救援・守備・夜討ちで同じ戦力を数える。倒れた負傷兵を探し回らせない。
const nLive = nightRaidLeft;
// 逃げた兵・戦えなくなった兵を、まだ道を塞ぐ殿として数えない。
const shoreLeft = (groups) => (groups || []).reduce((n, g) => n + (g.routed || g.order === 'retreat' ? 0 : g.units.reduce((s, u) => s + (u.alive && !u.gone && !u.fleeing && !u.noTarget && !u.downed && !u.woundOut && !u.rearWound ? 1 : 0), 0)), 0);
const nearCount = (rt, team, p, r) => rt.army.units.reduce((n, u) => n + (u.alive && !u.gone && u.team === team && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < r ? 1 : 0), 0);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const MOUTH = { x: FORT.x + FORT.r + 4, z: FORT.z };     // 賤ヶ岳の砦の東の口（柵の切れ目）
const DAWN_AT = { x: -82, z: 256 };                      // 夜明けに主人公が立つ所（砦の西の肩。切通しの口まで三十五歩ほど）
// 目標（goals5.js が並べる。段の一行は場所と行い。四つの段だけ。「敵を何人討つ」で埋めない・stageGoalsOnly。携帯の横で一行に収まる長さ）
// 11/5 check60：844 の横で九字ほどで二行に折れた（写真）。九字までに縮める
// 11/6 critic60（十1・三1）：だれを討つ・だれを追うかを書く。夜の美濃大返しも段にする（本陣で秀吉を迎える）
const STAGE_TEXT = ['東の物見で余呉湖の砦の並びを見る', '大岩山の中川殿へ加勢に下る', '砦の東の口を守る', '東の肩の道で秀吉の先手を迎える', '賤ヶ岳本陣で秀吉を迎える', '飯浦の切通しで勝政を討つ', '余呉湖西岸で柴田勢を茂山へ追う'];
const STAGE_PLACE = ['東の物見', '大岩山の坂', '砦の東の口', '東の肩の道', '賤ヶ岳本陣', '飯浦の切通し', '茂山'];
const STAGE_AT = [0.5, 1, 2, 2.3, 2.5, 3, 4];
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
html:root body #hud#hud#hud.shizu-goals[data-shizu-window="0"] #h-prog#h-prog.goal-mode .pg-goals li:nth-child(n+6),
html:root body #hud#hud#hud.shizu-goals[data-shizu-window="1"] #h-prog#h-prog.goal-mode .pg-goals li:first-child,
html:root body #hud#hud#hud.shizu-goals[data-shizu-window="1"] #h-prog#h-prog.goal-mode .pg-goals li:nth-child(n+7),
html:root body #hud#hud#hud.shizu-goals[data-shizu-window="2"] #h-prog#h-prog.goal-mode .pg-goals li:nth-child(-n+2) { display:none !important; }
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

const t02_shizugatake = {
  // 七段と夜明けの移りを、実際の入口から順に作り直す。
  checkpointStep: (rt) => rt.flags.phase,
  resumeSteps: [
    [0.5, function (rt) { rt.flags.holdPlayer = false; Open.startOpen(rt, this.ctx(rt)); }],
    [1, function (rt) { Open.startRelief(rt, this.ctx(rt)); }],
    [2, 'phase2'], [2.3, 'night'], [2.5, 'meetDone'], [2.8, 'dawn'], [3, 'phase3'], [4, 'phase4'],
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
  missionHeading: (rt) => { const i = stageIx(rt.flags.phase); return '①②③④⑤⑥⑦'[i] + STAGE_TEXT[i]; },
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
  introText: () => '柴田勝家と羽柴秀吉が、余呉湖のまわりの砦で睨み合う。秀吉は大垣にいる。賤ヶ岳の東の物見から、湖を挟む砦の並びを見届けよ。',
  minutes: 15,
  expectMin: 15,             // 進み具合の棒は十五分で（11/8 夜）
  depth: T02_DEPTH,           // 軍勢の厚み・陣立て（t02_shizugatake/depth.js）
  lethal: { max: 2, firstAt: 200, gap: 120 },   // 命懸けの戦場（docs/lethal_howto.md）
  fearKind: { kind: 'fort_raid', note: '砦が急襲され、大岩山が落ちる', w: { losses: 1.2, honjin: 1.3, iso: 1.3 }, line: '砦が危ない！' },
  spawn: { x: START.x, z: START.z, heading: Math.atan2(LOOK.x - START.x, LOOK.z - START.z) },
  // 物見へ下りる間は、目線を余呉湖の向こうの燃える大岩山へ上げる（坂の法と杉だけを写さない。共通の口）
  camLookAt: (rt) => (rt.flags.phase <= 1 && !rt.flags.saw ? { x: OIWA.x, z: OIWA.z + 30, up: 2 } : null),
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
    paths: [{ pts: KAIDO, w: 3.5 }, { pts: CUT, w: 2.5 }, { pts: UPHILL, w: 2.5 }, { pts: SHORE_W, w: 2.5 }],
    clear: (x, z) => Math.hypot(x - FORT.x, z - FORT.z) < FORT.r + 6 || distToPolyline(x, z, KAIDO) < 6 || distToPolyline(x, z, CUT) < 4
      || distToPolyline(x, z, SHORE_W) < 5 || distToPolyline(x, z, UPHILL) < 4 || dist({ x, z }, KINOMOTO) < 22 || distToPolyline(x, z, [[FORT.x, FORT.z], [LOOK.x, LOOK.z], [26, 218]]) < 9
      || distToPolyline(x, z, [[FORT.x, FORT.z], [DAWN_AT.x, DAWN_AT.z], [KATSUMASA.x, KATSUMASA.z]]) < 8
      // 11/6 九度目：物見の目の前の杉で、燃える大岩山が隠れた。物見から大岩山へ七十歩の目通しを空ける
      || distToPolyline(x, z, [[LOOK.x, LOOK.z], [LOOK.x + (OIWA.x - LOOK.x) * 0.4, LOOK.z + (OIWA.z - LOOK.z) * 0.4]]) < 10,
    trees: 1300, tufts: 2600,
    // 山は杉と雑木、湖と川の低い田（余呉川の谷・木ノ本）は木を置かない
    // 11/6 critic60（二1・八3）：④の岸の道から余呉湖が見えるよう、岸の道の両脇は木を置かない
    //   11/6 九度目（描いて遊んだ）：岸の道と湖の間の杉で、⑤の岸から湖が一度も見えなかった。道から湖までの西の帯は木を置かない
    treeDensity: (x, z) => (inLakeBox(x, z) && lakeAt(x, z) > 0.05 ? 0 : distToPolyline(x, z, SHORE_W) < 13 ? 0
      : x < LAKE.x - 40 && z < 215 && z > 0 && Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz) < 1.45 && x > distX(z) ? 0 : height(x, z) < 0.5 ? 0 : height(x, z) < toY(128) ? 0.08 : 1.15),
    groves: [{ x: -92, z: 318, r: 14, n: 22, kind: 'sugi' }, { x: 60, z: 120, r: 14, n: 20 }],
    fleeOut: (x, z, team) => team === 1 && z < -120,
  },

  // 行き先は段ごとに一つの決まった場所（kaito AW3「目標の場所は固定」）
  missionPin(rt) {
    const F = rt.flags, q = F.pin || (F.pin = { x: 0, z: 0, r: 6, hide: 6 });
    if (!rt.player.u.alive || F.ending) return null;
    // 開始の下知を待つ間と夜明けの六秒も、次に歩く場所の印を途切れさせない。
    const phase = F.phase === 0 ? 0.5 : F.phase === 2.8 ? 3 : F.phase;
    const P = phase === 0.5 ? LOOK : phase === 1 ? Open.RELIEF : phase === 2 ? MOUTH : phase === 2.3 ? JOIN : phase === 2.5 ? HONJIN : phase === 3 ? KATSUMASA : phase === 4 ? SHIGE : null;
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
    F.fallenFortFlags = [];
    for (const [p, k] of flags) for (const [dx, dz] of [[0, 0], [-5, 3], [5, 3]]) {
      const guard = nobori(W, p.x + dx, p.z + dz, k, 7);
      rt.scene.add(guard);
      if (p === OIWA || p === IWASAKI) {
        // 陥落前は羽柴方、陥落後は占領した佐久間の幟。燃える砦に守備側の旗を残さない。
        const sakuma = nobori(W, p.x + dx, p.z + dz, SAKUMA.flag, 7);
        sakuma.visible = false; rt.scene.add(sakuma);
        F.fallenFortFlags.push({ guard, sakuma });
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
    F.saku = enemyGroup(rt, { ...SAKUMA, name: '佐久間盛政の本隊', anchor: { x: OIWA.x - 4, z: OIWA.z - 70 }, facing: Math.PI * 0.85, fleeDir: { x: -0.3, z: -1 }, width: 8, morale: 90,
      order: 'hold', aggro: 0, seekRange: 0, noAI: true, noRout: true, dmgMult: 0.4 },
    [{ type: 'samurai', n: 4, o: { flag: SAKUMA.flag } }, ...foeList(26, { flag: SAKUMA.flag })]);
    F.saku.kind4 = 'main'; F.groups.push(F.saku);
    // 11/7 critic60（五2・十三3「盛政が一度も見えない」）：盛政と旗本二騎は本隊の前の小さな組。①で物見の下（四十ほど）まで馬を進め、
    //   名と姿を見せて下知する（討てない・打ちかからない）。後の段は本隊と一緒に動く
    F.mori = enemyGroup(rt, { ...SAKUMA, name: '佐久間盛政の旗本', anchor: { x: OIWA.x + 2, z: OIWA.z - 62 }, facing: Math.PI * 0.85, fleeDir: { x: -0.3, z: -1 }, width: 3, morale: 99,
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
    rt.after(1.2, () => { F.holdPlayer = false; Open.startOpen(rt, this.ctx(rt)); });
  },

  // 段の中身（t02_shizugatake/*.js）へ渡す道具
  ctx(rt) {
    const F = rt.flags;
    return { TEXT: STAGE_TEXT, LOOK, OIWA, MOUTH, KATSUMASA, SAKUMA, JOIN, foeList, live, nLive, burn: (r) => this.burnOiwa(r),
      next: () => (F.phase === 0.5 ? Open.startRelief(rt, this.ctx(rt)) : F.phase === 2.3 ? this.meetDone(rt) : this.phase2(rt)) };
  },
  // 夜の先手を迎えた：本陣で秀吉を迎える段へ
  meetDone(rt) {
    const F = rt.flags;
    F.phase = 2.5; F.pt = rt.t;
    rt.objDone('s2m');
    rt.award((t) => t.side.push('夜討ちを払い、秀吉の先手を迎えた'), '夜討ちを払った');
    rt.obj('s2n', ST(2.5), 'main');
  },
  // 大岩山と岩崎山が燃える（②で盛政が落とす）
  burnOiwa(rt) {
    const W = rt.world;
    for (const { guard, sakuma } of rt.flags.fallenFortFlags || []) { guard.visible = false; sakuma.visible = true; }
    for (const f of rt.flags.sakuForest || []) f.visible = true;
    for (const p of [OIWA, IWASAKI]) {
      // 11/6 critic60（十一4）：物見から見えない。燃える砦の火を大きく、黒い煙の柱を三本（大岩山は余呉湖の向こう一里の近さ）
      W.addFire(p.x, p.z, { size: 4.5, h: 0.4, blackSmoke: true });
      W.addFire(p.x + 6, p.z - 4, { size: 3.2, h: 0.3, blackSmoke: true });
      // 11/6 九度目（1600×900 で物見から撮った）：太さ 4 の柱は百八十歩先で靄に溶けて見えなかった。砦一つを焼く煙は山の上へ高く太く上がる
      for (const [dx, dz, sz] of [[3, 0, 7], [-5, 6, 6], [8, -6, 5.5]]) W.addSmokeColumn?.(p.x + dx, W.heightAt(p.x + dx, p.z + dz) + 6, p.z + dz, { size: sz, black: true });
    }
  },
  // ② 砦の東の口で、湖の南の岸から上がる盛政の手を防ぐ。桑山は退こうとし、丹羽長秀が飯浦から来る
  phase2(rt) {
    const F = rt.flags;
    rt.objDone('s1');
    rt.award((t) => t.side.push('中川の兵を落ちのびさせた'), '佐久間の追手を討った');
    if (!F.oiwaFell) { F.oiwaFell = true; this.burnOiwa(rt); }
    F.phase = 2; F.pt = rt.t; F.k0 = F.kills; F.waves = 0;
    // 追手の到着時の攻撃命令を消し、退いた先で再び襲いかからせない。
    if (live(F.chaseG)) { F.chaseG.order = 'retreat'; F.chaseG.focus = null; F.chaseG.onArrive = null; F.chaseG.aggro = 0; F.chaseG.seekRange = 0; F.chaseG.dest = { x: 30, z: 200 }; F.chaseG.speed = 2.6; F.chaseG.kind4 = 'gone'; }
    rt.after(0.6, () => rt.say('中川の家臣', '佐久間の勢、すぐそこまで迫っておりまする！', 3));
    rt.after(4.2, () => rt.say('桑山重晴', 'この砦の兵では支えきれぬ。退くか……', 3));
    rt.after(7.8, () => rt.say('丹羽長秀', '船で湖を渡って参った。賤ヶ岳を捨ててはならぬ。東の口を固めよ', 3.4));
    rt.obj('s2', ST(2), 'main');
    // 盛政の本隊は大岩山から湖の南東の岸へ寄せ、そこから手を出す（寄せ手の出所が見える）
    F.saku.order = 'move'; F.saku.dest = { x: -6, z: 214 }; F.saku.speed = 2; F.saku.onArrive = (q) => { q.order = 'hold'; };
    rt.after(8, () => { if (live(F.mori)) { F.mori.order = 'move'; F.mori.dest = { x: 2, z: 222 }; F.mori.speed = 2; F.mori.onArrive = (q) => { q.order = 'hold'; }; } });
    // 丹羽長秀の隊（二千ほど）：飯浦の切通しを上がって砦の西へ
    F.niwaG = allyGroup(rt, { name: '丹羽長秀の隊', fullStrength: true, anchor: { x: -118, z: 268 }, facing: 0.6, width: 5, aggro: 6, order: 'move', dest: { x: MOUTH.x - 8, z: MOUTH.z - 15 }, speed: 2.6, noAI: true, noRout: true },   // 東の口の北の脇（柵の外。口は東だけ）
    // 11/6 九2（描いて遊んだ）：丹羽の隊と物見の組が口から 30 も前へ出て寄せ手を止め、東の口で守る主人公が寄せ手と一度しか当たらなかった。口の脇で構え、口へ来た寄せ手と組む
      [{ type: 'busho', n: 1, o: { name: '丹羽長秀', invuln: true, horse: true, flag: NIWA } }, { type: 'samurai', n: 3, o: { flag: NIWA } }, { type: 'ashigaru', n: 9, o: { flag: NIWA, flagScale: 1 } }, { type: 'gun', n: 3, o: { flag: NIWA } }]);
    F.niwaG.onArrive = (q) => { q.order = 'hold'; q.aggro = 6; q.seekRange = 7; };
    // 物見の組も東の口へ戻って並ぶ
    // 名のない物見の組は共通の判断で七十歩先へ打って出る。段の下知を優先し、口を空けない。
    if (live(F.scoutG)) { F.scoutG.noAI = true; F.scoutG.order = 'move'; F.scoutG.dest = { x: MOUTH.x - 2, z: MOUTH.z - 6 }; F.scoutG.onArrive = (q) => { q.order = 'hold'; q.aggro = 6; q.seekRange = 7; }; }
    // 寄せ手は東の口へ向かって登る（北と北東から。三度）
    const wave = (x, z, n) => {
      const g = enemyGroup(rt, { ...SAKUMA, name: '佐久間の手', anchor: { x, z }, facing: Math.atan2(MOUTH.x - x, MOUTH.z - z), fleeDir: { x: 0, z: -1 }, width: 5, morale: 90, noRout: true, noAI: true, keepMoveOrder: true, dmgMult: 0.45,   // 11/6 九2：士気 75 では柵の鉄砲で口の 40 手前で崩れ、口へ来なかった
       
        order: 'move', dest: { x: (LOOK.x + MOUTH.x) / 2 + 2, z: (LOOK.z + MOUTH.z) / 2 }, seekRange: 5, aggro: 4, speed: 3.6 }, foeList(n, { flag: SAKUMA.flag }));
      //   11/6 九2：口の真北の急な法を真っすぐ登らせると、口の 40 手前で登れずに止まった。物見の肩の尾根（主人公が下りた道）を登って東の口へ
      //   11/6 九度目（描いて遊んだ）：道（order 'path'）は列の尻を待って止まり、寄せ手が口の 30〜40 下に二分留まって、口の主人公は柵と坂だけを見て棒立ちだった。
      //   尾根の中ほどまで駆け上がり、そこから口へ。着けば斬りかかる。生まれて二十秒を過ぎても口へ来なければ、update が口へ打ちかからせる
      g.bornT = rt.t;
      g.onArrive = (q) => { q.dest = { x: MOUTH.x + 3, z: MOUTH.z }; q.onArrive = (r) => { r.order = 'attack'; r.seekRange = 24; r.aggro = 14; }; };
      g.kind4 = 'raid'; F.groups.push(g); F.waves++;
      rt.army.play('toki', { x, z }, 1.1);
      sfx('horagai', 0.7);   // 11/8 critic60 賤ヶ岳（六3）：三度の寄せごとに寄せ手の法螺を鳴らす（鬨の声と合わせる）
    };
    // 11/4 jin：盛政の勢は賤ヶ岳の手の数倍（八千対千ほど）。寄せ手を厚くし、桑山が退きかけた苦しさを出す（AQ10）
    // 11/6 critic60（九2・三2）：寄せ手が口へ来るまで百二十秒かかり、主人公が棒立ちだった。物見の肩（口まで五十歩）から三度登って来る
    rt.after(12, () => { if (F.phase === 2) wave(-6, 262, 16); });
    //   11/6 九度目：寄せ手が口まで来るようにした後、②が二百二十秒続き、戦が九分を超えた。三度の間を二十秒に詰める
    rt.after(34, () => { if (F.phase === 2) wave(-2, 256, 16); });
    rt.after(56, () => { if (F.phase === 2) wave(-10, 252, 18); });
  },
  // 11/6 critic60（二6・四6）：夜を飛ばさない。二十日の夜、木ノ本から賤ヶ岳へ上がる松明の列（美濃大返し）を見せ、主人公は本陣で秀吉を迎える
  night(rt) {
    const F = rt.flags, W = rt.world;
    if (F.phase !== 2) return;
    F.phase = 2.3; F.pt = rt.t;
    rt.objDone('s2');
    rt.award((t) => t.side.push('賤ヶ岳の砦を守り通した'), '賤ヶ岳の砦を守った');
    // 夜になった瞬間に目の前の兵を消さず、下知で坂を下る。古い到着命令で攻撃に戻さない。
    for (const g of F.groups) if (g !== F.saku && g !== F.mori && g !== F.maedaG && live(g)) {
      g.order = 'retreat'; g.focus = null; g.onArrive = null; g.path = null;
      g.dest = { x: 30, z: 180 }; g.speed = 3; g.aggro = 0; g.seekRange = 0;
      g.kind4 = 'gone'; g.nightWithdraw = true;
    }
    // 落ち武者は既に砦へ逃げ込んだ味方。消さずに砦の守りへ残す。
    if (live(F.nakaG)) { F.nakaG.order = 'move'; F.nakaG.focus = null; F.nakaG.onArrive = (q) => { q.order = 'hold'; }; F.nakaG.dest = { x: FORT.x, z: FORT.z }; }
    W.setTime('night', true);
    rt.banner('四月二十日　夜', '大垣から筑前様の本隊が戻る');
    rt.obj('s2m', ST(2.3), 'main');
    // 木ノ本から賤ヶ岳の東の肩へ上がる道に、松明の列（道々の村が焚いた火）
    for (let i = 0; i < 7; i++) { const q = UPHILL[Math.min(UPHILL.length - 1, i >> 1)], r = UPHILL[Math.min(UPHILL.length - 1, (i >> 1) + 1)], k = (i & 1) * 0.5;
      W.addFire(q[0] + (r[0] - q[0]) * k + 2, q[1] + (r[1] - q[1]) * k + 2, { torch: true, smoke: false }); }
    for (const [x, z] of [[200, 200], [190, 160], [176, 120], [222, 250]]) W.addFire(x, z, { torch: true, smoke: false });
    // 秀吉の本陣（砦の中に陣幕・床几）。総大将は前に出ず、旗本の侍に守られる
    KIT.honjin(rt, FORT.x - 3, FORT.z + 3, { mon: HASHIBA, people: false, fire: false, w: 12, d: 9, noUma: true });   // fix4：金扇は家康の馬印。秀吉の馬印は立てない
    F.hide = allyGroup(rt, { name: '羽柴秀吉の旗本', fullStrength: true, anchor: { x: FORT.x - 3, z: FORT.z + 2 }, facing: 1.6, width: 5, aggro: 4, seekRange: 6, order: 'hold', noRout: true, fixed: true },
      [{ type: 'busho', n: 1, o: { name: '羽柴秀吉', invuln: true, horse: false } }, { type: 'samurai', n: 10, o: { keep: true } }, { type: 'ashigaru', n: 4, o: { flagScale: 1, keep: true } }, { type: 'gun', n: 3, o: { keep: true } }]);
    F.hide.honjin = true;
    for (const u of F.hide.units) { u.invuln = true; u.noTarget = true; }
    F.hideU = F.hide.units.find((u) => u.type === 'busho');
    if (F.hideU) F.hideU._crouch = true;
    // 大返しで着いた小姓衆と先手が、松明の道を上がって砦の西の肩に陣を取る（主人公の目の前を通る）
    F.yari = allyGroup(rt, { name: '秀吉の小姓衆', fullStrength: true, anchor: { x: UPHILL[3][0] - 4, z: UPHILL[3][1] + 2 }, facing: -1.6, width: 4, aggro: 6, speed: 4.6, order: 'move', dest: { x: DAWN_AT.x + 8, z: DAWN_AT.z + 10 }, noRout: true },
      [...KOSHO.map((name) => ({ type: 'samurai', n: 1, o: { name, invuln: true, horse: true, flag: HASHIBA } })), { type: 'ashigaru', n: 10 }, { type: 'gun', n: 2 }]);   // 名のある者は馬上（AY7）
    F.uma = allyGroup(rt, { name: '羽柴の先手', fullStrength: true, anchor: { x: UPHILL[2][0], z: UPHILL[2][1] }, facing: -1.6, width: 5, aggro: 6, speed: 4.4, order: 'move', dest: { x: DAWN_AT.x + 22, z: DAWN_AT.z + 18 }, noRout: true },
      [{ type: 'samurai', n: 5 }, { type: 'ashigaru', n: 20 }, { type: 'gun', n: 6 }, { type: 'bow', n: 2 }]);   // 秀吉の本隊は一万五千ほど。殿の勝政より厚く（AQ10）
    for (const g of [F.yari, F.uma]) {
      // 帰還・反攻の持ち場は段が指揮する。共通の回り込みで道の途中に留めない。
      g.noAI = true; g.keepMoveOrder = true;
      g.onArrive = (q) => { q.order = 'hold'; };
    }
    rt.after(1.2, () => rt.say('使番', '筑前様、大垣より十三里を駆け戻られた。木ノ本の道に松明が続いておる', 3.2));
    rt.after(5.2, () => rt.say('桑山重晴', '東の肩の道へ下り、上って来る筑前様の先手を迎えよ', 2.8));
    nightTurn(rt, this.ctx(rt));   // 羽柴の大軍の列・盛政が退けの命に従わない（t02_shizugatake/turn.js）
  },
  // 夜（美濃大返し）から二十一日の夜明けへ。真ん中に次の目標を出す。
  // 11/5 check60（標準 二6・BO9）：主人公も味方も瞬時に移さない。砦の東の口から、着いた本隊と一緒に西の肩を通って切通しの口へ歩く（約百歩）
  dawn(rt) {
    const F = rt.flags, W = rt.world;
    if (F.phase !== 2.5) return;
    F.phase = 2.8;
    rt.objDone('s2n');
    rt.say('羽柴秀吉', 'よう守った。夜が明けたら玄蕃を追うぞ', 3);
    W.setTime('morning');   // 夜から朝へ二十秒ほどで白む（world_weather の移ろい）
    rt.banner('四月二十一日　夜明け', '切通しの口の柴田勝政を討て');
    // 殿：柴田勝政（三千ほど。切通しの口で踏みとどまる）
    F.kmG = enemyGroup(rt, { ...SHIBATA, name: '柴田勝政の殿', anchor: { ...KATSUMASA }, facing: 0.7, fleeDir: { x: -0.3, z: -1 }, width: 6, morale: 95, dmgMult: 0.5,
      noRout: true, noAI: true, formation: 'line', order: 'hold', aggro: 14, fixed: true },
    [{ type: 'busho', n: 1, o: { name: '柴田勝政', hat: 'kabuto_m', horse: true, flag: SHIBATA.flag } }, { type: 'samurai', n: 3 }, ...foeList(20)]);
    F.kmG.kind4 = 'km'; F.groups.push(F.kmG);
    F.kmU = F.kmG.units.find((u) => u.type === 'busho');
    if (F.kmU) F.kmU.maxHp = F.kmU.hp = 110;
    // 盛政の本隊は湖の西の岸を北へ退く（盛政は落ちのびる＝討てない）。後ろの一隊が岸の道を塞ぐ
    // 湖の南を回って西岸へ歩く。夜明けに隊を置き直すと、見えていた盛政が突然消えていた。
    for (const g of [F.saku, F.mori]) if (live(g)) {
      const way = [[-8, 236], [-60, 236], ...SHORE_W];
      let i = 0;
      const next = (q) => {
        if (F.phase >= 4 || F.ending) { q.onArrive = null; return; }
        if (i >= way.length) { q.order = 'retreat'; q.dest = { ...SHIGE }; q.onArrive = null; return; }
        const [x, z] = way[i++];
        q.order = 'move'; q.dest = { x, z }; q.onArrive = next;
      };
      g.kind4 = 'flee'; g.aggro = 0; g.seekRange = 0; g.focus = null; g.speed = g === F.mori ? 3.6 : 2.6;
      next(g);
    }
    F.mmG = enemyGroup(rt, { ...SAKUMA, name: '佐久間盛政の後備', anchor: { x: SHORE_W[1][0], z: SHORE_W[1][1] }, facing: 2.6, fleeDir: { x: -0.3, z: -1 }, width: 5, morale: 70, dmgMult: 0.4,
      order: 'retreat', dest: { ...SHIGE }, speed: 0.6, aggro: 0 }, foeList(14, { flag: SAKUMA.flag }));
    F.mmG.kind4 = 'flee'; F.groups.push(F.mmG);
    rt.after(4.0, () => rt.say('羽柴秀吉', '玄蕃は退くぞ。まず切通しの口の殿を破れ', 3.2));
    // 11/6 時代考証：この日の一番槍は福島正則（一番槍・一番首で五千石。ほかの衆は三千石）。清正に言わせない
    rt.after(7.6, () => rt.say('福島正則', '一番槍は、それがしが仕る', 2.6));   // fix4：小姓が主の前で「わし」と言わない
    rt.after(6, () => this.phase3(rt));
  },
  // ③ 飯浦の切通しの口で、殿の柴田勝政を討つ。味方の隊も皆、口へかかる
  phase3(rt) {
    const F = rt.flags;
    F.phase = 3; F.pt = rt.t; F.k0 = F.kills;
    rt.obj('s3', ST(3), 'main');   // 11/6 八度目：五つの段にした後も③が「本陣で秀吉を迎える」のまま出ていた
    // 砦の北西の肩から、皆が主人公と同じほどの速さで切通しの口へ下りる（味方の隊は主人公が先へ出れば駆け足で追う・army_groups）
    // 11/6 critic60（一2）：丹羽長秀は二千を率いる大将。切通しの斬り合いには入らず、隊は砦の西の肩に二線として控える
    if (live(F.niwaG)) { F.niwaG.order = 'move'; F.niwaG.dest = { x: DAWN_AT.x + 4, z: DAWN_AT.z + 14 }; F.niwaG.speed = 3; F.niwaG.aggro = 2; F.niwaG.seekRange = 4; F.niwaG.onArrive = (q) => { q.order = 'hold'; q.aggro = 2; q.seekRange = 4; }; }   // 11/8：控えの二線は寄って来た敵だけを受け、口の斬り合いへ出て行かない
    for (const [g, sp, dx, dz] of [[F.yari, 3.4, 4, 8], [F.uma, 3.2, 10, 12], [F.scoutG, 3.0, 12, 4]]) if (live(g)) {
      g.noAI = true; g.keepMoveOrder = true;
      g.order = 'move'; g.speed = sp; g.dest = { x: KATSUMASA.x + dx, z: KATSUMASA.z + dz }; g.path = null;
      g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 34; };
    }
    rt.army.play('toki', { ...MOUTH }, 1.2);
    sfx('taiko', 0.9);
    sfx('horagai', 0.9);   // 11/8 critic60 賤ヶ岳（六3）：夜明けの総がかりに法螺も
    sevenSpears(rt, this.ctx(rt), 'cut');
  },
  // ④ 前田隊が茂山を払い、柴田軍は総崩れ。湖の西の岸を北へ追う
  phase4(rt) {
    const F = rt.flags;
    rt.objDone('s3');
    rt.award((t) => { t.special = { label: '切通しの口で柴田勝政の殿を破った', pts: 15 }; }, '柴田勝政の殿を破った');
    F.phase = 4; F.pt = rt.t; F.k0 = F.kills;
    F.footFightT = 0;
    rt.obj('s4', ST(4), 'main');
    for (const g of [F.kmG, F.mmG, F.saku, F.mori]) if (live(g)) { g.order = 'retreat'; g.dest = { ...GONGEN }; g.onArrive = null; g.speed = g === F.mori ? 3.6 : 2.2; g.kind4 = 'flee'; }   // 盛政は馬で先に落ちる
    // 殿の残りは切通しから権現坂へ落ちる（持ち場に縛らず、振り向いて主人公に絡まない。味方の本隊が残りに足を取られて岸の道へ出遅れた・11/5 の流し）
    if (live(F.kmG)) { F.kmG.fixed = false; F.kmG.kind4 = 'gone'; F.kmG.aggro = 0; F.kmG.seekRange = 0; F.kmG.speed = 3; for (const u of F.kmG.units) u.noTarget = true; }   // 落ちる殿の残りに味方の隊が足を取られない
    rt.after(8.5, () => rt.say('福島正則', '遅れるな、岸の道を茂山まで押すぞ', 2.8));   // fix4：小姓は兵に下知する身分でない。仲間を励ます言い方に
    // 岸の道で振り向いて踏みとどまる二つの塊。湖の西の岸を退くのは盛政の手と勝政の残り（家ごとの旗。勝家の旗本は狐塚で岸にはいない）
    F.chase5 = [[-128, 112, 12, SAKUMA, '佐久間の手'], [-158, 36, 12, SHIBATA, '柴田勢']].map(([x, z, n, house, name]) => {
      // 11/6 九2：士気 60 では主人公が寄る前に崩れて逃げ、岸で一度も当たらなかった。岸の道を塞いで踏みとどまる殿にする
      const g = enemyGroup(rt, { ...house, name, anchor: { x, z }, facing: 2.8, fleeDir: { x: -0.3, z: -1 }, width: 5, morale: 85, dmgMult: 0.36, noRout: true, noAI: true, keepMoveOrder: true,
        order: 'hold', seekRange: 18, aggro: 10, speed: 2.6 }, foeList(n, { flag: house.flag }));
      g.kind4 = 'way'; F.groups.push(g);
      return g;
    });
    // 11/6 九度目（描いて遊んだ）：兵の足（およそ 3.5）が駆ける主人公より遅く、麓で主人公のそばの味方が一人の二十秒があった。追い討ちの隊は駆け足を上げる
    for (const g of [F.yari, F.uma, F.scoutG]) if (live(g)) for (const u of g.units) { u.speed = Math.max(u.speed || 0, 4.8); u.run = Math.max(u.run || 4.5, 5); }
    for (const g of [F.yari, F.uma, F.scoutG]) if (live(g)) { g.order = 'move'; g.speed = 4.2; g.aggro = 7; g.dest = { x: -126, z: 128 }; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 40; }; }
    sevenSpears(rt, this.ctx(rt), 'shore');
  },

  onKill(rt, v) {
    const F = rt.flags;
    // 場を去った無傷の兵と討死を分け、倒れた体が片付いても損失を忘れない。
    if (v && v.team === 0 && !v.isPlayer && !v.isStruct && !v.civ) F.allyLost = (F.allyLost || 0) + 1;
    if (v && v.team === 1) F.kills++;
    if (v && v === F.kmU && !F.kmBanner) { F.kmBanner = true; rt.banner('柴田勝政、討ち取ったり', ''); }
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending || !F.phase) return;
    const P = rt.player.u;
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.25;
    const st = rt.t - F.pt;
    // 退く隊は 9m で振り向いて戦う。退き切った者は遠い所でだけ去らせる
    for (const g of F.groups) {
      if (!live(g)) continue;
      let near = Infinity;
      for (const u of g.units) {
        if (!u.alive || u.gone) continue;
        if (g.nightWithdraw && g.order === 'retreat' && dist(u.pos, P.pos) > 90) { rt.army.despawn(u); continue; }
        if (g.order === 'retreat' && F.phase >= 4 && u.pos.z < -40 && dist(u.pos, P.pos) > 70) { rt.army.despawn(u); continue; }
        near = Math.min(near, dist(u.pos, P.pos));
      }
      // 振り向くのは、主人公のそばに味方の本隊がいる時だけ（一人で先へ出た主人公を、退く隊がまとめて囲まない）
      if (!F.routAt && g.kind4 === 'flee' && g !== F.saku && g !== F.mori && g.order === 'retreat' && near < 9 && [F.yari, F.uma].some((q) => live(q) && dist(q.center(), P.pos) < 30)) { g.order = 'attack'; g.focus = P; g.aggro = 12; g.speed = 3; }
    }
    // 負け：砦の中に敵が六人より多く、味方が一人以下のまま十二秒（①②）
    if (F.phase <= 2) {
      const foes = nearCount(rt, 1, FORT, FORT.r + 3), friends = nearCount(rt, 0, FORT, FORT.r + 3);
      F.fortBad = foes >= 6 && friends <= 1 ? F.fortBad + 0.25 : 0;
      if (F.fortBad > 12) { this.lose(rt, '賤ヶ岳の砦を奪われた'); return; }
    }
    if (F.phase === 0.5) { Open.tickOpen(rt, 0.25, this.ctx(rt)); if (F.sawForts) F.saw = true; return; }
    if (F.phase === 1) { Open.tickRelief(rt, 0.25, this.ctx(rt)); return; }
    if (F.phase === 2) {
      // 三度の寄せ手を退ければ夜へ（柵に寄って残る数人は数えない）
      const left = F.groups.reduce((n, g) => n + (g.kind4 === 'raid' ? nLive(g) : 0), 0);
      // 寄せ手は口の主人公へ打ちかかる（坂の下で留まらない。口で守る者の目の前で斬り合いになる）
      for (const g of F.groups) if (g.kind4 === 'raid' && g.bornT != null && live(g) && g.order !== 'attack' && rt.t - g.bornT > 20) { g.order = 'attack'; g.focus = P; g.seekRange = 30; g.aggro = 16; g.speed = 3.6; }
      // 口で斬り合った（口の十二の内に寄せ手が三人より多く来た）後は、三度目から八十秒で日が暮れて寄せ手が退く（時が経つだけでは果たさない）
      if (!F.mouthFought && nearCount(rt, 1, MOUTH, 12) > 3) F.mouthFought = true;
      // 口へ届く前に味方が寄せ手を討ち減らした場合も守備の成果。経過時間だけでは果たさない。
      if (F.waves >= 3 && (F.mouthFought || left <= 8) && dist(P.pos, MOUTH) < 22 && st > 100 && (left <= 8 || st > 130)) this.night(rt);
      return;
    }
    if (F.phase === 2.3) { tickMeet(rt, this.ctx(rt)); return; }
    if (F.phase === 2.5) {
      // 本陣で迎えるのは、松明の道を上がった小姓衆が西の肩に着いてから（夜の列を目の前で見せる）
      const came = rt.t - F.pt > 6 && (!live(F.yari) || dist(F.yari.center(), { x: DAWN_AT.x + 8, z: DAWN_AT.z + 10 }) < 24 || rt.t - F.pt > 45);
      if (!F.metHide && came && dist(P.pos, HONJIN) < 7) {
        F.metHide = true;
        rt.say('羽柴秀吉', '玄蕃め、深入りしおった。夜明けを待て', 3);
        rt.after(3.4, () => this.dawn(rt));
      }
      return;
    }
    if (F.phase === 3) {
      // 殿は切通しの口で槍衾を組んで構える。味方の本隊が口へ寄るまでは口から出て来ない（主人公一人を囲まない）
      //   11/7（流し）：味方の本隊が来る前に殿の要（anchor）が砦の方や岸の方へ八十も流れ、勝政が口にいなかった。打って出るまでは要を口に留める
      if (!F.kmOut && live(F.kmG) && ![F.yari, F.uma].some((q) => live(q) && dist(q.center(), F.kmG.center()) < 26)) { F.kmG.anchor = { ...KATSUMASA }; F.kmG.order = 'hold'; F.kmG.focus = null; }
      this.waitForMain(F, F.kmG, 14, 20);
      // 11/6 critic60（三4）：勝政を討つ前に③を果たさない。百二十秒を過ぎれば勝政が馬で主人公へ打ちかかる
      //   11/7（流し）：勝政が馬で口を離れて岸の方へ八十も出て、口へ着いた主人公が四十秒待った（③だけで二百秒）。主人公が口の二十五の内へ来るか四十五秒で打ちかかる
      if ((st > 45 || st > 12 && dist(P.pos, KATSUMASA) < 25) && F.kmU?.alive && !F.kmOut) { F.kmOut = true; F.kmG.fixed = false; F.kmG.order = 'attack'; F.kmG.focus = P; F.kmG.aggro = 20; F.kmG.seekRange = 40; rt.say('柴田勝政', '柴田の殿、ここを通さぬ', 2.6); }
      if (F.kmU && !F.kmU.alive) this.phase4(rt);
      return;
    }
    if (F.phase === 4) {
      // 総崩れの後は追撃の判定で退く隊を再び振り向かせず、逃げる姿を見せて締める。
      if (F.routAt) { if (rt.t - F.routAt > 5) this.win(rt); return; }
      // 11/5 check60（標準 一5）：岸の道は細く、味方の隊が主人公から 30 より遅れると、主人公の後ろへ駆け足で寄せ直す（流しで主人公だけが茂山の下へ出て囲まれた）
      //   11/6 九4（描いて遊んだ）：30 より遅れてから主人公の後ろへ寄せると、いつも 25〜40 後ろで主人公一人が岸を走った。
      //   行き先を毎秒替えると隊はそのたびに合図を聞き分けて止まり（army_signals）、野の斜面を横に広がって進むと兵が要に遅れた。
      //   岸の道（SHORE_W）を縦隊（march）でたどり、主人公より後ろなら駆け足・先なら歩みを落とす。岸の殿が 22 の内にいれば打ちかかる
      if ((F.followT = (F.followT || 0) - 0.25) <= 0) {
        F.followT = 0.5;
        const fx = SHIGE.x - P.pos.x, fz = SHIGE.z - P.pos.z, fd = Math.hypot(fx, fz) || 1;
        [F.yari, F.uma, F.scoutG].forEach((g, i) => {
          if (!live(g)) return;
          //   11/6 六度目（一5・描かずの流し二度）：岸の佐久間の手と組んだ隊がそこに残り、先へ出た主人公が麓の柴田勢と一人で斬り合って討たれた。
          //   組むのは主人公のそばの斬り合い（25 の内）だけ。主人公が先へ出れば手を離して岸の道を追う
          const c = g.center();
          // 11/6 critic60（一5・九4）：主人公から二十五より離れた隊は、斬り合いも道もやめて主人公の脇へ駆け寄る（麓で主人公一人にしない）
          //   11/6 九度目（描いて遊んだ）：二十五で寄せると、岸と麓で主人公のそばの味方が一、二人の十秒が続いた。十四より離れたら寄せ、行き先は主人公の脇の少し先（茂山の向き）
          const gap = dist(c, P.pos);
          if (gap > 18) g.shizuFollowing = true;
          else if (gap < 10) g.shizuFollowing = false;
          // 近づいた瞬間に行軍へ戻すと、次の見回りでまた「待て」になり合図待ちを繰り返す。
          if (g.shizuFollowing) {
            const tx = P.pos.x + [-4, 4, 0][i] + fx / fd * 6, tz = P.pos.z + [-2, 0, 2][i] + fz / fd * 6;
            //   隊の要（anchor）を move で歩かせると要の速さ（3.9 まで）で主人公に追い着かない。要を主人公の脇へ置き直し、兵が各自駆けて持ち場へ寄る（自分の組の付き従いと同じ）
            g.order = 'hold'; g.march = false; g.path = null; g.focus = null; g.dest = null; g.onArrive = null; g.fixed = false;
            g.anchor = { x: tx, z: tz }; g.facing = Math.atan2(fx, fz); g.aggro = 10; g.seekRange = 12;
            return;
          }
          const foe = F.chase5.find((h) => live(h) && dist(h.center(), c) < 22 && dist(h.center(), P.pos) < 25);
          if (foe) { if (g.order !== 'attack') { g.order = 'attack'; g.march = false; g.seekRange = 30; g.aggro = 14; g.onArrive = null; } return; }          //   道（order 'path'）は列の尻を待って要が三割の速さに落ちる（33 人の縦隊では常に）。行き先を岸の道の折れ目ごとに替えて move で進む
          const way = CHASE_WAYS[i];
          let k = way.findIndex(([, z]) => z < g.anchor.z - 6);
          if (k < 0) k = way.length - 1;
          if (g.order !== 'move' || !g.dest || g.dest.x !== way[k][0] || g.dest.z !== way[k][1]) {
            g.order = 'move'; g.march = true; g.aggro = 7; g.path = null; g.dest = { x: way[k][0], z: way[k][1] };
            g.onArrive = k === way.length - 1 ? (q) => { q.march = false; q.order = 'attack'; q.seekRange = 40; } : null;
          }
          const lead = ((c.x - P.pos.x) * fx + (c.z - P.pos.z) * fz) / fd;   // 茂山の向きに、主人公より何歩先か
          const far = dist(c, P.pos);   // 11/6 critic60（一5・九4）：主人公から二十五より離れたら、向きにかかわらず駆けて寄る
          g.speed = far > 25 || lead < -10 ? 6 : lead < -3 ? 4.6 : lead > 8 ? 1.2 : 3.4;
        });
      }
      // 岸の柴田勢も、味方の本隊が寄るまでは岸の道で構えて待つ（走る主人公一人を囲まない）
      //   11/6 九2：麓の柴田勢（二つ目）は茂山の麓で踏みとどまる。主人公が麓へ着けば打ちかかり、味方が追い着くまで麓で斬り合う（麓で一人待つだけにしない）
      for (const g of F.chase5) this.waitForMain(F, g, 10, 18);
      if (live(F.maedaG) && !F.maedaGo && dist(P.pos, SHIGE) < 90) {
        F.maedaGo = true; F.maedaGoT = rt.t; F.maedaG.order = 'retreat'; F.maedaG.dest = { x: GONGEN.x, z: GONGEN.z - 60 }; F.maedaG.speed = 1.4;
        rt.say('前田利家', '陣を払え。府中へ退く', 2.6);
        rt.after(3, () => rt.say('使番', '茂山の前田勢、陣を払うて退きまする', 3));
        rt.after(6.5, () => rt.say('佐久間盛政', '前田殿が退いたじゃと……。権現坂まで退け', 3));
      }
      // 主人公が茂山へ抜けたら、岸に残った殿も麓へ下がって合流する。
      // 遠い岸に残った兵まで減らす判定と、麓だけを守る行き先が食い違い、達成できずに待つのを防ぐ。
      if (dist(P.pos, SHIGE) < 40) for (const g of F.chase5) {
        if (!live(g) || g.joinFoot || dist(g.center(), SHIGE) < 45) continue;
        g.joinFoot = true; g.order = 'move'; g.focus = null; g.path = null;
        g.dest = { x: SHIGE.x + 12, z: SHIGE.z + 18 }; g.speed = 3;
        g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 18; q.aggro = 10; };
      }
      const footG = F.chase5[1];
      //   11/6 六度目：打ちかかるのは味方の隊が主人公の 25 の内に追い着いてから（一人で先へ出た主人公を麓でまとめて囲まない・一5）
      if (live(footG) && dist(footG.center(), P.pos) < 16 && [F.yari, F.uma, F.niwaG].some((q) => live(q) && dist(q.center(), P.pos) < 25)) { footG.aggro = 10; footG.seekRange = 16; }
      // 勝ち：岸の道の柴田勢を崩して茂山の麓まで追う
      const left = shoreLeft(F.chase5);
      // 11/4 jin：一戦を七分ほどに収める。11/5 check60（標準 三3）：目標の「茂山の麓」へ着かずに勝ちにしない（時が経つだけで勝たない）
      //   11/6 九4：主人公一人が麓へ着いただけで勝たない。味方の隊（小姓衆か先手）が麓の 45 の内へ追い着いて締める
      // 11/9 三巡（織田C）：小姓衆の隊の中心が麓の手前の四十六〜四十九で止まり、殿を崩し切っても勝ちにならず刻限が切れた。麓の広さを六十に。
      const atFoot = dist(P.pos, SHIGE) < 40;
      // 隊の中心だけが坂に残っても、実際に追いついた兵がいれば合流とする。
      const mainIn = [F.yari, F.uma, F.scoutG].some((q) => q && q.units.reduce((n, u) => n + (u.alive && !u.gone && !u.fleeing && !u.noTarget && !u.downed && !u.woundOut && !u.rearWound && dist(u.pos, SHIGE) < 60 ? 1 : 0), 0) >= 3);
      F.footFightT = atFoot && mainIn ? F.footFightT + 0.25 : 0;
      // 11/6 critic60（二1・十二2）：麓に敵が残るのに勝たない。殿を崩し（残り二人まで）、残りが北へ逃げ出すのを見せてから勝ち
      // 討ち取りの表示と同じ残り四人まで崩し、前田の退きを見届けてから締める。時間だけで殿を退かせない。
      // 麓で待つだけでは殿を崩したことにしない。味方の到着と殿の損耗をともに確かめる。
      // 麓で味方と一分押し続け、殿の半数以上を崩した長い追撃では残りも退く。
      // 遠い岸や斜面の残兵を一人ずつ追わされて刻限切れにしない。到着・戦闘なしでは進まない。
      const broken = left <= 4 || st >= 180 && F.footFightT >= 60 && left <= 12;
      if (atFoot && mainIn && F.maedaGo && broken && !F.routAt) {
        F.routAt = rt.t;
        for (const g of F.groups) if (live(g) && g.units[0]?.team === 1 && g !== F.maedaG) { g.order = 'retreat'; g.fixed = false; g.focus = null; g.onArrive = null; g.path = null; g.dest = { x: g.center().x - 10, z: -220 }; g.speed = 3.6; g.aggro = 0; g.seekRange = 0; g.kind4 = 'gone'; }
        rt.say('福島正則', '柴田勢が崩れたぞ。追え、追え', 2.6);
      }
    }
  },

  // 構えて待つ敵の隊：七本槍か先手が 26 の内へ寄れば打ちかかる。それまでは近くの者（5）だけを相手にする
  waitForMain(F, g, aggro, seek) {
    if (!live(g)) return;
    const c = g.center(), near = [F.yari, F.uma].some((q) => live(q) && dist(q.center(), c) < 26);
    g.aggro = near ? aggro : 5; g.seekRange = near ? seek : 6;
    if (!near && g.order === 'attack' && !g.focus) g.order = 'hold';
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
    victoryMoment(rt, '勝');
    // ---- 戦の後の余韻：勝家の退き・盛政の行方・前田の退き・北ノ庄の煙（t02_shizugatake/turn.js） ----
    const sec = epilogue(rt, this.ctx(rt));
    rt.finish({ scriptedEnd: true }, sec);
  },
  lose(rt, why) {
    const F = rt.flags;
    if (F.ending || !rt.canFailMission()) return;
    F.ending = true;
    rt.objFail(['s0', 's1', 's2', 's2m', 's2n', 's3', 's4'][stageIx(F.phase)]);
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
    let q = b.def.missionPin(b);
    // 砦の柵の内から外の行き先へは、東の口を通って出る（柵へ真っすぐ当たって止まらない）
    const dF = dist(u.pos, FORT);
    const returning = q && dist(q, FORT) < FORT.r && dF > FORT.r + 1.5;
    // 夜の本陣へ戻る時も、柵の外を東の口まで回ってから入る。
    if (returning && !(Math.abs(u.pos.z - FORT.z) < 3 && u.pos.x > FORT.x)) q = { x: MOUTH.x + 7, z: MOUTH.z };
    if (q && (returning || dF < FORT.r + 9) && dist(q, FORT) > FORT.r + 2) {
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
    // 麓へ着いた後も残る殿を見届ける。印の真下で待つだけでは、離れた残兵を討てない。
    if (F.phase === 4 && dist(u.pos, SHIGE) < 40 && !F.routAt) {
      let target = null, nearest = Infinity;
      for (const g of F.chase5 || []) for (const foe of g.units) {
        if (!foe.alive || foe.gone || !ok(foe)) continue;
        const d = dist(foe.pos, u.pos);
        if (d < nearest) { nearest = d; target = foe; }
      }
      if (target) { goTo(p, inp, target.pos.x, target.pos.z, 2.2); return; }
    }
    if (q) goTo(p, inp, q.x, q.z, 2);
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
t02_shizugatake.date = (rt) => (rt.flags.phase >= 2.8 ? '天正十一年四月二十一日　夜明け' : rt.flags.phase >= 2.3 ? '天正十一年四月二十日　夜' : '天正十一年四月二十日　初夏');
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
  const F = rt.flags;
  return F.ending ? null : F.phase === 1 ? cut(F.chaseG?.units.length, nLive(F.chaseG), 3) : F.phase === 2.3 ? cut(F.yochiG?.units.length, nightRaidLeft(F.yochiG), 2) : F.phase === 3 ? [F.kmU && !F.kmU.alive ? 1 : 0, 1] : F.phase === 4 ? cut(F.chase5?.reduce((n, g) => n + g.units.length, 0), shoreLeft(F.chase5), 4) : null;
};
withGuard(t02_shizugatake);

export { t02_shizugatake };
