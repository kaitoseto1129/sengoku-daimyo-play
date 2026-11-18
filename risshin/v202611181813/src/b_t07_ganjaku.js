// ======================================================================
// 豊臣編 7 戦目：岩石城攻め（天正十五年・1587）。戦の型は「高速攻城」（docs/chapter2_toyotomi.md 7章）。
// 秀吉の本隊が九州へ入り、秋月方の岩石城（豊前・岩石山 454m）を蒲生氏郷・前田利長らが一日で落とす。
// 主人公は蒲生の先手と並び、大手の坂を登る（前田勢は搦手から）。日が沈むと負け（6分半ほど）。
// 段（山中城の型・docs/kaito_refs_1103）：1 大手の坂を登る（塀の狭間と矢倉から矢と鉄砲）→ 2 門から打って出た秋月勢（芥田悪六兵衛）を迎え撃つ →
//   3 退く秋月勢を追い、門が閉まる前に城内へ（付け入り。閉まれば味方が掛矢で破る）→ 4 本丸へ攻め入り、城将の熊井越中守を討つ。
// 地形：国土地理院の標高（asset_dem_ganjaku.js・岩石山の頂を原点に ±400m・5m 間隔）。ゲームの 1 は実の 1.4m。
// 部品：門と塀と狭間の射撃は siege_kit（def.siegeKit）、兵は bhelp の enemyGroup・allyGroup。
// ======================================================================
import { useTerrain, BATTLE_ASSETS, assetsForBattle } from './asset_manifest.js';
import { demSample } from './dem.js';
import { siegePlan, siegeHeight } from './siege_kit.js';
import { enemyGroup, allyGroup } from './bhelp.js';
import { siegeStages } from './siege_stages.js';
import { closeGate } from './siege_gate.js';
import { distToPolyline } from './world.js';
import { RANKS } from './state.js';
import { FACTION, GENERALS } from './units_data.js';
import { KACCHU, TOYO_GAMO_KACCHU } from './kacchu_data.js';
import * as THREE from 'three';
import { hashigo, nobori, jinmaku, yagura, kabukimon, castleBoardFence, palisade, hut, solidCircle, solidSeg, solidRect } from './props.js';
import { rockShape, groundRocks } from './rock_shape.js';
import { sfx } from './audio.js';
import { withGuard } from './toyo_bot.js';
import { farSight } from './far_sight.js';
import { wayLitter } from './gap_scene.js';
import { STAGES } from './stages.js';
import { goalsTick } from './hud_goals.js';
// 15分の構成（kaito 11/8 夜・docs/toyo15_plan_1108.md の 10）：段の中身は t07_ganjaku/ に一段一ファイル
import * as chakujin from './t07_ganjaku/chakujin.js';   // 着陣：麓を埋める秀吉の本隊・鉄砲の撃ちかけ
import * as tahoumen from './t07_ganjaku/tahoumen.js';   // 別の口：東の尾根・西の尾根の攻城と使番の知らせ
import * as ninomaru from './t07_ganjaku/ninomaru.js';   // ④二の丸の曲輪の乱戦と火
import * as rakujo from './t07_ganjaku/rakujo.js';
import * as honjin from './t07_ganjaku/honjin.js';     // 二巡：麓の本陣の羽柴秀勝と諸将の知らせ       // 落城の後：山じゅうに豊臣の旗・「九州を南へ」

// この戦の標高を支度で読ませる（共通の表は触らず、ここで一行足す）
BATTLE_ASSETS.t07_ganjaku = Object.freeze([...assetsForBattle(''), 'dem_ganjaku']);
let dem = null;
// 秋月方の家（黒の揃いの具足に撫子の紋。秋月の紋は撫子。共通の表は触らず、ここで足す）
FACTION.akizuki = { ...(FACTION.akizuki || FACTION.tokugawa), flag: 'nadeshiko' };   // 11/18 クラウド：旗・指物・櫓の紋が浅野の違い鷹の羽（豊臣方の家）だった。秋月の撫子へ
// 11/18 持ち主 ⑥（始めの写真）：蒲生の先手の幟の列が紋の無い白い布だった（表に無い家の旗の名 'gamo' に絵が無い）。蒲生の紋は対い鶴（指物と同じ鶴）
if (FACTION.gamo) FACTION.gamo = { ...FACTION.gamo, flag: 'tsuru' };
useTerrain('dem_ganjaku', (d) => { dem = d; });
// 天正十五年の名乗りは前田利勝（勝興寺あての禁制。「利長」は後の名。kaito 十4）。顔と具足は利長の物を使う
if (GENERALS['前田利長'] && !GENERALS['前田利勝']) GENERALS['前田利勝'] = GENERALS['前田利長'];
if (KACCHU['前田利長'] && !KACCHU['前田利勝']) KACCHU['前田利勝'] = KACCHU['前田利長'];

const XY = 1.4;      // ゲームの 1 が実の何 m か
const SC = 0.4;      // 実の高さを縮める率（実の比高 270m → 約 100m。坂を登れる傾きに）
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// 置き場（x=東+、z=南+。頂が原点。大手は南西の尾根）
const SPAWN = { x: -134, z: 134 };   // 坂の下から二の丸の門と塀・矢倉が見える所（-150,150 では門が霧の奥で写らなかった）
const GATE = { x: -56, z: 56 };                  // 二の丸の門（喰違の虎口）
const ROT = -Math.PI / 4;                         // 門の外向き＝南西
const YAGURA = { x: -18, z: 36 };                 // 岩の上の矢倉（11/18 持ち主 ⑥ 段5の写真：(-24,30) は二の丸から本丸への大手道の四m脇で、脚の骨組みが梯子の竿のように画面の右四分の一を塞いだ→道から十三m退けた）
const HON = { x: 0, z: 0 };                       // 本丸（頂）
const HONF = { x: HON.x - 9, z: HON.z + 9 };       // 本丸の大手の口の前（退いた守りが寄る所）
const KARA_OUT = { x: 70, z: -70 }, KARA_IN = { x: 26, z: -26 };   // 搦手（北東の尾根）の寄せ手の持ち場と、本丸の下の搦手の口
// 国見岩（15, -19・当たり半径7.2）の北を回り、搦手の開口から小屋の北西へ入る。
// 旧道の（16, -16）は岩の中で、後列が（21, -21）へ重なっていた。
const KARA_HON = [KARA_OUT, KARA_IN, { x: 24, z: -26 }, { x: 6, z: -30 }, { x: 3.1, z: -21.9 },
  { x: 10.6, z: -10.6 }, { x: 6.8, z: -11.6 }, { x: -0.2, z: -5.8 }, { x: HON.x - 5, z: HON.z - 3 }];
const KARA_PATH = KARA_HON.map((q) => [q.x, q.z]);
const ROAD = [[SPAWN.x, SPAWN.z], [-122, 124], [-96, 98], [-76, 76], [-60, 64]];
const ROAD_IN = [[-60, 50], [-46, 40], [-30, 30], [-14, 14], [0, 0]];
const SP = siegePlan({ x: GATE.x, z: GATE.z, rot: ROT, W: 16, koguchi: 'kuichigai', yokoya: false, moat: false, umadashi: false, sakamogi: false, shiyori: false, kirigishi: 0 });   // 切岸の段は山の斜面そのもの（1m の段を足すと門の前で寄せ手が詰まる）
const SIEGE_H = siegeHeight(SP);
// 門の外の口・門の前・門の内（喰違：外から右へ回り込み、横の筋の門を抜けて城の内へ）
const pt = (a, b) => { const [x, z] = SP.L(a, b); return { x, z }; };
const MOUTH = pt(5.5, 7), FRONT = pt(5.5, -3), INSIDE = pt(-6, -3), INNER = pt(-6, -14);
// 距離を測る道と寄せ手の行き先を揃える。毎回配列を作らず使い回す。
const APPROACH = [...ROAD, [MOUTH.x, MOUTH.z]];
// 門の周りの居場所：'out' 塀の外・'rec' 門の前の窪み・'lane' 門の横の筋・'in' 塀の内（門から 26m の外は null）
const gl = (x, z) => { const dx = x - GATE.x, dz = z - GATE.z; return [dx * SP.px + dz * SP.pz, dx * SP.ux + dz * SP.uz]; };
function gateZone(x, z) {
  const [a, b] = gl(x, z);
  if (Math.abs(a) > 20 || b > 26 || b < -22) return null;
  if (a > 3.6 && a < 16 && b > -6.2 && b <= 0.5) return 'rec';
  if (a >= -3.2 && a <= 3.6 && b > -6.2 && b < -0.3) return 'lane';
  return b > 0 ? 'out' : 'in';
}
const wantInside = (q) => gl(q.x, q.z)[1] < 0;
// 梯子を掛ける岩肌（門の両脇の塀の外。足は外、上は塀の上）
const LAD = [[-12, 3.2, -12, 0.3], [-16, 3.4, -16, 0.3], [14, 3.2, 14, 0.3]].map(([a, b, c, d]) => ({ foot: pt(a, b), top: pt(c, d) }));
// 大手道の中ほどの坂の木戸（出曲輪の柵）。坂の守りと弓はこの柵の内から射る（城の外の坂に守り手を並べない。kaito 十一3）
// 二の丸の大手道（ROAD_IN）の両脇七歩に立てる城方の幟（道の筋と曲輪の乱戦の場は空ける）
const NINO_NOBORI = [[-38.3, 43.4], [-45.7, 31.6], [-30.3, 38.4], [-37.7, 26.6], [-19, 29], [-29, 19]];
const KIDO = { x: -88, z: 89 }, KD = { x: 0.67, z: -0.74 }, KP = { x: 0.74, z: 0.67 };   // KD 坂の上り向き・KP 柵の向き

// 竪堀の筋（大手の南西から左右へ二十八度ずつ開いた二筋）
const TATE = [-1, 1].map((k) => { const a = 3 * Math.PI / 4 + k * 0.49; return { x: Math.cos(a), z: Math.sin(a) }; });
// 手書きの山（標高が読めない時）：頂を原点に、南西の尾根を緩く
function base(x, z) {
  const r = Math.hypot(x, z), ridge = Math.max(0, (-x + z) / Math.SQRT2) / Math.max(1, r);
  return 100 * Math.exp(-((r / 170) ** 2)) * (1 - 0.25 * ridge) + 6;
}
function raw(x, z) {
  if (!dem) return base(x, z);
  return demSample(dem, x * XY, z * XY) * SC;
}
// 道は両脇の高さをならし、曲輪は平らに削る
function shaped(x, z) {
  let h = raw(x, z);
  const dr = Math.min(distToPolyline(x, z, ROAD), distToPolyline(x, z, ROAD_IN));
  if (dr < 9) {
    const s = (raw(x + 4, z) + raw(x - 4, z) + raw(x, z + 4) + raw(x, z - 4)) / 4;
    h += (s - h) * (1 - sstep(4, 9, dr)) * 0.8;
  }
  const flat = (c, r, k = 1) => { const d = Math.hypot(x - c.x, z - c.z); if (d < r + 8) h += (raw(c.x, c.z) - h) * (1 - sstep(r, r + 8, d)) * k; };
  flat(HON, 14);
  flat({ x: -40, z: 40 }, 12, 0.85);
  // 縄張り（docs/battle_refs/t07_ganjaku.md）：本丸の下の北・東・南の尾根を横堀・堀切で断つ（大手の南西だけ残す）
  const r = Math.hypot(x, z), sw = r > 1 ? (z - x) / (Math.SQRT2 * r) : 1;
  h -= 4 * Math.exp(-(((r - 37) / 2.6) ** 2)) * (1 - sstep(0.3, 0.62, sw));
  // 大手の坂の両脇に竪堀を落とし、寄せ手を坂の一筋へ絞る
  if (r > 40 && r < 160) for (const a of TATE) {
    const d = Math.abs(x * a.z - z * a.x);
    if (d < 5) h -= 2.6 * Math.exp(-((d / 1.7) ** 2)) * sstep(40, 52, r) * (1 - sstep(130, 158, r));
  }
  return h;
}
const height = (x, z) => shaped(x, z) + SIEGE_H(x, z);

// 坂と門の段（時との勝負）は寄せの小勢を出さない。城の内へ入ってから乱戦（frontline_density の alwaysMelee を段で切り替える）
let CALM = true;
// 岩石山の花崗岩：同じ形の岩でも、世界の位置で斑・割れ目・苔・雨の筋を描き分ける（灰色のつるつるの塊に見せない。kaito 八1・十一4）
let GRANITE = null;
function graniteMat() {
  if (GRANITE) return GRANITE;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, color: 0xe8e2d6, emissive: 0x4f4a42, emissiveIntensity: 0.12, flatShading: true });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying vec3 vRW;\nvarying vec3 vRN;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  vec4 rw = vec4(transformed, 1.0); vec3 rn = objectNormal;
  #ifdef USE_INSTANCING
  rw = instanceMatrix * rw; rn = mat3(instanceMatrix) * rn;
  #endif
  vRW = (modelMatrix * rw).xyz; vRN = normalize(mat3(modelMatrix) * rn);`);
    sh.fragmentShader = `varying vec3 vRW;
varying vec3 vRN;
float gH(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float gN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gH(i), gH(i + vec3(1,0,0)), f.x), mix(gH(i + vec3(0,1,0)), gH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(gH(i + vec3(0,0,1)), gH(i + vec3(1,0,1)), f.x), mix(gH(i + vec3(0,1,1)), gH(i + vec3(1,1,1)), f.x), f.y), f.z); }
` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  {
    float n = gN(vRW * 0.45) * 0.6 + gN(vRW * 1.3) * 0.3 + gN(vRW * 4.0) * 0.1;
    float sp = gH(floor(vRW * 16.0));
    float cr = 1.0 - smoothstep(0.0, 0.035, abs(gN(vRW * vec3(0.32, 0.5, 0.32) + 7.0) - 0.5));
    float cr2 = 1.0 - smoothstep(0.0, 0.025, abs(gN(vRW * 0.95 + 3.0) - 0.5));
    float up = clamp(vRN.y, 0.0, 1.0);
    float moss = smoothstep(0.7, 0.95, up) * smoothstep(0.5, 0.75, n);
    float lich = smoothstep(0.7, 0.9, gN(vRW * 2.2 + 11.0)) * (1.0 - up * 0.5);
    float rain = smoothstep(0.55, 0.8, gN(vec3(vRW.x * 2.4, vRW.y * 0.12, vRW.z * 2.4))) * (1.0 - up);
    vec3 c = diffuseColor.rgb * (0.78 + 0.34 * n) * (0.9 + 0.16 * sp);
    c *= 1.0 - 0.6 * max(cr, cr2 * 0.7);
    c *= 1.0 - 0.22 * rain;
    c = mix(c, vec3(0.62, 0.64, 0.52), lich * 0.35);
    c = mix(c, vec3(0.22, 0.27, 0.14), moss * 0.55);
    diffuseColor.rgb = c;
  }`);
  };
  return (GRANITE = m);
}
let STONE_GEO = null, STONE_MAT = null;   // 塀の上から投げ落とす石の形と材質を使い回す
const T_LIMIT = 1100;   // 日が沈むまで（15分の構成で十八分ほど。坂に懸かってから数える）
const KIRI = 0x2a2420, AKI = 0x2e2a26;

// 段が変わる時の中央の青い札は右上の任務と同じ字で、874×402 では右上の札に重なり戦場の38%を覆った（11/11 見回り た・八尾若江と同じ直し）。この戦では出さない。
function ganjakuNoBlueCall(rt) {
  const root = rt.hud?.root;
  if (!root || typeof document === 'undefined') return;
  root.classList.add('ganjaku-goals');
  const style = document.createElement('style');
  style.textContent = 'html:root body #hud#hud#hud.ganjaku-goals #center-call .cc.blue { display:none !important; }';
  document.head.appendChild(style);
  const dispose = rt.dispose;
  rt.dispose = function () { root.classList.remove('ganjaku-goals'); style.remove(); return dispose?.call(this); };
}
// 右上の①〜⑤（15分の構成で二の丸の曲輪の段を足した）
const TEXT = ['大手の坂を登り、二の丸の門の前へ出る', '門から打って出た秋月勢を坂で迎え撃つ', '退く秋月勢を追い、門を抜けて城内へ入る',
  '二の丸の曲輪で、火の中の城兵を討ち払う', '本丸へ攻め入り、熊井越中守を討つ'];
STAGES.t07_ganjaku = TEXT.map((t, k) => (k ? [t, (rt) => (rt.flags.stage || 0) >= k + 1] : [t]));
const START = { x: -204, z: 150 };   // 麓の大軍の中から坂の下へ歩く（蒲生の本陣の陣幕を横切らない筋。11/8 bot が幕に詰まった）
const ARRIVAL = { ...SPAWN, label: '大手の坂の下', r: 14, hideDistance: 0 };
// 地点へ着いても戦いは続く。未達成の段の印を、共通の六メートルの省略で消さない。
const SLOPE_PIN = { ...MOUTH, label: '二の丸の門', r: 1.5, hideDistance: 0 };
const NINO_PIN = { ...ninomaru.NINO, label: '二の丸', r: 14, hideDistance: 0 };
const HON_PIN = { ...HON, label: '本丸', r: 13, hideDistance: 0 };
const HON_ENTRY = { x: -18 * Math.SQRT1_2, z: 18 * Math.SQRT1_2 };
const KU_IN = [{ x: 10.6, z: -10.6 }, { x: -0.2, z: -5.8 }];   // 外の熊井が本丸へ戻る筋：搦手の口 → 小屋の北の内（KARA_HON と同じ点）
// 国見岩（15,-19・当たり七m余り）を跨ぐ時は、岩の北の脇（22,-10）か南西の搦手道（3.1,-21.9）を先に通る
function kuWay(p) {
  const a = KU_IN[0], dx = a.x - p.x, dz = a.z - p.z, L = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((15 - p.x) * dx + (-19 - p.z) * dz) / L));
  if (t < 0.1 || t > 0.9 || Math.hypot(p.x + dx * t - 15, p.z + dz * t + 19) > 7.4) return a;   // 岩の縁に沿って既に口の脇にいる時は回り道しない
  return p.z > -19 ? a : p.x > 9 ? KU_SE : KU_S;   // 岩の北の脇は縁の巨岩（17.9,-13.4）（21.3,-7.9）で狭いので、口へまっすぐ（岩に沿って滑る）
}
const KU_S = { x: 3.1, z: -21.9 }, KU_SE = { x: 7, z: -31 };   // 岩の南東からは搦手道の（6,-30）を回る
// 大手から本丸の板塀を横切る指示を、南西の開口へ回す。搦手は既存の
// 国見岩を避ける道順を守る。塀沿いの弦が内側へ
// 食い込まないよう、外周では二十歩の輪を短い区間ずつ進む。
function honWay(p, want, out) {
  const r = Math.hypot(p.x, p.z);
  if (r < 14.5 || r > 42 || p.x > p.z || Math.hypot(want.x, want.z) >= 14.5) return want;
  const entry = HON_ENTRY;
  const a = Math.atan2(p.z, p.x), end = Math.atan2(entry.z, entry.x);
  const delta = Math.atan2(Math.sin(end - a), Math.cos(end - a));
  if (Math.abs(delta) > 0.12) {
    // 11/18 21:35 持ち主（POSLOG 809秒の回：本人が本丸の西の外 (-15,-11)・十八m半で三百八十秒止まった）：十九m より内では角を進めず、二十m の同じ角の点（一m半先）を行き先にして、着いた扱いのまま動かなかった。内では半歩ずつ角も進める
    const next = a + clamp(delta, -0.25, 0.25) * (r < 19 ? 0.5 : 1);
    // 11/18 20:30 持ち主（POSLOG：段5で本人が本丸の北の外 (4,26) で二百五十秒止まった）：北の縁の巨岩（4.5,22.1・半径3.6）が二十m の輪を塞ぐ。北の外からは二十八m の輪で岩の外を回る
    const rr = r > 22 && a > 0.9 && a < 1.75 ? 28 : 20;
    out.x = Math.cos(next) * rr; out.z = Math.sin(next) * rr;
  } else {
    out.x = entry.x * 2 / 3; out.z = entry.z * 2 / 3;
  }
  return out;
}
// 閉門中は角の手前でも待つため、近づいただけでは未達の行き先を消さない。
const GATE_PINS = [MOUTH, FRONT, INSIDE, INNER].map((p) => ({ ...p, label: '二の丸の門', r: 1.5, hideDistance: 0 }));
const LOOK_START = { ...SPAWN, up: 3 }, LOOK_GATE = { ...GATE, up: 3 };
const LOOK_NINO = { ...ninomaru.NINO, up: 3 }, LOOK_HON = { ...HON, up: 3 };

const t07_ganjaku = {
  introText: '九州へ入った秀吉の軍が、秋月方の岩石城を一日で落としにかかる。蒲生の先手と大手の坂を登れ。',   // 11/17 クラウド k365-26：始めの説明（誰が・どこで・なぜ・自分の役目）
  minutes: 15, expectMin: 15,
  introGoal: '大手の坂から二の丸の門を抜け、本丸の熊井越中守を討つ',
  lethal: { max: 4, firstAt: 260, gap: 60 },   // 命懸けの戦場（docs/lethal_howto.md）。蒲生・前田・熊井など名のある将は筋書きのまま
  // 布陣図の地名（docs/fujin/t07_ganjaku.md）
  introMapPlaces: [{ x: HON.x, z: HON.z - 14, name: '岩石城' }, { x: GATE.x, z: GATE.z + 12, name: '二の丸の門' }, { x: -214, z: 226, name: '羽柴秀勝の本陣' }],
  spawn: { x: START.x, z: START.z, heading: Math.atan2(GATE.x - START.x, GATE.z - START.z) },
  // 門を抜けた後も次の曲輪を見上げる。向きは変えず、前方にある時だけ共通の目線補助を使う。
  camLookAt: (rt) => !rt.flags.stage ? LOOK_START : rt.flags.stage <= 3 ? LOOK_GATE : rt.flags.stage === 4 ? LOOK_NINO : LOOK_HON,
  camMaxDown: 0.14,   // 後ろの斜面で視点が持ち上がっても、地面だけを見下ろさない。
  // 着陣中にはまだ任務が無く、共通の案内が行き先を選べない。合流先を初めから示す。
  missionPin(rt) {
    if (rt.flags.ending) return null;
    if (!rt.flags.stage) return ARRIVAL;
    if (rt.flags.stage === 1) return SLOPE_PIN;
    if (rt.flags.stage === 2) return rt.flags.meet;
    // 味方が先に門を抜けて段が進んでも、門外に残った本人には虎口の筋を示す。
    if (rt.flags.stage === 4 || rt.flags.stage === 5) {
      if (gl(rt.player.u.pos.x, rt.player.u.pos.z)[1] > -12) return this.gatePin(rt);
      if (rt.flags.stage === 4) return NINO_PIN;
      const p = rt.player.u.pos;
      const pin = rt.flags.honPin || (rt.flags.honPin = { label: '本丸の門', r: 1.5, hideDistance: 0 });
      return honWay(p, HON_PIN, pin);
    }
    if (rt.flags.stage !== 3) return undefined;
    return this.gatePin(rt);
  },
  gatePin(rt) {
    // 門の内だけを指すと、塀の外から角を横切ろうとして止まる。
    // 寄せ手と同じ喰違の筋を示し、角の手前で印を消さない。
    const p = rt.player.u.pos, zone = gateZone(p.x, p.z);
    if (zone === 'in') return GATE_PINS[3];
    if (zone === 'rec' || zone === 'lane') return GATE_PINS[2];
    const a = gl(p.x, p.z)[0];
    return zone === 'out' && a > 3.8 && a < 15 ? GATE_PINS[1] : GATE_PINS[0];
  },
  missionPinFallback: true,
  noReserve: true, noWake: true, noTaishoRaid: true, noDespair: true,
  // 城兵の加勢は二の丸の段で出す。共通の待つ備は noReserve を見ずに
  // 新手を足し、虎口の追撃中にも岩場で重なって止まった（246秒・十一人）。
  ownReserve: true,
  // 出撃・追撃はこの戦の道筋で動かす。共通の敵寄せが門の守りを坂へ呼ぶと、虎口で重なり、待機と撤退の下知も消える。
  noGoalFoe: true,
  noCavalryMix: true,   // 坂と狭い虎口を登る隊は定義どおり徒歩。名のある将の馬上指定は残す
  // 行き先は黄色の印一つだけ（ついていく相手の青い印は出さない）。敵は頭上の▼で分かる（kaito AG・AT・AV15）
  noLeaderFollow: true, enemyTriangleSigns: true,
  // 11/18 18:30 持ち主 ⑥（段4 二の丸の写真 中前・中右：赤い▼が八〜十並び、兵より印が目立った）：根白坂と同じく、本人を狙う敵と二十五m 内の近い六人だけに▼
  enemySignVisible: (rt, u) => {
    const me = rt.player.u, p = me.pos;
    if (rt._triT !== rt.t) {
      rt._triT = rt.t; const near = rt._triNear || (rt._triNear = new Set()); near.clear();
      const c = rt._triCand || (rt._triCand = []); c.length = 0;
      for (const v of rt.army.units) { if (!v.alive || v.team === me.team || v.isStruct) continue; const d = (v.pos.x - p.x) ** 2 + (v.pos.z - p.z) ** 2; if (d < 625) c.push(d, v); }
      for (let k = 0; k < 6 && c.length; k++) { let bi = 0; for (let j = 2; j < c.length; j += 2) if (c[j] < c[bi]) bi = j; near.add(c[bi + 1]); c.splice(bi, 2); }
    }
    return u.target === me || u.atk?.target === me || rt._triNear.has(u);
  },   // （11/18 cloud-08：200秒の写真で塀際・坂の敵の頭上に赤い▼が二十ほど並び、軍勢の絵より印が目立った。本人の二十五m 内と、本人を狙う敵だけに▼）
  // 行き先の印を出しても、共通の表示省略で武将の名札を隠さない。
  keepBattleSigns: true,
  // 行き先は頭上の金の▼一つ（ピン・旗の輪・矢印を重ねない）。目標は段の四つだけ（「敵を何人討つ」で埋めない。kaito AR1・AW3・BH6）
  goalSignOnly: true, goalSignOnscreenOnly: true, goalSignNoEdge: true, stageGoalsOnly: true, goalsAllRows: true, goalsVisibleRows: 5,
  retryGoalCount: (rt) => Math.max(0, (rt.flags.stage || 1) - 1),
  // 保存して開き直した時も、着陣からではなく今の段へ戻す。
  checkpointStep: (rt) => rt.flags.stage || 0,
  resumeSteps: [1, 2, 3, 4, 5].map((s) => [s, function (rt) { this.go(rt, s); }]),
  resumeAt(rt, s) {
    const F = rt.flags;
    // 保存の印は隊を作り直した後に戻る。済んだ木戸の撤退と熊井の出撃も戻す。
    // 迎撃以降からの再開では、突破済みの木戸の守りを坂へ戻さない。
    // 段だけ保存され木戸の印が無い場合も、門前へ進んだ事から復元する。
    if (s >= 2 || F.kidoFell) { F.kidoFell = true; this.retreatKido(rt); }
    // 迎撃を流し直すと門は開く。保存した閉門・破門・付け入りを実物にも戻す。
    // 印だけ戻すと、破ったはずの塀が復活し、付け入り後の寄せ手が虎口で詰まる。
    if (s === 3) {
      const gate = this.gateRef(rt), st = gate?.struct;
      if (F.breached && st) {
        st.hp = 0; st.alive = false;
        gate.fall?.();
        this.breach(rt);
      } else if (F.tsukeiri) {
        this.gateOpen(rt);
        this.breach(rt);
        F.gw = { route: [INNER, HONF], i: 0, aggro: 8 };
        F.gateGuard.aggro = 1; this.walk(F.gateGuard, F.gw, rt.t);
      } else if (F.shut) {
        closeGate(gate);
        // 段の作り直しで入った追撃の道順を、閉門後の持ち場へ戻す。
        // 閉じた門の内側を目指したままでは、掛矢の二番手も虎口に詰まる。
        this.march(rt, F.gamo, [MOUTH], 14);
        this.march(rt, F.gamo2, [this.roadAt(this.along(MOUTH.x, MOUTH.z) - 20), this.roadAt(this.along(MOUTH.x, MOUTH.z) - 10)], 14);
        F.laddersUp = false;
        this.ladders(rt);
      }
    }
    if (s === 5 && F.lastStand) F.hon.aggro = 40;
    // 夕暮れの印だけ戻して朝の空を残さない。
    if (rt.flags.dusk) { rt.world.dayClock = null; rt.world.setTime('dusk'); }
    // 再開では主人公を段の入口へ戻す。保存した通過済みの印で虎口の折れを飛ばさない。
    F.botFront = false; F.botIn = false;
    F.botPast = s >= 5;   // 本丸の再開地点（二の丸）は虎口を抜けた先。門へ引き返さない。
    F.botProg = null;
    return s === 1 ? SPAWN : s === 2 || s === 3 ? rt.flags.meet : s === 4 ? INSIDE : ninomaru.NINO;
  },
  sideTaskAfter: Infinity,   // 門の櫓を取る別の目標と字の案内（「櫓の入口から中へ」）を出さない。段の四つの目標だけ
  goalSignAction: (rt) => ['', '門の前へ進め', '坂で迎え撃て', '門の内へ入れ', '二の丸を討ち払え', '本丸へ攻め入れ'][rt.flags.stage || 0] || '',
  // 奥の軽い作りの乱戦（見せかけの軍勢）は置かない。戦うのは場にいる本物の兵だけ（kaito AP9・AQ6・⑥）
  noFrontFill: true,
  camPull: 4.5,   // 11/2 カメラが兵に寄りすぎ：後ろへ引いて、坂の上の城と味方の列を一緒に写す
  // 部将として先頭を駆ける戦。受ける傷を六割に、戦っていない間は少しずつ息が戻る
  playerTaken: 0.33, playerRegen: 0.04,   // 15分の長い攻めなので、受ける傷を軽く（坂と門の矢で倒れ続けた。11/8 bot）
  // 11/18 クラウド（act bot）：二の丸・本丸の乱戦で足軽の一突きが床（命の四割）の四十ずつ入り、囲まれて三突きで倒れた（二回）。城の内の段だけ床を八割に（K360⑦ の下限）
  floorMult: () => 0.8,   // 11/19 cloud-08（kaito 11/18「少し軽く」・下限0.8倍）：坂の段（assault）でも一太刀の床を八割に（act bot 6回中2回、坂で150・298秒に倒れた）
  meleeGrace: { rate: 1, burst: 1, interval: 3.5, k1118: true },   // kaito 11/18「少し軽く」：刃の後の猶予を三秒半に（本丸の段で本丸・門の守りに囲まれ一太刀の床が続けて当たり九秒で倒れた・cloud-11・cloud-49。同時に打つ数は変えない）
  // 深手では、迫る一撃だけ受けて味方の陰へ退く。防御を優先し続けて回復のための退き方を止めない。
  botGuardFlee: (rt) => !!rt.flags.botRest || rt.player.u.hp < rt.player.u.maxHp * 0.45,
  // 乱戦の濃さは控えめに（段の的の隊は寄せに引き抜かない）
  // 坂と門の段は時との勝負なので寄せの小勢を出さない（城の内へ入ってから乱戦）
  get alwaysMelee() { return CALM ? false : undefined; },
  frontlineDensity: { strength: 0.8, active: (rt) => (rt.flags.stage || 0) >= 3, canSend: (rt, g) => !g.noFrontline },
  quietArmyCalls: true,   // 11/17 iMac 検品（kenpin/t07_ganjaku_6koma.jpg）：本丸の段で中央に「味方が追撃に移った」の字が浮いた。字は出さず、退く敵の背と幟の動きで見せる
  world: {
    camBlockRocks: true,   // 11/17 iMac n-map（K360 検品）：大きな岩をカメラの寄せで避ける（倒れた後の視点の前を岩の板が覆った）
    noFake: true,   // 11/13 K285（kaito「本物の兵しか映したらいけない」）：絵だけの兵を作らない。映る兵は全員 戦の中の本物
    namedKacchu: TOYO_GAMO_KACCHU,
    strictFireOrders: true,   // 出撃後の櫓は、近い主人公にも味方越しに撃たない
    smokeFogFloor: 90,   // 硝煙の見通しは地形の設定から読む。門と敵を霧で隠さない
    seed: 158704, time: 'morning',   // 未明に攻め懸かり、日中に落とす（午前四時〜午後四時の伝え）。段2で日中、刻限が近づくと夕に
    muddy: 0.05, terrainTags: true,
    groundHalf: 260, moveLim: 250,
    paths: [ROAD, ROAD_IN],
    height,
    // 岩の多い山：高い所と急な所ほど岩肌の灰に寄せる
    tint(x, z, h, c) {
      const n = Math.sin(x * 0.11 + z * 0.07) * Math.sin(z * 0.09 - x * 0.05) + 0.5 * Math.sin(x * 0.37 + z * 0.29);
      const k = clamp((h - 60) / 50, 0, 1) * 0.5 + clamp((n - 0.3) / 0.7, 0, 1) * 0.35;
      // 11/18 22:30 持ち主 ⑥（gate4 中200秒の写真：本丸の下の斜面が一面の淡い裸土で、砂の丘に見えた）：寄せる灰を苔と草の混じる灰緑に（色から草の割合を読むので、岩の間に草が残る）
      c.setRGB(c.r * (1 - k) + 0.41 * k, c.g * (1 - k) + 0.42 * k, c.b * (1 - k) + 0.34 * k);
    },
    clear: (x, z) => distToPolyline(x, z, ROAD) < 7 || distToPolyline(x, z, ROAD_IN) < 7 || Math.hypot(x - HON.x, z - HON.z) < 22 || Math.hypot(x - GATE.x, z - GATE.z) < 24 || Math.hypot(x - YAGURA.x, z - YAGURA.z) < 6,   // 矢倉の脚の間に木を生やさない
    trees: 380, tufts: 1200,
    treeDensity: (x, z) => (distToPolyline(x, z, ROAD) < 16 ? 0.3 : Math.hypot(x, z) > 60 ? 1.2 : 0.5),   // 大手の坂の脇はまばらに（麓から二の丸の門と塀が見える）
    fleeOut: (x, z, team) => team === 1 && Math.hypot(x, z) > 200,
    // 兵の歩みを喰違の筋に沿わせる（門の外 → 門の前の窪み → 横の筋の門 → 門の内）。塀に向かってまっすぐ押し続けない
    // 敗走中は共通の歩みが moveWay を呼ばない。四歩先へ逃げるだけでは
    // 虎口の折れを選べず塀に残るため、内側へ抜けるまでは同じ道順を使う。
    fleeWay: (army, u, want) => {
      if (u.team !== 1 || gl(u.pos.x, u.pos.z)[1] <= -12) return want;
      return t07_ganjaku.world.moveWay(army, u, INNER);
    },
    moveWay: (army, u, want) => {
      const hon = honWay(u.pos, want, u._t07HonWay || (u._t07HonWay = { x: 0, z: 0 }));
      if (hon !== want) return hon;
      // 坂の木戸も開口部を通る。横に広がった後列は柵へ直進すると、
      // 近い避け足だけでは抜けられないため、まず柵の手前で道の中央へ寄せる。
      const dx = u.pos.x - KIDO.x, dz = u.pos.z - KIDO.z;
      const wx = want.x - KIDO.x, wz = want.z - KIDO.z;
      const b = dx * KD.x + dz * KD.z, wb = wx * KD.x + wz * KD.z;
      if (b * wb < 0) {
        const a = dx * KP.x + dz * KP.z, wa = wx * KP.x + wz * KP.z;
        const cross = Math.abs(a + (wa - a) * b / (b - wb));
        if (cross > 3 && cross < 13) {
          const side = (b < 0 ? -1 : 1) * (Math.abs(a) > 2 ? 3 : -3);
          const q = u._t07KidoWay || (u._t07KidoWay = { x: 0, z: 0 });
          q.x = KIDO.x + KD.x * side; q.z = KIDO.z + KD.z * side;
          return q;
        }
      }
      const k = gateZone(u.pos.x, u.pos.z);
      if (!k) return want;
      const w = gateZone(want.x, want.z) || (Math.hypot(want.x - GATE.x, want.z - GATE.z) > 30 ? (wantInside(want) ? 'in' : 'out') : null);
      if (!w || w === k) return want;
      const inward = w === 'in' || (w === 'lane' && k !== 'in') || (w === 'rec' && k === 'out');
      if (inward) {
        if (k === 'out') { const a = gl(u.pos.x, u.pos.z)[0]; return w === 'rec' ? want : a > 3.8 && a < 15 ? FRONT : MOUTH; }
        // 横の筋にいる後列も、まず門の内側の角を通る。
        // INNER へ直進すると奥の塀を斜めに横切り、列の持ち場へ戻れず止まる。
        return k === 'rec' || k === 'lane' ? INSIDE : INNER;
      }
      // 塀の裏に寄った後列は、まず内側へ回してから横の筋へ入れる。
      // 角までの距離だけで切り替えると、塀へ斜めに突き当たり、
      // 角から離れた所では行き先が戻ってしまう。
      if (k === 'in') {
        const [a, b] = gl(u.pos.x, u.pos.z);
        if (b <= -6.2 && a > -4.5) return INNER;
        return b >= -4.5 && b <= -1.5 ? FRONT : INSIDE;
      }
      return k === 'lane' ? FRONT : k === 'rec' ? MOUTH : want;
    },
  },
  // 二の丸の門・塀・狭間の射撃（siege_kit）。守り手の矢と鉄砲は門へ近づくほど激しい
  siegeKit: { plan: SP, build: { team: 1, wall: 'dobei', gateHp: 260, fire: { hurt: 0.011, rain: 0.35, peak: 4, near: 60 } }, when: (rt) => (rt.flags.stage || 0) <= 1 },   // 門が開いて打って出た後は、狭間から味方越しに撃たない

  // 蒲生の後備（段2で坂の下から上がる。段2を通らない再開では段4に門の外の坂から出す）
  rear(rt, s) {
    const F = rt.flags;
    if (!F.allies.includes(F.gamo3)) {
      const back = this.roadAt(this.along(MOUTH.x, MOUTH.z) - (s === 2 ? 75 : 26));
      F.gamo3 = allyGroup(rt, { name: '蒲生の後備', faction: 'gamo', flag: 'sashi:tsuru:#ece6d6:#201f1c', anchor: { x: back.x, z: back.z }, facing: Math.atan2(GATE.x - back.x, GATE.z - back.z), width: 6, aggro: 14, noRout: true, fullStrength: true },
        [{ type: 'samurai', n: 5 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 3 }]);
      F.gamo3.noFrontline = true;
      F.allies.push(F.gamo3);
    }
  },
  setup(rt) {
    ganjakuNoBlueCall(rt);
    const F = rt.flags;
    CALM = true; F.stones = [];   // 投石の経過も段の再開時に巻き戻す
    F.stage = 0; F.ending = false; F.ek = 0; F.ak = 0; F.t0 = rt.t; F.stageT = rt.t; F.honT = 0;
    if (rt.player.canRide && rt.player.mounted) rt.player.toggleMount();
    const W = rt.world, faceUp = Math.atan2(GATE.x - SPAWN.x, GATE.z - SPAWN.z);

    // ---- 攻め手（docs/battle_refs/t07_ganjaku.md）：大手は蒲生、搦手は前田。秀吉は馬ヶ岳の本陣にいて、この山には来ない ----
    // 蒲生の先手（主人公はこの列と坂を登る）。蒲生家の対い鶴は既存の鶴紋の描画を共用する。
    F.gamo = allyGroup(rt, { name: '蒲生の先手', faction: 'gamo', flag: 'sashi:tsuru:#ece6d6:#201f1c', anchor: { x: SPAWN.x + 6, z: SPAWN.z - 4 }, facing: faceUp, width: 8, aggro: 14, noRout: true, fullStrength: true },
      [{ type: 'samurai', n: 1, o: { name: '蒲生郷成' } }, { type: 'samurai', n: 8 }, { type: 'ashigaru', n: 4, o: { tatake: true } }, { type: 'ashigaru', n: 26 }, { type: 'bow', n: 5 }, { type: 'gun', n: 6 }]);
    F.gamo2 = allyGroup(rt, { name: '蒲生の二番手', faction: 'gamo', flag: 'sashi:tsuru:#ece6d6:#201f1c', anchor: { x: START.x + 36, z: START.z - 9 }, facing: faceUp, width: 8, aggro: 14, noRout: true, fullStrength: true },   // 11/18 クラウド：本人の真後ろでなく坂の筋の36m 前に置き、本人が列の背を見て登る（874×402 の始めの写真で坂の前が空だった）
      [{ type: 'samurai', n: 6 }, { type: 'ashigaru', n: 2, o: { tatake: true } }, { type: 'ashigaru', n: 20 }, { type: 'gun', n: 4 }]);   // 先頭は竹束を抱えて登る（持つ者の後ろには弾が通りにくい。kaito 二3・十3）
    F.allies = [F.gamo, F.gamo2];
    // 既存の二番手が本人の脇から先手へ合流する。着陣の麓で一人にせず、兵は増やさない。
    this.march(rt, F.gamo2, [START, { x: SPAWN.x - 8, z: SPAWN.z + 8 }], 14);
    // 搦手（北東の尾根）から寄せる前田勢。本丸の段で搦手の守りを破って本丸へ入る
    F.maeda = allyGroup(rt, { name: '前田勢', faction: 'maeda', flag: 'maeda', anchor: { ...KARA_OUT }, facing: Math.atan2(-KARA_OUT.x, -KARA_OUT.z), width: 8, aggro: 12, noRout: true, fullStrength: true },
      [{ type: 'busho', n: 1, o: { name: '前田利勝', horse: true } }, { type: 'samurai', n: 8 }, { type: 'ashigaru', n: 22 }, { type: 'gun', n: 4 }]);   // 11/9 重さ：始まりの本物の兵 294 を減らすため足軽を少し減らした。利長は馬上で旗本の侍に囲まれる
    // 麓の蒲生の本陣：大手の大将の蒲生氏郷は旗本の侍に囲まれ、坂の下の幕の前で床几に座り、前に出ない
    F.honjin = allyGroup(rt, { name: '蒲生の本陣', faction: 'gamo', flag: 'sashi:tsuru:#ece6d6:#201f1c', anchor: { x: -168, z: 168 }, facing: faceUp, width: 6, aggro: 0, fixed: true, noAI: true, noRout: true, order: 'hold' },
      [{ type: 'busho', n: 1, o: { name: '蒲生氏郷', invuln: true, horse: false, armor: KIRI, mon: 'kuki', flag: 'sashi:tsuru:#ece6d6:#201f1c' } }, { type: 'samurai', n: 18 }, { type: 'gun', n: 4 }]);
    F.honjin.noFrontline = true;
    for (const u of F.honjin.units) if (u.name === '蒲生氏郷') u.jinchu = {};   // 座ったまま下知する
    try {
      rt.scene.add(jinmaku(W, -174, 174, 14, 9, 3, { mon: 'tsuru' }));
      for (const [x, z] of [[-160, 176], [-176, 160], [-182, 184], [-150, 186]]) rt.scene.add(nobori(W, x, z, 'sashi:tsuru:#ece6d6:#201f1c', 7));
    } catch (e) { console.warn(e); }
    const n = Math.min(12, RANKS[rt.G.rank || 0]?.squad || 0);
    if (n) rt.makeSquad({ x: START.x - 2, z: START.z + 3 }, faceUp, [{ kind: 'spear', n }]);
    // 二の丸の門の左右の櫓・岩の上の矢倉・大手の坂の上の西の尾根の物見櫓。坂の下から尾根の上に城の櫓が並んで見える
    { const n0 = rt.scene.children.length;
      try {
        for (const [x, z] of [[-45.4, 59.6], [-59.6, 45.4], [YAGURA.x, YAGURA.z]]) rt.scene.add(yagura(W, x, z, { mon: 'nadeshiko', team: 1 }));
        for (const [x, z] of [[-98, 64], [-84, 54]]) rt.scene.add(yagura(W, x, z, { mon: 'nadeshiko' }));   // 西の尾根の物見櫓は空（寄せ手が登れない櫓の上の一人に足止めされない）
      } catch (e) { console.warn(e); }
      farSight(rt.scene.children.slice(n0), { W, ground: { x: -40, z: 40, r: 60 } });
      // 門・塀（siege_kit は作りの後に組む）も霧に沈めない
      const n1 = rt.scene.children.length; rt.after(0.05, () => farSight(rt.scene.children.slice(n1), { W, near: { x: GATE.x, z: GATE.z, r: 40 } })); }

    this.nawabari(rt);

    // ---- 城方：秋月方の三千（大手は芥田悪六兵衛、搦手と本丸は城将の熊井越中守）----
    const foe = (name, at, list, o = {}) => enemyGroup(rt, { fixed: true, name, faction: 'akizuki', flag: 'nadeshiko', armor: AKI, anchor: { x: at.x, z: at.z }, facing: faceUp + Math.PI, order: 'hold', aggro: 9, width: 4, ...o }, list);
    F.slope = [
      // 坂の木戸は柵の内に槍を二重に並べ、侍が束ねる（一人で崩せる守りにしない。kaito 二3・BJ3）
      foe('坂の木戸の守り', { x: KIDO.x + KD.x * 3, z: KIDO.z + KD.z * 3 }, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }], { width: 7, aggro: 7 }),
      foe('坂の木戸の弓', { x: KIDO.x + KD.x * 8, z: KIDO.z + KD.z * 8 }, [{ type: 'bow', n: 5 }, { type: 'ashigaru', n: 5 }]),
    ];
    // 門の内で打って出る機を待つ芥田の手（段2で門を開けて坂へ突いて出る）
    F.sally = foe('芥田の手', INNER, [{ type: 'busho', n: 1, o: { name: '芥田悪六兵衛', horse: true } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 18 }], { aggro: 6, width: 6 });
    // 火縄銃・弓は遠くへ飛んでも当てるのは五十歩ほどまで（11/11 act：物見櫓の守りが三十二歩先から撃ち続け、○六十五で倒れた）。
    //   三十歩より遠い矢玉は半分、五十歩より遠い矢玉は二割に。近い矢玉と刃は変えない。
    { const P = rt.player, td = P.takeDamage; P.takeDamage = function (a, src) { const m = this.u.hitKind === 'gun' || this.u.hitKind === 'arrow';
      if (m && src?.pos) { const r = Math.hypot(src.pos.x - this.u.pos.x, src.pos.z - this.u.pos.z); a *= r > 50 ? .2 : r > 30 ? .5 : r > 15 ? .7 : 1; }   // 11/20 cloud-08：十五歩より遠い矢玉も七割に（坂の段で門の鉄砲が二十歩先から三発続けて当て、命77→38で倒れた・act bot 202秒）
      return td.call(this, a, src); }; }
    F.gateGuard = foe('門の守り', { x: INNER.x + 6, z: INNER.z - 6 }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }], { aggro: 7 });
    F.yagura = foe('矢倉の射手', YAGURA, [{ type: 'bow', n: 4 }, { type: 'gun', n: 2 }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 3 }], { aggro: 3 });   // 岩の上から射る。門の筋まで降りて来ない
    F.kara = foe('搦手の守り', KARA_IN, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 2 }], { facing: Math.atan2(KARA_OUT.x, KARA_OUT.z), aggro: 9 });
    // 本丸：城将の熊井越中守は旗本に囲まれて本丸の奥にいる（陣を割らないと届かない）
    // 後列まで北の板塀の内に収める。野戦の回り込みで持ち場を塀の外へ移さず、寄せ手を本丸で迎える。
    F.hon = foe('本丸の守り', { x: HON.x - 5, z: HON.z - 4 }, [{ type: 'busho', n: 1, o: { name: '熊井越中守', horse: true } }, { type: 'samurai', n: 8 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 2 }], { aggro: 8, width: 6, noAI: true });
    // 11/18 持ち主 ⑥（段5の写真）：本丸の塀の内に人影が少なく、千人の本丸が空に見えた。大手の口の左右の塀の内に弓・鉄砲の小組（本物）を置き、塀越しに坂へ射る
    F.honWall = [[-12, 3], [-3, 12]].map(([x, z], i) => foe(i ? '本丸の塀の射手（右）' : '本丸の塀の射手（左）', { x, z }, [{ type: 'bow', n: 3 }, { type: 'gun', n: 1 }, { type: 'ashigaru', n: 3 }], { aggro: 3, width: 3 }));
    for (const g of F.honWall) { g.dmgMultPlayer = 0.3; g.dmgMult = 0.6; }   // 本丸の段の倒れが続いた（11/18）ので、塀の内から本人へ射る矢玉は三割
    F.nino = ninomaru.make(rt, K);   // ④二の丸の曲輪の城兵（段4まで曲輪の奥で構える）
    F.foes = [...F.slope, F.sally, F.gateGuard, F.yagura, F.nino, F.kara, F.hon, ...F.honWall];
    F.gateGuard.dmgMultPlayer = 0.4; F.gateGuard.dmgMult = 0.5;   // 矢は組の倍（dmgMult）だけに従う（army_ranged の矢は本人の倍を見ない）。段3で一倍へ戻す   // 11/18 持ち主（act bot 171秒）：坂の段で門の前に着いた本人へ、塀の内の門の守りの矢と石が二十〜三十 m から背に重なり（三十秒で命80→0・傷52）倒れた。段3（門を抜ける）までは本人へ四割
    F.yagura.dmgMultPlayer = 0.25; F.yagura.dmgMult = 0.75;   // 11/18 05:25 持ち主：四割でも act bot 261秒、坂の段で矢倉の射手の傷138（弓と鉄砲と降りた足軽）で倒れた。本人へ二割五分・組の打ち込み七割五分（一突きの床も下げる）   // 11/18 持ち主：act bot の傷の一番が矢倉の射手（一戦で100・坂の段で命13→3）。岩の上から本人へ射る矢だけ四割に（味方へはそのまま）
    // 城の守りと寄せ手を別の乱戦へ抜かず、決めた道筋と持ち場を守る。
    for (const g of [...F.foes, ...F.allies, F.maeda]) g.noFrontline = true;
    F.hon.noRout = true;   // 本丸の守りは崩れて逃げない（熊井越中守は本丸で討死した）
    F.hon.dmgMult = Math.min(F.hon.dmgMult ?? 1, 0.62);   // 11/18 持ち主：0.75 でも本丸で足軽の一突き三十余りが三秒おきに三つ続き命百→五（act bot 241秒）。床がこの倍に従うので六割強へ
      // 11/18 見回り：act が本丸の段で守りに囲まれ倒れる事が続く（229秒・背から）。本丸の守りの打ち込みを少し軽く
    // 城攻めの段（siege_stages.js・docs/siege_honjin_spec_1107.md 5・13章）：坂の木戸 → 打って出た芥田の手 → 門 → 本丸。
    //   今の段の守りだけが打って出て、奥は持ち場で構えて待つ。段が長引けば使番が知らせる（11章）
    // 退く先と行軍は go・ninomaru が指示する。共通の at を重ねると、四割未満の残兵の退く下知が hold に戻される。
    F.stages = siegeStages(rt, [
      { groups: F.slope, done: () => F.stage >= 2, report: '二の丸の門前へ、まだ登り切れませぬ！', reportAfter: 70 },
      { groups: [F.sally], done: () => F.stage >= 3 },
      { groups: [F.gateGuard, F.yagura], done: () => F.stage >= 4, report: '二の丸の門の内へ、まだ進み切れませぬ！', reportAfter: 60 },
      { groups: [F.nino], done: () => F.stage >= 5 },
      { groups: [F.hon, F.kara, ...F.honWall], done: () => false },
    ], { runner: '使番' });

    this.goalsHud(rt);
    rt.setPhase('brief');
    // 着陣（段0）：麓を埋める本隊と鉄砲の撃ちかけを見て、坂の下の蒲生の先手まで歩く（t07_ganjaku/chakujin.js）
    tahoumen.install(rt);
    chakujin.install(rt, K);
    honjin.install(rt);
    // 合流先の印だけでなく任務も登録し、着陣中の案内を待機扱いにしない。
    rt.obj('arrival', '大手の坂の下で蒲生の先手に合流する', 'order');
    rt.marker('t07', SPAWN, '大手の坂の下', { h: 3 });
    rt.say('蒲生氏郷', '殿下の命じゃ。島津に付いた秋月の岩石城を、今日のうちに落とす', 3.6);
    rt.after(3.9, () => rt.say(rt.G.name || '主人公', '一日で？　この岩山を', 2.4));
  },

  // 共通の任務札は今の一行だけなので、目標の札（hud_goals）で置き換え、①〜④を最初から全部並べて済んだ物に印。
  //   両軍の兵の数の棒（armybar）も上に出す（kaito 九1・九3・十1）。根白坂・真田丸と同じ作り。戦が終われば元へ戻す
  goalsHud(rt) {
    const hud = rt.hud;
    if (!hud || !hud.root || typeof document === 'undefined') return;
    hud.root.classList.add('ganjaku-goals');
    const st = document.createElement('style');
    const H = 'html:root body #hud#hud#hud.ganjaku-goals', P = `${H} #h-prog#h-prog.goal-mode`;
    st.textContent = `
/* 岩石城では操作を攻撃に絞り、「守る」の釦を出さない。戦を離れたらこの指定も外す。 */
html:root body:has(#hud.ganjaku-goals) #tc [data-b="guard"] { display:none !important; }
${H} #armybar:not([hidden]) { display:grid !important; visibility:visible !important; opacity:1 !important; }
${H} #armybar .clock { visibility:hidden !important; }
/* 11/18 クラウド：中央の声（#center-call の .cc）が出ている間は数の棒を隠す（874×402 で戦の終わりに重なった・bot） */
html:root body #hud#hud#hud#hud.ganjaku-goals:has(#center-call .cc:not(.blue)) #armybar { visibility:hidden !important; }
html:root body:has(#intro:not([hidden]) > .card) #hud#hud#hud.ganjaku-goals :is(#armybar, #h-prog) { visibility:hidden !important; }
${P} > :not(.pg-goals) { display:none !important; }
${P} > .pg-goals { display:block !important; }
${P} {
 left:auto !important; right:calc(12px + env(safe-area-inset-right, 0px)) !important; transform:none !important;
 width:auto !important; min-width:0 !important; max-width:min(390px, 44vw) !important; box-sizing:border-box;
 padding:8px 12px 9px 10px !important; background:rgba(14,12,10,.7) !important; border:none !important; border-radius:6px !important; }
${P} .pg-goals li { white-space:normal !important; align-items:flex-start; color:#e6dfd2 !important; }
${P} .pg-goals li i { margin-top:3px; }
${P} .pg-goals li span { color:inherit !important; background:none !important; }
${P} .pg-goals li.now { color:#fff !important; }
${P} .pg-goals li.done { color:#cfc9bc !important; }
@media (max-height:500px) {
 ${P} .pg-goals li, ${P} .pg-goals li.now { font-size:13px !important; line-height:1.3; gap:6px; padding:0; }
 ${P} .pg-goals ul { gap:3px; }
}
${P} .pg-goals :is(h3 b, li em) { display:none !important; }`;
    document.head.appendChild(st);
    const hudProgress = hud.progress;
    hud.progress = function (battle) {
      const out = hudProgress.call(this, battle);
      if (battle === rt && this.prog && !rt.over) goalsTick(this.prog, rt);
      return out;
    };
    const dispose = rt.dispose;
    rt.dispose = function () {
      hud.progress = hudProgress;
      if (hud.prog) hud.prog.classList.remove('goal-mode');
      hud.root.classList.remove('ganjaku-goals'); st.remove();
      return dispose.call(this);
    };
  },

  // 岩石山の巨岩と本丸の囲い（docs/battle_refs/t07_ganjaku.md。天守は無い中世の山城）
  nawabari(rt) {
    const W = rt.world;
    try {
      // 本丸：頂を板塀で囲む（南西の大手と北東の搦手の筋に口）。塀の内に掘立の小屋と秋月方の旗
      const R = 15, N = 12;
      for (let i = 0; i < N; i++) {
        const a0 = 3 * Math.PI / 4 + (i - 0.5) * 2 * Math.PI / N, a1 = a0 + 2 * Math.PI / N;
        if (i === 0 || i === 6) continue;   // 南西の大手と北東の搦手に口
        const seg = [Math.cos(a0) * R, Math.sin(a0) * R, Math.cos(a1) * R, Math.sin(a1) * R];
        rt.scene.add(castleBoardFence(W, seg, { h: 2.4, boardCap: true, unevenBoards: true, groundBoards: true }));
        Object.assign(solidSeg(...seg, 0.15), { missileH: 2.4, missileType: 'wood' });
      }
      this.dorui(rt, R, N);
      // 本丸の大手（南西）と搦手（北東）の口に冠木門、塀の内に物見の櫓（中世の山城の本丸。天守は無い）
      for (const k of [-1, 1]) rt.scene.add(kabukimon(W, -k * R * Math.SQRT1_2, k * R * Math.SQRT1_2, 6.4, -Math.PI / 4, { doors: false }));
      rt.scene.add(yagura(W, 5, 9, { mon: 'nadeshiko', boarded: true }));   // 本丸の物見は板囲いと屋根の井楼（骨組みだけにしない）
      rt.scene.add(hut(W, 6, -6, 7, 4.5, Math.PI / 4, { solid: false }));
      solidRect(6, -6, 7, 4.5, Math.PI / 4);
      for (const [x, z] of [[-9, -6], [9, 7], [2, -12]]) rt.scene.add(nobori(W, x, z, 'nadeshiko', 6));
      // 大手道の坂の木戸：道を横切る柵（道の筋に八 m の木戸口を空ける）。柵の内に坂の守りと弓。
      //   冠木門は置かない（低い冠木の下を通る時にカメラの前を塞いだ）
      for (const k of [-1, 1]) {
        const a = 4, b = 12, seg = [KIDO.x + KP.x * a * k, KIDO.z + KP.z * a * k, KIDO.x + KP.x * b * k, KIDO.z + KP.z * b * k];
        rt.scene.add(palisade(W, seg, { solid: true, h: 2.2 }));
      }
      rt.scene.add(nobori(W, KIDO.x + KD.x * 5 + KP.x * 6, KIDO.z + KD.z * 5 + KP.z * 6, 'nadeshiko', 6));
      // 11/18 クラウド ③：二の丸の曲輪に城方の幟が一本も無く、坂から見上げた城が空に見えた（段3の写真）。大手道の両脇に撫子の幟を林に立てる（道の筋は空ける）
      for (const [x, z] of NINO_NOBORI) rt.scene.add(nobori(W, x, z, 'nadeshiko', 6));
      // 11/18 持ち主 ⑥（段5の写真）：本丸の冠木門の前の坂が平たい土の一枚で、籠城の跡が無かった。本丸へ運び上げる途中で捨てた兵糧の俵・樽・箱を道の脇へ（道の筋は空ける）
      wayLitter(rt, [[-38, 38], [-30, 30], [-19, 19]], { seed: 1587, step: 6, off: 4.8, clear: 3.8, kinds: ['sack', 'barrel', 'sack', 'box_a', 'crate'],
        skip: (x, z) => Math.hypot(x, z) < 18.5 || Math.hypot(x - YAGURA.x, z - YAGURA.z) < 5 || NINO_NOBORI.some(([a, c]) => Math.hypot(x - a, z - c) < 2.5) });
    } catch (e) { console.warn(e); }
    // 巨岩：本丸の縁・国見岩・大手の坂の両脇・上の斜面。坂と門と段の行き先は空ける
    const keep = [[{ x: 5, z: 9 }, 4], [SPAWN, 16], [GATE, 30], [YAGURA, 12], [{ x: -168, z: 168 }, 34], [{ x: -98, z: 64 }, 8], [{ x: -84, z: 54 }, 8], [INNER, 10], ...NINO_NOBORI.map(([x, z]) => [{ x, z }, 3]), [{ x: -84, z: 112 }, 10], [{ x: -112, z: 132 }, 10], [KARA_IN, 10], [{ x: 16, z: -16 }, 9], [{ x: 46, z: -46 }, 9], [KARA_OUT, 12], [KIDO, 13], ...LAD.map((l) => [l.foot, 6])];
    const free = (x, z, s) => distToPolyline(x, z, ROAD) > 8 + s && distToPolyline(x, z, ROAD_IN) > 9 + s && distToPolyline(x, z, KARA_PATH) > 3 + s && keep.every(([c, r]) => Math.hypot(x - c.x, z - c.z) > r + s);
    const list = [[15, -19, 8]];   // 国見岩（頂の東）
    let seed = 1587;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 18; i++) {   // 本丸の縁（南西の口を残す）
      const a = 3 * Math.PI / 4 + 0.7 + i * (2 * Math.PI - 1.4) / 17, r = 20 + rnd() * 5;
      list.push([Math.cos(a) * r, Math.sin(a) * r, 3 + rnd() * 3]);
    }
    // 大手の坂の両脇の岩の壁（「切り立った岩の間の坂」。坂の筋は空ける）
    for (let k = 1; k < ROAD.length; k++) {
      const [ax, az] = ROAD[k - 1], [bx, bz] = ROAD[k], len = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / len, tz = (bz - az) / len;
      for (let u = 0; u < len; u += 8) for (const side of [-1, 1]) {
        const s = 2.4 + rnd() * 2.6, off = 8.6 + s + rnd() * 3;
        list.push([ax + tx * u - tz * off * side, az + tz * u + tx * off * side, s]);
      }
    }
    for (let i = 0; i < 400 && list.length < 120; i++) {   // 大手の坂の両脇と上の斜面
      const a = 3 * Math.PI / 4 + (rnd() - 0.5) * (i % 3 ? 0.8 : 3.6), r = 30 + rnd() * 120;
      list.push([Math.cos(a) * r, Math.sin(a) * r, 1.6 + rnd() * rnd() * 5]);
    }
    const rocks = list.filter(([x, z, s], i) => i === 0 || (Math.hypot(x, z) > 17 + s && free(x, z, s)));
    const mat = graniteMat();   // 岩石山の白っぽい花崗岩（割れ目・斑・苔・雨の筋）
    const mesh = new THREE.InstancedMesh(rockShape(1, false, 2), mat, rocks.length);
    const pose = new THREE.Object3D();
    rocks.forEach(([x, z, s], i) => {
      pose.position.set(x, W.heightAt(x, z) - s * 0.15, z);
      pose.rotation.set(0.25 * Math.sin(i * 1.7), i * 2.3, 0.2 * Math.cos(i * 0.9));
      pose.scale.set(s * (i % 3 === 0 ? 1.3 : 1.0), s * (i % 2 ? 1.7 : 1.3), s * 0.85);   // 角ばって立つ花崗岩
      pose.updateMatrix(); mesh.setMatrixAt(i, pose.matrix);
      if (s > 2) Object.assign(solidCircle(x, z, s * 0.9), { missileH: s, missileType: 'dust' });
    });
    mesh.castShadow = mesh.receiveShadow = true;
    try { groundRocks(W, mesh); } catch (e) { console.warn(e); }
    rt.scene.add(mesh);
  },

  // 本丸の板塀の外の土塁：塀の根元に土を盛り、外へなだらかに落とす（板の箱が地面に置いてあるだけに見せない。kaito 四5）
  dorui(rt, R, N) {
    const W = rt.world, pos = [], col = [], idx = [];
    const prof = [[R - 0.5, 0.05], [R + 0.35, 0.75], [R + 1.4, 0.55], [R + 3.2, -0.25]];
    // 11/18 夜50-41：200秒の写真で本丸の右が模様の無い灰白の平たい面に見えた（renraku 1745・raycast で当たったのはこの土塁）。
    //   地面と同じ土の絵（W.groundU.tDirt）を貼り、色は絵に掛ける薄い色味（頂は土、法は草の混じる土手）にする
    const tex = W.groundU && W.groundU.tDirt && W.groundU.tDirt.value;
    // 11/18 22:10 持ち主 ⑥（gate4 中200秒の写真：本丸の口の右の土塁が淡い砂の山一色で、土手に見えなかった）：頂を締まった土、外の法を草の混じる暗い土手へ
    const C = tex ? [[0.64, 0.56, 0.44], [0.72, 0.63, 0.49], [0.47, 0.54, 0.32], [0.41, 0.50, 0.29]] : [[0.36, 0.30, 0.21], [0.42, 0.36, 0.25], [0.34, 0.36, 0.22], [0.30, 0.34, 0.20]];
    const uv = [];
    const steps = 96, gap = Math.PI / N + 0.05;
    let row = 0;
    for (let k = 0; k <= steps; k++) {
      const a = 3 * Math.PI / 4 + (k / steps) * 2 * Math.PI;
      const da = Math.min(...[3 * Math.PI / 4, 7 * Math.PI / 4, 11 * Math.PI / 4].map((g) => Math.abs(a - g)));
      const lift = sstep(gap, gap + 0.12, da);   // 大手と搦手の口では土を盛らない
      const cx = Math.cos(a), cz = Math.sin(a);
      prof.forEach(([r, h], j) => {
        const x = cx * r, z = cz * r, n = Math.sin(a * 7 + j) * 0.08;
        pos.push(x, W.heightAt(x, z) + (h + n) * lift - (lift < 0.01 ? 0.4 : 0), z);
        uv.push(a * R / 3, r / 3);
        const c = C[j], v = 0.84 + 0.16 * Math.sin(a * 13 + j * 2.1) + 0.1 * Math.sin(a * 37 + j * 5.3);
        col.push(c[0] * v, c[1] * v, c[2] * v);
      });
      if (k) for (let j = 0; j < 3; j++) { const p0 = (row - 1) * 4 + j, p1 = row * 4 + j; idx.push(p0, p1, p0 + 1, p0 + 1, p1, p1 + 1); }
      row++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide, map: tex || null }));
    m.receiveShadow = true;
    rt.scene.add(m);
  },

  // 段を進める
  go(rt, s) {
    const F = rt.flags;
    if (F.ending || F.stage >= s) return;
    F.stage = s; F.stageT = rt.t; CALM = s < 4;
    // 段の変わり目で息を整える（一つの段の傷を次の段へ持ち越しすぎない）
    const pu = rt.player.u; if (pu.alive && s > 1) pu.hp = Math.max(pu.hp, pu.maxHp * 0.7);
    // 11/18 持ち主：act bot 345秒、門が破れて本丸へ退く門の守りに二の丸の道で囲まれ、命百から十五秒で倒れた。門を抜けた後の門の守りは崩れて退く手なので打ち込みを六割に（一突きの床は組の dmgMult に従う。dmgMultPlayer では床が下がらない）
    // 11/18 08:40 持ち主（act bot 226秒）：段3で門がまだ開かぬうち、坂 (-80,80) に出た門の守りの足軽に一突き三十二を背から重ねられ倒れた（門の守り135）。一倍へ戻すのは門を抜けた段4から
    if (s >= 4 && F.gateGuard && F.gateGuard.dmgMultPlayer != null) { F.gateGuard.dmgMultPlayer = null; F.gateGuard.dmgMult = 1; }   // 門を抜けた後は組の倍（段4から六割）に従う
    if (s >= 4 && F.gateGuard) F.gateGuard.dmgMult = Math.min(F.gateGuard.dmgMult ?? 1, 0.6);
    // 果たした段を済みにする（目標ごとに別の札。「少し前からやり直す」は最後に果たした段の所から始まる。kaito 五5）
    if (s > 1) rt.objDone('s' + (s - 1));
    rt.unmark('t07');
    tahoumen.stage(rt, s);   // 別の口の攻城と使番の知らせ
    // 味方の隊は持ち場を前へ移すだけ（兵は走って付いてくる。出し直さない）
    const A = (x, z) => {
      const m = this.along(x, z);
      F.allies.forEach((g, i) => { if (!g.routed) this.to(g, i ? this.roadAt(m - i * 10) : { x, z }); });
    };   // 坂で迎え撃つ時も、二番手は先手の後ろに置く（一点に重ねない）
    if (s === 1) {
      rt.objDone('arrival');
      F.walks = [];   // 着陣の合流を終え、坂を登る持ち場へ切り替える。
      F.t0 = rt.t;   // 日が沈むまでの時は、坂へ懸かってから数える
      rt.setPhase('assault');
      rt.obj('s1', '大手の坂を登り、二の丸の門の前へ出る', 'main');
      rt.marker('t07', MOUTH, '二の丸の門', { h: 3 });
      // 西の尾根の物見櫓は空に（共通の櫓の守り perch が上に射手を立てる。登れない櫓の上から坂の寄せ手を射続けて、門の前で倒れた）
      const A = rt.army;
      for (const u of A.units.slice()) if (u.alive && u.team === 1 && u.perch && [[-98, 64], [-84, 54]].some(([x, z]) => Math.hypot(u.pos.x - x, u.pos.z - z) < 6)) {
        A.scene.remove(u.mesh); A.units.splice(A.units.indexOf(u), 1);
        if (u.group) u.group.units.splice(u.group.units.indexOf(u), 1);
        u.alive = false; u.gone = true;
      }
      F.lead = 0;   // 蒲生の先手は自分と並んで坂を駆け上がる（update で坂の上へ持ち場を送る）
    } else if (s === 2) {
      // 味方だけが門前へ着いても段は進むが、麓に残った本人へ一番乗りの戦功は付けない。
      const p = rt.player.u.pos, gc = this.centerOf(F.gamo);
      if (Math.hypot(p.x - MOUTH.x, p.z - MOUTH.z) < 20 && (!gc || this.along(p.x, p.z) >= this.along(gc.x, gc.z))) {
        rt.award((t) => t.side.push('大手の坂を一番に登った'), '大手の坂を一番に登った');
      }
      try { if (!F.dusk) rt.world.setTime('day'); } catch (e) { /* 夕暮れに入った後は昼へ戻さない */ }
      rt.obj('s2', '門から打って出た秋月勢を坂で迎え撃つ', 'main');
      // 寄せ手は櫓の真下に留まらず、門から二十 m ほど下の坂で、出て来る秋月勢を受ける（門の櫓の真下で撃たれ続けない）
      F.meet = { ...this.roadAt(this.along(MOUTH.x, MOUTH.z) - 22), label: '大手の坂', r: 6, hideDistance: 0 };
      // 11/18 17:10 持ち主 ⑥（130秒の写真で坂に味方が十人ほどしか見えない・味方 4,392 と出ているのに近くの塊が薄い）：
      //   段4で上げていた蒲生の後備を、芥田の手が打って出る段2から坂の下より上げる（兵は増やさない。出す時を早めるだけ）
      this.rear(rt, s);
      A(F.meet.x, F.meet.z);
      this.march(rt, F.maeda, [KARA_OUT, { x: 44, z: -44 }, KARA_IN], 12);   // 搦手でも前田勢が列で尾根を攻め上る
      // 門が開き、芥田の手が喰違の筋を抜けて坂へ突いて出る（山中城の馬出しの出撃の型）
      this.gateOpen(rt);
      // 門の左右の櫓の射手も、打って出た味方の背越しには射ない（狭間と同じ。芥田の手と斬り合う所を櫓から撃ち続けない）
      for (const q of rt.army.groups) if (q.team === 1 && /物見櫓の守り|隅櫓の守り/.test(q.name || '')) q.dmgMult = Math.min(q.dmgMult ?? 1, 0.4);   // 11/9 見回り：櫓の二人ずつの射手が act の傷の半ばを占めた
      this.holdSallyFire(rt);
      const g = F.sally;
      g.aggro = 2; g.noRout = true; g.speed = (g.speed || 2.2) * 1.4;
      // 11/18 持ち主（act bot 176秒）：門の前で矢を浴びて待った本人へ、門を出た芥田の手の侍の一太刀三十八と足軽が六秒で重なり倒れた。出端の八秒だけ打ち込みを四割五分に（後は七割）
      g.dmgMult = 0.45; F.sallyEase = rt.t + 8; if (pu.alive) pu.hp = Math.max(pu.hp, pu.maxHp * 0.85);
      // 11/9 見回り：act が坂で芥田の手に背から囲まれ二度とも倒れた。打って出た手の打ち込みを少し軽く
      // 後列も虎口の折れに沿わせる。一直線の持ち場では塀の裏へ入り、門の内で重なる。
      g.roadColumn = true; g.followColumnRoad = true;
      F.sw = { route: [INNER, INSIDE, FRONT, MOUTH, F.meet], i: 0, aggro: 30 };   // 坂で受ける寄せ手と主人公へ三十 m から懸かる
      this.walk(g, F.sw, rt.t);
      rt.marker('t07', F.meet, '大手の坂', { h: 3, red: true, group: F.sally });   // 行き先は地名と距離。芥田の名は頭上の名札一つだけにする。
      rt.say('蒲生郷成', '門が開いた！　打って出て来るぞ。坂で受け止めよ', 3.2);
      sfx('wood', 0.8);
    } else if (s === 3) {
      // 虎口で詰まった出撃隊を刻限で退かせた場合は、交戦していない迎撃の戦功を付けない。
      if (F.fightT != null || F.sally.units.every((u) => !u.alive) || F.sally.units.some((u) => u.name === '芥田悪六兵衛' && !u.alive)) {
        rt.award((t) => t.side.push('打って出た秋月勢を退けた'), '打って出た秋月勢を退けた');
      }
      rt.obj('s3', '退く秋月勢を追い、門を抜けて城内へ入る', 'main');
      rt.marker('t07', INSIDE, '二の丸の門', { h: 3 });
      // 芥田の手は門の内へ駆け戻る。追いすがれば門は閉まらない（付け入り）
      const g = F.sally;
      // 支えきれず背を向けて城の奥（本丸の方）へ崩れ退く。振り返って斬り合わない（追い討ちされる側）
      const fx = HON.x - GATE.x, fz = HON.z - GATE.z, fl = Math.hypot(fx, fz);
      F.sw = null;
      // 組頭が生きていても退く下知を出す。士気を零にするだけでは共通の隊の決まりで踏みとどまる。
      // 坂に残った守りも、門の前が崩れたのを見て城の奥へ逃げ込む
      for (const q of [g, ...F.slope]) this.fleeIntoCastle(rt, q, fx / fl, fz / fl);
      F.allies.forEach((ga, i) => this.march(rt, ga, i ? [MOUTH, FRONT, INSIDE] : [MOUTH, FRONT, INSIDE, INNER], 14));
      F.gateGuard.aggro = 3;   // 門の守りは逃げ込む味方を入れるので手一杯。門の外の筋まで突いて出ない
      this.holdSallyFire(rt);   // 再開で迎撃を飛ばした時も、追撃中の坂へ櫓から撃たない。
      // 打って出た手が崩れたのを見て、門の櫓と岩の上の矢倉の射手も持ち場を捨てて本丸へ逃げ込む（一日で落ちた城の崩れ。門の前で寄せ手を射続けない）
      for (const q of rt.army.groups) {
        const c = q.team === 1 && q !== F.hon && q !== F.kara && q !== F.nino && q !== F.gateGuard && this.centerOf(q);
        if (!c || Math.hypot(c.x - GATE.x, c.z - GATE.z) > 45) continue;
        const dx = HON.x - c.x, dz = HON.z - c.z, dl = Math.hypot(dx, dz) || 1;
        this.fleeIntoCastle(rt, q, dx / dl, dz / dl);
      }
      rt.say('蒲生郷成', '敵が引くぞ！　門が閉まる前に、追って城内へ紛れ込め！', 3.2);
    } else if (s === 4) {
      rt.award((t) => t.side.push(F.tsukeiri ? '退く敵に付け入って門を抜けた' : '二の丸の門を抜けた'), F.tsukeiri ? '退く敵に付け入って門を抜けた' : '二の丸の門を抜けた');
      this.breach(rt); F.walks = [];
      // 11/18 夜50-41（K281 の厚み）：200秒の描かずの通しで、門を抜けた時の蒲生勢は先手8・二番手2まで減り、本人の60m内の味方が11人だった。
      //   門が破れたのを見て坂の下から蒲生の後備が上がり、先手の後ろについて二の丸・本丸へ攻め入る（兵は門の外の坂から出す）
      this.rear(rt, s);
      F.allies.forEach((ga, i) => this.march(rt, ga, [MOUTH, FRONT, INSIDE, INNER, { x: ninomaru.NINO.x - 4 - i * 6, z: ninomaru.NINO.z + 6 + i * 6 }], 14));
      ninomaru.start(rt, K);   // 二の丸の曲輪の乱戦と火（t07_ganjaku/ninomaru.js）
    } else if (s === 5) {
      // 本丸からの再開でも、作り直した二の丸の残兵に撤退の下知を戻す。
      ninomaru.retreat(rt);
      // 城兵が接敵せず退いた時は、曲輪への到着だけを討ち払いの戦功にしない。
      if (F.ninoRepelled) rt.award((t) => t.side.push('二の丸の曲輪を討ち払った'), '二の丸の曲輪を討ち払った');
      rt.obj('s5', TEXT[4], 'main');
      rt.marker('t07', HON, '本丸', { h: 3 });
      // 門の脇の塀は押し倒され、大手の寄せ手は本丸の口へなだれ込む（喰違の細い筋に詰まらない）
      this.breach(rt); F.walks = [];
      F.allies.forEach((ga, i) => this.march(rt, ga, [MOUTH, FRONT, INSIDE, INNER, { x: HON.x - 5 - i * 7, z: HON.z + 7 + i * 7 }], 14));
      F.maeda.noFrontline = true;
      // 搦手を破った前田勢も、侍と足軽が列で搦手の口から本丸へ攻め入る（利勝一人で先に着かない）
      for (const q of F.maeda.units) if (q.alive && q.name === '前田利勝') q.speed = Math.min(q.speed || 3, 2.6);
      // 岩と板塀の間は一列で回り、搦手の口から小屋の北西を通って空いた庭へ進む。
      F.maeda.colW = 1;
      this.march(rt, F.maeda, KARA_HON, 12);
      rt.say('蒲生郷成', '城内じゃ！　岩の上の矢倉に構うな、本丸の熊井を討て', 3.2);
      rt.after(4, () => { if (F.stage === 5) rt.say('前田利勝', '搦手は破った！　本丸で落ち合おうぞ', 3); });
    }
  },
  // 隊の持ち場を移す（歩かず走って寄せる）
  to(g, at) {
    if (!g || g.routed) return;
    g.anchor.x = at.x; g.anchor.z = at.z; g.order = 'hold'; g.dest = null; g.path = null; g.focus = null; g.onArrive = null;
  },
  // 道筋に沿って列で進ませる（隊の道筋 order 'path'。狭い喰違の筋では列の幅を詰め、遅れを待つ。塀を突き抜けない）
  walk(g, w, t) {
    if (!g || g.routed) return;
    // 先頭だけでなく後列も同じ折れを通る。寄せ手・門の守りにも道に沿う持ち場を使い、
    // 隊の要が角を曲がった時に後列が塀や搦手の岩へ直進しないようにする。
    g.roadColumn = true; g.followColumnRoad = true;
    g.order = 'path'; g.path = w.route.map((q) => [q.x, q.z]); g.pathIdx = w.i; g.dest = null; g.focus = null;
    g.formation = 'column'; w.t0 = t; w.idxT = t; g.aggro = Math.min(g.aggro ?? 5, 5);   // 道筋の間は脇の櫓の上の射手に構わず進む
    const c = this.centerOf(g) || g.anchor;
    w.lastX = c.x; w.lastZ = c.z; w.lastPathIdx = g.pathIdx;
    g.onArrive = () => { w.done = true; this.to(g, g.anchor); g.formation = 'yari'; g.aggro = w.aggro; };   // 行軍を終え、出た先では斬りかかる
  },
  stepWalk(g, w, t) {
    if (!w || w.done) return;
    // 士気の崩れや退く下知が行軍に優先する。古い到着待ちで戦場へ引き返させない。
    if (!g || g.routed || g.order === 'retreat') { w.done = true; return; }
    if (t - w.t0 < 45) return;
    // 寄せ手も打って出る手も、道を進み切るまで行軍を続ける。時間だけで坂の途中に止めない。
    // 道筋の配列は終点に着いても残る。通過済みなら、後列の到着待ちだけで戦いを止め続けない。
    if (g && !g.routed && g.order === 'path' && g.path && (g.pathIdx || 0) < g.path.length) {
      const c = this.centerOf(g) || g.anchor, i = g.pathIdx || 0;
      // 実際に前進していれば待ち直し、四十五秒動かなければ列を組み直す。
      // 11/18 21:25 持ち主（POSLOG：芥田の手が門の内 (-53,44) で道の二つ目の角（pathIdx 2）のまま百五十秒、段2が上限の百八十秒まで延びた・四本に二本）：
      //   兵が押し合って中心が一m より揺れ続け、四十五秒の止まり待ちが毎回やり直しになっていた。角を三十秒越えられなければ、揺れていても列を組み直す
      if (i !== w.lastPathIdx) w.idxT = t;
      if (i !== w.lastPathIdx || (Math.hypot(c.x - w.lastX, c.z - w.lastZ) > 1 && t - (w.idxT ?? t) < 30)) {
        w.lastX = c.x; w.lastZ = c.z; w.lastPathIdx = i; w.t0 = t; return;
      }
      w.idxT = t;
      // 虎口で後列が詰まっても、その場を終点にしない。未通過の角を残し、
      // 一列で行軍をやり直す。出撃隊も寄せ手も門の向こうの目標へ進ませる。
      // 道に沿う後列には通過済みの折れも必要。先頭の進みだけを戻し、道を切り詰めない。
      w.route = (g.roadColumn ? g.path : g.path.slice(i)).map(([x, z]) => ({ x, z })); w.i = g.roadColumn ? i : 0;
      g.colW = 1;
      this.walk(g, w, t);
      return;
    }
    // 道筋を通過し終えた隊は後列待ちを解く。遅れた兵の中心へ持ち場を戻すと、
    // 出撃隊が坂まで来ず、寄せ手も門の外へ引き返すため、終点の持ち場を保つ。
    w.done = true;
    if (!g || g.routed) return;
    this.to(g, w.route[w.route.length - 1] || g.anchor);
    g.formation = 'yari'; g.aggro = w.aggro;
  },
  // 味方の隊を喰違の筋に沿って進める（いちばん近い所から先へ。塀を突き抜けない）
  march(rt, g, route, aggro) {
    if (!g || g.routed || !route.length) return;
    const F = rt.flags, c = this.centerOf(g);
    if (!c) return;
    let i = 0, best = Infinity;
    // 近い点だけで選ぶと、尾根や門の筋を進んだ隊まで通過済みの点へ戻る。
    // 今いる道の区間を選び、その先の点から行軍を続ける（喰違の角は省かない）。
    for (let k = 1; k < route.length; k++) {
      const a = route[k - 1], b = route[k], dx = b.x - a.x, dz = b.z - a.z;
      const t = clamp(((c.x - a.x) * dx + (c.z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      const d = Math.hypot(c.x - a.x - dx * t, c.z - a.z - dz * t);
      if (d < best) { best = d; i = t > 0 ? k : k - 1; }
    }
    const w = { route, i, aggro };
    F.walks = (F.walks || []).filter((m) => m.g !== g);
    F.walks.push({ g, w });
    this.walk(g, w, rt.t);
  },
  gateOpen(rt) {
    const G = rt.siegeKit?.kits?.[0]?.gate;
    if (G && G.struct && G.struct.alive && !G.struct.opened) { G.struct.opened = true; G.open && G.open(); }
  },
  // 出撃中の坂を射界に収める櫓は味方を巻き込むため撃たない。
  // 隊の名や負傷者を除いた中心でなく、射手本人の持ち場で判定する。
  holdSallyFire(rt) {
    const meet = rt.flags.meet || GATE;   // 門の段からの再開では、迎撃地点がまだ戻っていない場合もある。
    for (const g of rt.army.groups) {
      if (g.team !== 1) continue;
      for (const u of g.units) {
        if (!u.alive || (!u.perch && !g.interiorHold)) continue;
        if (Math.hypot(u.pos.x - GATE.x, u.pos.z - GATE.z) < 20 ||
            u.perch && Math.hypot(u.pos.x - meet.x, u.pos.z - meet.z) < 70) {
          g.fire = false;
          break;
        }
      }
    }
  },
  // 門の脇の岩肌へ梯子を掛ける（門が閉まった時。見た目の梯子。塀の上の守り手を引き付ける）
  ladders(rt) {
    const F = rt.flags, W = rt.world;
    if (F.laddersUp) return;
    F.laddersUp = true;
    for (const L of LAD) {
      try {
        const fy = W.heightAt(L.foot.x, L.foot.z), ty = Math.max(fy + 3.2, W.heightAt(L.top.x, L.top.z) + 2.4);
        const m = hashigo({ x: L.foot.x, y: fy, z: L.foot.z }, { x: L.top.x, y: ty, z: L.top.z });
        if (m) { rt.scene.add(m); (F.ladMeshes || (F.ladMeshes = [])).push(m); }
      } catch (e) { console.warn(e); }
    }
    sfx('wood', 0.7);
  },
  // 門が破れたら、門の脇の塀も押し倒して寄せ手をなだれ込ませる（喰違の細い筋に味方が詰まらない）
  breach(rt) {
    const K = rt.siegeKit?.kits?.[0];
    // 11/18 持ち主 ⑥（段4の写真）：掛けた梯子が、押し倒した塀の跡に宙へ立ったまま残り、門の筋で画面の左三分の一を覆った。塀と一緒に倒す
    for (const m of rt.flags.ladMeshes || []) m.visible = false;
    for (const w of K?.walls || []) {
      const mx = (w.seg[0] + w.seg[2]) / 2, mz = (w.seg[1] + w.seg[3]) / 2;
      if (w.alive && Math.hypot(mx - GATE.x, mz - GATE.z) < 13) { w.hp = 0; w.alive = false; if (w.mesh) w.mesh.visible = false; }
    }
  },
  centerOf(g) {
    let x = 0, z = 0, n = 0;
    for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut) { x += u.pos.x; z += u.pos.z; n++; }
    return n ? { x: x / n, z: z / n } : null;
  },
  fighting(g, at, r) {
    let n = 0;
    for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && (!at || Math.hypot(u.pos.x - at.x, u.pos.z - at.z) < r)) n++;
    return n;
  },
  gateStruct(rt) { return rt.siegeKit?.kits?.[0]?.gate?.struct || null; },

  // 段を果たした瞬間に攻撃を捨てる。隊の更新待ちで、退く敵の
  // 狙いや振りかぶりが残り、追う本人を背から打つことを防ぐ。
  fleeIntoCastle(rt, g, x, z) {
    g.fire = false; g.noRout = false; g.routed = true; g.order = 'flee';
    g.fleeSet = true; g.fleeDir = { x, z }; g.morale = 0;
    g.focus = null; g.path = null; g.dest = null;
    for (const u of g.units) if (u.alive) {
      u.target = null; u.atk = null; u.swing = null; u.bind = null;
      u.charging = false; u.routIn = 0;
    }
    rt.army.routStep(g, 0);
  },
  retreatKido(rt) {
    for (const q of rt.flags.slope) if (!q.routed) {
      const c = this.centerOf(q) || KIDO, dx = INNER.x - c.x, dz = INNER.z - c.z, dl = Math.hypot(dx, dz) || 1;
      this.fleeIntoCastle(rt, q, dx / dl, dz / dl);
    }
  },

  update(rt, dt) {
    const F = rt.flags;
    // 再開で段が戻った時も、坂・迎撃・門の前に筋書き外の乱戦兵を足さない。
    CALM = (F.stage || 0) < 4;
    // 打って出た芥田の手の侍は本人一人へ集まり、八秒で百から零にした（11/11 act 150 秒）。二秒おきに、近い味方の足軽も的にして半分は散らす（刃は弱めない）。
    if (F.stage === 2 && F.sally && !F.sally.routed && !(F.spreadAt > rt.t) && rt.player.u.alive) {
      F.spreadAt = rt.t + 2;
      const pp = rt.player.u.pos, near = [];
      for (const q of rt.army.units) if (q.team === 0 && q.alive && !q.isPlayer && !q.fleeing && !q.gone && !q.isStruct && Math.hypot(q.pos.x - pp.x, q.pos.z - pp.z) < 25) near.push(q);
      // 11/18 cloud-08：くじの半分では侍が本人へ戻り続け、四秒おきに一太刀27で倒れた（act bot 162秒）。本人に掛かれるのは芥田と、近い侍二人・足軽二人まで。残りは近い寄せ手へ
      const pu = rt.player.u, keep = { samurai: 2, ashigaru: 2 };
      const cand = F.sally.units.filter((su) => su.alive && !su.fleeing && !su.woundOut && su.type !== 'busho' && Math.hypot(su.pos.x - pp.x, su.pos.z - pp.z) <= 30)
        .sort((a, b) => Math.hypot(a.pos.x - pp.x, a.pos.z - pp.z) - Math.hypot(b.pos.x - pp.x, b.pos.z - pp.z));
      if (near.length) for (const su of cand) {
        if (keep[su.type] > 0 && (su.target === pu || su.atk?.target === pu)) { keep[su.type]--; continue; }
        if (su.target !== pu && su.atk?.target !== pu && Math.random() > .5) continue;
        su.target = near[Math.floor(Math.random() * near.length)]; su.aiT = 0;
      }
    }
    // 11/18 cloud-08（司令塔①・高遠の形）：中学生 bot が坂・二の丸で刃に囲まれ倒れた。命が四割五分を切ったら、三十歩の内の味方（弓・鉄砲を除く）を六人まで、
    //   本人と一番近い打ち手の間（本人から二歩・敵の側）へ割り込ませ、その打ち手を味方へ向ける（受ける傷の値と敵の数は変えない）
    { const me = rt.player.u;
      if (me.alive && me.hp < me.maxHp * 0.45 && (F.gkGuardT = (F.gkGuardT || 0) - dt) <= 0) {
        F.gkGuardT = 2;
        let foe = null, fd = 9;
        for (const o of rt.army.units) {
          if (!o?.alive || !o.pos || o.team === me.team || o.isStruct || o.fleeing || o.woundOut || o.civ || Math.abs(o.pos.y - me.pos.y) > 2.5) continue;
          if (!(o.target === me || o.atk?.target === me || o.swing?.target === me)) continue;
          const d = Math.hypot(o.pos.x - me.pos.x, o.pos.z - me.pos.z);
          if (d < fd) { fd = d; foe = o; }
        }
        if (foe) {
          const k = 2 / Math.max(fd, 0.5), gx = me.pos.x + (foe.pos.x - me.pos.x) * k, gz = me.pos.z + (foe.pos.z - me.pos.z) * k;
          let sent = 0, first = null;
          for (const o of rt.army.units) {
            if (sent >= 6) break;
            if (!o?.alive || !o.pos || o.team !== me.team || o === me || o.isStruct || o.fleeing || o.woundOut || o.civ || o.type === 'gun' || o.type === 'bow') continue;
            const d = Math.hypot(o.pos.x - me.pos.x, o.pos.z - me.pos.z);
            if (d > 30 || Math.abs(o.pos.y - me.pos.y) > 2.5) continue;
            o.moveTo = { x: gx + (Math.random() - 0.5) * 2, z: gz + (Math.random() - 0.5) * 2 }; o.target = foe; o.aiT = Math.min(o.aiT || 0, 0.3); sent++;
            if (!first) first = o;
          }
          if (first && sent >= 2 && foe.target === me) { foe.target = first; foe.aiT = 0; }
        }
      }
    }
    // 行軍・退却・本陣の待機では考え直しを待たず、討たれた相手への狙いを外す（全戦の通しで三秒以上残った）。
    for (const u of rt.army.units) if (u.alive) {
      // 討死の知らせで target が先に消えても、別に残った攻撃・注視を拾う。
      if (u.target && !u.target.alive) { u.target = null; u.aiT = 0; }
      if (u.atk?.target && !u.atk.target.alive) { u.atk = null; u.aiT = 0; }
      if (u.swing?.target && !u.swing.target.alive) { u.swing = null; u.aiT = 0; }
      if (u.watch && !u.watch.alive) { u.watch = null; u.aiT = 0; }
    }
    // 掛矢で壊した門や、退いて消えた兵は onKill を通らない。本人の狙いも毎コマ外す。
    const player = rt.player;
    if (player.lock && !player.lock.alive) { player.lock = null; player.wheelAcc = 0; }
    if (player.aimed && !player.aimed.alive) { player.aimed = null; player.aimT = 0; }
    for (const m of F.walks || []) this.stepWalk(m.g, m.w, rt.t);
    // 11/18 02:20 毎時の持ち主（act bot 3回に2回、本丸の段で本丸の守りに四方から寄られ 侍の一太刀29 が四秒おきに続き十五秒で倒れた）：
    //   城の内の段で命が六割を切って囲まれた時は、本人を狙う城兵のうち近い二人だけを残し、ほかは八歩内の味方と組み合わせる（高遠と同じ。受ける傷の倍率は変えない）
    // 11/18 02:20 同（act bot：二の丸が落ちた後、深手で坂を退いた本人を門の守りの足軽が坂の下まで七十歩追い、背から二突きで倒した）：
    //   城の内の段では、城兵は門の外二十歩より先の本人を追わない（持ち場の城へ戻る）。坂の途中で息を戻す間を残す
    if ((F.stage || 0) >= 4 && player.u.alive && !wantInside(player.u.pos) && Math.hypot(player.u.pos.x - GATE.x, player.u.pos.z - GATE.z) > 20 && !(F.chaseFixAt > rt.t)) {
      F.chaseFixAt = rt.t + 0.5;
      const me = player.u;
      for (const o of rt.army.units) {
        if (!o.alive || o.team === me.team || o.isStruct || o.group === F.sally || F.slope?.includes(o.group)) continue;
        if (!(o.target === me || o.atk?.target === me || o.swing?.target === me) || wantInside(o.pos)) continue;
        o.target = null; o.atk = null; o.swing = null; o.aiT = 0.3;
      }
    }
    // 11/18 21:20 持ち主（act bot 321秒 倒れ）：段5に入って二十秒で本人だけ本丸の内 (-5,3) へ着き、味方の列が門から上がる前に本丸の守りの侍と足軽に代わる代わる突かれ倒れた（命の六割を切る前から二人三人）。
    //   城の内の段で二十m 内に味方の刃が無い間は、本人に掛かる城兵（名の無い刃）を近い一人に絞り、ほかは持ち場へ退かせる（城兵は持ち場を守り、ひとりの寄せ手を囲みに出ない。受ける傷の値は変えない）
    if ((F.stage || 0) >= 4 && player.u.alive && !(F.loneAt > rt.t)) {
      F.loneAt = rt.t + 1;
      const me = player.u;
      const alone = !rt.army.units.some((a) => a.alive && a.team === me.team && a !== me && !a.isStruct && !a.fleeing && !a.woundOut && !a.civ && a.type !== 'bow' && a.type !== 'gun' && Math.hypot(a.pos.x - me.pos.x, a.pos.z - me.pos.z) < 20);
      if (alone) {
        const on = [];
        for (const o of rt.army.units) {
          if (!o.alive || o.team === me.team || o.isStruct || o.fleeing || o.woundOut || o.perch || o.name || o.type === 'bow' || o.type === 'gun') continue;
          if (!(o.target === me || o.atk?.target === me || o.swing?.target === me)) continue;
          const d = Math.hypot(o.pos.x - me.pos.x, o.pos.z - me.pos.z);
          if (d < 12) on.push([d, o]);
        }
        on.sort((a, b) => a[0] - b[0]);
        for (const [, o] of on.slice(1)) {
          const an = o.group?.anchor; if (!an) continue;
          o.target = null; o.atk = null; o.swing = null; o.aiT = 2; o.moveTo = { x: an.x + (Math.random() - 0.5) * 4, z: an.z + (Math.random() - 0.5) * 4 };
        }
      }
    }
    // 11/18 21:10 持ち主（act bot 174秒 倒れ）：段2で深手（命19）の本人が迎え撃つ所から坂を十七m 下った (-84,91) まで、芥田の手の侍に追われ背から一太刀三十八で倒れた。
    //   段2・3で命が四割を切った本人が迎え撃つ所より八m 下にいる間は、打って出た手と門の守りは追わず、迎え撃つ所へ戻る（打って出た手は坂の上の門を背に戦う。息を戻す間を残す）
    if ((F.stage === 2 || F.stage === 3) && F.meet && player.u.alive && player.u.hp < player.u.maxHp * 0.4 && !(F.sallyLeashAt > rt.t) &&
        this.along(player.u.pos.x, player.u.pos.z) < this.along(F.meet.x, F.meet.z) - 8) {
      F.sallyLeashAt = rt.t + 0.5;
      const me = player.u;
      for (const g of [F.sally, F.gateGuard]) for (const o of g?.units || []) {
        if (!o.alive || o.fleeing || !(o.target === me || o.atk?.target === me || o.swing?.target === me)) continue;
        o.target = null; o.atk = null; o.swing = null; o.aiT = 1.5; o.moveTo = { x: F.meet.x + (Math.random() - 0.5) * 6, z: F.meet.z + (Math.random() - 0.5) * 6 };
      }
    }
    if ((F.stage || 0) >= 4 && player.u.alive && player.u.mobbed && player.u.hp < player.u.maxHp * 0.6 && !(F.mobFixAt > rt.t)) {
      F.mobFixAt = rt.t + 0.5;
      const me = player.u, on = [];
      for (const o of rt.army.units) {
        if (!o.alive || o.team === me.team || o.target !== me || o.isStruct || o.fleeing || o.woundOut) continue;
        const d = Math.hypot(o.pos.x - me.pos.x, o.pos.z - me.pos.z);
        if (d < 7) on.push([d, o]);
      }
      on.sort((a, b) => a[0] - b[0]);
      // 11/18 21:00 持ち主（act bot 239秒 倒れ）：二の丸を十六秒で抜けた本人が味方より先に本丸の口 (-10,11) へ着き、本丸の守りの足軽二人に一突き二十を三秒おきに重ねられ倒れた（八歩内に味方が無く、組み合わせる手が無かった）。
      //   二十歩の内に味方の刃が無い時は、本人に掛かるのを近い一人だけにし、ほかは本丸の持ち場（塀の内）へ一歩退かせる（城兵は塀の内を守り、ひとりの寄せ手を外まで囲みに出ない）
      const alone = !rt.army.units.some((a) => a.alive && a.team === me.team && a !== me && !a.isStruct && !a.fleeing && !a.woundOut && !a.civ && a.type !== 'bow' && a.type !== 'gun' && Math.hypot(a.pos.x - me.pos.x, a.pos.z - me.pos.z) < 20);
      for (const [, o] of on.slice(alone ? 1 : 2)) {
        if (o.name) continue;
        let mate = null, md = 8;
        for (const a of rt.army.units) {
          if (!a.alive || a.team !== me.team || a === me || a.isStruct || a.fleeing || a.woundOut || a.civ) continue;
          const d = Math.hypot(a.pos.x - o.pos.x, a.pos.z - o.pos.z);
          if (d < md) { md = d; mate = a; }
        }
        if (!mate) {
          if (alone && o.group?.anchor) { const an = o.group.anchor; o.target = null; o.atk = null; o.swing = null; o.aiT = 2.5; o.moveTo = { x: an.x + (Math.random() - 0.5) * 4, z: an.z + (Math.random() - 0.5) * 4 }; }
          continue;
        }
        o.target = mate; o.atk = null; o.aiT = Math.min(o.aiT || 0, 0.3);
        if (!(mate.atk && mate.target?.alive)) { mate.target = o; mate.aiT = Math.min(mate.aiT || 0, 0.3); }
      }
    }
    // 落城後の余韻でも後列の到着待ちを解く。段の進行と攻撃だけを終える。
    if (F.ending) return;
    if (!F.stage) { if (chakujin.update(rt, K)) this.go(rt, 1); return; }
    // 刻限と同じ更新で熊井を討った時も、果たした最後の目標を日没の負けで取り消さない。
    if (F.stage === 5 && F.hon.units.some((u) => u.name === '熊井越中守' && !u.alive)) { this.win(rt); return; }
    const p = rt.player.u.pos, el = rt.t - F.t0;
    // 日が傾く：残りの時を空の色で知らせる（字は出さない）
    // 11/8 critic60 t07（四6・二2）：昼の時計（dayClock）が動く戦では setTime('dusk') が空を変えず、負けの時も真昼の青空だった。
    //   時計を外して夕暮れへ移ろわせ、日が沈む前に空を夕焼けにして暗くする（根来と同じ手 b_t04_negoro.js）
    // 11/18 持ち主（journey t07 の場面表 4:30「本丸の段で必ず夕焼けに」）：遊びは五分前後で本丸に着き、六割二分（十一分）の夕は誰も見なかった。
    //   本丸の段に入ったら、四十五秒かけて夕へ移ろわせる（岩石城は未明に懸かり夕方に落ちた伝え）
    if (!F.dusk && (el > T_LIMIT * 0.62 || F.stage >= 5)) { F.dusk = true; try { const W = rt.world; W.dayClock = null; W.setTime('dusk'); if (W.fade) W.fade.dur = el > T_LIMIT * 0.62 ? Math.max(20, T_LIMIT * 0.3) : 45; } catch (e) { /* 空の切り替えが無い時はそのまま */ } }
    if (el > T_LIMIT) { this.lose(rt); return; }
    if (F.sw) this.stepWalk(F.sally, F.sw, rt.t);
    if (F.gw) this.stepWalk(F.gateGuard, F.gw, rt.t);
    // 櫓の傷の軽減は登坂中から効かせる。迎撃へ移る前に矢玉が集中し、深手になっていた。
    // 後から配置された射手にも適用し、出撃後は従来どおり撃ち止めを保つ。
    if (F.stage >= 1 && F.stage <= 3 && !(F.sallyFireAt > rt.t)) {
      F.sallyFireAt = rt.t + 1;
      for (const q of rt.army.groups) if (q.team === 1 && /物見櫓の守り|隅櫓の守り/.test(q.name || '')) { q.dmgMult = Math.min(q.dmgMult ?? 1, 0.4); q.dmgMultPlayer = 0.22; }   // 11/18 持ち主：act bot 171秒に倒れた（櫓の矢が三十秒で命51→11・83の傷）。本人へだけ二割余り（味方への矢はそのまま）
      if (F.stage >= 2) this.holdSallyFire(rt);
    }
    this.stones(rt, dt);
    const sallyN = this.fighting(F.sally), sally0 = F.sally.units.length;
    if (F.stage === 1) {
      // 味方の先手と二番手は、自分の少し先と後ろを坂に沿って走る（一人で登らせない。止まれば味方も坂の途中で待つ）
      if ((F.leadT = (F.leadT || 0) - dt) <= 0) {
        F.leadT = 1;
        // 門前で待つ間も二番手の間隔を残す。道の長さを越えると両隊の行き先が門口の一点になる。
        const k = Math.min(this.along(MOUTH.x, MOUTH.z), Math.max(F.lead, this.along(p.x, p.z), (rt.t - F.stageT) * 1.2));
        F.lead = k;
        this.to(F.gamo, this.roadAt(k + 8)); this.to(F.gamo2, this.roadAt(k - 6));
      }
      // 坂の木戸を抜かれたら、木戸の守りと弓は二の丸へ逃げ込む（抜かれた出曲輪に残って、登る寄せ手を背から射ない）
      const kk = this.along(KIDO.x, KIDO.z);
      // 持ち場の指示（F.lead）は時間でも進む。実際に登った先手の位置で木戸を抜いたか確かめる。
      // 先手が坂に残っていても、実際に先へ登った二番手の到着を拾う。
      const advanced = F.allies.some((g) => { const c = this.centerOf(g); return c && this.along(c.x, c.z) > kk + 22; });
      if (!F.kidoFell && (this.along(p.x, p.z) > kk + 14 || advanced)) {
        F.kidoFell = true;
        this.retreatKido(rt);
      }
      // 自分が遅れても、先手が門の前まで登り詰めれば城方は門を開いて打って出る（物語は進む。kaito 二5）
      // 15分の構成：坂は六十秒は登る（早く門の前に着いても、木戸を抜いた味方が上がるまで芥田は打って出ない）
      if (rt.t - F.stageT > 60 && Math.hypot(p.x - MOUTH.x, p.z - MOUTH.z) < 20 || (rt.t - F.stageT > 120 && F.allies.some((g) => { const c = this.centerOf(g); return c && Math.hypot(c.x - MOUTH.x, c.z - MOUTH.z) < 22; }))) this.go(rt, 2);
    } else if (F.stage === 2) {
      if (F.sallyEase && rt.t > F.sallyEase) { F.sallyEase = 0; F.sally.dmgMult = 0.7; }   // 出端の軽さを七割へ戻す（11/9 の七割）
      // 四割を討たれるか、芥田が討たれれば崩れて引く。通常の撃退には坂での接触が必要。
      // 出撃が虎口で詰まる場合は、三分を上限に城内へ撤退させ、追撃へ移る。
      const boss = F.sally.units.find((u) => u.name === '芥田悪六兵衛');
      // 11/18 クラウド：act bot が印「大手の坂」に着いて六秒なにも起きない事があった（芥田の手が虎口の折れを抜ける間）。着いたら一度だけ台詞（K175）
      if (!F.meetSay && F.fightT == null && F.meet && Math.hypot(p.x - F.meet.x, p.z - F.meet.z) < 8) { F.meetSay = true; rt.say('蒲生郷成', '門が開いた！　打って出て来るぞ。槍を揃えて坂で迎えよ', 3); }
      if (F.fightT == null && !(F.fightCheckAt > rt.t)) {
        F.fightCheckAt = rt.t + 0.5;
        for (const u of F.sally.units) {
          if (!u.alive || u.fleeing || u.woundOut) continue;
          const target = rt.army.nearestEnemy(u, 6, (v) => !v.noTarget && !v.isStruct && !v.fleeing && Math.abs(v.pos.y - u.pos.y) < 3 && !rt.army.wallBetween(u.pos, -1, v.pos));
          // 門の内や虎口で先手に触れただけでは、坂への出撃を打ち切らない。
          // 門外の大手道で組み合えば、迎撃地点の手前でも撃退までの時を数える。
          // 十二歩の円の外で戦い続けても、接敵が未成立のままにならない。
          const onSlope = gl(u.pos.x, u.pos.z)[1] >= 7 && distToPolyline(u.pos.x, u.pos.z, APPROACH) < 12;
          if (target && (onSlope || Math.hypot(u.pos.x - F.meet.x, u.pos.z - F.meet.z) < 12)) {
            F.fightT = rt.t;
            // 先頭が接敵しても、後列が虎口の折れを抜ける道順は残す。
            // 途中で持ち場を坂へ直に移すと、門内の兵が塀へ向かって詰まる。
            // 道順を通過済みなら後列待ちを解き、坂で隊を開く。
            if (F.sw && !F.sw.done && (!F.sally.path || F.sally.pathIdx >= F.sally.path.length)) {
              F.sw.done = true;
              this.to(F.sally, F.meet);
              F.sally.formation = 'yari'; F.sally.aggro = F.sw.aggro;
            }
            break;
          }
        }
      }
      // 芥田を討つか四割を討ち減らせば撃退。百二十秒の下限で、果たした戦いを続けさせない。
      // 接触しただけの場合は、出撃から百二十秒・接触から二十五秒を経て退く。
      // 虎口の内での兵の損耗だけでは出撃を打ち切らず、残兵が坂へ出る時を残す。
      // 芥田本人を弓や鉄砲で先に討った時は、近接の接触判定を待たず果たす。
      // ただし接敵の印が付かないまま待ち続けない（全戦共通の波の上限）。
      // 上限でも段3の撤退命令を通し、止まった敵を残して済みの印だけ進めない。
      if (sallyN === 0 || (boss && !boss.alive) || (F.fightT != null && sallyN <= sally0 * 0.6) ||
          (rt.t - F.stageT > 120 && F.fightT != null && rt.t - F.fightT > 25) || rt.t - F.stageT >= 180) this.go(rt, 3);
    } else if (F.stage === 3) {
      const st = this.gateStruct(rt);
      const gateUp = st && st.alive;
      // 11/17 ス四：門の前の印へ着いても六秒なにも起きない所があった（bot ★★）。着いたら一度だけ台詞を出す（K175）
      if (!F.arrSay && Math.hypot(p.x - MOUTH.x, p.z - MOUTH.z) < 7) { F.arrSay = true; rt.say('蒲生郷成', '門の前じゃ！　開いておれば付け入れ、閉まれば掛矢の組を待て', 3); }
      // 付け入り：門が開いている間に、自分か味方が門の近くまで追いすがっていれば門は閉まらない
      if (!F.tsukeiri && gateUp && st.opened) {
        let chase = Math.hypot(p.x - FRONT.x, p.z - FRONT.z) < 9 || Math.hypot(p.x - INSIDE.x, p.z - INSIDE.z) < 9;
        if (!chase) for (const g of F.allies) for (const u of g.units) if (u.alive && Math.hypot(u.pos.x - FRONT.x, u.pos.z - FRONT.z) < 6) { chase = true; break; }
        if (chase) {
          F.tsukeiri = true; this.breach(rt); rt.bark('門が閉まらぬ。付け入った');
          // 11/18 夜50-41：付け入っても蒲生の先手は坂に残り、本人だけ門口で二十秒味方を待った（描かずの通し 3回中2回）。退く敵の背について、先手も門の内へなだれ込む
          F.allies.forEach((g, i) => this.march(rt, g, i ? [MOUTH, FRONT, INSIDE] : [MOUTH, FRONT, INSIDE, INNER], 14));
          for (const g of [F.sally, F.gateGuard]) g.morale = Math.max(0, (g.morale ?? 100) - 30);
          F.yagura.aggro = 2;   // 岩の上の矢倉の射手は持ち場から降りず、門の筋へ寄って来ない
          // 門の守りも支えきれず本丸へ退く
          F.gw = { route: [INNER, HONF], i: 0, aggro: 8 }; F.gateGuard.aggro = 1; this.walk(F.gateGuard, F.gw, rt.t);
        }
        else {
          // 芥田の手がみな門の内へ入り、誰も追って来なければ門を閉める
          const out = F.sally.units.some((u) => u.alive && Math.hypot(u.pos.x - MOUTH.x, u.pos.z - MOUTH.z) < Math.hypot(u.pos.x - INNER.x, u.pos.z - INNER.z));
          // 11/18 07:58 持ち主（act bot 309秒）：段3が79秒で討ち取り0（開いた門の前で三十秒・閉まって三十二秒・歩き）。待ちを詰める
          if (!out || rt.t - F.stageT > 22) {
            closeGate(this.gateRef(rt)); F.shut = true; F.shutT = rt.t;
            // 先手は門口、二番手の掛矢はその後ろへ。別々の持ち場に進ませ、行軍の指示を消さない。
            this.march(rt, F.gamo, [MOUTH], 14);
            this.march(rt, F.gamo2, [this.roadAt(this.along(MOUTH.x, MOUTH.z) - 20), this.roadAt(this.along(MOUTH.x, MOUTH.z) - 10)], 14);
            this.ladders(rt); rt.say('蒲生郷成', '門を閉められた！　掛矢で門を破れ', 3);
          }
        }
      }
      // 閉まった門は寄せた味方が掛矢で打つ（味方が門の前にいるほど早い）
      if (gateUp && !st.opened) {
        let near = 0;
        for (const g of F.allies) for (const u of g.units) if (u.alive && Math.hypot(u.pos.x - GATE.x, u.pos.z - GATE.z) < 28) near++;
        // 寄せが少なくても、後ろから掛矢の組が上がって来て門は必ず破れる（三十秒ほど。主人公のせいでない事で日没の負けにしない。kaito 十二3）
        st.hp -= dt * Math.max(9, 2.2 * Math.min(near, 16));
        if (F.shut && rt.t - (F.shutT ?? rt.t) > 24) st.hp = 0;
        if (st.hp <= 0) { st.hp = 0; st.alive = false; rt.bark('門が破れた'); }
      }
      if (st && !st.alive && !F.breached) {
        // 掛矢は耐久を直接減らすため、扉を倒す処理もここで呼ぶ。
        // 生死の印だけでは、閉じた板が通れる門口に残る。
        F.breached = true; this.gateRef(rt)?.fall?.(); this.breach(rt);
        // 先手は門の奥へ、二番手は門の内へ。二隊を同じ終点に重ねない。
        F.allies.forEach((g, i) => this.march(rt, g, i ? [MOUTH, FRONT, INSIDE] : [MOUTH, FRONT, INSIDE, INNER], 14));
      }
      // 自分が門を抜ければすぐ二の丸へ。閉まった門を時間だけで通過扱いにしない。
      const entered = F.allies.some((g) => { const c = this.centerOf(g); return c && Math.hypot(c.x - INNER.x, c.z - INNER.z) < 12; });
      const passable = st && (!st.alive || st.opened);
      if (passable && (Math.hypot(p.x - INNER.x, p.z - INNER.z) < 10 || Math.hypot(p.x - INSIDE.x, p.z - INSIDE.z) < 4 || (rt.t - F.stageT > 60 && entered) ||
          (rt.t - F.stageT > 90 && Math.hypot(p.x - GATE.x, p.z - GATE.z) < 45) || rt.t - F.stageT > 150)) this.go(rt, 4);   // 11/18 cloud-08（cloud-41 の中学生 bot：門の十六m 手前で止まり、味方も門の内へ入らず段3が188秒から1080秒の時切れまで動かなかった）：門が破れて九十秒、本人が門の二十五m 内なら二の丸へ進める
    } else if (F.stage === 4) {
      if (ninomaru.update(rt, K)) this.go(rt, 5);
    } else if (F.stage === 5) {
      // 熊井越中守が討たれれば落城（誰が討っても）。目標どおり、討つまでは勝ちにしない（kaito 三3・十1）
      const inHon = Math.hypot(p.x - HON.x, p.z - HON.z) < 13;
      const left = this.fighting(F.hon, HON, 24);
      F.honT = inHon && left <= 4 ? F.honT + dt : Math.max(0, F.honT - dt * 0.5);
      // 旗本が討ち減らされると、熊井は馬を寄せて自ら斬って出る（本丸で討死した伝え。奥に籠って待たせない）
      // 旗本を割って届けば最初から討てる。旗本が減るか百秒で自ら斬って出る。
      // 11/18 17:35 持ち主（act bot 1721：段5で「本丸へ攻め入り、熊井越中守を討つ」のまま四十五秒なにも起きない、が二度）：四十秒で郷成が先を見せる（熊井が自ら出る百秒までの間）
      if (!F.lastStand && !F.honSay && rt.t - F.stageT > 40) { F.honSay = true; rt.say('蒲生郷成', inHon ? '熊井は旗本の奥じゃ。旗本を突き崩せ' : '本丸の冠木門から入れ。熊井は内におる', 3); }
      if (!F.lastStand && (F.honT >= 4 || rt.t - F.stageT > 100)) { F.lastStand = true; if (!F.kumaiBack) F.hon.aggro = 40; rt.say('熊井越中守', '秋月の城、ただでは渡さぬ！', 3); }
      // 11/18 15:30 持ち主（描かずの通し：熊井が寄せ手を追って本丸の外 (31,-17)・(-1,-29) へ出、本丸の内の本人は百三十秒〜時切れまで届かず歩き回った・act bot でも段5が三百六十秒）：
      //   熊井が本丸から十六m より外へ出たら、本丸の守りの追う幅を六m に絞って持ち場（本丸）へ戻し、十m 内へ戻れば元の幅へ（本丸で討死した伝えの通り、本丸を離れない）
      if (!(F.kumaiAt > rt.t)) {
        F.kumaiAt = rt.t + 1;
        const ku = F.hon.units.find((u) => u.name === '熊井越中守' && u.alive);
        const kd = ku ? Math.hypot(ku.pos.x - HON.x, ku.pos.z - HON.z) : 0;
        // 11/18 16:30 持ち主（act bot 1610 の661秒：熊井が本丸の外 35m で前田勢に討たれ、本丸の本人は二百七秒待った）：本丸の守りが二人以下になると
        //   army_think の「生き残り一人二人は三十二m の敵へ出る」で、絞った追う幅を越えて外の寄せ手へ駆けた。戻す間はその決まり（近い敵へ必ず出る）を止める（noEngage）。
        //   二十m より外で三m 内に敵がいなければ、毎秒狙いを外して本丸へ向かせる
        // 11/18 18:05 持ち主（act bot 696秒の回：段5が四百三十七秒・討ち取り12）：本丸で熊井に届かぬまま長引く時がある。
        //   段5が百五十秒を越えたら、熊井が旗本を離れて本人へ自ら斬り掛かる（本丸で討死した伝え・待たせない）。本丸へ戻す決まりはここで止める
        const me = rt.player.u;
        if (ku && me.alive && rt.t - F.stageT > 150) {
          if (!F.kumaiCharge) { F.kumaiCharge = true; F.kumaiBack = false; F.hon.noEngage = false; F.hon.aggro = 40; rt.say('熊井越中守', 'もはやこれまで。そこの者、わしが相手じゃ！', 3); }
          const md = Math.hypot(ku.pos.x - me.pos.x, ku.pos.z - me.pos.z);
          // 本人が本丸の塀の外なら、熊井は南西の口から出て行く（塀を突き抜けて詰まらない）
          const out = Math.hypot(me.pos.x - HON.x, me.pos.z - HON.z) >= 15 && Math.hypot(ku.pos.x - HON.x, ku.pos.z - HON.z) < 16;
          // 11/18 20:10 持ち主（POSLOG 510秒の回：熊井が本丸の北東の外 (24〜29,-14) で前田勢と斬り合い、北西の外の本人へ塀を突き抜けて向かい八十秒届かず）：
          //   熊井が本丸の外の北東の半分にいて本人が遠ければ、搦手の口（国見岩の南）から本丸へ戻り、小屋の北を回って内を通る
          const kin = ku.pos.x > ku.pos.z && kd > 13 && md > 6 ? (kd > 15.5 ? kuWay(ku.pos) : KU_IN[1]) : null;
          if (kin) { ku.target = null; ku.atk = null; ku.aiT = 0.3; ku.moveTo = kin; }
          else if (md < 14 && !out) { ku.target = me; ku.moveTo = null; } else { ku.target = null; ku.atk = null; ku.aiT = 0.3; ku.moveTo = out ? { x: HON_ENTRY.x * 1.4, z: HON_ENTRY.z * 1.4 } : { x: me.pos.x, z: me.pos.z }; }
        } else if (ku && kd > 16 && !F.kumaiBack) { F.kumaiBack = true; F.hon.aggro = 6; F.hon.noEngage = true; }
        else if (F.kumaiBack && (!ku || kd < 10)) { F.kumaiBack = false; F.hon.noEngage = false; F.hon.aggro = F.lastStand ? 40 : 8; }
        if (ku && F.kumaiBack && (kd > 20 || !F.kumaiBackT) && !rt.army.nearestEnemy(ku, 3)) { F.kumaiBackT = 1; ku.target = null; ku.atk = null; ku.aiT = 0.3; ku.moveTo = ku.pos.x > ku.pos.z && kd > 15.5 ? kuWay(ku.pos) : F.kumaiHome || (F.kumaiHome = { x: HON.x - 5, z: HON.z - 4 }); }
      }
    }
  },
  // 城そのものが武器：坂を登る間と、閉まった門の前では、二の丸の塀の上から石を投げ落とす（門を破るまで。kaito 十3）。
  //   字は出さず、弧を描いて落ちる石・音・当たった味方の崩れで分からせる。石は三つを使い回す
  stones(rt, dt) {
    const F = rt.flags, p = rt.player.u.pos, W = rt.world;
    const stones = F.stones;
    for (const s of stones) {
      if (!s.on) continue;
      s.t += dt;
      const k = Math.min(1, s.t / s.dur);
      if (s.landed) { if (s.t > s.dur + 2.5) { s.on = false; s.mesh.visible = false; } continue; }
      s.mesh.position.set(s.ax + (s.bx - s.ax) * k, s.ay + (s.by - s.ay) * k + Math.sin(k * Math.PI) * 2.5, s.az + (s.bz - s.az) * k);
      s.mesh.rotation.x += dt * 9; s.mesh.rotation.z += dt * 5;
      if (k >= 1) {
        s.landed = true;
        rt.army.play('knock', { x: s.bx, z: s.bz }, 0.9);
        rt.army.forNear(s.bx, s.bz, 1, (u) => { if (u.alive && u.team === 0 && !u.invuln && !u.isStruct && !(u.isPlayer && u.hp < u.maxHp * 0.35)) rt.army.damage(u, u.isPlayer ? 4 : 11, null, { kind: 'rock' }); });
      }
    }
    if (F.ending || rt.t < (F.stoneAt || 0)) return;
    const st = this.gateStruct(rt);
    if (!st || !st.alive || st.opened || (F.stage !== 1 && F.stage !== 3)) return;
    // 本人が後方にいても、門へ登った寄せ手には石が来る。城の外の兵だけを狙う。
    const range = F.stage === 1 ? 34 : 30;
    let aim = null, dG = range;
    for (const u of rt.army.units) {
      if (!u.alive || u.team !== 0 || u.isStruct || u.civ || u.invuln || u.fleeing || u.woundOut || wantInside(u.pos)) continue;
      const d = Math.hypot(u.pos.x - GATE.x, u.pos.z - GATE.z);
      if (d < dG) { aim = u.pos; dG = d; }
    }
    if (!aim) return;
    // 本人も射程内なら従来どおり周りの味方と狙いを分ける。
    const pu = rt.player.u;
    if (pu.alive && !pu.invuln && !wantInside(p) && Math.hypot(p.x - GATE.x, p.z - GATE.z) < range) {
      aim = p; dG = Math.hypot(p.x - GATE.x, p.z - GATE.z);
    }
    F.stoneAt = rt.t + (dG < 20 ? 2.2 : 3.6) + Math.random() * 1.5;
    let stone = stones.find((q) => !q.on);
    if (!stone) {
      if (stones.length >= 3) return;
      if (!STONE_GEO) { STONE_GEO = rockShape(0.42); STONE_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x8c8579, roughness: 1, flatShading: true }); }   // 11/8 critic60 t07（八1）：白い小さな玉でなく、角のある灰褐色の割り石の大きさに
      stone = { mesh: new THREE.Mesh(STONE_GEO, STONE_MAT) }; stone.mesh.castShadow = true;
      rt.scene.add(stone.mesh); stones.push(stone);
    }
    // 狙いの周りの寄せ手にも振り分ける。城内へ抜けた者へ塀越しに投げない。
    let tx = aim.x, tz = aim.z;
    if (Math.random() > 0.35) rt.army.forNear(aim.x, aim.z, 8, (u) => { if (u.team === 0 && u.alive && !u.isPlayer && !u.isStruct && !u.civ && !u.invuln && !u.fleeing && !u.woundOut && !wantInside(u.pos) && Math.hypot(u.pos.x - GATE.x, u.pos.z - GATE.z) < range && Math.random() < 0.3) { tx = u.pos.x; tz = u.pos.z; } });
    tx += (Math.random() - 0.5) * 2.4; tz += (Math.random() - 0.5) * 2.4;
    const src = pt((Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 9), -0.8);
    const ay = W.heightAt(src.x, src.z) + 3;
    Object.assign(stone, { on: true, landed: false, t: 0, dur: 0.9 + Math.min(1.2, Math.hypot(tx - src.x, tz - src.z) / 40), ax: src.x, ay, az: src.z, bx: tx, by: W.heightAt(tx, tz) + 0.25, bz: tz });
    stone.mesh.visible = true; stone.mesh.position.set(src.x, ay, src.z);
    rt.army.play('eshout', { x: src.x, z: src.z }, 0.6);
  },
  // 大手の坂の筋（麓 → 門の外の口）で、何 m 登ったか・その所
  along(x, z) {
    const R = APPROACH;
    let best = Infinity, at = 0, acc = 0;
    for (let k = 1; k < R.length; k++) {
      const [ax, az] = R[k - 1], [bx, bz] = R[k], L = Math.hypot(bx - ax, bz - az);
      const t = clamp(((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (L * L), 0, 1);
      const d = Math.hypot(ax + (bx - ax) * t - x, az + (bz - az) * t - z);
      if (d < best) { best = d; at = acc + t * L; }
      acc += L;
    }
    return at;
  },
  roadAt(m) {
    const R = APPROACH;
    let left = Math.max(0, m);
    for (let k = 1; k < R.length; k++) {
      const [ax, az] = R[k - 1], [bx, bz] = R[k], L = Math.hypot(bx - ax, bz - az);
      if (left <= L) return { x: ax + (bx - ax) * left / L, z: az + (bz - az) * left / L };
      left -= L;
    }
    const e = R[R.length - 1]; return { x: e[0], z: e[1] };
  },
  gateRef(rt) { return rt.siegeKit?.kits?.[0]?.gate || null; },
  onKill(rt, v) {
    const F = rt.flags;
    // 門や塀、町の者を総勢の討死に数えない（残人数の分母と揃える）。
    if (!v.isStruct && !v.civ) { if (v.team === 1) F.ek++; else if (v.team === 0) F.ak++; }
    // 討たれた相手を見続けず、次の思考で生きた敵か持ち場へ向き直る。
    for (const u of rt.army.units) if (u.alive) {
      if (u.target === v) { u.target = null; u.aiT = 0; }
      if (u.atk?.target === v) { u.atk = null; u.aiT = 0; }
      if (u.swing?.target === v) { u.swing = null; u.aiT = 0; }
      if (u.watch === v) { u.watch = null; u.aiT = 0; }
    }
    // 主人公の固定した狙いは兵の target とは別。残すと次の敵にも死者の方を向く。
    const p = rt.player;
    if (p.lock === v) { p.lock = null; p.wheelAcc = 0; }
    if (p.aimed === v) { p.aimed = null; p.aimT = 0; }
  },

  win(rt) {
    const F = rt.flags; if (F.ending) return; F.ending = true;
    // 終了後は石を更新しないため、投石を宙に残さない。
    for (const s of F.stones) { s.on = false; s.mesh.visible = false; }
    rt.unmark('t07');
    rt.award((t) => { t.main = true; t.special = { label: '岩石城を一日で落とした', pts: 20 }; }, '熊井越中守を討ち、本丸を取った');
    rt.objDone('s5'); rt.setPhase('end');
    rt.banner('岩石城、落城', '一日で落ちた');
    rt.player.u.invuln = true;
    rt.say('蒲生郷成', '熊井越中守、討ち取ったり！　本丸に旗を立てよ', 3.5);
    // 本丸に蒲生の旗が立ち、本丸の小屋に火が掛かる（火を放って一気に畳みかけた伝え）。残る城兵は崩れて搦手の方へ落ちる
    // 共通の設営で加わる櫓の守りも含める。撃ち止めだけでは持ち場に残って斬り合いを続ける。
    for (const q of rt.army.groups) if (q.team === 1) {
      q.fire = false;
      if (!q.routed) { q.noRout = false; q.order = 'retreat'; q.fleeSet = true; q.fleeDir = { x: 0.7, z: -0.7 }; q.morale = 0; }
    }
    rt.after(0.8, () => {
      try { for (const [x, z] of [[-3, 3], [3, -2], [-8, -4]]) rt.scene.add(nobori(rt.world, x, z, 'sashi:tsuru:#ece6d6:#201f1c', 6)); } catch (e) { console.warn(e); }
      try { rt.world.addFire(6, -6, { size: 2.6, blackSmoke: true }); } catch (e) { console.warn(e); }
      sfx('obj', 0.6);
    });
    rt.after(3.4, () => { try { rt.world.addFire(5, 9, { size: 2, blackSmoke: true }); } catch (e) { console.warn(e); } });
    // 11/18 見回り k365-cloud-21（act bot 317秒）：勝った後、本人の組十四人が follow のまま立ち止まった本人の所 (-12,-12) へ重なった。
    //   本丸の口の前で列に構えさせ、落城の余韻を一つ所に固まった塊で見せない（本能寺の締めと同じ hold の手）
    //   11/18 15:15 持ち主（act bot 391秒 end：十人が (-12,-5) の一点に重なって止まった）：組ごとに持ち場をずらし、横一列（yari）に構えさせる
    (rt.squadGroups || []).forEach((g, i) => { g.order = 'hold'; g.anchor = { x: HONF.x + 2 + i * 4, z: HONF.z - 2 - i * 3 }; g.formation = 'yari'; g.dest = null; g.aggro = 6; });
    rt.after(4, () => rt.say('前田利勝', 'この岩山が一日か。秋月も肝が冷えたであろう', 3));
    rt.after(7.6, () => rt.say('蒲生氏郷', '殿下に申せ。秋月は降りましょう', 3));
    // 余韻：山じゅうの尾根に豊臣の旗・本陣から「九州を南へ」（t07_ganjaku/rakujo.js）
    // finish を先に呼ぶと over が立ち、後から届く声が共通の say で消える。
    // 共通の締め待ちに預け、旗・火・使番を見届ける三十秒は操作と声を残す。
    rt.after(8, () => { rakujo.play(rt); });
    rt._closing = { at: rt.t + 30, info: { scriptedEnd: true }, delay: 0 };
  },
  lose(rt) {
    const F = rt.flags; if (F.ending) return; F.ending = true;
    for (const s of F.stones) { s.on = false; s.mesh.visible = false; }
    rt.unmark('t07');
    rt.objFail('s' + Math.max(1, F.stage || 1)); rt.tracker.main = false; rt.setPhase('end');
    rt.banner('日が沈んだ', '岩石城は落ちなかった');
    rt.player.u.invuln = true;
    rt.finish({ scriptedEnd: true, failureReason: '日が沈むまでに本丸の熊井越中守を討てなかった' }, 6);
  },
};

t07_ganjaku.sides = { a: { name: '豊臣勢', mon: 'toyotomi' }, b: { name: '秋月方（島津方）', mon: 'nadeshiko', faction: 'akizuki' } };
// 上に出す総勢（docs/battle_learn/t07_ganjaku.md：攻め手の蒲生・前田の隊はおよそ五千、城兵は三千）
t07_ganjaku.force = (rt) => {
  // 二の丸の城兵と新手を足した後も、生きた城兵が残るうちに零にしない。
  // 討死一人を固定の三十人に換算せず、場の生存者と討死の比で総勢を減らす。
  let a = 0, b = 0;
  for (const u of rt.army.units) {
    if (!u.alive || u.isStruct || u.civ) continue;
    if (u.team === 0) a++; else if (u.team === 1) b++;
  }
  // 新手も初めの総勢の内。出場によって討死済みの人数まで戻さない。
  // 段の再開では flags と一緒に戻るため、やり直す前の損害を持ち越さない。
  const F = rt.flags;
  // 11/18 クラウド kaito2（K365 両軍の人数）：攻め手の数を場の生存者の比で出すと、退いた・片付けた味方まで討死に数え、7分で 5,000→2,143 と半分を失って見えた（史実の寄せ手の損は少ない）。攻め手は討死一人を八人に
  F.forceA = Math.min(F.forceA ?? 5000, Math.max(0, 5000 - (F.ak || 0) * 8));
  void a;
  F.forceB = Math.min(F.forceB ?? 3000, b ? Math.ceil(3000 * b / (b + (F.ek || 0))) : 0);
  return { a: F.forceA, a0: 5000, b: F.forceB, b0: 3000 };
};
// 右上の①〜④（stages.js と同じ字）。段の長さは本丸の斬り合いで延びるので、目標ごとの時切れの ✕ は付けない
t07_ganjaku.goals5 = () => (STAGES.t07_ganjaku || []).map((s, k) => ({ kind: 'stage', k, text: s[0], sec: 1e6,
  check: (rt) => (rt.flags.stage || 0) > k + 1 || (!!rt.flags.ending && rt.tracker?.main !== false) }));
t07_ganjaku.date = () => '天正十五年四月一日　初夏';
t07_ganjaku.history = '天正十五年（1587）四月一日。九州へ入った豊臣秀吉の本隊は、秋月種実の持ち城である豊前の岩石城を攻めた。秀吉は馬ヶ岳に陣を置いて岩石山には来ず、養子の羽柴秀勝を大将に、蒲生氏郷が大手から、前田利勝（のちの利長）が搦手から攻めた。攻め手はおよそ五千。\n城は岩石山（四百五十四メートル）の頂にあり、大きな岩が天然の守りになる険しい山城だった。秋月方の城兵はおよそ三千、大手を芥田悪六兵衛、搦手を城将の熊井越中守が守ったと伝わる。未明に攻め懸かり、鉄砲を絶え間なく撃ちかけて、城は日の暮れる前に落ちた。城兵の四百ほどが討たれ、熊井越中守も討死した。\n堅い城がたちまち落ちたことで、秋月種実は益富城を捨てて古処山へ退き、やがて戦わずに降った。豊臣軍の九州の進撃は一気に速まった。';

// bot の頭：近い敵を突き、段の行き先へ。門が閉まった時は門を打つ
t07_ganjaku.botBrain = (b, inp, { goTo }) => {
  inp.quickCmd = null;
  const F = b.flags, p = b.player, u = p.u;
  if (!u.alive || F.ending) return;
  inp.leftPressed = false;
  inp.k.delete('KeyW');
  const gc = F.gamo.center();
  // 深手では味方の陰で回復を待つ。列に着いただけで再び突っ込み、討たれるのを防ぐ。
  // 一突きの床が命の三〜四割なので、四割五分で退く（三割五分では次の一突きで倒れた）
  if (u.hp < u.maxHp * 0.45) F.botRest = true;
  if (F.botRest && u.hp >= u.maxHp * 0.65) { F.botRest = false; F.botRestRoad = null; }
  if (F.botRest) {
    // 追撃へ移っても門の外では坂を下る。前進する先手へ戻ると、深手のまま門前へ引き返してしまう。
    const onSlope = F.stage <= 2 || F.stage === 3 && gl(u.pos.x, u.pos.z)[1] > 7 && distToPolyline(u.pos.x, u.pos.z, APPROACH) < 12;
    // 坂では本人と先手の両方より下へ退く。先手が登り続けても、回復待ちの場所は上へ動かさない。
    // 門の内では城壁を横切らず、先手の列へ戻る。
    if (onSlope && !F.botRestRoad) {
      // 11/18 17:25 持ち主（act bot 210秒）：退いた先 (-68,73) が矢倉・門の櫓から二十余m で、命十一のまま十五秒射られ続けて倒れた。矢の届く三十四m の外まで坂を下る（六m ずつ・五度まで）
      let a = Math.min(t07_ganjaku.along(u.pos.x, u.pos.z), t07_ganjaku.along(gc.x, gc.z)) - 12, r = t07_ganjaku.roadAt(a);
      for (let k = 0; k < 5 && Math.min(Math.hypot(r.x - YAGURA.x, r.z - YAGURA.z), Math.hypot(r.x - GATE.x, r.z - GATE.z)) < 34; k++) r = t07_ganjaku.roadAt(a -= 6);
      F.botRestRoad = r;
    }
    let cover = onSlope ? F.botRestRoad : gc;
    // 先手の中心も敵中なら、そこに立ち止まって回復を待たない。近い敵から離れ、塀を横切る退き方は避ける。
    const threat = b.army.nearestEnemy(u, 8, (o) => !o.noTarget && !o.isStruct && !o.fleeing && !o.perch && Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos));
    if (threat && onSlope) {
      // 敵から真横に離れると、坂脇の巨岩や櫓で止まる。追われている間も大手道を下り続ける。
      const rear = t07_ganjaku.roadAt(t07_ganjaku.along(u.pos.x, u.pos.z) - 12);
      if (t07_ganjaku.along(rear.x, rear.z) < t07_ganjaku.along(cover.x, cover.z)) cover = F.botRestRoad = rear;
    } else if (threat) {
      const dx = u.pos.x - threat.pos.x, dz = u.pos.z - threat.pos.z, d = Math.hypot(dx, dz);
      if (d > 0.1) {
        const rear = F.botCover || (F.botCover = { x: 0, y: 0, z: 0 });
        rear.x = u.pos.x + dx / d * 10; rear.z = u.pos.z + dz / d * 10; rear.y = u.pos.y;
        if (!b.army.wallBetween(u.pos, -1, rear)) cover = rear;
      }
    }
    if (Math.hypot(u.pos.x - cover.x, u.pos.z - cover.z) > 4) goTo(p, inp, cover.x, cover.z, 3);
    return;
  }
  const boss = F.hon.units.find((o) => o.name === '熊井越中守' && o.alive);
  // 11/18 20:10 持ち主（POSLOG 510秒の回：熊井が本丸の北東の外・本人が北西の外で、塀を挟んでまっすぐ向かい八十秒届かず）：
  //   熊井へまっすぐ行く筋が本丸の板塀（十五m）を跨ぐ時は、本丸の内（南西の口）へ入って待つ。熊井は内を通って本人へ来る
  const crossHon = (a, q) => { const dx = q.x - a.x, dz = q.z - a.z, L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, -(a.x * dx + a.z * dz) / L)); return Math.hypot(a.x + dx * t, a.z + dz * t) < 15.5; };
  const ur = Math.hypot(u.pos.x, u.pos.z), kr = boss ? Math.hypot(boss.pos.x, boss.pos.z) : 0;
  // 本人が内・熊井が北東の外なら、熊井が戻って来る小屋の北（KU_IN）で待つ（小屋と塀へまっすぐ詰まらない）
  const bossWay = boss && ur > 15 && kr > 15 && crossHon(u.pos, boss.pos) ? HON : boss && ur < 14.5 && kr > 15.5 && boss.pos.x > boss.pos.z ? KU_IN[1] : boss && boss.pos;
  const goal = !F.stage ? SPAWN : F.stage <= 1 ? MOUTH : F.stage === 2 ? F.meet : F.stage === 3 ? INNER : F.stage === 4 ? ninomaru.NINO : boss ? bossWay : HON;
  // 坂で届かない敵（斜面の上下）と睨み合って止まらない：行き先へ十五秒近づけなければ、六秒は敵を構わず進む
  const gd = Math.hypot(u.pos.x - goal.x, u.pos.z - goal.z), pr = F.botProg || (F.botProg = { s: 0, d: Infinity, t: 0, skip: 0 });
  if (pr.s !== F.stage || gd < pr.d - 3) { pr.s = F.stage; pr.d = gd; pr.t = b.t; }
  else if (b.t - pr.t > 15 && gd > 8 && F.stage !== 2) { pr.skip = b.t + 6; pr.t = b.t; pr.d = gd; }
  const e = pr.skip > b.t ? null : b.army.nearestEnemy(u, F.stage === 2 ? 16 : F.stage === 3 ? 4 : 9, (o) => !o.noTarget && !o.isStruct && !o.fleeing && !o.perch && o.type !== 'dummy' && Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos) &&
    // 11/18 16:35 持ち主（描かずの通し：段5で本人が本丸の北の塀の外 (8,24)〜(1,31) を百秒行き来）：本丸の板塀（solidSeg）は wallBetween に入らず、塀越しの守りを狙って塀に詰まった。塀の内と外が違う敵は、間近（二m半）でなければ狙わない
    //   11/18 18:20 持ち主（POSLOG：段5で本人が北の塀の外 (-1〜12, 25) を三百秒行き来・熊井に届かず563秒）：塀ぎわ（十五m の前後）の櫓の守りを外の敵と見て追い続けた。塀の外の本人は十七m 半より外の敵だけ、内の本人は十三m より内の敵だけを狙う
    (F.stage < 4 || (Math.hypot(u.pos.x - HON.x, u.pos.z - HON.z) < 15 ? Math.hypot(o.pos.x - HON.x, o.pos.z - HON.z) < 13 : Math.hypot(o.pos.x - HON.x, o.pos.z - HON.z) > 17.5) || Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 2.5));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.4) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    return;
  }
  const at = (q, r = 3) => {
    const way = honWay(u.pos, q, F.botHonWay || (F.botHonWay = { x: 0, z: 0 }));
    goTo(p, inp, way.x, way.z, way === q ? r : 1.5);
  };
  const nearTo = (q, r) => Math.hypot(u.pos.x - q.x, u.pos.z - q.z) < r;
  if (F.stage <= 2 || (F.stage === 4 && F.botPast)) { at(goal, 3); return; }
  if (F.stage === 3) {
    // 退く敵の後ろから喰違の筋（門の前 → 門の内）を追う。閉まった門は打つ
    // 閉門時も先に味方を待ち、門前の角を回る。門へ直進すると脇の塀に当たり、孤立する。
    const mates = F.gamo.units.filter((o) => o.alive && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 10).length;
    if (!F.botIn && !F.tsukeiri && mates < 4 && b.t - F.stageT < 40) { at(MOUTH, 3); return; }   // 付け入った後は先手も門へなだれ込むので、門口で待たずに追う（夜50-41）
    if (!F.botFront && nearTo(FRONT, 3)) F.botFront = true;
    if (F.botFront && nearTo(INSIDE, 3)) F.botIn = true;
    // 坂から門前へ直進すると虎口の外塀に当たる。開門・閉門のどちらも外の口を経由する。
    if (!F.botFront && gateZone(u.pos.x, u.pos.z) === 'out') {
      const a = gl(u.pos.x, u.pos.z)[0];
      if (!(a > 3.8 && a < 15)) { at(MOUTH, 1.5); return; }
    }
    const st = t07_ganjaku.gateStruct(b);
    if (st && st.alive && !st.opened) {
      if (!F.botFront) { at(FRONT, 1.5); return; }
      const mx = (st.seg[0] + st.seg[2]) / 2, mz = (st.seg[1] + st.seg[3]) / 2;
      if (Math.hypot(mx - u.pos.x, mz - u.pos.z) > 2.2) { at({ x: mx, z: mz }, 1.6); return; }
      p.yaw = Math.atan2(mx - u.pos.x, mz - u.pos.z); inp.leftPressed = Math.random() < 0.6; return;
    }
    at(F.botIn ? INNER : F.botFront ? INSIDE : FRONT, 1.5); return;
  }
  // 本丸へは門の内（喰違の奥）を抜けてから向かう（門の脇の塀に詰まらない）
  if (!F.botPast) {
    if (nearTo(INNER, 4) || gl(u.pos.x, u.pos.z)[1] <= -12) F.botPast = true;
    else { at(t07_ganjaku.gatePin(b), 1.5); return; }
  }
  if (gd > 3) { at(goal, 2.4); return; }
  p.yaw = Math.atan2(goal.x - u.pos.x, goal.z - u.pos.z); inp.leftPressed = Math.random() < 0.6;
};

// 11/18 20:40 持ち主（POSLOG 592秒の回：段5で本人が本丸の北の外 (-5,28) で避け足（庇）のまま二百秒・sta0）：塀の内の射手の矢に避け続け、口へ回れなかった。
//   段5で本丸の塀の外にいる間は避け足を足さず、口へ回るのを先にする（射手の本人への矢は三割）
t07_ganjaku.botNoCover = (b) => b.flags.stage === 5 && Math.hypot(b.player.u.pos.x - HON.x, b.player.u.pos.z - HON.z) > 15;
// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
withGuard(t07_ganjaku);

// 段のファイルへ渡す物（t07_ganjaku/*.js）
const K = {
  GATE, SPAWN, HON, TEXT,
  foe: (name, at, list, o = {}) => {
    const g = enemyGroup(K.rt, { fixed: true, name, faction: 'akizuki', flag: 'nadeshiko', armor: AKI, anchor: { x: at.x, z: at.z }, facing: Math.atan2(GATE.x - at.x, GATE.z - at.z), order: 'hold', aggro: 9, width: 4, ...o }, list);
    g.noFrontline = true; return g;
  },
  fighting: (g) => t07_ganjaku.fighting(g),
};
const setup0 = t07_ganjaku.setup;
t07_ganjaku.setup = function (rt) { K.rt = rt; rt.cleanupTasks?.add(() => { if (K.rt === rt) K.rt = null; }); return setup0.call(this, rt); };   // 戦を出たら外す（11/17 記憶の測り）

export { t07_ganjaku };
export default t07_ganjaku;
