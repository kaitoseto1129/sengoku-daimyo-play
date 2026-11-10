// ======================================================================
// 豊臣編 4　紀州征伐／根来寺（天正十三年（1585）三月二十三日。docs/chapter2_toyotomi.md の 4）
// 小牧・長久手の和睦の後、秀吉はおよそ十万で紀州へ向かった。鉄砲で名高い根来衆・雑賀衆を攻める。
// 三月二十一日、和泉の千石堀城で根来衆の主力が激しく戦い、火が煙硝蔵に入って落ちた。
// 二十三日、秀吉勢が根来寺へ入り、坊舎の多くが焼けた。大塔と大師堂は残った。
// 自分は部将として羽柴秀次の先手を率いる。押す兵が付いた竹束の陰で門前の坊舎へ寄る → 坊舎の縁・物見から堀秀政を狙う鉄砲衆を討つ →
// 丸太の組が山門を打ち破る → 味方と境内へ攻め入る → 大塔の前の行人方を崩し、大塔を焼かせない（AY 2〜5。自分が動かなくても味方で筋は進む）。
// 史実では根来寺での抵抗は少ない。寺に残った鉄砲衆の抵抗を厚くしたのは脚色（筋書きの一枚どおり）。
// 形の手本は docs/battle_refs/t04_negoro.md（文化庁の史跡解説・発掘・国土地理院の標高・堂の今の位置）。
// 向き：下の数は「谷の道の向き」に沿った手書きの座標（+z＝大門から大塔へ東北東、+x＝左＝北山の側）。
//   置く時に P() で本当の方角へ回す（地図の北が本当の北。大塔・堂は南を向く）。寸法は縮めた復元。
// ======================================================================
import * as THREE from 'three';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { showGateBreak } from './battle_events.js';
import { flagTexture } from './textures.js';
import { useTerrain, BATTLE_ASSETS, assetsForBattle } from './asset_manifest.js';
import { demSample } from './dem.js';
import { distToPolyline } from './world.js';
import { enemyGroup, allyGroup, wallLine, nm, centerOf } from './bhelp.js';
import { dress } from './b_inabayama.js';
import { nobori, jinmaku, shogi, tsuiji, tawara, romon, ishigaki, solidRect, solidCircle, solidSeg, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { sobo, kura, doja, hondo, shoro, monomidai } from './temple_parts.js';
import * as DP from './b_depth.js';
import { depthStart, depthTick, depthBot } from './b_depth.js';
import { makeRam } from './hajo.js';
import { addTaba, placeTaba, tickTabas, patchGunCover } from './taketaba.js';
import { STAGES } from './stages.js';
import { withGuard } from './toyo_bot.js';
import { farSight } from './far_sight.js';
// 約15分の段（docs/toyo15_plan_1108.md の 6）：足した段の中身は src/t04_negoro/ の各ファイル
import { install as negoroIntro } from './t04_negoro/intro.js';
import { soboStep } from './t04_negoro/sobo.js';
import { fireStart, fireTick } from './t04_negoro/fire.js';
import { kyotenStep } from './t04_negoro/kyoten.js';
import { breath, fallB } from './toyo15/kit.js';
import { negoroDepth } from './t04_negoro/depth.js';
import { MEM_TIGHT } from './settings.js';
import { routeTools } from './b_k_route.js';

// 国土地理院の標高（tools/dem.mjs の negoro。無い時は手書きの谷だけで遊べる）
let ngDem = null, RAMP = null;
// 標高の束（tools/dem.mjs の negoro）を支度で読む（11/1 まで束が無く、手書きの地形だけだった）
BATTLE_ASSETS.t04_negoro = Object.freeze([...assetsForBattle(''), 'dem_negoro']);
useTerrain('dem_negoro', (data) => { ngDem = data; ngRef = null; RAMP = null; SITE_Y.clear(); });

// ---- 向き：手書きの座標（lx, lz）を本当の方角へ回す ----
// 大門（今の大門の位置）から大塔へは東北東（実測で東へ 521m・北へ 325m）。+lz をその向き、+lx を左（北）にする。
// 遊びの座標は x＝東、z＝南（地図の北が上）。P(lx, lz) が置く所、toL(x, z) がその逆。
const ROT = Math.atan2(0.849, -0.529);
const CR = Math.cos(ROT), SR = Math.sin(ROT);
const P = (x, z) => ({ x: x * CR + z * SR, z: -x * SR + z * CR });
const PA = (x, z) => [x * CR + z * SR, -x * SR + z * CR];
const toL = (x, z) => ({ x: x * CR - z * SR, z: x * SR + z * CR });
const dirL = (dx, dz) => ({ x: dx * CR + dz * SR, z: -dx * SR + dz * CR });   // 向き（長さ1の矢）を回す

// 手書きの座標（lx, lz）。参道は大門から菩提川の橋を渡り、大伝法堂と大塔の前の平場へ
const SANDO_L = [[0, -230], [0, -120], [0, -40], [0, 0], [0, 40], [-3, 70], [-5, 100], [-4, 140]];
const SANDO = SANDO_L.map(([x, z]) => PA(x, z));
// 道しるべ（AJ 11/3 kaito「坊舎に斬り込めと書いてあるが、そこまでどうやって辿り着くか分からない」）：
//   兵も地面の矢印も参道の曲がり角（門前の坊舎の間・大門の口・菩提川の橋・大塔の前）を一つずつ辿る。坊舎・塀の向こうへまっすぐ向かわせない
//   道の点は 8 歩ごとに細かく刻む（長い一筋のままだと、同じ筋の上の行き先へ塀越しにまっすぐ向かった）
const SANDO_FINE = [];
for (let i = 0; i < SANDO.length - 1; i++) {
  const [ax, az] = SANDO[i], [bx, bz] = SANDO[i + 1], n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 8));
  for (let k = 0; k < n; k++) SANDO_FINE.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
}
SANDO_FINE.push(SANDO[SANDO.length - 1]);
const { way: sandoWay0 } = routeTools(SANDO_FINE, 'ng');
// 曲がり角の着いたとみなす輪は一歩（二歩のままだと、角の二歩手前で止まり、次の角へ移らなかった）
const sandoWay = (army, u, want) => { const q = sandoWay0(army, u, want); if (q !== want) q.botRadius = 1; return q; };
let NG_RT = null;
const GATE = P(0, 0);                   // 大門（二重の大きな楼門。1585 年に焼け残り、のちに大和郡山城の門になったと伝わる）
const DAITO_L = { x: 18, z: 86 };
const DAITO = P(DAITO_L.x, DAITO_L.z);  // 大塔（参道の左＝北。北山の裾の平場に南を向いて立つ）
const DENPO = P(12, 60);                // 大伝法堂（本堂。大塔の西の前。焼け残り、秀吉が京へ運ばせた）
const DAISHI = P(32, 70);               // 大師堂（大塔のすぐ西。焼け残った）
// 大塔の前（南の正面の参道）。大塔を背にして、奥の谷と北山・前山から来る行人方を受ける所
//   11/6：前は大塔より二十歩も奥の山の坂（lz 106）にあり、大塔が見えないまま坂で戦った
const TOWER_FRONT_L = 82;
const TOWER_FRONT = P(-4, TOWER_FRONT_L);
const MONZEN = P(0, -74);               // 門前（西坂本）の坊舎の並び
const SAIKA_EN = P(-11, -42);           // 奥の坊舎（門前の左）の縁。雑賀の鉄砲衆が参道へ向けて並ぶ
const YOSE = P(0, -96);               // 竹束の寄せ場
const START = P(0, -140);               // 門前の坊舎の屋根と大門が始めの画面に入る所
const WALL_X = 74;                      // 築地塀の左右の端（手書きの座標）
const BRIDGE_L = { x: 0, z: 40 };       // 菩提川の橋
const POND_L = { x: 46, z: -26, rx: 15, rz: 10 };   // 大門池（大門の外。今は図書館が建つ）
// 門前（西坂本）の坊舎（手書きの座標と向き）
const MONZEN_BO = [[-18, -84, Math.PI / 2], [-18, -66, Math.PI / 2], [-32, -76, Math.PI / 2], [18, -84, -Math.PI / 2], [18, -66, -Math.PI / 2], [32, -76, -Math.PI / 2], [-20, -40, Math.PI / 2], [20, -40, -Math.PI / 2]];
const HASHIBA = { armor: 0x2a2420, flag: 'toyotomi' };
const NEGORO = { armor: 0x3a342c, flag: 'maru' };
// 先手の家ごとの旗（羽柴の桐で皆をそろえない。筒井は梅鉢・堀は三つ盛亀甲に花菱。textures の MON）
const TSUTSUI = { ...HASHIBA, flag: 'umebachi' }, HORI = { ...HASHIBA, flag: 'hori' };
// 上の身分（足軽大将より上）は先手を率いる部将の言い方
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

// ---- 地形 ----
// 実測（国土地理院）：北は和泉山脈の南の裾（北山）、南は東西に衝立のように延びる前山。その間の狭い平地と谷に堂と子院が並ぶ。
// 大門は前山の西の端の細い尾根と北山の間の口に立つ。手書きの座標を、道の向きに 8m・横に 4m で実測へ写し、高さは 0.3 倍
const DEM_T = { E: -79, S: 112 };       // 大塔の実の位置（標高の格子の中心からの m。東＋・南＋）
const DEM_AX = { E: 0.849, S: -0.529 }, DEM_LF = { E: -0.529, S: -0.849 };
const DEM_SZ = 8, DEM_SX = 4, DEM_V = 0.3;
let ngRef = null;
function demL(lx, lz) {
  const a = (lz - DAITO_L.z) * DEM_SZ, b = (lx - DAITO_L.x) * DEM_SX;
  return demSample(ngDem, DEM_T.E + a * DEM_AX.E + b * DEM_LF.E, DEM_T.S + a * DEM_AX.S + b * DEM_LF.S);
}
// 子院の平場（雛壇）：斜面を削って平らにし、低い側に石垣を積む（発掘で分かった子院の作り）。[lx, lz, 幅, 奥行]（幅と奥行は東西・南北）
const SITES_L = [
  [-46, 16, 12, 10], [-44, 56, 12, 10], [-50, 92, 12, 10], [44, 22, 12, 10], [54, 62, 12, 10], [-26, 118, 12, 10], [50, 120, 12, 10], [-26, 16, 12, 10],
  [36, 56, 12, 10], [56, 100, 10, 9],
];
const SITES = SITES_L.map(([x, z, w, d]) => ({ ...P(x, z), hw: w / 2 + 1, hd: d / 2 + 1 }));
// 堂の平場（基壇の下を均す）：大塔・大伝法堂・大師堂
const DOU_FLATS = [{ ...DAITO, r: 16 }, { ...DENPO, r: 13 }, { ...DAISHI, r: 9 }];
const SITE_Y = new Map();
// 菩提川：北山から下り、大門と堂の間で参道を横切って前山の側へ流れる（手書きの座標）
const BODAI_L = [[96, 52], [60, 46], [26, 42], [0, 40], [-30, 37], [-60, 32], [-96, 24]];
const sm = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

// 標高の束が無い時の手書きの谷（手書きの座標）：西の田から東へゆるく上り、左右の尾根が谷を挟む
function base(x, z) {
  let h = 0.03 * (z + 220);
  const ax = Math.abs(x);
  if (ax > 78) h += Math.pow(ax - 78, 1.25) * 0.32;
  if (z > 132) h += (z - 132) * 0.55;
  h += 0.35 * Math.sin(x * 0.06 + 0.7) * Math.cos(z * 0.05) + 0.2 * Math.sin(z * 0.11 - x * 0.03);
  if (z < -120) h = Math.min(h, 0.03 * 100 + 0.08 * Math.sin(x * 0.2) + (ax > 78 ? Math.pow(ax - 78, 1.25) * 0.32 : 0));
  return h;
}
// 均す前の地面（手書きの座標）。実測を写し、参道の筋だけ横に均す（大門の口・堂の前の平地）
function rawL(lx, lz) {
  if (!ngDem) return base(lx, lz);
  if (ngRef === null) ngRef = demL(0, 0);
  const raw = (demL(lx, lz) - ngRef) * DEM_V;
  const cz = Math.max(-240, Math.min(150, lz));
  const hp = ((demL(0, cz - 8) + demL(0, cz) + demL(0, cz + 8)) / 3 - ngRef) * DEM_V;
  const h = hp + (raw - hp) * sm((Math.abs(lx) - 16) / 28) + 0.25 * Math.sin(lx * 0.07 + 0.7) * Math.cos(lz * 0.05);
  return h + rampL(lx, lz, h);
}
// 11/6 描いて遊んで：大門は急な土の山の上に乗り（門の手前 20 歩で 4m 上がって門で下がる）、大塔の前は 18 度の坂だった。
//   実の根来寺は大門の口から堂の並ぶ平地へゆるく上る（縮めた分、坂が実よりきつく出ていた）。
//   門前から大門の口までと、境内の堂の平地は、参道の筋をゆるい一続きの上りへならす（北山・前山の裾はそのまま）
function rampL(lx, lz, h) {
  if (!RAMP) {
    const at = (z) => { let s = 0; for (const x of [-6, 0, 6]) { const a = (z - DAITO_L.z) * DEM_SZ, b = (x - DAITO_L.x) * DEM_SX; s += demSample(ngDem, DEM_T.E + a * DEM_AX.E + b * DEM_LF.E, DEM_T.S + a * DEM_AX.S + b * DEM_LF.S); } return (s / 3 - ngRef) * DEM_V; };
    RAMP = { g0: at(-64), g1: at(6), k0: at(26) };
  }
  const R = RAMP, side = sm((34 - Math.abs(lx)) / 12);
  if (side <= 0) return 0;
  let want = null, w = 0;
  if (lz > -72 && lz < 14) { want = R.g0 + (R.g1 - R.g0) * sm((lz + 64) / 70); w = sm((lz + 72) / 8) * sm((14 - lz) / 8); }
  // 境内の上りは 78 歩で 7m（その先は奥の山の裾へ戻す）
  else if (lz > 20 && lz < 132) { want = R.k0 + Math.max(0, lz - 26) * 0.09; w = sm((lz - 20) / 8) * sm((132 - lz) / 28); }
  if (want === null) return 0;
  return (want - h) * w * side * 0.85;
}
// 子院の平場の高さ：四隅の一番高い所より少し上（低い側は石垣の上に立つ）
function siteY(i) {
  let y = SITE_Y.get(i);
  if (y === undefined) {
    const s = SITES[i];
    let top = -Infinity, bot = Infinity;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const q = toL(s.x + a * s.hw, s.z + b * s.hd); const h = rawL(q.x, q.z); top = Math.max(top, h); bot = Math.min(bot, h); }
    const c = toL(s.x, s.z), mid = rawL(c.x, c.z);
    // 高い側は削り、低い側は石垣の高さ（2m ほど）までに留める
    //   11/6 描いて遊んで：急な斜面の子院は低い隅から 8m を超す石垣の塊になり、大塔の前で崖のような石の箱が立った。
    //   根来の子院の石垣は二〜三メートル（発掘）。低い隅から 3m までにし、高い側はその分深く削る（切土の段）
    y = Math.max(mid + 0.9, Math.min(top + 0.3, mid + 2.2));
    y = Math.max(bot + 0.9, Math.min(y, bot + 3));
    SITE_Y.set(i, y);
  }
  return y;
}
function douY(i) {
  const k = 'd' + i;
  let y = SITE_Y.get(k);
  if (y === undefined) { const f = DOU_FLATS[i], q = toL(f.x, f.z); y = rawL(q.x, q.z) + 0.3; SITE_Y.set(k, y); }
  return y;
}
function height(x, z) {
  const L = toL(x, z);
  let h = rawL(L.x, L.z);
  // 堂の平場
  for (let i = 0; i < DOU_FLATS.length; i++) {
    const f = DOU_FLATS[i], d = Math.hypot(x - f.x, z - f.z);
    if (d < f.r) h += (douY(i) - h) * sm((f.r - d) / (f.r * 0.35));
  }
  // 子院の雛壇（縁は切り立つ。低い側に石垣を積む）
  for (let i = 0; i < SITES.length; i++) {
    const s = SITES[i], o = Math.max(Math.abs(x - s.x) - s.hw, Math.abs(z - s.z) - s.hd);
    if (o < 0.8) h += (siteY(i) - h) * sm(1 - o / 0.8);
  }
  // 大門池：大門の外の溜池
  const e = ((L.x - POND_L.x) / POND_L.rx) ** 2 + ((L.z - POND_L.z) / POND_L.rz) ** 2;
  if (e < 1.3) h -= 1.8 * sm((1.3 - e) / 0.5);
  // 菩提川の流れ（橋の下の参道は削らない）
  //   地面の網目（2.5m）でも谷が写る幅にする。川底は幅 7m ほど平らにし、岸は 3m で上げる
  //   （11/6 描いて遊んで：V 字の細い谷を網目が均し、水の帯が土から出たり潜ったりして割れた板に見えた）
  if (Math.abs(L.x) > 2.7 && Math.abs(L.z - 40) < 20) { const d = distToPolyline(L.x, L.z, BODAI_L); if (d < 6.5) h -= 1.1 * sm((6.5 - d) / 3); }
  return h;
}

// 段の数（右上の一行。stages.js の作りに乗せる）
const atStep = (n) => (rt) => (rt.flags.step ?? 0) >= n;
// 11/6 kaito 十1：五つの目標は最初から同じ言葉で並べ、途中で言い替えない。門は根来寺の「大門」の一つの名で呼ぶ（山門と大門の二つの名にしない）
const GOALS = [
  '竹束の陰について、門前の坊舎まで寄せよ',
  '坊舎の縁から堀秀政を狙う鉄砲衆を討て',
  '丸太の組と大門へ寄り、扉を打ち破れ',
  '僧坊の路地で、持ち場を替えて撃つ鉄砲衆を討て',
  '火の回る境内を抜け、菩提川の橋を渡って大塔の前へ',
  '大塔の前で行人方を討ち、大塔を守り抜け',
  '奥の院に残る鉄砲衆を潰し、根来衆を追い払え',
];
STAGES.t04_negoro = GOALS.map((g, i) => (i ? [g, atStep(i + 1)] : [g]));
// 段に入った時に step を進める包み
// 足した段のファイルへ渡す道具（NG）は setup の後で埋める
const NG = { GOALS };
// 共通の時間上限で、未到着・残敵ありの段まで済ませない。七段とも本人の達成条件を守る。
const stepped = (n, st) => ({ ...st, noHardCap: true, start(rt, C, m, ctx) { rt.flags.step = n; rt.flags.stepT = rt.t; st.start(rt, C, m, ctx); } });
const fighting = (u) => u && u.alive && !u.fleeing && !u.downed && !u.dying;
// 塀の撃ち手は門前に残る寄せ手だけを狙う。後送中・退却中の兵を狙いに残さない。
const gateTarget = (u) => fighting(u) && !u.name && !u.noTarget && !u.woundOut && !u.rearWound
  && Math.hypot(u.pos.x - GATE.x, u.pos.z - GATE.z) < 40;
// 深手で退く者は生存数には残るが、討つべき敵と行き先には数えない。
// 一時的に倒れている者は起き上がるため、残兵の数には残す。
const remaining = (u) => u && u.alive && !u.fleeing && !u.dying && !u.woundOut && !u.rearWound;
// 後送された押し手は生存数に残る。起き上がる者は待つが、後送だけの束は寄せの案内に使わない。
const hasPushers = (t) => t.g.count > 0 && !t.g.routed && t.g.units.some((u) => remaining(u) && !u.rearWound);
const alive = (g) => !!g && g.count > 0 && !g.routed && g.units.some(remaining);
const heads = (list) => list.reduce((a, g) => a + (alive(g) ? g.units.reduce((n, u) => n + (remaining(u) ? 1 : 0), 0) : 0), 0);
function nearestFighter(g, p, current) {
  if (!alive(g)) return null;
  // 後送中の兵を追わせない。手当てを終えて復帰すれば再び的にできる。
  if (fighting(current) && remaining(current) && !current.rearWound && g.units.includes(current)) return current;
  let best = null, bd = Infinity;
  for (const u of g.units) if (fighting(u) && remaining(u) && !u.rearWound) {
    const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}

// ---- 根来の鉄砲の持ち場（AY 2）：本物の鉄砲の兵を持ち場の床（u.perch）に据える。持ち場を離れず、撃つ度に硝煙を出す ----
// 撃ち手の姿は、具足の兵・白い裹頭の行人・剃った頭の小袖の僧・小柄な若い行人を順に混ぜる（根来衆は地侍の子弟が山内に入った僧兵の集団）
const SOHEI_LK = { sohei: 1, armor: 0x2a2622, lace: 0xcfc7b4, cloth: 0xd8d2c2, hat: 'hachimaki', flag: null };
const GUN_LOOKS = [{}, SOHEI_LK, {}, { kosode: 1, bozu: 1, flag: null }, {}, { ...SOHEI_LK, small: 1 }];
let KOSHI = null, ASHIBA = null, ASHI = null;
const KOSHI_GEO = () => KOSHI || (KOSHI = new THREE.BoxGeometry(0.14, 1.0, 3.6));   // 縁の腰板（参道に向く側）
const STEP_GEO = () => ASHIBA || (ASHIBA = new THREE.BoxGeometry(1.6, 0.12, 0.9));   // 塀の内の踏み台の板
let BOARD = null;
const BOARD_GEO = () => BOARD || (BOARD = new THREE.BoxGeometry(6.1, 2.15, 0.05));   // 門前の坊舎の表の内の板戸（坊舎の 1.9 倍の前の寸法）
const LEG_GEO = () =>ASHI || (ASHI = new THREE.BoxGeometry(0.13, 1, 0.13));        // 踏み台の脚（高さは scale.y）
// spots：[{ x, z（手書きの座標）, dy（地面からの高さ）か abs（高さそのもの）, f（向き） }]
function gunPost(rt, name, spots, armored = false) {
  if (!spots.length) return null;
  const W = rt.world;
  // armored：遠くから見上げる所（大門の楼）は具足の撃ち手だけ（白い裹頭が並ぶと白い人形に見えた）
  const list = spots.map((s, i) => ({ type: 'gun', n: 1, o: { ...NEGORO, ...(armored ? {} : GUN_LOOKS[i % GUN_LOOKS.length]) } }));
  const g = enemyGroup(rt, { faction: 'saika', fixed: true, name, anchor: P(spots[0].x, spots[0].z), facing: Math.PI + ROT, order: 'hold', aggro: 2, seekRange: 0, noRout: true, morale: 100, dmgMult: 0.12 }, list);   // 15分の戦（11/8）：持ち場の撃ち手は数で厚く、一発は軽く（0.32 から。十五分のあいだ撃たれ続ける）
  // 11/6 描いて遊んで：縁・塀・子院の撃ち手が一発も撃たなかった。持ち場の撃ち手は隊の段の並び（gunGated の slotPos）から離れて据わるので、
  //   「段の所へ着いていない」と見なされ構えなかった。持ち場ごとに一人一人が撃つ（段を組まない）
  g.gunRanks = () => 1;
  g.units.forEach((u, i) => {
    const s = spots[i];
    if (!s) return;
    const q = P(s.x, s.z), y = s.abs ?? W.heightAt(q.x, q.z) + (s.dy || 0), d = dirL(s.f[0], s.f[1]);
    u.pos.set(q.x, y, q.z); u.perch = { x: q.x, y, z: q.z }; u.mesh.position.copy(u.pos);
    u.heading = Math.atan2(d.x, d.z); u.mesh.rotation.y = u.heading;
    u.gunAmmo = 60;
    if (list[i].o.small) { u.mesh.scale.multiplyScalar(0.84); u.bodyHeight *= 0.84; }
  });
  return g;
}
// 持ち場を捨てて逃げる（床から降りる）
const flee = (g) => {
  if (!g) return;
  // 組頭が生きていても、退く下知なら隊は崩れる。士気だけでは持ち場を離れない。
  g.noRout = false; g.morale = 0; g.focus = null; g.order = 'retreat';
  g.stay = false; g.dest = null; g.onArrive = null;
  for (const u of g.units) { u.perch = null; u.target = null; }
};

// ---- 大塔（多宝塔）：基本形を組んだ軽い一棟。材質は一度だけ作る ----
let TOWER_MAT = null;
function towerMats() {
  if (TOWER_MAT) return TOWER_MAT;
  const m = (c, r = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0 });
  TOWER_MAT = { stone: m(0x8a857a), wood: m(0x4e3424), white: m(0xe2dccd), roof: m(0x4a4b4c, 0.85), bronze: new THREE.MeshStandardMaterial({ color: 0x5a4a2a, roughness: 0.5, metalness: 0.6 }),
    lattice: m(0x2a1c12), water: new THREE.MeshStandardMaterial({ color: 0x223024, roughness: 0.55, metalness: 0, transparent: true, opacity: 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }) };   // 山の小川の澄んだ浅い水（灰色の板に見えないよう暗く）
  return TOWER_MAT;
}
function daitoModel(world, x, z) {
  const M = towerMats(), g = new THREE.Group();
  const y = world.heightAt(x, z);
  const add = (geo, mat, py, ry = 0) => { const o = new THREE.Mesh(geo, mat); o.position.y = py; o.rotation.y = ry; o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  add(new THREE.BoxGeometry(17, 1.2, 17), M.stone, 0.6);                         // 基壇
  add(new THREE.BoxGeometry(14, 6, 14), M.white, 4.2);                           // 初重の壁
  // 初重（裳階・方五間）の各面：中の間に板扉、その両脇に板、端の間に連子窓（白い壁だけの箱にしない）
  for (let f = 0; f < 4; f++) {
    const a = f * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
    for (const [k, w, h, py, mat] of [[0, 2.6, 4.2, 3.7, M.wood], [-2.2, 1.1, 4.2, 3.7, M.wood], [2.2, 1.1, 4.2, 3.7, M.wood], [-4.4, 2.2, 1.6, 5.0, M.lattice], [4.4, 2.2, 1.6, 5.0, M.lattice]]) {
      const o = add(new THREE.BoxGeometry(w, h, 0.2), mat, py, a);
      o.position.x = s * 7.02 + c * k; o.position.z = c * 7.02 - s * k;
    }
  }
  for (const sx of [-1, 1]) for (const k of [-1, 0, 1]) {                        // 柱
    add(new THREE.BoxGeometry(0.6, 6, 0.6), M.wood, 4.2).position.set(sx * 7, 4.2, k * 6.6);
    add(new THREE.BoxGeometry(0.6, 6, 0.6), M.wood, 4.2).position.set(k * 6.6, 4.2, sx * 7);
  }
  // 屋根は四角の錐台（軒の勾配はおよそ 27 度）。下から見上げても抜けないよう、軒裏の板で塞ぐ
  add(new THREE.CylinderGeometry(7.2, 14.5, 2.6, 4, 1, true), M.roof, 8.5, Math.PI / 4);   // 裳階の屋根
  add(new THREE.BoxGeometry(20.4, 0.25, 20.4), M.wood, 7.25);                        // 裳階の軒裏
  add(new THREE.CylinderGeometry(5.6, 6.4, 1.8, 24), M.white, 10.6);              // 亀腹
  add(new THREE.CylinderGeometry(5.2, 5.2, 5.2, 24), M.white, 13.6);              // 円い塔身
  add(new THREE.CylinderGeometry(5.4, 5.4, 0.6, 24), M.wood, 16.3);
  add(new THREE.CylinderGeometry(1.2, 13, 5.5, 4, 1, true), M.roof, 19.3, Math.PI / 4);   // 上重の屋根
  add(new THREE.BoxGeometry(18.3, 0.3, 18.3), M.wood, 16.6);                         // 上重の軒裏（組物の段）
  add(new THREE.CylinderGeometry(0.35, 0.45, 11, 8), M.bronze, 26.4);              // 相輪
  for (let i = 0; i < 9; i++) add(new THREE.CylinderGeometry(1.1 - i * 0.06, 1.1 - i * 0.06, 0.22, 12), M.bronze, 22.4 + i * 0.75);
  add(new THREE.SphereGeometry(0.6, 10, 8), M.bronze, 32.2);
  g.position.set(x, y, z);
  return g;
}

const t04_negoro = {
  spawn: { x: START.x, z: START.z, heading: ROT },
  // 三月の紀州攻めは七月の関白就任より前。年だけで身分を決める共通の説明を使わない。
  introPeople: [{ id: '秀吉', name: '羽柴秀吉', note: '信長亡き後の天下を争う羽柴家の大将。' }],
  minutes: 15, expectMin: 15,
  depth: () => negoroDepth(NG), lethal: { max: 2, firstAt: 200, gap: 120 },   // 11/9 二巡（徳川D）：既定の lethal では縁と塀の鉄砲の中で bot が二回とも二〜五分で倒れた。突然の討死を二つ・三分過ぎからに絞る。 武将の備（t04_negoro/depth.js）と命懸けの戦場（lethal.js）
  forceBarAlways: true,   // 両軍の総勢と減りを、行き先の案内中も一本の棒で示す
  keepBattleSigns: true,   // 行き先の▼を出している間も、人数の棒と武将名を隠さない。
  nameTagLimit: 12,   // 見えている将の名を一、二人だけに絞らない（重なりは共通の判定で避ける）
  noCavalryMix: true,   // 寺の境内・山城の狭い道：共通の「敵の組に騎馬を混ぜる」をしない（路地と山道で馬の突きに何度も倒された）
  nearbyAllySignLimit: 0,   // 近くの味方に意味の分からない白い丸を出さない（critic60 五2）
  playerTaken: 0.3,   // 15分の戦：縁・塀・路地の鉄砲が十五分のあいだ絶えず撃つ。本人が途中で倒れ続けないよう軽く
  noWake: true, noTaishoRaid: true, noDespair: true,
  // 関所 11/10（知らせ4）：坊舎の一組が崩れただけで「敵は総崩れじゃ」と出た。寺の衆は小さな組ごとに崩れるので、一手の崩れとして言う
  battleVoices: { lines: { ally: { rout: ['一手が崩れた！', '敵の一手が退くぞ！', 'あの手は崩れた。次が来るぞ！'] } } },
  // 11/6 描いて遊んで：大門が破れた直後、門の内の行人方の槍を二秒に二度受けて（一突き四割）討たれ、負けた。
  //   刃を受けた後の三秒は次の刃を通さない（澤山・伊能と同じ。一太刀の重さはそのまま。十一1・十二3）
  meleeGrace: { rate: 1, burst: 1, interval: 3 },
  // 目標は五つの段だけ（「敵を何人討つ」で埋めない。AW 3）
  stageGoalsOnly: true,
  goalsVisibleRows: 5,   // 七段の順序を保ち、今の目標を含む五件を最初から並べる。
  // 11/4 jin（BH6・Simple）：敵を指す矢印と構えの案内は出さない。敵は頭上の▼で分かる
  meleeGuide: () => false,
  guardGuideAllowed: () => false,
  // 11/4 jin（AW3・AJ）：▼は段ごとに決まった一か所に立て、言葉もその段の行いにする（「門前の坊舎」を「門へ進め」と読み違えない）
  goalTargetOverride(rt) {
    const F = rt.flags, s = F.step || 0;
    if (F.ending || s < 1) return null;
    const T = F._ngTg || (F._ngTg = {});
    if (T.s !== s) {
      const at = s === 1 ? YOSE : s === 2 ? (F.posts.win ? centerOf(F.posts.win) : MONZEN) : s === 3 ? P(0, -3) : s === 4 ? P(0, 18) : s === 7 ? NG.OKU : TOWER_FRONT;
      Object.assign(T, { s, x: at.x, z: at.z, unit: null, boss: false,
        action: ['', '竹束について寄せよ', '鉄砲衆を討て', '大門を破れ', '鉄砲衆を討て', '大塔の前へ', '大塔を守れ', '奥の院を潰せ'][s], label: ['', '竹束の陰', '坊舎の鉄砲衆', '大門', '僧坊の路地', '大塔の前', '大塔の前', '奥の院'][s] });
    }
    // 丸太の護衛は担ぎ手の脇へ案内する。門を直接指すと、組を追い越して射撃の前へ出てしまう。
    // 足した段（④僧坊・⑦奥の院）は今の的（動く鉄砲衆）に付ける。
    if ((s === 3 || s === 4 || s === 5 || s === 7) && F.dp?.cur?.goal) { T.x = F.dp.cur.goal.x; T.z = F.dp.cur.goal.z; }
    // ① 竹束の陰：▼は押し進む竹束の列のすぐ後ろ（11/6 描いて遊んで：▼が門前に立ち、自分だけ馬で竹束を追い越して坊舎の窓から撃たれた）
    if (s === 1 && F.tabaSet) { const q = P(0, Math.min(-99, t04_negoro.tabaFront(F) - 3)); T.x = q.x; T.z = q.z; }
    // 鉄砲衆は参道の左右の縁に分かれて据わる。真ん中の道を指さず、近い撃ち手の持ち場（動かない）を指す
    if (s === 2) {
      const p = rt.player.u.pos;
      const C = F.dp?.cur;
      // 討ち取りの条件を満たした後は、達成に必要な門前の合流場所へ戻す。
      const cleared = C && !C.later?.length && heads([F.posts.win]) <= 4 && heads(C.groups || []) <= 4;
      let best = cleared ? null : nearestFighter(F.posts.win, p, T.unit);
      if (!cleared && !best && C?.groups) for (const g of C.groups) {
        best = nearestFighter(g, p, T.unit);
        if (best) break;
      }
      // 縁が崩れた後は残る雑賀衆へ、皆退いた後は段の合流場所へ案内する。逃げる撃ち手を追わせない。
      T.unit = best;
      T.x = best ? best.pos.x : MONZEN.x; T.z = best ? best.pos.z : MONZEN.z;
      T.label = best ? '坊舎の鉄砲衆' : '門前の坊舎';
      T.action = best ? '鉄砲衆を討て' : '味方と合流せよ';
    }
    return T;
  },
  // 右上の一行は五つの目標の言葉のまま（門の打ち手の「大門の門扉を打て」や主の任務の一行に替えない。十1）
  missionHeading(rt) {
    const s = rt.flags.step || 0;
    return GOALS[Math.max(0, Math.min(GOALS.length - 1, s - 1))];
  },
  gateGuideOwnTask: true,
  // 11/6 描いて遊んで：馬で坊舎の縁の際（壁から一歩半）に立ち、坊舎を背にすると、カメラが坊舎の中へ入って格子と板が画面を塞いだ（九7・十一2）。
  //   馬上は共通の肩の選び直しが効かないので、坊舎・塀・子院の箱の中へ入ったカメラは、主人公の居る側の箱の外へ押し出す
  clampCamera(rt, pos) {
    const B = rt.flags.camBoxes, pu = rt.player && rt.player.u;
    if (!B || !pu) return;
    for (const b of B) {
      if (pos.y < b.y0 || pos.y > b.y1) continue;
      const fx = pos.x - b.x, fz = pos.z - b.z;
      let p0 = fx * b.c - fz * b.s, p1 = fx * b.s + fz * b.c;
      if (Math.abs(p0) >= b.hw || Math.abs(p1) >= b.hd) continue;
      const gx = pu.pos.x - b.x, gz = pu.pos.z - b.z, q0 = gx * b.c - gz * b.s, q1 = gx * b.s + gz * b.c;
      if (Math.abs(q0) >= b.hw && (Math.abs(q1) < b.hd || Math.abs(q0) - b.hw > Math.abs(q1) - b.hd)) p0 = Math.sign(q0) * (b.hw + 0.15);
      else if (Math.abs(q1) >= b.hd) p1 = Math.sign(q1) * (b.hd + 0.15);
      // 軒下では主人公も屋根の真下にいる。平面の位置だけで箱の中とみなすと、屋根へ入ったカメラを戻せない。
      else if (pu.pos.y < b.y0) pos.y = b.y0 - 0.15;
      else if (pu.pos.y > b.y1) pos.y = b.y1 + 0.15;
      // 縁や踏み台で主人公も箱の範囲内にいる場合は、主人公に近い側の外へ出す。
      // そのままにすると、馬上から振り向いたカメラが板戸や屋根の中に残る。
      else if (b.hw - Math.abs(q0) < b.hd - Math.abs(q1)) p0 = (Math.sign(q0) || Math.sign(p0) || 1) * (b.hw + 0.15);
      else p1 = (Math.sign(q1) || Math.sign(p1) || 1) * (b.hd + 0.15);
      pos.x = b.x + p0 * b.c + p1 * b.s; pos.z = b.z - p0 * b.s + p1 * b.c;
    }
  },
  // 天正十三年三月は関白（七月）の前。羽柴の旗は五三桐（五七桐は関白の後。battle.js の flagEra）
  flagEra: { toyotomi: 'kiri53' },
  // 共通の奥の乱戦の補い（front_fill）は参道の正面に立って門前の坊舎と大門を隠すので、この戦では下の setup で参道の左右にだけ置く
  noFrontFill: true,
  introPlace: '紀伊国 根来寺（今の和歌山県岩出市根来）',
  introText: '二日前、千石堀城は煙硝蔵の火で落ちた。寺に残った根来の鉄砲衆が、坊舎と大門で待つ。大塔は焼かせるな。',
  world: {
    // 11/8 critic60 八1：参道に白い紙を敷いたような灰の斑と点線（道の芯の泥の照り）。乾いた踏み固めの土にし、道の縁を草へ滑らかに混ぜる
    softPathSoil: true,
    seed: 1585, time: 'day', muddy: 0, fogFar: 380, battleViewDistance: 110,   // 門前の坊舎・山門・大塔を霧に沈めない（11/2）
    paths: [SANDO],
    height,
    moveWay: sandoWay,
    guideWay: (u, p) => (NG_RT ? sandoWay(NG_RT.army, u, p) : p),
    // 11/4 jin（AW3・BK4）：行き先の▼は段の所に固定する（道の曲がり角へ動かさない）
    guideMarkerWay: false,
    tint(x, z, h, c) {
      const L = toL(x, z);
      // 参道は踏み固めた土、堂の前の平場は白い砂
      const d = distToPolyline(L.x, L.z, SANDO_L);
      if (d < 4) { const k = 1 - d / 4; c.setRGB(c.r * (1 - k) + 0.42 * k, c.g * (1 - k) + 0.37 * k, c.b * (1 - k) + 0.29 * k); }
      if (L.z > 50 && L.z < 120 && L.x > -26 && L.x < 40) c.setRGB(c.r * 0.8 + 0.1, c.g * 0.8 + 0.09, c.b * 0.8 + 0.07);
      // 北山と前山の斜面は濃い雑木の緑
      if (Math.abs(L.x) > 70 || L.z > 136) c.setRGB(c.r * 0.82, c.g * 0.92, c.b * 0.78);
    },
    paddy(x, z) {
      // 大門の外の田（紀の川の平地の条里は南北にそろう）
      const L = toL(x, z);
      if (L.z > -118 || L.z < -240 || Math.abs(L.x) < 7 || Math.abs(L.x) > 76) return 0;
      const ex = Math.min(((x % 14) + 14) % 14, 14 - ((x % 14) + 14) % 14), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.7;
    },
    clear: (x, z) => { const L = toL(x, z); return distToPolyline(L.x, L.z, SANDO_L) < 12 || (L.z > -112 && L.z < 124 && Math.abs(L.x) < 66) || Math.hypot(x - START.x, z - START.z) < 20; },
    trees: 520, tufts: 2600,
    treeDensity: (x, z) => { const L = toL(x, z); return Math.abs(L.x) > 70 || L.z > 132 ? 1.4 : L.z < -118 ? 0.05 : 0.25; },
    groves: [[-60, 128], [58, 126], [-82, -20], [84, 30]].map(([x, z], i) => ({ ...P(x, z), r: i < 2 ? 14 : 12, n: i < 2 ? 18 : 14 })),
    fleeOut: (x, z, team) => { const L = toL(x, z); return team === 1 && (L.z > 150 || Math.abs(L.x) > 104); },
  },
  sides: { a: { name: '羽柴勢', mon: 'toyotomi' }, b: { name: '根来衆', mon: 'maru' } },
  date: () => '天正十三年三月二十三日　春・晴',

  setup(rt) {
    const W = rt.world, F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.towerHp = 100; F.ending = false;
    // 行き先の共通の非表示指定が、人数の棒と将の名まで隠していた。この戦の表示判定を生かす。
    if (typeof document !== 'undefined' && !document.getElementById('negoro-field-signs')) {
      const st = document.createElement('style'); st.id = 'negoro-field-signs';
      const scope = 'html body:not(:has(#pause:not([hidden]))) #hud:not(.photo):not(.ending):has(#h-prog[data-battle="t04_negoro"])';
      st.textContent = scope + ' .field-names:not([hidden]){display:block!important}' +
        scope + ':not(:has(#bigmap:not([hidden]))) #tugbar:not([hidden]){display:flex!important}' +
        // 下知は既存の五件の目標で伝え、中央の同じ下知を重ねない。
        scope + ' #center-call .cc.blue{display:none!important}';
      document.head.appendChild(st);
      rt.cleanupTasks?.add(() => st.remove());
    }
    NG_RT = rt;
    // 戦を出たら手放す（持ったままだと戦がまるごと残った。11/8 docs/crash_1108.md）
    rt.cleanupTasks?.add(() => { if (NG_RT === rt) NG_RT = null; });
    // 始まりの札の人物の説明は戦の年で書く（battle_welcome.js）。年だけだと 1585 は「天下をまとめた関白」になるが、
    //   この戦は三月で関白（七月）の前。札の説明を三月の身分（天下を争う羽柴家の大将）にする（十4）
    globalThis.__battleYear = 1584.9;
    // 共通の乱戦の補い（frontline_density）は本人の横に数人の小勢を湧かせる（AW 6）。この戦では使わない
    rt.def.frontlineDensity = false;
    patchGunCover(rt);

    // ---- 寺の形：大門・築地塀・門前の坊舎・子院の雛壇と石垣・大伝法堂・大塔・大師堂・奥の院・大門池・菩提川 ----
    const tera0 = rt.scene.children.length;
    // 大門の左右の築地塀（口を空ける）。左右の塀は谷の奥へ折れ、北山と前山の裾を登る。塀は壊れない（打つのは大門の扉だけ）
    // 11/10 重さ：塀の区画（三十）を一つずつ描かず、材質ごとの束に（壊れない塀なので見た目は同じ。描く数 495→）
    const TB = makeSimpleBatch();
    const WL = (pts) => wallLine(rt, pts.map(([x, z]) => PA(x, z)), { team: 1, hp: 1e9, name: '築地塀', mesh: tsuiji, segLen: 8, h: 2.75, meshOpt: { batch: TB } });   // 当たりの高さは見た目の塀（2.6m と笠）にそろえる（共通の 3m のままだと、塀の撃ち手が全身を塀の上に出さないと撃てなかった）
    WL([[-WALL_X, 0], [-6.6, 0]]); WL([[6.6, 0], [WALL_X, 0]]);
    WL([[-WALL_X, 0], [-WALL_X, 118]]); WL([[WALL_X, 0], [WALL_X, 118]]);
    // 大門：三間一戸の二重門（今の門は 1850 年の建て直しで高さ 17m・幅 18m）。両脇の間は仁王の格子で塞ぐ
    const gy = W.heightAt(GATE.x, GATE.z);
    const daimon = romon(W, GATE.x, GATE.z, 8.4, ROT);
    daimon.scale.set(1.45, 1.6, 1.45);
    rt.scene.add(daimon);
    // 11/6 描いて遊んで：両脇の間が黒い箱で、門をくぐる時に画面の半分が黒い塊だった。柱・貫・前後の格子（連子）と奥の暗がりにする
    const bay = new THREE.Group();
    {
      const M = towerMats(), mat4 = new THREE.Matrix4();
      const inst = (geo, mat, list) => { const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach(([x, y, z], i) => im.setMatrixAt(i, mat4.makeTranslation(x, y, z))); im.castShadow = true; bay.add(im); };
      const posts = [], beams = [], bars = [], rails = [], backs = [];
      for (const sx of [-1, 1]) {
        const cx = sx * 4.95;
        for (const a of [-1, 1]) for (const b of [-1, 1]) posts.push([cx + a * 1.22, 2.8, b * 1.02]);
        for (const y of [0.18, 5.42]) beams.push([cx, y, 0]);
        for (const fz of [-1.1, 1.1]) {
          for (let k = 0; k < 9; k++) bars.push([cx - 0.96 + k * 0.24, 2.95, fz]);
          for (const y of [0.85, 2.95, 5.05]) rails.push([cx, y, fz]);
        }
        backs.push([cx, 2.9, 0]);
        solidRect(...PA(cx, 0), 3, 3, ROT);
      }
      inst(new THREE.BoxGeometry(0.36, 5.6, 0.36), M.wood, posts);
      inst(new THREE.BoxGeometry(2.8, 0.36, 2.4), M.wood, beams);
      inst(new THREE.BoxGeometry(0.08, 4.2, 0.08), M.wood, bars);
      inst(new THREE.BoxGeometry(2.1, 0.12, 0.12), M.wood, rails);
      inst(new THREE.BoxGeometry(2.1, 4.9, 1.9), M.lattice, backs);   // 格子の奥（仁王の居る暗がり）
    }
    bay.position.set(GATE.x, gy, GATE.z); bay.rotation.y = ROT; rt.scene.add(bay);
    for (const sx of [-1, 1]) wallLine(rt, [PA(sx * 3.4, 0), PA(sx * 6.6, 0)], { team: 1, hp: 1e9, name: '大門', mesh: () => new THREE.Group(), segLen: 4 });
    const gn = dirL(0, -1);
    F.gate = rt.army.addStruct({ seg: [...PA(-3.4, 0), ...PA(3.4, 0)], nx: gn.x, nz: gn.z, hp: 700, maxHp: 700, team: 1, name: '大門の門扉' });
    F.gateMesh = new THREE.Mesh(new THREE.BoxGeometry(6.8, 5.2, 0.35), towerMats().wood);
    const gp = P(0, 0.3);
    F.gateMesh.position.set(gp.x, gy + 2.6, gp.z); F.gateMesh.rotation.y = ROT;
    F.gateMesh.castShadow = true; rt.scene.add(F.gateMesh);
    // 扉の外の面：二枚の扉の合わせ目・横の貫・鉄の乳金物（鋲）の列（黒い一枚板に見えた）
    {
      const iron = new THREE.MeshStandardMaterial({ color: 0x2b2a28, roughness: 0.55, metalness: 0.5 }), mat4 = new THREE.Matrix4();
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.07, 5.2, 0.06), iron); seam.position.set(0, 0, -0.2); F.gateMesh.add(seam);
      const nuki = new THREE.InstancedMesh(new THREE.BoxGeometry(6.6, 0.24, 0.1), towerMats().wood, 4);
      [-1.9, -0.65, 0.65, 1.9].forEach((y, i) => nuki.setMatrixAt(i, mat4.makeTranslation(0, y, -0.22)));
      F.gateMesh.add(nuki);
      const stud = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 6, 4), iron, 48);
      let n = 0;
      for (const y of [-1.9, -0.65, 0.65, 1.9]) for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) stud.setMatrixAt(n++, mat4.makeTranslation(sx * (0.35 + k * 0.52), y, -0.29));
      F.gateMesh.add(stud);
    }
    F.gate.mesh = F.gateMesh;
    // 門前（西坂本）の坊舎：参道の左右に並ぶ。鉄砲衆が窓から撃つ
    F.monzen = [];
    for (const [x, z, r] of MONZEN_BO) {
      const q = P(x, z);
      const bo = sobo(W, q.x, q.z, r + ROT); bo.scale.setScalar(1.9); rt.scene.add(bo); F.monzen.push(q);   // 門前の坊舎は大きく（遠くからも寺と分かる。11/2）
      // 11/6 描いて遊んで：参道に向く表の戸口と格子から、中のがらんとした白い壁と床が見え、切って見せた人形の家のようだった。
      //   表の内側に暗い板戸（閉てた舞良戸）を一面に立て、格子の奥を暗がりにする
      { const m = new THREE.Mesh(BOARD_GEO(), towerMats().lattice); m.position.set(0, 1.38, 2.5 / 2 + 1.0); bo.add(m); }
      // 当たりも見た目の大きさにそろえる（元の大きさのままだと、兵が大きな屋根の下へ入り込み、壁の中に隠れて見えた。AJ）
      solidRect(q.x, q.z, 6.5 * 1.9, 5 * 1.9, r + ROT);
    }
    // 門前の坊舎の構え：坊舎の間と裏を築地塀で囲む（子院は塀で囲った一区画。AJ：坊舎の裏へ回り込んで、参道へ戻る道が分からなくなった）。
    //   参道に向く側は坊舎の戸口と縁だけ。兵も自分も裏へは入らない（塀は誰にも抜けない当たりも持つ）
    for (const s of [-1, 1]) {
      const B = (pts) => { const q = pts.map(([x, z]) => PA(s * x, z)); WL(pts.map(([x, z]) => [s * x, z])); for (let i = 0; i < q.length - 1; i++) solidSeg(q[i][0], q[i][1], q[i + 1][0], q[i + 1][1], 0.6); };
      B([[13.3, -90.2], [13.3, -96], [42, -96], [42, -28], [15.3, -28], [15.3, -33.8]]);
      B([[13.3, -77.8], [13.3, -72.2]]);
      B([[15.3, -59.8], [15.3, -46.2]]);
    }
    finalizeSimpleBatch(rt, TB);
    { const q = P(-34, -56); rt.scene.add(kura(W, q.x, q.z, Math.PI / 2 + ROT)); }
    { const q = P(36, -58); rt.scene.add(kura(W, q.x, q.z, -Math.PI / 2 + ROT)); }
    // 堂：大伝法堂（本堂）・大塔・大師堂は南を向く。焼け残った三つ
    rt.scene.add(hondo(W, DENPO.x, DENPO.z, 0));
    const daito = daitoModel(W, DAITO.x, DAITO.z); daito.scale.setScalar(1.15); rt.scene.add(daito);
    rt.scene.add(doja(W, DAISHI.x, DAISHI.z, 0));
    { const q = P(-12, 52); rt.scene.add(shoro(W, q.x, q.z, 0)); }
    // 子院：斜面を削った平場に建ち、低い側を石垣で留める（発掘の子院の作り）。坊舎は南を向く。最後の一つは奥の院
    F.keidai = [];
    const kei0 = rt.scene.children.length;
    for (let i = 0; i < SITES.length; i++) {
      const s = SITES[i];
      rt.scene.add(i === SITES.length - 1 ? doja(W, s.x, s.z, 0) : sobo(W, s.x, s.z, 0));
      if (i < 8) F.keidai.push({ x: s.x, z: s.z });
    }
    const walls = [];
    for (let i = 0; i < SITES.length; i++) {
      const s = SITES[i], y = siteY(i), x0 = s.x - s.hw, x1 = s.x + s.hw, z0 = s.z - s.hd, z1 = s.z + s.hd;
      // 辺は南・東・北・西の順（外へ向く側が右）
      for (const [ax, az, bx, bz, ox, oz] of [[x0, z1, x1, z1, 0, 1], [x1, z1, x1, z0, 1, 0], [x1, z0, x0, z0, 0, -1], [x0, z0, x0, z1, -1, 0]]) {
        const mx = (ax + bx) / 2 + ox * 3, mz = (az + bz) / 2 + oz * 3, drop = y - W.heightAt(mx, mz);
        // 石垣の根は、辺の下の一番低い地面まで届かせる（11/6 描いて遊んで：急な斜面の子院で、根が 8m で切れて石垣が宙に浮いた）
        let low = Infinity;
        for (let t = 0; t <= 1.001; t += 0.125) for (const o of [1, 2.5, 5]) low = Math.min(low, W.heightAt(ax + (bx - ax) * t + ox * o, az + (bz - az) * t + oz * o));
        // 地面の網目（2.5m）で縁がなだらかに見えるので、石垣は縁から 1m 外に、天端の高さを決めて積む
        if (drop > 0.35) walls.push({ drop, y, maxH: Math.max(2, y - low + 1.2), pts: [[ax + ox, az + oz], [bx + ox, bz + oz]] });
      }
    }
    walls.sort((p, q) => q.drop - p.drop);
    for (const w of walls.slice(0, MEM_TIGHT ? 8 : 28)) rt.scene.add(ishigaki(W, w.pts, { topY: w.y + 0.1, big: 1.5, maxH: w.maxH, minH: 1.6 }));
    const kei1 = rt.scene.children.length;
    for (const [x, z] of [[-8, -6], [8, -6], [-10, 64], [10, 64]]) { const q = P(x, z); rt.scene.add(nobori(W, q.x, q.z, NEGORO.flag, 5)); }
    // 大門池（大門の外の溜池）
    {
      const g = new THREE.CircleGeometry(1, 32); g.rotateX(-Math.PI / 2); g.scale(POND_L.rx * 0.92, 1, POND_L.rz * 0.92);
      const m = new THREE.Mesh(g, towerMats().water), q = P(POND_L.x, POND_L.z);
      m.position.set(q.x, rawL(POND_L.x, POND_L.z) - 0.75, q.z); m.rotation.y = ROT; m.receiveShadow = true; rt.scene.add(m);
      for (const k of [-0.55, 0, 0.55]) { const c = P(POND_L.x, POND_L.z + k * POND_L.rx); solidCircle(c.x, c.z, POND_L.rz * 0.8); }
    }
    // 菩提川の流れと参道の板橋
    for (let i = 0; i < BODAI_L.length - 1; i++) {
      let [ax, az] = BODAI_L[i], [bx, bz] = BODAI_L[i + 1];
      if (Math.abs(bx) < 2.7) { const t = (Math.abs(ax) - 2.7) / (Math.abs(ax) - Math.abs(bx)); bx = ax + (bx - ax) * t; bz = az + (bz - az) * t; }
      if (Math.abs(ax) < 2.7) { const t = (Math.abs(bx) - 2.7) / (Math.abs(bx) - Math.abs(ax)); ax = bx + (ax - bx) * t; az = bz + (az - bz) * t; }
      // 水は流れの底の地面に沿う一枚の帯（11/6 専門の目：短い板を段々に並べると、灰色の石段が宙に浮いて見えた）。
      //   一歩半ごとに区切り、流れの向きには川底に沿って下る（坂でも段にならない）
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 1.5)), du = dirL(bx - ax, bz - az), L = Math.hypot(du.x, du.z), sx = -du.z / L, sz = du.x / L;
      const pos = [], idx = [];
      for (let k = 0; k <= n; k++) {
        const c = P(ax + (bx - ax) * k / n, az + (bz - az) * k / n);
        // 水面は川の横の向きには平ら（川底の真ん中の高さの少し上）。縁は平らな川底の端まで（その外は岸の土が水面を切る）
        const wy = W.heightAt(c.x, c.z) + 0.22;
        for (const o of [-3.1, 0, 3.1]) pos.push(c.x + sx * o, wy, c.z + sz * o);
        if (k) { const a = (k - 1) * 3; idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, towerMats().water); m.receiveShadow = true; rt.scene.add(m);
    }
    {
      const q = P(BRIDGE_L.x, BRIDGE_L.z), y = W.heightAt(q.x, q.z), br = new THREE.Group();
      // 11/6 描いて遊んで：板が地面から浮いた箱に見えた。板の上を参道の土の高さにそろえ、両端は地面へ沈め、欄干は低い角材の手摺に
      const deck = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.5, 9.5), towerMats().wood); deck.position.y = -0.17; br.add(deck);
      for (const sx of [-1, 1]) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 7.5), towerMats().wood); r.position.set(sx * 2.45, 0.72, 0); br.add(r);
        for (const k of [-3.6, -1.2, 1.2, 3.6]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.8, 0.16), towerMats().wood); p.position.set(sx * 2.45, 0.38, k); br.add(p); }
      }
      br.position.set(q.x, y, q.z); br.rotation.y = ROT; rt.scene.add(br);
    }
    // 門前の坊舎・蔵・大門は、田の寄せ口からでも霧に沈めない（根来の坊舎の屋根の並びが見える）
    //   11/6 描いて遊んで：境内の子院と石垣まで霧から外すと、霧で白く霞んだ北山・前山の斜面の前に、子院の石垣だけが黒くくっきり浮いて見えた。
    //   子院と石垣は山と同じく霧に沈める（門の外から見えるのは門前の坊舎・大門・堂）
    // 開始地点から大門までは百四十歩。既定の百五十歩では、門の手前から霧を戻して白く塗り潰してしまう。
    farSight(rt.scene.children.slice(tera0).filter((o, i) => i + tera0 < kei0 || i + tera0 >= kei1), { W, far: 220, ground: { ...P(0, -60), r: 70 } });
    // カメラの当たり（11/6 描いて遊んで：縁の撃ち手を斬る時、カメラが坊舎の中へ入り、格子と腰板で画面が塞がった。九7・十一2）
    //   門前の坊舎・蔵・大門の脇の間を箱にして、カメラは箱の手前で止める（共通の拾い直しを待たずに効く）
    const camBox = (x, z, w, d, rot, top) => ({ x, z, hw: w / 2 + 0.3, hd: d / 2 + 0.3, c: Math.cos(rot), s: Math.sin(rot), y0: W.heightAt(x, z) - 0.5, y1: W.heightAt(x, z) + top });
    const boxes = [];
    for (const [x, z, r] of MONZEN_BO) {
      const q = P(x, z); boxes.push(camBox(q.x, q.z, 6.5 * 1.9, 5 * 1.9, r + ROT, 8));
      // 軒の出（0.85m の 1.9 倍）：軒の高さより上は軒先まで箱にする（11/6：縁の撃ち手を斬る時、カメラが軒裏と屋根の中へ入り、画面の上半分が板で塞がった）
      const e = camBox(q.x, q.z, 6.5 * 1.9 + 3.6, 5 * 1.9 + 3.6, r + ROT, 9); e.y0 += 4.4; boxes.push(e);
    }
    // 境内の子院の坊舎と、門前の囲いの築地塀（塀の内へカメラが抜けて、網目で透けた壁越しに後ろを向いた）
    for (let i = 0; i < SITES.length; i++) {
      // 最後の奥の院も戦う場所。坊舎より大きい堂の軒までカメラを入れない。
      const s = SITES[i], oku = i === SITES.length - 1;
      const b = camBox(s.x, s.z, oku ? 7.5 + 4.8 : 6.5 + 1.7, oku ? 6 + 4.8 : 5 + 1.7, 0, oku ? 9.5 : 6);
      b.y0 = siteY(i) - 0.3; b.y1 = siteY(i) + (oku ? 9.5 : 6); boxes.push(b);
    }
    for (const s of [-1, 1]) for (const line of [[[13.3, -90.2], [13.3, -96], [42, -96], [42, -28], [15.3, -28], [15.3, -33.8]], [[13.3, -77.8], [13.3, -72.2]], [[15.3, -59.8], [15.3, -46.2]]]) {
      for (let i = 0; i < line.length - 1; i++) {
        const [ax, az] = line[i], [bx, bz] = line[i + 1], c = P(s * (ax + bx) / 2, (az + bz) / 2);
        const len = Math.hypot(bx - ax, bz - az), along = Math.abs(bx - ax) > Math.abs(bz - az);
        boxes.push(camBox(c.x, c.z, along ? len : 0.9, along ? 0.9 : len, ROT, 3.4));
      }
    }
    for (const [x, z, r] of [[-34, -56, Math.PI / 2], [36, -58, -Math.PI / 2]]) { const q = P(x, z); boxes.push(camBox(q.x, q.z, 5, 4, r + ROT, 5)); }
    for (const sx of [-1, 1]) { const q = P(sx * 4.95, 0); boxes.push(camBox(q.x, q.z, 2.8, 2.4, ROT, 9)); }
    F.camBoxes = boxes;
    const camBlock0 = W.cameraBlockFraction;
    W.cameraBlockFraction = (from, to) => {
      let hit = camBlock0?.call(W, from, to) ?? null;
      const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
      for (const b of boxes) {
        const fx = from.x - b.x, fz = from.z - b.z;
        let lo = 0, hi = hit ?? 1;
        for (let k = 0; k < 3 && lo <= hi; k++) {
          // 箱の向きの座標へ（props.js の solidRect と同じ向き）
          const p = k === 0 ? fx * b.c - fz * b.s : k === 1 ? fx * b.s + fz * b.c : from.y;
          const d = k === 0 ? dx * b.c - dz * b.s : k === 1 ? dx * b.s + dz * b.c : dy;
          const a = k === 0 ? -b.hw : k === 1 ? -b.hd : b.y0, e = k === 0 ? b.hw : k === 1 ? b.hd : b.y1;
          if (Math.abs(d) < 1e-6) { if (p < a || p > e) hi = -1; continue; }
          const t0 = (a - p) / d, t1 = (e - p) / d;
          lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
        }
        if (lo <= hi && lo > 1e-4 && lo < 1) hit = lo;
      }
      return hit;
    };
    // 秀吉の本陣：出だしの後ろ（田の中の寄せ口）に陣幕と幟。秀吉は幕の奥の床几に座る（AT3・AV7）
    const HJ = P(-24, -176);
    rt.scene.add(jinmaku(W, HJ.x, HJ.z, 12, 8, 4, { mon: HASHIBA.flag }));
    const SEAT = { x: HJ.x, z: HJ.z - 2 };
    rt.scene.add(shogi(W, SEAT.x, SEAT.z, 0, { gunbai: true, color: 0x5a1a14 }));
    for (const [x, z] of [[-8, -190], [8, -190], [-42, -182], [26, -170]]) { const q = P(x, z); rt.scene.add(nobori(W, q.x, q.z, HASHIBA.flag, 6)); }
    { const q = P(20, -186); rt.scene.add(tawara(W, q.x, q.z, 0.3, 4)); }

    // ---- 羽柴勢：秀次の先手（自分が率いる）と筒井定次の手。名のある将は皆馬に乗る（AY 7） ----
    const H = { faction: 'oda', armor: HASHIBA.armor };
    F.vanG = allyGroup(rt, { ...H, name: '秀次の先手', anchor: P(-4, -132), facing: ROT, width: 12, aggro: 9, noRout: true, formation: 'yari', dmgMult: 0.85 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 5 }], HASHIBA));
    F.tsutsuiG = allyGroup(rt, { ...H, name: '筒井定次の手', anchor: P(10, -136), facing: ROT, width: 12, aggro: 9, noRout: true, formation: 'yari', dmgMult: 0.85 },
      dress([{ type: 'samurai', n: 1, o: { name: '筒井定次', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x2a2a3a } }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 4 }], TSUTSUI));
    F.hidetsugu = allyGroup(rt, { ...H, name: '羽柴秀次の旗本', anchor: P(-16, -152), facing: ROT, width: 8, aggro: 4, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '羽柴秀次', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x6a4a1c } }, { type: 'samurai', n: 8 }, { type: 'ashigaru', n: 6 }], HASHIBA));
    F.hidetsuguU = F.hidetsugu.units[0];
    // 紀州攻めの大将たち（battle_events_1101：秀吉・秀長・堀秀政・仙石秀久）。総大将の秀吉は後ろの本陣の床几に座って動かない。
    //   秀長は馬上で、旗本とともに本陣の前を固める。仙石は先手の右
    F.hideyoshi = allyGroup(rt, { ...H, name: '羽柴秀吉の本陣', anchor: SEAT, facing: ROT, width: 2, aggro: 0, seekRange: 0, order: 'hold', fixed: true, noRout: true, fullStrength: true, noRetinue: true },
      dress([{ type: 'busho', n: 1, o: { name: '羽柴秀吉', invuln: true, horse: false, hat: 'kabuto_m', haori: 0x8a6a1c, keep: true } }], HASHIBA));
    F.hideyoshi.stay = true; F.hideyoshi.noAI = true;
    for (const u of F.hideyoshi.units) {
      u.invuln = true; u.noTarget = true;
      u.pos.set(SEAT.x, W.heightAt(SEAT.x, SEAT.z), SEAT.z + 0.35); u.mesh.position.copy(u.pos);
      u.jinchu = { standing: false, t: 0, soldiers: [] };   // 床几に腰を下ろしたまま（prelude の陣中の座りを使う）
    }
    { const q = P(-24, -164);
      F.hatamoto = allyGroup(rt, { ...H, name: '秀吉の旗本', anchor: q, facing: ROT, width: 12, aggro: 3, seekRange: 6, order: 'hold', fixed: true, noRout: true, fullStrength: true },
        dress([{ type: 'busho', n: 1, o: { name: '羽柴秀長', invuln: true, horse: true, hat: 'kabuto_m', keep: true } }, { type: 'samurai', n: 10, o: { keep: true } }, { type: 'ashigaru', n: 10, o: { keep: true } }], HASHIBA));
      F.hatamoto.stay = true; }
    // 堀秀政：坊舎の前へ馬を進め、根来の鉄砲に狙われる侍大将（AY 2「侍大将が鉄砲に狙われ、それを守る」）。討たれはせず、深手で退く
    F.horiG = allyGroup(rt, { ...H, name: '堀秀政の手', anchor: P(-14, -140), facing: ROT, width: 8, aggro: 9, noRout: true, dmgMult: 0.85 },
      dress([{ type: 'busho', n: 1, o: { name: '堀秀政', horse: true, hat: 'kabuto_m' } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 3 }], HORI));
    F.horiU = F.horiG.units.find((u) => u.name === '堀秀政') || F.horiG.units[0];
    // 同じ更新中の集中射撃でも、次の段の判定を待たず深手で退けるようにする。
    if (F.horiU) { F.horiU.invuln = true; F.horiU.maxHp *= 3; F.horiU.hp = F.horiU.maxHp; }
    F.sengokuG = allyGroup(rt, { ...H, name: '仙石秀久の手', anchor: P(30, -138), facing: ROT, width: 8, aggro: 9, noRout: true, dmgMult: 0.85 },
      dress([{ type: 'busho', n: 1, o: { name: '仙石秀久', invuln: true, horse: true, hat: 'kabuto_m' } }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 2 }], HASHIBA));
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad(P(4, -134), ROT, [{ kind: 'spear', n }]);
    // 手当てに退いた堀の手には、大門・境内へ進む下知を重ねない。
    F.friends = () => [F.vanG, F.tsutsuiG, F.horiHurt ? null : F.horiG].filter((g) => g && g.count);
    // 十万の羽柴勢の後ろ（軽い作り）：田の向こうに控える。寺の中の見せかけの軍勢・目の前の作り物の乱戦は置かない（AF・AP 9）
    // 豊臣の旗は敵の紋の表にもあるので、側（team）をはっきり渡す
    [[-40, -206], [40, -206], [0, -226], [-60, -150], [60, -150]].forEach(([x, z], i) => {
      const q = P(x, z);
      const A = W.addDistantArmy({ x: q.x, z: q.z, w: 30, d: 14, count: 200, facing: ROT, armor: HASHIBA.armor, flagTex: flagTexture(HASHIBA.flag), mon: HASHIBA.flag, seed: 15850 + i, team: 0 });
      if (A && A.army) { A.army.team = 0; A.army.noWake = true; }
    });

    // ---- 根来衆の鉄砲（AY 2）：坊舎の縁・物見・大門の楼・築地塀の上・子院の石垣の上から撃つ。撃つ度に白い硝煙 ----
    F.posts = {};
    const lowQ = MEM_TIGHT;
    // 坊舎の縁：参道に向く側の腰板の陰（家の中から撃つ）。行人・僧・小柄な若い行人も鉄砲を持つ
    const win = [];
    for (const s of [-1, 1]) for (const [ax, zs] of [[12.6, [-87, -84, -81]], [12.6, [-69, -66, -63]], [14.6, [-43, -40, -37]]]) {
      for (const z of zs) win.push({ x: s * ax, z, dy: 0.45, f: [-s * 0.8, -0.6] });
      // 腰板（連子の下の板）：撃ち手の腰から下を隠す
      const q = P(s * (ax - 0.7), zs[1]), b = new THREE.Mesh(KOSHI_GEO(), towerMats().wood);   // 腰板は木の色（黒い箱に見えた）
      b.position.set(q.x, W.heightAt(q.x, q.z) + 0.95, q.z); b.rotation.y = ROT; b.castShadow = true; rt.scene.add(b);
    }
    // 15分の戦（11/8）：撃ち手は携帯の軽い作りと同じ数に（十五分撃たれ続けて倒れ続けた）
    F.posts.win = gunPost(rt, '坊舎の鉄砲衆', win.filter((_, i) => i % 3 !== 1));
    // 物見：門前の囲いの奥の隅から撃ち下ろす（どこから狙われるか分からない）
    const mono = [];
    for (const s of [-1, 1]) {
      const q = P(s * 36, -90); rt.scene.add(monomidai(W, q.x, q.z, ROT));
      for (const o of [-0.5, 0.5]) mono.push({ x: s * 36 + o, z: -90.4, dy: 4.25, f: [-s * 0.5, -1] });
    }
    F.posts.mono = gunPost(rt, '物見の鉄砲', mono);
    // 大門の楼（上の縁）と、門の脇の築地塀の上（足場に立って塀越しに撃つ）
    // 11/6 描いて遊んで：六人が白い裹頭で横一列に突っ立って見えた。具足の撃ち手四人を、楼の縁の左右の端と柱の間に散らし、少し斜めに向ける
    const deck = [[-4.6, -2.7, 0.25], [-1.6, -2.3, 0.08], [1.9, -2.5, -0.1], [4.5, -2.2, -0.3]].slice(0, lowQ ? 3 : 4).map(([x, z, a]) => ({ x, z, abs: gy + 7.35, f: [a, -1] }));
    F.posts.deck = gunPost(rt, '大門の楼の鉄砲', deck, true);
    const wall = [];
    for (const s of [-1, 1]) for (const x of [10, 18, 26]) wall.push({ x: s * x, z: 1.1, dy: 1.5, f: [0, -1] });
    F.posts.wall = gunPost(rt, '築地塀の鉄砲衆', wall);
    F.posts.wall.dmgMult = 0.08;   // 15分の戦（11/8）：0.14 から   // 十二挺が撃ち下ろす（数で厚く見せ、一発は軽く。11/6：門の前で十秒ごとに討たれた）
    F.posts.deck.dmgMult = 0.1;
    // 11/6 描いて遊んで：塀の上の撃ち手は自分の塀に射線を塞がれて撃てず、足元の足場は黒い箱が並んで見えた。
    //   一人ずつ、塀の笠の上へ筒が出る高さまで足場を上げ、足場は板の踏み台（板と二本の脚）にする
    for (const u of F.posts.wall.units) {
      const fo = P(toL(u.pos.x, u.pos.z).x, -30), g0 = W.heightAt(u.pos.x, u.pos.z);
      const aim = { x: fo.x, y: W.heightAt(fo.x, fo.z), z: fo.z };
      for (let k = 0; k < 16 && rt.army.shotBlocked(u, aim); k++) u.pos.y += 0.1;
      u.perch.y = u.pos.y; u.mesh.position.y = u.pos.y;
      const top = u.pos.y, hgt = top - g0, L = toL(u.pos.x, u.pos.z);
      const plank = new THREE.Mesh(STEP_GEO(), towerMats().wood);
      plank.position.set(u.pos.x, top - 0.06, u.pos.z); plank.rotation.y = ROT; plank.castShadow = true; rt.scene.add(plank);
      for (const o of [-0.6, 0.6]) {
        const q = P(L.x + o, L.z), leg = new THREE.Mesh(LEG_GEO(), towerMats().wood);
        leg.scale.y = Math.max(0.2, hgt); leg.position.set(q.x, g0 + hgt / 2 - 0.1, q.z); rt.scene.add(leg);
      }
    }
    // 境内の子院の石垣の上：門を抜けた先の参道を左右から撃ち下ろす
    const kei = [];
    for (const i of [0, 3, 7]) { const s = SITES[i], y = siteY(i), L = toL(s.x, s.z); for (const o of [-1.2, 1.2]) kei.push({ x: L.x - Math.sign(L.x) * 4, z: L.z - 3.5 + o, abs: y + 0.05, f: [-Math.sign(L.x), -0.7] }); }
    F.posts.kei = gunPost(rt, '子院の鉄砲衆', kei);

    // ---- 竹束（AY 3）：一つの束を足軽二人が押して歩く。押す者がいなければ動かない。束は弾を止め、誰もすり抜けない ----
    F.tabaSet = [];
    for (const lx of [-8.4, -5, -1.7, 1.7, 5, 8.4]) {
      const g = allyGroup(rt, { ...H, name: '竹束の衆', anchor: P(lx, -124), facing: ROT, width: 1.6, aggro: 1, seekRange: 1, noRout: true, fixed: true, fullStrength: true },
        dress([{ type: 'ashigaru', n: 2, o: { keep: true } }], HASHIBA));
      // 共通の「味方も一緒にかかれ」（ally_charge）や大将の采配で押す役を外れない
      g.lane = lx; g.stay = true; g.noAI = true;
      const q = P(lx, -122.6);
      const tb = addTaba(rt, q.x, q.z, 0, { rot: ROT, fixed: true });
      for (const u of g.units) { u.tatake = tb.m; u.speed = 0.9; }
      F.tabaSet.push({ g, tb });
    }

    // ---- 丸太の組（AY 4）：大木を担いだ足軽が、山門の段で門扉を打ち破る。始めから担いで後ろに控える ----
    F.ramG = this.ramGroup(rt, P(-2, -146));
    F.ram = makeRam(rt, { group: F.ramG, gate: { struct: F.gate, get breached() { return !F.gate.alive; } }, kind: '丸太' });
    // ---- 戦の前の会話 ----
    rt.setPhase('brief');
    rt.obj('main', HI(rt) ? '先手を率い、大門を破って根来寺の大塔まで攻め入る' : '大門を破り、境内の奥の大塔まで攻め入る', 'main');
    rt.say('羽柴秀吉', '十万で紀州へ入った。根来と雑賀の鉄砲を、根から絶て', 4);
    rt.after(4.3, () => rt.say('羽柴秀次', '千石堀で根来の者は多く死んだ。だが、寺にはまだ鉄砲が残っておる', 4.5));
    rt.after(9.1, () => rt.say('組頭', '坊舎の縁、物見、門の楼。どこからでも撃ってきます。坊主も小僧も鉄砲を持っておりますぞ', 4.5));
    rt.after(14, () => rt.say('羽柴秀次', `${nm(rt)}、竹束の陰について寄せよ。大塔は焼くな。上様の仰せじゃ`, 4));
    rt.after(15, () => this.begin(rt));
  },

  // 丸太を担ぐ組：足軽八人。担ぎ手の半分が討たれると丸太は止まる（hajo.js）
  //   担ぎ手は陣笠と胴で弾を一つ二つは受けて歩く（門まで百歩を撃たれ通しで、着く前に皆倒れていた）
  ramGroup(rt, at) {
    const g = Object.assign(allyGroup(rt, { faction: 'oda', armor: HASHIBA.armor, name: '丸太の組', anchor: at, facing: ROT, width: 3, aggro: 1, seekRange: 1, noRout: true, fixed: true, fullStrength: true },
      dress([{ type: 'ashigaru', n: 8, o: { keep: true } }], HASHIBA)), { stay: true, noAI: true });
    // 11/6 描いて遊んで：門に着いて五秒で担ぎ手が半分倒れて丸太が止まり、次の丸太が五十歩後ろから出直して門扉が破れなかった
    for (const u of g.units) { u.maxHp *= 6; u.hp = u.maxHp; }
    return g;
  },

  begin(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    rt.setPhase('fight');
    sfx('taiko', 0.9);
    const ctx = { faction: 'saika', flag: NEGORO.flag, armor: NEGORO.armor, friends: F.friends, look: (list) => dress(list, NEGORO), dmg: 0.5, scale: 1.4, backing: false };
    depthStart(rt, ctx, [
      stepped(1, this.tabaStep()),
      stepped(2, this.horiStep()),
      stepped(3, this.gateStep()),
      stepped(4, soboStep(NG)),
      stepped(5, this.enterStep()),
      stepped(6, this.towerStep()),
      stepped(7, kyotenStep(NG)),
    ], () => this.win(rt));
    negoroIntro(rt, NG);
  },

  // 生きている竹束の、谷の道の向きの位置の平らし（押す者がいない束は数えない）
  tabaFront(F) {
    let s = 0, k = 0;
    for (const t of F.tabaSet) if (hasPushers(t)) { s += toL(t.tb.x, t.tb.z).z; k++; }
    // 押す者が全滅しても大門（零）へ案内しない。残る寄せ手との合流は門前の寄せ場で行う。
    return k ? s / k : -99;
  },

  // ① 竹束の陰について寄る：押す衆が竹束を押し、先手はその後ろを歩く。自分が動かなくても寄せは進む（AY 3・5）
  tabaStep() {
    const self = this;
    return {
      kind: 'move', max: Infinity, idleAdvance: false,
      start(rt, C) {
        const F = rt.flags;
        C.at = YOSE; C.goal = P(0, -108);
        rt.banner('竹束を前へ', '束の陰について寄せる');
        rt.obj('dp', GOALS[0], 'main');
        // 11/6 描いて遊んで：▼「竹束の陰」が竹束より二十五歩先の寄せ場（YOSE）に立ち、それを追うと馬で竹束を追い越して坊舎の縁から撃たれ通しだった。
        //   ▼は押し進む竹束の列のすぐ後ろについて動く（右上の的と同じ所）
        rt.marker('dp', () => P(0, Math.min(-99, self.tabaFront(F) - 3)), '竹束の陰', { h: 3 });
        rt.say('組頭', '竹束を前へ！　押し立てて寄せよ！　束の陰から出るな！', 3.5);
        for (const t of F.tabaSet) { t.goal = -99; t.t0 = rt.t; t.z0 = toL(t.tb.x, t.tb.z).z; }
      },
      tick(rt, C, m, ctx, el) {
        const F = rt.flags, z = self.tabaFront(F);
        // 先手・筒井・堀の手は竹束の後ろについて歩く（竹束より前へ出ない）
        const behind = [[F.vanG, -3, 5], [F.tsutsuiG, 5, 7], [F.horiG, -11, 9], [F.ramG, -1, 22]];
        for (const [g, x, b] of behind) if (g && g.count) { g.order = 'move'; g.anchor = P(x, Math.min(z, -100) - b); }
        if (F.sengokuG.count) { F.sengokuG.order = 'move'; F.sengokuG.anchor = P(28, Math.min(z, -100) - 12); }
        C.goal = P(0, z - 2.5);
        C.at = P(0, Math.min(-99, z - 3)); C.arr = false;   // 行き先も▼と同じ竹束のすぐ後ろ（寄せ場へ先回りしない）
        rt.objProgress('dp', `あと ${Math.max(0, Math.round(-100 - z))}m`);
        if (el > 8 && !C.said) { C.said = true; rt.say('足軽', '弾が竹に当たっておる！　束の陰なら抜けぬぞ', 3); }
        // 寄せ手だけで進んでも、本人が門前へ着くまでは達成にしない。
        const p = rt.player.u.pos;
        // 15分の戦（11/8）：寄せる間は使番の知らせと遠くの大軍で埋め、二分足らずで門前へ着かせない
        return fighting(rt.player.u) && !rt.retryOpen && el > 100 && (z >= -101 || !F.tabaSet.some(hasPushers)) && Math.hypot(p.x - YOSE.x, p.z - YOSE.z) < 14;
      },
      end(rt, C) {
        const F = rt.flags;
        rt.unmark('dp'); rt.objDone('dp');
        for (const t of F.tabaSet) { t.goal = null; t.g.order = 'hold'; t.g.anchor = { x: t.tb.x, z: t.tb.z }; }
        rt.award((t) => t.side.push('竹束で門前まで寄せた'), '竹束で寄せた');
      },
    };
  },

  // ② 堀秀政が坊舎の前へ馬を進める。根来の鉄砲は皆、堀を狙う。縁と物見の鉄砲衆を討って堀を守る（AY 2）
  horiStep() {
    return {
      kind: 'hori', max: Infinity, idleAdvance: false,
      start(rt, C) {
        const F = rt.flags;
        C.at = MONZEN; C.goal = MONZEN; C.groups = []; C.later = [{ t: 20 }];
        rt.banner('堀秀政が狙われておる', '坊舎の鉄砲衆を討つ');
        sfx('taiko', 0.8);
        rt.say('堀秀政', '坊主ばらの鉄砲など恐るるな！　者ども、坊舎へかかれ！', 3.5);
        rt.after(4, () => rt.say('組頭', '鉄砲が皆、堀様を狙うておる！　縁の撃ち手を斬れ！', 3.5));
        F.horiG.order = 'attack'; F.horiG.seekRange = 40; F.horiG.anchor = P(-4, -76);
        // 竹束は参道の両脇へ寄せ、真ん中を丸太の組の通り道に空ける
        for (const t of F.tabaSet) { t.wide = 2.2; t.goal = -97; t.t0 = rt.t; t.z0 = toL(t.tb.x, t.tb.z).z; }
        // 丸太の組は先手の後ろへ詰める（山門の段ですぐ門へ寄れるように）
        F.ramG.order = 'move'; F.ramG.anchor = P(-1, -94);
        for (const g of [F.vanG, F.tsutsuiG]) if (g.count) { g.order = 'attack'; g.seekRange = 45; g.anchor = MONZEN; }
        for (const k of ['win', 'mono']) if (F.posts[k] && F.horiU) F.posts[k].focus = F.horiU;
        // 坊舎の戸口から行人方が斬って出る（参道の側から。裏や蔵の間には出さない。AJ）
        for (const [x, z] of [[-10, -64], [10, -66]]) {
          C.groups.push(enemyGroup(rt, { faction: 'saika', fixed: true, name: '坊舎の行人方', anchor: P(x, z), facing: Math.PI + ROT, order: 'attack', seekRange: 50, aggro: 12, width: 6, morale: 90, fleeDir: dirL(0, 1), dmgMult: 0.35 },
            dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5 }, { type: 'ashigaru', n: 5, o: SOHEI_LK }], NEGORO)));   // 行人方は裹頭の僧兵を混ぜる（関所1）
        }
        rt.obj('dp', GOALS[1], 'main');
        rt.marker('dp', centerOf(F.posts.win), '坊舎の鉄砲衆', { red: true, group: F.posts.win });
      },
      tick(rt, C, m, ctx, el) {
        const F = rt.flags, h = F.horiU;
        if (C.later.length && el > 20) {
          C.later.length = 0;
          rt.say('足軽', '雑賀の鉄砲衆じゃ！　奥の坊舎の縁から撃ってくるぞ、伏せよ！', 3);
          C.groups.push(enemyGroup(rt, { faction: 'saika', fixed: true, name: '雑賀の鉄砲衆', anchor: SAIKA_EN, facing: Math.PI + ROT, order: 'attack', seekRange: 50, aggro: 10, width: 5, morale: 90, fleeDir: dirL(0, 1), dmgMult: 0.2 },
            dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 6, o: { sohei: 1, armor: 0x2a2622, lace: 0xcfc7b4, cloth: 0xd8d2c2, hat: 'hachimaki', flag: null } }], NEGORO)));
        }
        // 堀が深手を負えば、旗本が抱えて退く（討たれはしない。目標は鉄砲衆を討つ事なので、退いても失敗にはしない。十一1）
        if (h && !F.horiHurt && (h.woundOut || h.hp < h.maxHp * 0.3)) {
          F.horiHurt = true; h.invuln = true;
          F.horiG.order = 'move'; F.horiG.anchor = P(-14, -140);
          F.horiG.stay = true; F.horiG.seekRange = 0; F.horiG.focus = null;
          for (const u of F.horiG.units) u.target = null;
          for (const k of ['win', 'mono']) if (F.posts[k]) F.posts[k].focus = null;
          rt.say('堀秀政', '……不覚。いったん退く。あとは任せたぞ', 3.5);
        }
        const guns = heads([F.posts.win]);
        const foes = heads(C.groups);
        // 後送兵を含む隊の中心でなく、戦える相手へ案内する。守りが崩れたら達成場所へ戻す。
        let target = null;
        if (guns > 4) target = nearestFighter(F.posts.win, rt.player.u.pos);
        if (!target && foes > 4) for (const g of C.groups) {
          target = nearestFighter(g, rt.player.u.pos);
          if (target) break;
        }
        C.goal = target ? target.pos : MONZEN;
        rt.objProgress('dp', `残る鉄砲 ${guns}挺${F.horiHurt ? '・堀は退いた' : ''}`);
        // 縁の撃ち手が減るか長引けば、残る根来衆は坊舎の裏へ逃げ出す（自分が討たなくても筋は進む）
        if ((guns <= 4 || el > 95) && !C.broke) { C.broke = true; for (const g of [...C.groups, F.posts.win]) flee(g); }
        // 鉄砲衆が退いても、後方に居たままで堀の護衛を果たした事にはしない。
        const p = rt.player.u.pos;
        // 縁の撃ち手の前に長く立たせない（15分の戦でも、この段は撃ち手を討てば進む）
        return fighting(rt.player.u) && !rt.retryOpen && guns <= 4 && foes <= 4 && !C.later.length && Math.hypot(p.x - MONZEN.x, p.z - MONZEN.z) < 24;
      },
      end(rt, C) {
        const F = rt.flags;
        for (const g of [...C.groups, F.posts.win, F.posts.mono]) flee(g);
        rt.unmark('dp');
        rt.objDone('dp');
        if (!F.horiHurt) { rt.award((t) => t.side.push('堀秀政を鉄砲から守った'), '堀秀政を守った'); rt.say('堀秀政', '鉄砲が黙ったな。よう守ってくれた', 3); }
        else rt.say('組頭', '縁の鉄砲は黙りました！　堀様は後ろで手当てを', 3);
        // 撃ち手の逃げた門前の坊舎に火を掛ける（史実：坊舎の多くが焼けた。燃える所は燃やす。四6）
        const W = rt.world;
        if (W.addBlaze && !F.monzenFire) {
          F.monzenFire = [];
          MONZEN_BO.forEach(([x, z, r], i) => { if (i === 0 || i === 2 || i === 4 || i === 5) { const q = P(x, z); F.monzenFire.push(W.addBlaze(q.x, q.z, { w: 6.5 * 1.9, d: 5 * 1.9, h: 5.5, rot: r + ROT })); } });
          rt.after(3, () => rt.say('足軽', '坊舎に火が回ったぞ！　煙の陰から大門へ寄せよ！', 3));
        }
        // 丸太の組は門前の坊舎の端まで詰めておく（大門の段ですぐ担いで走れるように）
        F.ramG.order = 'move'; F.ramG.anchor = P(-1, -56);
      },
    };
  },

  // ③ 大門：丸太の組が門扉を打つ。自分が丸太のそばにいれば皆で押して早く破れる（AY 4）
  //   11/6：門の外に並んでいた根来の守り（十一3「城の外に守り手を並べない」）はやめ、守り手は大門の楼と塀の上から撃つ。
  //   門の内には守りの組を控えさせ、破れた所で斬り合いになる（④）
  gateStep() {
    const self = this;
    return {
      kind: 'gate', max: Infinity, idleAdvance: false,
      start(rt, C) {
        const F = rt.flags;
        C.at = P(0, -6); C.goal = P(0, -10); C.groups = [];
        rt.banner('大門を打ち破れ', '丸太の組と寄せる');
        sfx('taiko', 0.8);
        rt.say('組頭', '丸太を前へ！　大門の扉を打ち破れ！　担ぎ手を撃たせるな！', 3.5);
        breath(rt, 0.3);   // 15分の戦：段の替わり目に息を整える
        self.sendRam(rt);
        // 味方は参道の左右（塀の際）へ寄り、真ん中を丸太の通り道に空ける。鉄砲は楼と塀の上へ撃ち返す
        F.friends().forEach((fg, i) => { fg.order = 'move'; fg.seekRange = 8; fg.anchor = P(i % 2 ? 7 : -7, -9); });
        // 竹束は丸太の通り道の左右を門の際まで押し出し、塀と楼からの撃ち下ろしを受ける（11/6：竹束が二十歩手前で止まり、門の前の自分と担ぎ手が撃たれ通しだった）
        for (const t of F.tabaSet) { t.goal = -7; t.wide = 1.8; t.t0 = rt.t; t.z0 = toL(t.tb.x, t.tb.z).z; }
        // 門の内の守り（④で破れた門から斬り合う。11/6：門の内の際に詰めて、閉じた扉越しに丸太の脇の自分を槍で突いた。破れるまでは扉から離して待たせる）
        F.innerG = enemyGroup(rt, { faction: 'saika', fixed: true, name: '大門の内の行人方', anchor: P(0, 30), facing: Math.PI + ROT, order: 'hold', seekRange: 3, aggro: 6, width: 9, morale: 90, fleeDir: dirL(0, 1), dmgMult: 0.35 },
          dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }], NEGORO));
        // 共通の「本人へ寄せる」（ai の pacing・army_think の pull）に駆り出されて扉の際へ出ないよう、破れるまで持ち場に留める
        F.innerG.stay = true;
        rt.obj('dp', GOALS[2], 'main');
        rt.marker('dp', P(0, -3), '大門', { h: 4 });
      },
      tick(rt, C, m, ctx, el, dt) {
        const F = rt.flags, s = F.gate, pu = rt.player.u;
        if (s.alive) {
          // 生存数に残る重傷者・後送兵は担げない。一時的な転倒は交代の理由にしない。
          const carriers = F.ramG.units.reduce((n, u) => n + (remaining(u) && !u.rearWound ? 1 : 0), 0);
          if ((F.ram.stopped || !F.ramG.count || F.ramG.routed || carriers < 2) && (C.reram || 0) < 3) {
            C.reram = (C.reram || 0) + 1;
            F.ram.mesh.visible = false;
            flee(F.ramG);
            F.ramG = self.ramGroup(rt, P(0, -34)); F.ramZ = null; F.ramWait = 0;
            F.ram = makeRam(rt, { group: F.ramG, gate: { struct: s, get breached() { return !s.alive; } }, kind: '丸太' });
            self.sendRam(rt);
            rt.say('組頭', '新しい丸太を運べ！　門は目の前じゃ！', 3);
          }
          // 戦える本人が丸太のそばにいる間だけ、皆で声を合わせて押す。
          const mm = F.ram.mesh;
          const helping = mm.visible && Math.hypot(mm.position.x - pu.pos.x, mm.position.z - pu.pos.z) < 5;
          // 三組とも担げなくなっても、本人が門前で打ち続ける別の手段を残す。
          const lastPush = C.reram >= 3 && !mm.visible;
          const hittingGate = pu.atk?.target === s && !pu.atk.ranged && !pu.atk.bow || pu.swing?.target === s && !pu.swing.ranged;
          const atGate = fighting(pu) && !rt.retryOpen && Math.hypot(s.seg[0] / 2 + s.seg[2] / 2 - pu.pos.x, s.seg[1] / 2 + s.seg[3] / 2 - pu.pos.z) < (lastPush ? 5 : 8);
          if (atGate && (helping || lastPush && hittingGate)) {
            C.pushT = (C.pushT || 0) + dt;
            if (!C.pushSaid) { C.pushSaid = true; rt.say('足軽', 'お頭も手を貸してくだされ！　一、二の、三！', 3); }
            if (C.pushT > 1.1) { C.pushT = 0; rt.army.damage(s, 24, pu, { kind: 'ram' }); }
          // 短い突きの合間にも、実際に打った時間は残す。毎回消すと一・一秒に届かず救済の一打が出ない。
          // 待つだけでは増えず、門を離れる・倒れる・再開の札を開くと解除する。
          } else if (!atGate || !lastPush) C.pushT = 0;
          // 時間と接近だけでは開けない。丸太か本人の攻撃で門扉を破ってから進む。
          // 塀の上の鉄砲衆は、塀の際に寄った先手の足軽を撃ち下ろす（11/6：塀の上の十二挺が皆、丸太の脇の自分を撃ち、門の前で討たれた。
          //   担ぎ手を狙わせると丸太が三度止まって門が破れなかったので、塀の際の寄せ手を狙う）
          const wp = F.posts.wall;
          if (wp && !gateTarget(wp.focus)) {
            wp.focus = null;
            for (const g of [F.vanG, F.tsutsuiG, F.horiG]) {
              const u = g && g.count && g.units.find(gateTarget);
              if (u) { wp.focus = u; break; }
            }
            // 11/9 三巡（織田C）：塀の際の味方の足軽がいなくなると、十二挺の狙いが丸太の脇の本人へ移り、背から撃たれて四十秒で倒れた（act）。狙う寄せ手がいない間は撃ち下ろさない。
          }
          if (wp) wp.holdFire = !wp.focus;
        }
        // 上限（全戦共通の決まり10）：三分を過ぎても門扉が残る時は、本人が丸太の脇にいなくても味方が打ち続けて破る（bot が塀の外の斜面へ出て、門の段が五分止まった。関所 11/10）
        if (s.alive && el > 180) { C.autoT = (C.autoT || 0) + dt; if (C.autoT > 1.5) { C.autoT = 0; rt.army.damage(s, 24, null, { kind: 'ram' }); } }
        if (!s.alive && C.openT == null) C.openT = el;
        // 自分は丸太の脇について押す（丸太の組の真横）
        const mm = F.ram.mesh;
        C.goal = s.alive ? (mm.visible ? { x: mm.position.x + dirL(1, 0).x * 1.6, z: mm.position.z + dirL(1, 0).z * 1.6 } : P(0, C.reram >= 3 ? -3 : -9)) : P(0, 8);
        rt.objProgress('dp', s.alive ? `門扉 ${Math.round(100 * (1 - s.hp / s.maxHp))}%` : '');
        // 破れて一分たっても本人が門の前へ戻らない時も先へ（本人の位置だけで段を止めない）
        return fighting(pu) && !rt.retryOpen && C.openT != null && el - C.openT > 2 && (Math.hypot(pu.pos.x - GATE.x, pu.pos.z - GATE.z) < 14 || el - C.openT > 60);
      },
      end(rt, C) {
        for (const g of C.groups) flee(g);
        // 門を破った後は竹束を左右の持ち場に据え、押し手を前進させ続けない。
        for (const t of rt.flags.tabaSet) {
          t.goal = null; t.g.order = 'hold';
          const q = P(t.g.lane * (t.wide || 1), -9);
          t.g.anchor.x = q.x; t.g.anchor.z = q.z;
        }
        if (rt.flags.posts?.wall) rt.flags.posts.wall.holdFire = false;
        rt.unmark('dp');
        rt.objDone('dp');
        rt.award((t) => t.side.push('丸太の組と大門を破った'), '大門を破った');
      },
    };
  },

  // 丸太の組を門へ（門扉を的にして打つ）
  sendRam(rt) {
    const F = rt.flags;
    F.ramG.assault = () => F.gate.alive ? F.gate : null;
    F.ramG.assault.gateOnly = true;
    // 門の前までは歩かせる（着いたら update で門扉を的にする）
    F.ramG.order = 'move'; F.ramG.focus = null; F.ramG.anchor = P(0, -3.2); F.ramG.seekRange = 1;
  },

  // ④ 境内へ：門が破れたら、味方は門の内の行人方と斬り合い、橋を渡って大塔の前へ進む。
  //   11/6：前は五十五秒で（自分が門の外で詰まっていても）済み、大塔を一度も見ずに勝った（三2・三3）。
  //   自分が大塔の前に着いた時に済む（味方は先に着いて待つ。着くまで時を数えて飛ばさない）
  enterStep() {
    return {
      kind: 'move', max: Infinity, idleAdvance: false,
      start(rt, C) {
        const F = rt.flags;
        C.at = TOWER_FRONT; C.goal = P(0, 14); C.groups = [];
        for (const k of ['deck', 'wall']) flee(F.posts[k]);
        rt.say('堀秀政', '門が開いたぞ！　皆、境内へなだれ込め！', 3);
        if (alive(F.innerG)) { F.innerG.stay = false; F.innerG.order = 'attack'; F.innerG.seekRange = 40; C.groups.push(F.innerG); }
        // 味方は隊のまま門をくぐり、橋の手前で揃ってから大塔の前へ（ばらばらに走らせない）
        F.friends().forEach((g, i) => { g.order = 'attack'; g.seekRange = 24; g.anchor = P(i % 2 ? 6 : -6, 22); });
        for (const g of [F.ramG, F.sengokuG]) if (g && g.count) { g.order = 'attack'; g.seekRange = 24; g.anchor = P(10, 18); }
        C.groups.push(enemyGroup(rt, { faction: 'saika', fixed: true, name: '橋の行人方', anchor: P(0, 50), facing: Math.PI + ROT, order: 'attack', seekRange: 30, aggro: 12, width: 8, morale: 80, fleeDir: dirL(0, 1), dmgMult: 0.5 },
          dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5 }, { type: 'ashigaru', n: 5, o: SOHEI_LK }], NEGORO)));   // 行人方は裹頭の僧兵を混ぜる（関所1）
        rt.obj('dp', GOALS[4], 'main');
        rt.marker('dp', TOWER_FRONT, '大塔の前', { h: 4 });
        fireStart(rt, NG);
      },
      tick(rt, C, m, ctx, el, dt) {
        const F = rt.flags, pu = rt.player.u, p = toL(pu.pos.x, pu.pos.z);
        fireTick(rt, dt || 0, el, NG);
        // 火の回る橋から守り手が実際に退く時に知らせる。台詞だけ先に退却させない。
        if (!C.retreat && el >= 45) {
          C.retreat = true;
          const retreating = C.groups.some(alive);
          for (const g of C.groups) flee(g);
          if (retreating) rt.say('使番', '根来の衆、奥の谷へ退き始めました！　大塔へ火を渡させぬよう、お進みください', 4);
        }
        // 門の内の守りが崩れたら、味方は橋を渡って大塔の前へ
        if (!C.over && (!alive(F.innerG) || F.innerG.count <= 4 || el > 40)) {
          C.over = true;
          F.friends().forEach((g, i) => { g.order = 'attack'; g.seekRange = 30; g.anchor = { x: TOWER_FRONT.x + dirL(i % 2 ? 6 : -6, 0).x, z: TOWER_FRONT.z + dirL(i % 2 ? 6 : -6, 0).z }; });
          for (const g of [F.ramG, F.sengokuG]) if (g && g.count) { g.order = 'attack'; g.seekRange = 30; g.anchor = P(4, TOWER_FRONT_L - 8); }
          rt.say('羽柴秀次', '橋を渡れ！　大塔の前を押さえよ！', 3);
        }
        C.goal = p.z < 6 ? P(0, 8) : p.z < 34 ? P(0, 36) : TOWER_FRONT;
        rt.objProgress('dp', `大塔の前まで あと ${Math.max(0, Math.round(Math.hypot(pu.pos.x - TOWER_FRONT.x, pu.pos.z - TOWER_FRONT.z)))}m`);
        // 火が燃え移る間（二分半）は、橋の手前で退く根来衆を追う。それから大塔の前へ
        // 守り手の退却と本人の到着は別。門の外で待った時間を大塔への到着に替えない。
        return fighting(pu) && !rt.retryOpen && el > 150 && Math.hypot(pu.pos.x - TOWER_FRONT.x, pu.pos.z - TOWER_FRONT.z) < 14;
      },
      end(rt, C) {
        const F = rt.flags;
        for (const g of [...C.groups, F.posts.kei]) flee(g);
        rt.unmark('dp'); rt.objDone('dp');
      },
    };
  },

  // ⑤ 大塔の前：着いてから、奥の谷・北山・前山の三方から行人方が松明を持って寄せる。寄せた組を皆討つか追い払えば済む。
  //   11/6：前は時が過ぎるだけで済み、行人方と一度も当たらずに勝った（九2・三3）
  towerStep() {
    const self = this;
    const h = DP.hold({ at: TOWER_FRONT, r: 16, dur: 45, noRefill: true, label: '大塔の前', obj: GOALS[5],
      title: '大塔を焼かせるな', sub: '行人方が火をかけに来る',
      say: [['羽柴秀次', '大塔に火をかけさせるな！　あれは残せと上様の仰せじゃ', 4]],
      waves: () => [
        { t: 2, say: ['足軽', '奥の谷から行人方じゃ！　松明を持っておる！', 3], foes: () => [self.towerWave('奥の谷の行人方', P(0, 122))] },
        { t: 18, say: ['組頭', '北山の坂からも来る！　大塔の縁へ寄せるな！', 3], foes: () => [self.towerWave('北山の行人方', P(40, 116))] },
        { t: 36, say: ['足軽', '前山の側からも！　橋の方へ回らせるな！', 3], foes: () => [self.towerWave('前山の行人方', P(-40, 100))] },
      ],
      reward: '大塔を焼かせずに守った' });
    return {
      ...h, max: Infinity, idleAdvance: false,
      start(rt, C, m, ctx) {
        h.start(rt, C, m, ctx);
        // 味方の隊は大塔の前に横に並んで受ける
        rt.flags.friends().forEach((g, i) => { g.order = 'hold'; g.seekRange = 18; g.anchor = { x: TOWER_FRONT.x + dirL([-7, 7, 0][i] || 0, 4).x, z: TOWER_FRONT.z + dirL([-7, 7, 0][i] || 0, 4).z }; });
      },
      tick(rt, C, m, ctx, el, dt) {
        const held = C.inT;
        h.tick(rt, C, m, ctx, el, dt);
        // 共通の守備は範囲の外三十歩も数える。大塔では範囲内で守った時間だけ数え、離れて待って最後に戻るだけでは果たせない。
        const u = rt.player.u;
        const defending = fighting(u) && !rt.retryOpen && Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) < 16;
        C.inT = held + (defending ? dt : 0);
        if (C.inT < 45) rt.objProgress('dp', `守る あと${Math.max(0, Math.ceil(45 - C.inT))}秒`);
        // 三方の三十六人を八割以上崩して守り続けたら、長引いた残兵は退く。
        // 岩や建物の裏の最後の一人を探し続ける全滅条件にしない。
        if (!C.retreat && !C.waves.length && el >= 150 && C.inT >= 45 && defending && (heads(C.groups) <= 7 || el >= 180)) {
          C.retreat = true;
          for (const g of C.groups) flee(g);
          rt.say('組頭', '行人方が崩れた！　大塔の前から退いていくぞ！', 3);
        }
        // 深手で退く者は除くが、一時的に倒れて起き上がる敵は残兵に数える。
        return !C.waves.length && el >= 45 && C.inT >= 45 && defending
          && !C.groups.some(alive);
      },
      end(rt, C, m) { h.end(rt, C, m); },
    };
  },

  // 大塔へ寄せる行人方：大塔の前へ駆け、近くに居る間は塔が焦げる（update で数える）
  towerWave(name, from) {
    return { name, from, list: [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 2 }], dmg: 0.5, mass: 0, noRout: 20 };
  },

  openGate(rt) {
    const F = rt.flags, s = F.gate;
    // 丸太が打ち破った時（onStructDestroyed）も、ここで一度だけ知らせを出す
    if (F.gateOpened) return;
    F.gateOpened = true;
    if (s.alive) {
      s.hitFrom = P(0, -4); s.alive = false; s.hp = 0;
      rt.army.structFall(s);
    }
    sfx('taiko', 1);
    // 共通の門突破に見出しを渡す。別の札を予約すると、共通の保留分が後から出て二枚になる。
    showGateBreak(rt, '大門が破れた', '境内へ攻め入る');
    // 史実：坊舎の多くが焼けた。境内の子院にも火が回る（大塔と大師堂は残る）
    const W = rt.world;
    // 炎の描画を省く場合も、門を破った後は昼の時計を止めて夕へ移す。
    if (W.setTime) { W.dayClock = null; W.setTime('dusk'); if (W.fade) W.fade.dur = 30; }
    if (W.addBlaze && !F.blazes) {
      F.blazes = [];
      for (const q of [F.keidai[0], F.keidai[1], F.keidai[3], F.keidai[4], F.keidai[5], F.keidai[7]]) if (q) F.blazes.push(W.addBlaze(q.x, q.z, { w: 6.5, d: 5, h: 3.2 }));
      rt.after(5, () => rt.say('堀秀政', '坊舎に火が回った！　根来の寺が燃えるぞ。大塔へ火を渡すな', 3.5));
    }
  },

  onStructDestroyed(rt, s) {
    if (s === rt.flags.gate) this.openGate(rt);
  },

  // 竹束は押す二人の前について動く。押す者が皆倒れれば、その場に残る（誰もいないのに動かない）
  moveTabas(rt, dt) {
    const F = rt.flags;
    if (!F.tabaSet) return;
    const f = dirL(0, 1), k = Math.min(1, dt * 6);
    for (const t of F.tabaSet) {
      let n = 0, cx = 0, cz = 0;
      // 倒れた者や深手で後送される者は束を押せない。残った押し手だけについて動く。
      for (const u of t.g.units) if (fighting(u) && !u.woundOut && !u.rearWound) { cx += u.pos.x; cz += u.pos.z; n++; }
      if (n) {
        cx /= n; cz /= n;
        // 押す者は歩いて押す（走らない）：行き先を毎秒 1.1m ずつ先へ置く（0.85m では先手が待ちきれず、自分も味方も束を追い越した）
        if (t.goal != null) { const L = toL(cx, cz); t.g.order = 'move'; t.g.anchor = P(t.g.lane * (t.wide || 1), Math.min(t.goal, L.z + 2.6, t.z0 + 1.1 * (rt.t - t.t0))); }
        t.tb.x += (cx + f.x * 0.85 - t.tb.x) * k; t.tb.z += (cz + f.z * 0.85 - t.tb.z) * k; t.tb.rot = ROT;
        placeTaba(rt, t.tb);
      }
      // 竹束の当たり：押す者のほかは、兵も自分も束を抜けない（幅 2.1m・厚み 0.6m の板として押し返す）
      const tb = t.tb;
      rt.army.forNear(tb.x, tb.z, 2.2, (u) => {
        if (u.isStruct || !u.alive || u.group === t.g || u.perch) return;
        const dx = u.pos.x - tb.x, dz = u.pos.z - tb.z, a = dx * f.x + dz * f.z, c = dx * f.z - dz * f.x;
        const pc = 1.4 - Math.abs(c), pa = 0.65 - Math.abs(a);
        if (pc <= 0 || pa <= 0) return;
        if (pc < pa) { const s = c < 0 ? -1 : 1; u.pos.x += f.z * pc * s; u.pos.z -= f.x * pc * s; }
        else { const s = a < 0 ? -1 : 1; u.pos.x += f.x * pa * s; u.pos.z += f.z * pa * s; }
      });
    }
  },

  carryRam(rt, dt) {
    const F = rt.flags, g = F.ramG, s = F.gate, FRONT = -3.4;
    // 生存していても倒れた担ぎ手を列へ引きずらず、後送の動きも妨げない。
    const live = g._ngCarriers || (g._ngCarriers = []);
    live.length = 0;
    for (const u of g.units) if (fighting(u) && !u.woundOut && !u.rearWound) live.push(u);
    if (!live.length) return;
    if (F.ramZ == null) { let z = 0; for (const u of live) z += toL(u.pos.x, u.pos.z).z; F.ramZ = Math.min(FRONT, z / live.length); }
    let off = 0;
    live.forEach((u, i) => {
      if (u.target && !u.target.isStruct) u.target = null;
      const q = P((i % 2 ? 0.6 : -0.6), F.ramZ + 1.3 - Math.floor(i / 2) * 0.9);
      const dx = q.x - u.pos.x, dz = q.z - u.pos.z, d = Math.hypot(dx, dz);
      off += d;
      // 人混みに押されても列へ戻る（小走りの速さまで）
      if (d > 0.05) { const m = Math.min(d, 3.2 * dt) / d; u.pos.x += dx * m; u.pos.z += dz * m; }
    });
    // 皆が列に着いている間だけ前へ（一人ずつばらばらに門へ行かない）
    //   乱れている間は足をゆるめて待つ（止まり切らない。門の十二歩手前からは揃いを待たない）
    //   すぐ前に斬りかかる敵がいる間は、味方が退けるまで丸太を下げて待つ（担いだまま斬り合いへ突っ込まない）
    const ordered = off / live.length < 2 || F.ramZ > -12;
    const head = P(0, F.ramZ + 3);
    let foe = false;
    rt.army.forNear(head.x, head.z, 4, (u) => { if (!foe && u.alive && u.team === 1 && !u.isStruct && !u.perch && !u.fleeing && !u.downed && !u.dying) foe = true; });
    //   待つのは八秒まで（味方が退けきれない時も、丸太は門を目指す）
    F.ramWait = foe ? (F.ramWait || 0) + dt : Math.max(0, (F.ramWait || 0) - dt);
    //   担いで小走り（門前の坊舎の端から門まで二十秒余り。前は歩きで五十秒かかり、その間に撃ち減らされた）
    if (F.ramZ < FRONT && (!foe || F.ramWait > 8)) F.ramZ = Math.min(FRONT, F.ramZ + (ordered ? 2.4 : 1.2) * dt);
    const at = P(0, F.ramZ);
    if (F.ramZ >= FRONT - 2.5) {
      if (g.order !== 'assault') { g.order = 'assault'; g.focus = s; g.seekRange = 1; }
      g.anchor = at;
      for (const u of live) u.target = s;   // 担ぎ手は皆、門扉を打つ
    }
    else { g.order = 'move'; g.focus = null; g.anchor = at; }
  },

  update(rt, dt) {
    const F = rt.flags;
    this.moveTabas(rt, dt);
    // 丸太の組は斬り合わない：参道を門の前まで担いで歩き、着いてから門扉を打つ（途中の敵に取り付いて、門へ着かなかった）
    //   担ぎ手は二列に並んで丸太の左右につき、組の真ん中（F.ramZ）は皆が揃っている時だけ歩く速さで前へ進む
    if (F.ramG && F.step === 3 && F.gate.alive) this.carryRam(rt, dt);
    if (F.ram) F.ram.tick(dt);
    tickTabas(rt, dt);
    depthTick(rt, dt);
    // 門の外で崩れた根来衆は、閉じた大門の前に溜まらず、塀に沿って左右の山へ逃げる
    //   （11/6 描いて遊んで：境内の方へ逃げて大門と築地塀の外に並んで立ち、守り手が門の外に並んで見えた。十一3）
    F.fleeScanT = (F.fleeScanT || 0) - dt;
    if (F.fleeScanT <= 0 && F.gate && F.gate.alive) {
      F.fleeScanT = 0.5;
      for (const u of rt.army.units) {
        if (!u.alive || u.team !== 1 || !u.fleeing || u.perch) continue;
        const L = toL(u.pos.x, u.pos.z);
        if (L.z < -34 || L.z > 1 || Math.abs(L.x) > 118) continue;
        const s = Math.sign(L.x) || (u.id % 2 ? 1 : -1);
        u.moraleFleeDir = dirL(s, Math.abs(L.x) > 70 ? 0.9 : L.z < -24 ? 0.35 : 0);
      }
    }
    if (F.ending) return;
    // 大塔：近くで戦える根来衆の数だけ焦げる。倒れた者や負傷して退く者は放火できない。
    if (F.step === 6) {
      F.towerScanT = (F.towerScanT || 0) - dt;
      if (F.towerScanT <= 0) {
        F.towerScanT = 0.5;
        let k = 0;
        for (const u of rt.army.units) if (fighting(u) && u.team === 1 && !u.perch && !u.woundOut && !u.rearWound && Math.hypot(u.pos.x - DAITO.x, u.pos.z - DAITO.z) < 13) k++;
        if (k) {
          F.towerHp = Math.max(0, F.towerHp - k * 0.2);
          if (!F.towerWarn && F.towerHp < 60) { F.towerWarn = true; rt.say('羽柴秀次', '大塔の縁に火がついた！　行人方を寄せつけるな！', 3); }
          if (F.towerHp < 40 && !F.towerFire && rt.world.addFire) F.towerFire = rt.world.addFire(DAITO.x - 4, DAITO.z + 10, { size: 1.6, h: 1.2 });
        }
        rt.objProgress('main', `大塔の守り ${Math.round(F.towerHp)}／100`);
        if (F.towerHp <= 0) { this.lose(rt, '大塔が焼け落ちた'); return; }
      }
    }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; fallB(rt);
    rt.setPhase('end');
    rt.objDone('main');
    for (const g of rt.army.groups || []) if (g.team === 1 && g.count) { g.noRout = false; g.morale = 0; }
    if (F.towerFire && rt.world.removeFire) rt.world.removeFire(F.towerFire);
    sfx('horagai', 0.8);
    rt.banner('根来寺、落ちる', '大塔と大師堂は残った');
    rt.award((t) => { t.main = true; t.special = { label: F.towerHp > 80 ? '大塔に火を付けさせずに守り抜いた' : '焦げた大塔を守り抜いた', pts: 18 }; }, '大塔を守った');
    // 戦の後の会話
    rt.player.u.invuln = true;
    rt.say('羽柴秀吉', '坊主の鉄砲も、これで終いじゃ', 3.5);
    rt.after(3.8, () => rt.say(rt.G.name || '自分', '大塔だけは残りました', 3));
    rt.after(7, () => rt.say('羽柴秀次', '弾の跡は残ろうと、塔は立っておる。よう働いた', 3.5));
    // 紀州征伐の続き（史実：二十四日から紀の川を西へ。雑賀の残りは太田城に籠もり、堤を築いた水攻めで四月に開城）
    rt.after(11, () => rt.say('羽柴秀吉', '残るは雑賀の太田城じゃ。堤を築いて水で囲め', 3.5));
    // 余韻：谷の坊舎は夜まで燃え続ける（空の赤さが貝塚から見えたと伝わる）
    rt.after(15.5, () => rt.say('組頭', '坊舎の火は夜まで消えますまい。何百年の寺が、一日で', 4));
    rt.finish({}, 22);
  },

  lose(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objFail('main');
    rt.tracker.main = false;
    if (rt.world.addBlaze) rt.world.addBlaze(DAITO.x, DAITO.z, { w: 14, d: 14, h: 12, n: 3 });
    rt.banner(why, '大塔の炎が谷を照らす');
    rt.say('羽柴秀次', '大塔が……！　上様に何と申し上げればよい', 3.5);
    rt.finish({ failureReason: why }, 8);
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1) return;
    rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },
};

// 両軍の総勢（羽柴勢はおよそ十万。根来寺に残った衆は数千の目安）
t04_negoro.force = (rt) => {
  const F = rt.flags;
  // 討死の記録は一人ずつ。四十倍すると七十五人の討死で三千人全員が消え、残る敵や退却の知らせと食い違う。
  return { a: Math.max(0, 100000 - (F.ak || 0)), a0: 100000, b: Math.max(0, 3000 - (F.ek || 0)), b0: 3000, casualtiesCounted: true };
};
t04_negoro.history = '天正十三年（1585）三月、小牧・長久手の和睦を終えた羽柴秀吉は、およそ十万の兵で紀州へ向かった。鉄砲で名高い根来衆・雑賀衆を攻めるためである。三月二十一日、和泉の千石堀城では根来衆の主力が激しく戦ったが、火が煙硝蔵に入って城は落ちた。二十三日、秀吉勢は根来寺へ入り、坊舎の多くが焼けた。大塔と大師堂は焼け残り、大塔には今も弾の跡が残ると伝わる。史実では根来寺そのものでの抵抗は少なかった。遊びでは寺に残った鉄砲衆の抵抗を厚くし（坊舎の縁・物見・大門の楼・塀の上から撃つ）、竹束での寄せ・堀秀政を狙う鉄砲衆の討ち取り・丸太での大門破り・境内への突入・大塔の守りを一続きの段にまとめた。地形は国土地理院の実測（北山・前山・大門の口）を縮めて写し、堂の並びは今の大門・大伝法堂・大塔・大師堂の位置に合わせた。子院は斜面を削って石垣で平場を作る（発掘による）。寸法と子院の数、秀次・筒井定次の持ち場は推定。';

// bot：段の的へ進み、目の前の敵を突く（b_depth の頭）
t04_negoro.botBrain = (b, inp, { goTo }) => {
  inp.quickCmd = null;
  if (b.flags.ending) { inp.k.delete('KeyW'); return; }
  if (!b.flags.dp || !b.flags.dp.on) {
    // 段の始まる前は先手のそばで待つ
    const u = b.player.u;
    inp.k.delete('KeyW');
    const S8 = P(0, -132);
    if (Math.hypot(u.pos.x - S8.x, u.pos.z - S8.z) > 4) goTo(b.player, inp, S8.x, S8.z, 2);
    return;
  }
  depthBot(b, inp, goTo);
};

// 足した段（src/t04_negoro/）へ渡す道具
Object.assign(NG, { P, dirL, ROT, NEGORO, SOHEI: SOHEI_LK, dress, flee, alive, heads, nearestFighter, OKU: P(48, 98),
  chain: [SITES[2], P(-18, -66), SITES[6], P(18, -84), P(-20, -40), P(20, -40)] });

// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
withGuard(t04_negoro);

export { t04_negoro };
export default t04_negoro;
