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
import { RANKS, ladderStep } from './state.js';
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
import { depthStart, depthTick, depthBot, depthCheckpointStep, depthResumeSteps } from './b_depth.js';
import { makeRam } from './hajo.js';
import { addTaba, placeTaba, tickTabas, patchGunCover } from './taketaba.js';
import { STAGES } from './stages.js';
import { withGuard } from './toyo_bot.js';
import { blockLook } from './fujin_place.js';
import { farSight } from './far_sight.js';
// 約15分の段（docs/toyo15_plan_1108.md の 6）：足した段の中身は src/t04_negoro/ の各ファイル
import { install as negoroIntro } from './t04_negoro/intro.js';
import { soboStep } from './t04_negoro/sobo.js';
import { fireStart, fireTick } from './t04_negoro/fire.js';
import { kyotenStep } from './t04_negoro/kyoten.js';
import { breath, fallB } from './toyo15/kit.js';
import { negoroDepth } from './t04_negoro/depth.js';
import { hiddenGuns } from './t04_negoro/hidden_guns.js';
import { MEM_TIGHT } from './settings.js';
import { routeTools } from './b_k_route.js';
import { FUJIN_TABLE } from './fujin_table.js';

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
// 11/18 クラウド（根来の持ち主・act bot 376秒「隊が一点に重なって動かない」）：布陣の表（docs/fujin/t04_negoro.md）の根来衆の行は置き場を
//   「P(x, z)」で書いてあるが、広い戦場（wide_field.js）は xz の無い行を本人と敵の重心から並べ直すため、「奥の院の行人方」が境内の左の外れ
//   （ゲームの (57,55)）に立ち、崩れた残り七人が一点に固まっていた。表の P を本当の座標にして xz に入れ、布陣図どおり寺の奥へ立てる
for (const S of FUJIN_TABLE.t04_negoro?.sides || []) for (const r of S.rows || []) {
  const m = !r.xz && /P\(\s*([−-]?\d+)\s*,\s*([−-]?\d+)\s*\)/.exec(r.note || '');
  if (m) { const p = P(+m[1].replace('−', '-'), +m[2].replace('−', '-')); r.xz = [Math.round(p.x), Math.round(p.z)]; }
}

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
const TW_C = { x: 0, y: 0, z: 0 };   // 大塔の寄せの組の真ん中（毎コマ new しない）
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
// 11/19 クラウド k365-cloud-42（K366）：千石堀で大名に上がった者を、手の者が「お頭」と呼ばない。大名は「殿」
const KASHIRA = (rt) => (ladderStep(rt.G) >= 5 ? '殿' : 'お頭');

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
  // 奥の院は参道の続きの平場へ。旧位置は山腹で、目的地も堂の軒際の急斜面になっていた。
  // 堂の深い軒（幅12.3m・奥行10.8m）の外まで切土し、屋根へ斜面が食い込まない広さを取る。
  [36, 56, 12, 10], [12, 118, 14.3, 12.8],
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
  // 士気だけでは、組頭が生きた隊は崩れず残敵にも数え続けられる。
  // 下知で退く隊は明示的に崩し、共通の退走処理で得物を捨てて逃がす。
  g.noRout = false; g.noRally = true; g.routed = true;
  g.morale = 0; g.focus = null; g.order = 'flee';
  if (!g.fleeSet) { g.fleeDir = dirL(0, g.team === 0 ? -1 : 1); g.fleeSet = true; }
  g.stay = false; g.dest = null; g.onArrive = null;
  for (const u of g.units) {
    u.perch = null; u.target = null; u.atk = null; u.swing = null; u.bind = null; u.charging = false;
    // 共通の退走処理を次の更新で必ず通す。生存・負傷・転倒の状態は変えない。
    if (u.alive && !u.fleeing && !u.isPlayer) u.routIn = 0;
  }
  g._routLeft = 1;
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
  enemyTriangleSigns: true,   // 縁・楼・塀の撃ち手も、共通の赤い▼で敵と分かるようにする。
  enemyTriangleAll: true,   // 遠い密集や行き先の近くでも、敵一人ずつの所属印を間引かない。
  nameTagLimit: 12,   // 見えている将の名を一、二人だけに絞らない（重なりは共通の判定で避ける）
  noCavalryMix: true,   // 寺の境内・山城の狭い道：共通の「敵の組に騎馬を混ぜる」をしない（路地と山道で馬の突きに何度も倒された）
  nearbyAllySignLimit: 0,   // 近くの味方に意味の分からない白い丸を出さない（critic60 五2）
  // 11/18 05時 クラウド持ち主（act bot 296秒「味方の新手6人が一点に重なって止まる」(-59,-14)＝手書きの (43,-43)：門前の囲いの塀の外・大門池の際）：
  //   新手は参道の筋（門の外は左右二十八歩・境内は塀の内）と谷の内にだけ置く
  reserveBound: (p) => { const L = toL(p.x, p.z); return Math.abs(L.x) <= (L.z < -2 ? 28 : 68) && L.z > -200 && L.z < 140 ? p : null; },
  reserveDmgMult: 0.25,   // 11/14 クラウド：共通の待つ備の新手が大門の段の倒れの傷の一番（220・68）だった
  reserveNoEnemy: true,   // 0.25 でも新手は坊舎の鉄砲衆を写した鉄砲の組で、十〜二十五m から九ずつ浴びせ act を四回中四回倒した（123）。寺の内は塀・楼・坊舎の鉄砲で既に厚いので城方の待つ備は出さない
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
  // 段2 の任務の札の数は、字の相手＝坊舎の縁の鉄砲衆だけ（段の流れの寄せ手を全部数えると 16/59 と出て進まないように見えた）
  stageFoeCount(rt) {
    const F = rt.flags, w = F.posts?.win;
    if ((F.step || 0) !== 2 || !w) return undefined;
    const all = w.units.length;
    return all ? [all - heads([w]), all] : null;
  },
  goalTargetOverride(rt) {
    const F = rt.flags, s = Math.max(1, F.step || 0);
    // 開戦直後の下知を待つ十五秒も、最初の竹束の陰を示す。段の開始時刻は変えない。
    if (F.ending) return null;
    const T = F._ngTg || (F._ngTg = {});
    if (T.s !== s) {
      const at = s === 1 ? YOSE : s === 2 ? (F.posts.win ? centerOf(F.posts.win) : MONZEN) : s === 3 ? P(0, -3) : s === 4 ? P(0, 18) : s === 7 ? NG.OKU : TOWER_FRONT;
      // 持ち場に着いても守備・制圧は続く。近づいただけで行き先を消さない（関所3）。
      Object.assign(T, { s, x: at.x, z: at.z, unit: null, boss: false, hideDistance: 0,
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
      // 縁の守りを崩した後は、まだ達成数まで減っていない雑賀衆を指す。
      // 少数の縁の撃ち手を指し続けると、段の進行と案内が食い違う。
      const otherFoes = C && heads([F.posts.win]) <= 4 && heads(C.groups || []) > 4;
      let best = cleared || otherFoes ? null : nearestFighter(F.posts.win, p, T.unit);
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
  // 11/18 クラウド k365-cloud-07（司令塔：人が大門の脇の塀に張り付いた時も塀だけ写らないように）：大門の段で扉が立つ間、本人が門の脇の塀の際
  //   （門から五歩より外・塀から七歩内）にいる時は、カメラを門前の広場（P(0,-12)）の側へ回して少し引き上げたい。量と向きだけを返す。
  //   カメラの本体（player_view.js）がこれを読む口はカメラの係（cloud-36）に連絡帳で頼んだ。口が無い間は何も起きない
  cameraPull(rt) {
    const F = rt.flags, pu = rt.player && rt.player.u;
    if (!pu || !F.gate || !F.gate.alive || (F.step || 0) < 3) return null;
    const l = toL(pu.pos.x, pu.pos.z);
    const w = Math.min(1, Math.max(0, (l.z + 7) / 3)) * Math.min(1, Math.max(0, (Math.abs(l.x) - 5) / 3));
    if (w <= 0) return null;
    const t = P(Math.sign(l.x) * 2, -12);
    return { w, toward: t, back: 2.5 * w, up: 1.2 * w };
  },
  clampCamera(rt, pos) {
    const B = rt.flags.camBoxes, pu = rt.player && rt.player.u;
    if (!B || !pu) return;
    for (const b of B) {
      if (b.live && !b.live()) continue;   // 破れた後の大門の扉は通り抜ける
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
  // 11/13 クラウドす K124：iPhone 横（874×402）で所の行が右へはみ出て切れ、人物の箱で下知の文が一行目の「寺」で切れていた。所を短くし、札は下知だけにする
  introPlace: '紀伊国 根来寺（和歌山県岩出市）',
  introBriefOnly: true,
  introText: '二日前、千石堀城は煙硝蔵の火で落ちた。寺に残った根来の鉄砲衆が、坊舎と大門で待つ。大塔は焼かせるな。',
  world: {
    noFake: true,   // 11/13 K285（kaito「本物の兵しか映したらいけない」）：絵だけの兵を作らない。映る兵は全員 戦の中の本物
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

  checkpointStep: depthCheckpointStep, resumeSteps: depthResumeSteps,   // 戦の途中の保存（K363・b_depth.js）
  setup(rt) {
    const W = rt.world, F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.towerHp = 100; F.ending = false;
    // 11/18 クラウド（iMac n-allgate の検品・k340_video の頭）：大門の段（200秒で命21）と路地の段（260秒で命2）で刃に囲まれて倒れた。刃の一太刀も六割に（千石堀と同じ）
    // 11/18 クラウド act bot：僧坊の路地の段で、十八〜二十七歩先の鉄砲に背から十発ずつ撃たれ続けて倒れた（314秒）。弾は playerTaken を通らないので、十歩より遠い弾と矢だけ六割に（千石堀と同じ作り。近い弾と刃はそのまま）
    // 11/19 02時 クラウド持ち主（act bot 2戦とも受けた傷 足軽0・侍0「ちょっと簡単すぎ・もっと強い奴と」）：刃の一太刀を六割→八割に（K360⑦ 本人を軽くするのは八割まで）。数・寄せ方は変えない
    { const Pl = rt.player, td = Pl.takeDamage; Pl.takeDamage = function (a, s) { const m = this.u.hitKind === 'gun' || this.u.hitKind === 'arrow'; const far = s?.pos && Math.hypot(s.pos.x - this.u.pos.x, s.pos.z - this.u.pos.z) > 10; const d = td.call(this, a, s); if (!(d > 0) || !s || s.isStruct) return d; if (!m) return d * 0.8; if (s._ngPost && (this.u.hp < this.u.maxHp * 0.4 || s.group?.focusOnly && s.group.focus !== this.u || rt.flags.step === 3 && rt.flags.gate?.alive)) return d * 0.35; return far ? d * 0.6 : d; }; }
    // 11/18 21時 クラウド持ち主（act bot 252秒 大門の段で倒れた・誰＝築地塀の鉄砲衆65：塀の十二挺は塀の際の寄せ手だけを狙う（focusOnly）のに、
    //   寄せ手の脇に立つ本人へ逸れた弾が命九割から四割まで一発二十余りで通った）：本人を狙っていない塀の弾が本人に当たった時も三割半に。
    //   次の流しでも楼と塀の弾が命九割から一発十五〜二十二で通って239秒に倒れたので、扉が破れるまで（段3）は塀と楼の弾を三割半に（丸太を押す間は門前に立つしかない）
    // 11/18 04時 クラウド持ち主（act bot 235秒 大門の段で築地塀の鉄砲衆に81の傷で倒れた）：塀と楼の持ち場の撃ち手（_ngPost）は、本人の命が四割を切ったら弾を三割半に（数で厚い撃ち下ろしの見せ場は残し、門前で撃ち殺され続けない）
    // 行き先の共通の非表示指定が、人数の棒と将の名まで隠していた。この戦の表示判定を生かす。
    if (typeof document !== 'undefined' && !document.getElementById('negoro-field-signs')) {
      const st = document.createElement('style'); st.id = 'negoro-field-signs';
      const scope = 'html body:not(:has(#pause:not([hidden]))) #hud:not(.photo):not(.ending):has(#h-prog[data-battle="t04_negoro"])';
      st.textContent = scope + ' .field-names:not([hidden]){display:block!important}' +
        scope + ':not(:has(#bigmap:not([hidden]))) #tugbar:not([hidden]){display:flex!important}' +
        // 下知は既存の五件の目標で伝え、中央の同じ下知を重ねない。
        scope + ' #center-call .cc.blue{display:none!important}' +
        // 11/18 クラウド（根来の持ち主）：行き先の札（.gs-tag）と真ん中の声（.cc）が一瞬重なった（evidence README の残り）。声の間は札を消す（沢山・関ヶ原と同じ）
        scope + ':has(#center-call .cc:not(.blue)) #goal-sign .gs-tag{opacity:0!important}';
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
    const roofs = [];   // 隠れ鉄砲（K123）を伏せる屋根
    for (const [x, z, r] of MONZEN_BO) {
      const q = P(x, z);
      const bo = sobo(W, q.x, q.z, r + ROT); bo.scale.setScalar(1.9); rt.scene.add(bo); F.monzen.push(q); roofs.push({ o: bo, lx: x, lz: z, keidai: false });   // 門前の坊舎は大きく（遠くからも寺と分かる。11/2）
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
    { const q = P(-34, -56), o = kura(W, q.x, q.z, Math.PI / 2 + ROT); rt.scene.add(o); roofs.push({ o, lx: -34, lz: -56, keidai: false }); }
    { const q = P(36, -58), o = kura(W, q.x, q.z, -Math.PI / 2 + ROT); rt.scene.add(o); roofs.push({ o, lx: 36, lz: -58, keidai: false }); }
    // 堂：大伝法堂（本堂）・大塔・大師堂は南を向く。焼け残った三つ
    const denpo = hondo(W, DENPO.x, DENPO.z, 0);
    // 大伝法堂の側面と背面も柱と腰板で区切る。大塔から奥の院へ回っても白壁一枚の板に見せない。
    {
      const posts = [], boards = [];
      for (const sx of [-1, 1]) {
        for (let z = -5; z <= 5; z += 2.5) posts.push([sx * 7.06, 3.2, z]);
        boards.push([sx * 7.06, 1.7, 0]);
      }
      for (let x = -5.6; x <= 5.61; x += 2.8) posts.push([x, 3.2, -5.06]);
      const mat4 = new THREE.Matrix4();
      for (const [geo, points] of [[new THREE.BoxGeometry(0.24, 4.4, 0.24), posts], [new THREE.BoxGeometry(0.14, 1.3, 10), boards],
        [new THREE.BoxGeometry(14, 1.3, 0.14), [[0, 1.7, -5.06]]]]) {
        const mesh = new THREE.InstancedMesh(geo, towerMats().wood, points.length);
        points.forEach(([x, y, z], i) => mesh.setMatrixAt(i, mat4.makeTranslation(x, y, z)));
        mesh.castShadow = true; mesh.receiveShadow = true; denpo.add(mesh);
      }
    }
    rt.scene.add(denpo);
    const daito = daitoModel(W, DAITO.x, DAITO.z); daito.scale.setScalar(1.15); rt.scene.add(daito);
    // 大塔も建物の壁を抜けない。基壇の外縁までを塞ぎ、前の参道と守備地点は空ける。
    solidRect(DAITO.x, DAITO.z, 17 * 1.15, 17 * 1.15, 0);
    rt.scene.add(doja(W, DAISHI.x, DAISHI.z, 0));
    { const q = P(-12, 52); rt.scene.add(shoro(W, q.x, q.z, 0)); }
    // 子院：斜面を削った平場に建ち、低い側を石垣で留める（発掘の子院の作り）。坊舎は南を向く。最後の一つは奥の院
    F.keidai = [];
    const kei0 = rt.scene.children.length;
    for (let i = 0; i < SITES.length; i++) {
      const s = SITES[i];
      const ko = i === SITES.length - 1 ? doja(W, s.x, s.z, 0) : sobo(W, s.x, s.z, 0);
      rt.scene.add(ko);
      if (i < SITES.length - 1) roofs.push({ o: ko, keidai: true });
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
    // 11/18 クラウド k365-cloud-07（200秒の照らし）：閉じた大門の扉に馬で張り付くと、カメラが扉の板の中へ入り画面が茶一色になった。扉が立つ間だけ箱にする
    { const q = P(0, 0.3), b = camBox(q.x, q.z, 6.8, 0.6, ROT, 6); b.live = () => !!(rt.flags.gate && rt.flags.gate.alive); boxes.push(b); }
    // 大塔へ向かう道沿いの大伝法堂・大師堂も、壁と深い軒へカメラを入れない。
    // 壁の外の縁側まで一つの大きな箱にせず、軒の当たりは屋根の高さからにする。
    for (const [q, w, d, h] of [[DENPO, 14, 10, 4.4], [DAISHI, 7.5, 6, 3.2]]) {
      boxes.push(camBox(q.x, q.z, w, d, 0, h + 1.5));
      const roof = camBox(q.x, q.z, w + 4.8, d + 4.8, 0, h + 1.8 + (d / 2 + 2.4) * 0.8);
      roof.y0 = W.heightAt(q.x, q.z) + h + 1.4;
      boxes.push(roof);
    }
    // 大塔は専用の形なので、堂の共通部品からカメラの当たりを受け取らない。
    // 初重の壁と深い軒を実寸で分け、塔の前で振り向いても白い壁の内側へ入れない。
    const towerY = W.heightAt(DAITO.x, DAITO.z);
    for (const [w, d, bottom, top] of [[14, 14, 0, 7.2], [20.4, 20.4, 7.125, 9.8], [10.8, 10.8, 9.8, 16.6], [18.3, 18.3, 16.45, 22.05]]) {
      const b = camBox(DAITO.x, DAITO.z, w * 1.15, d * 1.15, 0, top * 1.15);
      b.y0 = towerY + bottom * 1.15; b.y1 = towerY + top * 1.15; boxes.push(b);
    }
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
    // 11/18 クラウド act bot：(40,-206)・(0,-226) は戦場の端（176m）の外で、近づくと立つ本物の兵が端へ飛び一点に重なった。並びはそのまま端の内へ寄せた
    [[-40, -200], [20, -170], [-15, -185], [-60, -150], [50, -140]].forEach(([x, z], i) => {
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
    F.posts.wall.dmgMult = 0.05;   // 11/14 クラウド：act bot が大門の段で三回中二回、塀と楼の鉄砲（十発ずつ・二十五秒で百二十）に倒れた。0.08→0.05・楼 0.1→0.06
    // 旧 0.08   // 15分の戦（11/8）：0.14 から   // 十二挺が撃ち下ろす（数で厚く見せ、一発は軽く。11/6：門の前で十秒ごとに討たれた）
    F.posts.deck.dmgMult = 0.06;
    // 11/18 08:20 UTC クラウド（根来の持ち主・中学生 bot 163秒）：門前の囲いの物見の鉄砲四挺に、命三割で一秒に四発（十九歩）を浴びて倒れた。物見も同じ救いに入れる
    for (const u of [...F.posts.wall.units, ...F.posts.deck.units, ...(F.posts.mono?.units || [])]) u._ngPost = true;
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
    // ---- 隠れ鉄砲（K123 kaito 11/3・11/6「鉄砲衆がとてつもなく多い・家の中・塀の陰・高い所・屋根の上・かくれんぼ」）：
    //   本物の撃ち手は増やさず（兵は二百五十まで）、屋根の棟の裏・塀の陰・山の草に軽い人影を伏せる。寄ると起きて撃ち、また伏せる（t04_negoro/hidden_guns.js）
    {
      const hs = [], box = new THREE.Box3();
      const add = (x, z, up, down, i) => hs.push({ x, z, up, down, head: i % 3 === 1 ? 1 : 0 });
      for (const r of roofs) {
        box.setFromObject(r.o); const top = box.max.y;
        if (r.keidai) {   // 子院の坊舎は南を向く（棟は東西）。棟の北の裏に一人か二人
          const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2 - 0.6;
          for (const o of lowQ ? [0] : [-1.8, 1.8]) add(cx + o, cz, top - 0.62, top - 1.75, hs.length);
          continue;
        }
        // 門前の坊舎と倉：棟は参道に沿う。参道から見て棟の向こうの斜面に伏せる
        const s = Math.sign(r.lx), big = Math.abs(r.lx) < 30 && box.max.x - box.min.x > 8;
        for (const o of big ? [-3.2, 0.4, 3.6] : [0]) { const q = P(r.lx + s * 0.7, r.lz + o); add(q.x, q.z, top - 0.62, top - 1.75, hs.length); }
      }
      // 塀の陰：門前の囲いの塀（奥の x 42・坊舎の間）と大門の左右の築地塀の内。笠（2.6m）の上へ頭と筒だけ出す
      const wallSpot = (lx, lz) => { const q = P(lx, lz), g = W.heightAt(q.x, q.z); add(q.x, q.z, g + 1.9, g + 1.0, hs.length); };
      for (const s of [-1, 1]) {
        for (const z of lowQ ? [-88, -70, -52, -36] : [-90, -80, -70, -60, -50, -40]) wallSpot(s * 43, z);
        wallSpot(s * 14.2, -75); wallSpot(s * 16.2, -53);
        for (const x of lowQ ? [36, 52, 66] : [34, 42, 50, 58, 66]) wallSpot(s * x, 1.2);
        wallSpot(s * 72.8, 10); wallSpot(s * 72.8, 24);
      }
      // 高い所・草の陰：大門の前の野と、谷の両側の斜面。伏せると草に沈む
      for (const [lx, lz] of [[-30, -112], [32, -108], [-52, -100], [54, -96], [-60, -74], [62, -70], [-58, -46], [60, -42], [-30, -14], [24, -12], [-56, -10], [64, -8]]) {
        const q = P(lx, lz), g = W.heightAt(q.x, q.z); add(q.x, q.z, g - 0.25, g - 1.45, hs.length);
      }
      F.hiddenGuns = hiddenGuns(rt, hs);
    }

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
    // 11/18 クラウド（根来の持ち主・act bot 6回中2回「突撃を出したが組の五人が皆倒れて動けない」176・297秒）：坊舎の縁と路地の鉄砲に
    //   本人の組が撃たれ通しで、段の半ばで組が空になっていた。組の兵は竹束の陰を歩く陣笠と胴で一・二発は受けられるよう、命を一・五倍に（この戦だけ）
    for (const g of rt.army.groups || []) if (g.isPlayerSquad) for (const u of g.units) if (!u._ngHp && !u.isPlayer) { u._ngHp = true; u.maxHp *= 1.5; u.hp = u.maxHp; }
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
        // 11/15 クラウドす（K123・K175）：▼「竹束の陰」に着いても何も起きず、竹束の押し方が分からなかった。
        //   着いたら押し手が声を合わせて束を一押しし、束は押し手が運び自分は陰について歩けばよいと伝える
        //   ▼は束と一緒に進むので、陰について歩く間は九秒ごとに押し手の掛け声で一押しずつ進める
        const nearP = Math.hypot(p.x - C.at.x, p.z - C.at.z) < 12, enterP = nearP && !C.wasNearP; C.wasNearP = nearP;
        // 11/18 夜50-38（act bot 26秒：印に着いて六秒何も起きない）：印の円に入った瞬間は九秒の間を待たず、三秒空いていれば一押しする
        if (nearP && rt.t - (C.pushSayT ?? -99) > (enterP ? 3 : 9)) {   // 印の十 m で着いた扱い（九 m では一押しが起きない回があった）
          const k = C.pushN = (C.pushN || 0) + 1;
          C.pushSayT = rt.t;
          if (k === 1) sfx('taiko', 0.5);
          rt.say('竹束の衆', [`${KASHIRA(rt)}が陰に入られた！　それ、一、二の、三で押せ！　${KASHIRA(rt)}は束の後ろを歩きなされ`,
            'えい、おう！　束を前へ！', '押せ、押せ！　束から頭を出すな！', 'あと一押し！　門前の坊舎は目の前じゃ！'][k === 1 ? 0 : 1 + (k - 2) % 3], 3);
          // 11/16 iMac act bot：押し手の声は戦で鳴らず、一押し（一歩半）では右上の「あと何 m」も変わらず六秒何も起きなかった（29秒）。一押しで束を三歩前へ
          for (const t of F.tabaSet) if (t.goal != null) t.t0 -= 4;   // 一押し：束が三歩ほど前へ出る
        }
        // 11/18 夜50-38（newbie bot 70秒で倒れる：竹束を追い越して大門の前まで一人で走り、塀と楼の鉄砲に撃たれ続けた）：
        //   竹束より二十歩先へ出たら、組頭が束の陰へ戻れと呼ぶ（十秒に一度まで。命が半分を切っていたら言い方を強く）
        { const lp = toL(p.x, p.z);
          if (lp.z > z + 20 && rt.player.u.alive && rt.t - (C.aheadSayT ?? -99) > 10) {
            C.aheadSayT = rt.t;
            rt.say('組頭', rt.player.u.hp < rt.player.u.maxHp * 0.5 ? `${KASHIRA(rt)}、出過ぎじゃ！　撃たれておるぞ、束の陰まで下がりなされ！` : '前へ出過ぎじゃ！　塀の鉄砲に狙われる、竹束の陰へ戻れ！', 3);
          } }
        // 11/18 22:10 クラウド持ち主（act bot 2戦とも段1 百十五秒で本人の討ち取り0・「もっと強い奴と斬り合いたい」）：
        //   竹束で寄せられる側は、押し手を斬りに坊舎から斬って出るのが常。本人が束の陰に着いてから二度（四十秒・七十五秒）、
        //   束の二十歩先の坊舎の側から行人方の五人が束を崩しに出て、束の陰の本人へ打ち掛かる。段の終わりで退く。撃ち手の数は変えない
        if (rt.player.u.alive && (C.sally || 0) < 2 && el > (C.sally ? 75 : 40) && (C.sally || Math.hypot(p.x - C.at.x, p.z - C.at.z) < 16 || el > 70)) {
          const sd = C.sally ? 1 : -1;
          // 束の正面から来ると、束を挟んで三〜五歩で睨み合うだけで刃が届かなかった（act bot の足跡）→ 束の列（左右十歩）の脇、束と同じ深さから回り込む
          // 23:00 クラウド持ち主（POSLOG：脇の十八・十三歩が坊舎の囲いの内で、組が四十六・七十歩先へ押し出され、二度目は本人へ届かず段が終わった）
          //   → 本人の脇から外へ、歩ける所を十四〜六歩の間で探す
          const L = toL(p.x, p.z);
          let q = null;
          for (const dx of [14, 11, 8, 6]) for (const dz of [1, -2, 4]) { const c = P(L.x + sd * dx, L.z + dz); if (!q && rt.world.walkable?.(c.x, c.z) !== false) q = c; }
          if (!q) q = P(L.x - sd * 8, L.z - 6);
          C.sally = (C.sally || 0) + 1;
          // 描かずの通し：着いて五秒で周りの先手に一人討たれて崩れ、本人の討ち取り0 → 段の終わりまで崩れず、本人でない者からの傷は四分の一（橋の守りと同じ）
          const g = enemyGroup(rt, { faction: 'saika', fixed: true, name: '坊舎の行人方', anchor: q, facing: Math.PI + ROT, order: 'attack', seekRange: 26, aggro: 14, width: 3, morale: 100, noRout: true, fleeDir: dirL(sd, 1), dmgMult: 0.35 },
            dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 2 }, { type: 'ashigaru', n: 2, o: SOHEI_LK }], NEGORO));
          for (const u of g.units) u.takeNonPlayer = 0.25;
          g.focus = rt.player.u;
          (C.groups || (C.groups = [])).push(g);
          rt.say('組頭', sd < 0 ? '坊舎から坊主どもが束を崩しに出たぞ！　押し手を斬らせるな！' : 'また出て来おった！　束の前で迎え討て！', 3);
        }
        // 23:00 クラウド持ち主（POSLOG：本人が行人方を命一割まで削っても、止めは周りの先手が刺し、段1の本人の討ち取り0）：
        //   斬って出た組は本人の所を追い（繋ぎを本人へ）、命が半ばを切ったら本人でない者からの傷は二十分の一（止めは本人の手で）
        for (const g of C.groups || []) {
          if (!g.count || g.order !== 'attack') continue;
          g.anchor = { x: p.x, z: p.z };
          for (const u of g.units) if (u.alive) {
            u.takeNonPlayer = u.hp < u.maxHp * 0.5 ? 0.05 : 0.25;
            // 斬り掛かる者が七歩内に来たら、その間は「着いた」とみなす（行き先へ歩き続ける間は bot も遊び手も束の陰で打ち返さず、本人の当たり0だった）
            if (!u.fleeing && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 7) C.arr = true;
          }
        }
        // 15分の戦（11/8）：寄せる間は使番の知らせと遠くの大軍で埋め、二分足らずで門前へ着かせない
        // 11/18 夜50-38（newbie bot：迷い歩きで竹束の陰から二十〜四十歩離れ、段1が661秒続いた）：竹束が門前へ着いて百秒過ぎたら、寄せ場の三十歩内で着いた事にする
        if (z >= -101 && C.tabaInT == null) C.tabaInT = el;
        const rr = C.tabaInT != null && el - C.tabaInT > 100 ? 30 : 14;
        return fighting(rt.player.u) && !rt.retryOpen && el > 100 && (z >= -101 || !F.tabaSet.some(hasPushers)) && Math.hypot(p.x - YOSE.x, p.z - YOSE.z) < rr;
      },
      end(rt, C) {
        const F = rt.flags;
        rt.unmark('dp'); rt.objDone('dp');
        for (const g of C.groups || []) { flee(g); for (const u of g.units) u.takeNonPlayer = null; }
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
        // 11/19 01時 クラウド持ち主（act・中学生 bot：段2 が二十七〜三十七秒で済み、縁の十二挺を味方の先手が先に討って本人の討ち取り1〜2）：
        //   縁の撃ち手は段の間、本人でない者からの傷を三分の一に（数と刃は変えない。段の終わりで外す）
        if (F.posts.win) for (const u of F.posts.win.units) u.takeNonPlayer = 0.33;
        // 坊舎の戸口から行人方が斬って出る（参道の側から。裏や蔵の間には出さない。AJ）
        for (const [x, z] of [[-10, -64], [10, -66]]) {
          C.groups.push(enemyGroup(rt, { faction: 'saika', fixed: true, name: '坊舎の行人方', anchor: P(x, z), facing: Math.PI + ROT, order: 'attack', seekRange: 50, aggro: 12, width: 6, morale: 90, fleeDir: dirL(0, 1), dmgMult: 0.35 },
            dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5 }, { type: 'ashigaru', n: 5, o: SOHEI_LK }], NEGORO)));   // 行人方は裹頭の僧兵を混ぜる（関所1）
        }
        rt.obj('dp', GOALS[1], 'main');
        // 撃ち手が退いた後も、本人が戻る門前まで案内を切らさない。
        rt.marker('dp', () => C.goal, '門前の坊舎', { h: 3 });
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
        // 11/18 15時 クラウド（中学生 bot：段2で本陣の脇 (13,-152) に1080秒立ち尽くす）：撃ち手が崩れて四十秒過ぎても門前へ来なければ、
        // 組頭が一度呼び、さらに三十秒で門前へ来なくても筋を大門へ進める（丸太の組が先に寄せる）
        const near = Math.hypot(p.x - MONZEN.x, p.z - MONZEN.z) < 24;
        if (C.broke && C.brokeT == null) C.brokeT = el;
        const late = C.brokeT != null ? el - C.brokeT : 0;
        if (!near && late > 40 && !C.called) { C.called = true; rt.say('組頭', '縁の鉄砲は崩れたぞ！　門前の坊舎へ寄れ、大門へかかる！', 3); }
        return fighting(rt.player.u) && !rt.retryOpen && guns <= 4 && foes <= 4 && !C.later.length && (near || late > 70);
      },
      end(rt, C) {
        const F = rt.flags;
        for (const g of [...C.groups, F.posts.win, F.posts.mono]) flee(g);
        if (F.posts.win) for (const u of F.posts.win.units) u.takeNonPlayer = null;
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
          // 11/18 K306・K355（センゴク権兵衛2巻 第8〜9話）：坊舎の中は仏と経ばかりで雑兵が戸惑う。秀吉は天下への見せしめに焼くと決めた
          rt.after(6.6, () => { if (!F.ending && rt.player.u.alive) rt.say('足軽', '坊舎の中は仏と経ばかりじゃ……これも焼くのか', 2.8); });
          rt.after(9.8, () => { if (!F.ending && rt.player.u.alive) rt.say('組頭', '殿下の御下知じゃ。根来を焼いて天下に見せよ、と', 2.8); });
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
      start(rt, C, m, ctx) {
        const F = rt.flags;
        C.at = P(0, -6); C.goal = P(0, -10); C.groups = [];
        // 11/18 クラウド k365-cloud-07（cloud-27 の照らし ✕：二百秒で bot が塀の上の鉄砲衆を追い、大門の脇の塀に張り付いて塀だけが写った）：
        //   bot は大門の段の間、門の脇の塀の際（門から五歩より外で塀から七歩内）か扉の四歩内へ寄ったら、門前の広場へ戻って大門を向く（左右の後詰と丸太が画面に入る。扉に張り付くと扉で画面が塞がった）
        // depthBot は段の ctx の botSteer を毎コマ呼ぶ（扉が破れた後は何もしない）
        if (ctx) ctx.botSteer = (b, inp) => {
          const pu = b.player && b.player.u; if (!pu || !rt.flags.gate || !rt.flags.gate.alive) return;
          const l = toL(pu.pos.x, pu.pos.z);
          if ((l.z > -7 && Math.abs(l.x) > 5) || l.z > -4) { C.steerTo = P(Math.sign(l.x || 1) * 2, -12); C.steerBack = 10; }
          if (!(C.steerBack > 0)) return;
          // 広場へ戻ったら、しばらく（十秒）そこで大門を向いて待つ（塀の撃ち手を追ってすぐ塀へ戻らない）
          C.steerBack -= 0.05;
          const t = C.steerTo, d = Math.hypot(t.x - pu.pos.x, t.z - pu.pos.z);
          if (d > 1.5) { b.player.yaw = Math.atan2(t.x - pu.pos.x, t.z - pu.pos.z); inp.k.add('KeyW'); }
          else { const g = P(0, 0); b.player.yaw = Math.atan2(g.x - pu.pos.x, g.z - pu.pos.z); inp.k.delete('KeyW'); }
        };
        rt.banner('大門を打ち破れ', '丸太の組と寄せる');
        sfx('taiko', 0.8);
        rt.say('組頭', '丸太を前へ！　大門の扉を打ち破れ！　担ぎ手を撃たせるな！', 3.5);
        breath(rt, 0.3);   // 15分の戦：段の替わり目に息を整える
        // 塀の射手は寄せ手を狙う。共通の近距離応射で丸太の脇の本人へ的を替えない。
        F.posts.wall.focusOnly = true;
        F.posts.wall.holdFire = true;
        self.sendRam(rt);
        // 11/18 クラウド k365-cloud-07（cloud-27 の照らし 200秒 ✕「壁の前に本人一人」）：先手は二百秒で十七人まで減り、大門の前の本人の回りが空いた。
        //   大門の段の始めに、門の左右の塀の前（丸太の通り道の外）へ後詰の槍組を厚い塊と幟の林で据える。持ち場で待つ（境内へは入らない）
        if (!F.gozumeG) {
          // 11/18 二度目（cloud-27 の照らし ✕「後詰が塀の向こう」）：(-11,-20)・参道の (-5,-22) は本人の後ろで画面に入らなかった（本人は門の左右の塀の前に立つ事が多い）。
          //   門の左右、塀の八歩手前に塀と平らに一組ずつ並べ、門へ向く本人にも塀へ向く本人にも横手に見えるようにする
          F.gozumeGs = [-12, 12].map((lx) => {
            const q = P(lx, -8);
            const g = allyGroup(rt, { faction: 'oda', armor: HASHIBA.armor, name: lx < 0 ? '大門の後詰' : '大門の右の後詰', anchor: q, facing: ROT, width: 9, aggro: 0, seekRange: 0, order: 'hold', fixed: true, noRout: true, formation: 'yari', dmgMult: 0.85 },
              dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16, o: { keep: true } }], HASHIBA));
            g.stay = true; g.noAI = true;
            // 斬り合いには出ない後ろの塊：門が破れた後の斬り合いで十七人とも討たれ、二百秒にはまた空いた。狙われず討たれない（秀吉の本陣と同じ）
            for (const u of g.units) { u.invuln = true; u.noTarget = true; }
            try { blockLook(rt, g, { x: q.x, z: q.z, facing: ROT, flag: HASHIBA.flag, ranks: 4, nobori: true, side: 0 }); } catch (e) { /* 幟が立てられない時は兵だけ */ }
            return g;
          });
          F.gozumeG = F.gozumeGs[0];
        }
        // 味方は参道の左右（塀の際）へ寄り、真ん中を丸太の通り道に空ける。鉄砲は楼と塀の上へ撃ち返す
        F.friends().forEach((fg, i) => { fg.order = 'move'; fg.seekRange = 8; fg.anchor = P(i % 2 ? 7 : -7, -9); });
        // 竹束は丸太の通り道の左右を門の際まで押し出し、塀と楼からの撃ち下ろしを受ける（11/6：竹束が二十歩手前で止まり、門の前の自分と担ぎ手が撃たれ通しだった）
        for (const t of F.tabaSet) { t.goal = -7; t.wide = 1.8; t.t0 = rt.t; t.z0 = toL(t.tb.x, t.tb.z).z; }
        // 門の内の守り（④で破れた門から斬り合う。11/6：門の内の際に詰めて、閉じた扉越しに丸太の脇の自分を槍で突いた。破れるまでは扉から離して待たせる）
        F.innerG = enemyGroup(rt, { faction: 'saika', fixed: true, name: '大門の内の行人方', anchor: P(0, 30), facing: Math.PI + ROT, order: 'hold', seekRange: 3, aggro: 6, width: 9, morale: 90, fleeDir: dirL(0, 1), dmgMult: 0.35 },
          dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }], NEGORO));   // 11/18 クラウド（k340_video の頭）：十二人だと破れた門の内で本人が三人に囲まれ二十秒で倒れた。九人に
        // 共通の「本人へ寄せる」（ai の pacing・army_think の pull）に駆り出されて扉の際へ出ないよう、破れるまで持ち場に留める
        F.innerG.stay = true;
        rt.obj('dp', GOALS[2], 'main');
        rt.marker('dp', P(0, -3), '大門', { h: 4 });
      },
      tick(rt, C, m, ctx, el, dt) {
        const F = rt.flags, s = F.gate, pu = rt.player.u;
        // 11/18 18時 クラウド持ち主（act bot 段3 大門の108秒で本人の討ち取り1・「もっと強い奴と斬り合いたい」・K123「自分が動かなくても物語が進む」）：
        //   門扉を打たれる守り手は、門の脇の潜り戸から斬って出て担ぎ手を払うのが常。扉が破れる前に二度（二十五秒・七十秒）、門の左右の際から
        //   行人方の六人が斬って出て、丸太の脇の本人へ打ち掛かる。破れたら退く（end の flee）。門の内の守り・塀の撃ち手の数は変えない
        // 11/18 20:25 クラウド持ち主（act bot 4戦のうち3戦で段3 大門の討ち取り0：本人は門前の坊舎で逃げる行人方を四十秒追い、
        //   その間に一の斬って出が六十歩先で空振りし、丸太が門を破った後に着いた）：
        //   本人が門の三十歩内へ来るまで、門扉は四分の一より下へ破れない（百五十秒まで）。一の斬って出は本人が門の三十歩内へ来てから（六十秒まで）
        const gateNear = Math.hypot(pu.pos.x - GATE.x, pu.pos.z - GATE.z) < 30;
        if (s.alive && !gateNear && el < 150 && s.hp < s.maxHp * 0.25) s.hp = s.maxHp * 0.25;
        if (s.alive && pu.alive && (C.sally || 0) < 2 && el > (C.sally ? 70 : 25) && (C.sally || gateNear || el > 60)) {
          const sd = C.sally ? 1 : -1;
          let q = P(sd * 8, -2);
          if (rt.world.walkable?.(q.x, q.z) === false) q = P(sd * 5, -4);
          C.sally = (C.sally || 0) + 1;
          const g = enemyGroup(rt, { faction: 'saika', fixed: true, name: '潜り戸の行人方', anchor: q, facing: Math.PI + ROT, order: 'attack', seekRange: 24, aggro: 14, width: 3, morale: 85, fleeDir: dirL(sd, 1), dmgMult: 0.35 },
            dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 2 }, { type: 'ashigaru', n: 3, o: SOHEI_LK }], NEGORO));
          g.focus = pu;
          C.groups.push(g);
          rt.say('足軽', sd < 0 ? '門の脇の潜り戸から坊主どもが斬って出たぞ！　丸太を守れ！' : 'また潜り戸から出て来おった！　担ぎ手を斬らせるな！', 3);
        }
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
            if (!C.pushSaid) { C.pushSaid = true; rt.say('足軽', `${KASHIRA(rt)}も手を貸してくだされ！　一、二の、三！`, 3); }
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
        // 長引いた時の補助も、門前で実際に丸太を担げる二人が必要。
        // 全滅・後送・遠くで止まった組の代わりに、時間だけで扉を壊さない。
        const workingRam = s.alive && el > 180 && F.ram.mesh.visible && !F.ram.stopped && !F.ramG.routed
          && F.ramG.units.reduce((n, u) => n + (fighting(u) && remaining(u) && !u.rearWound
            && Math.hypot(u.pos.x - GATE.x, u.pos.z - GATE.z) < 8 ? 1 : 0), 0) >= 2;
        if (workingRam) { C.autoT = (C.autoT || 0) + dt; if (C.autoT > 1.5) { C.autoT = 0; rt.army.damage(s, 24, null, { kind: 'ram' }); } }
        else C.autoT = 0;
        if (!s.alive && C.openT == null) C.openT = el;
        // 自分は丸太の脇について押す（丸太の組の真横）
        const mm = F.ram.mesh;
        C.goal = s.alive ? (mm.visible ? { x: mm.position.x + dirL(1, 0).x * 1.6, z: mm.position.z + dirL(1, 0).z * 1.6 } : P(0, C.reram >= 3 ? -3 : -9)) : P(0, 8);
        rt.objProgress('dp', s.alive ? `門扉 ${Math.round(100 * (1 - s.hp / s.maxHp))}%` : '');
        // 味方が門を破っても、本人が門前へ寄るまでは護衛を果たした事にしない。
        // 長く待つだけで達成せず、破れた門への案内を残す。
        return fighting(pu) && !rt.retryOpen && C.openT != null && el - C.openT > 2 && Math.hypot(pu.pos.x - GATE.x, pu.pos.z - GATE.z) < 14;
      },
      end(rt, C) {
        for (const g of C.groups) flee(g);
        // 門を破った後は竹束を左右の持ち場に据え、押し手を前進させ続けない。
        for (const t of rt.flags.tabaSet) {
          t.goal = null; t.g.order = 'hold';
          const q = P(t.g.lane * (t.wide || 1), -9);
          t.g.anchor.x = q.x; t.g.anchor.z = q.z;
        }
        if (rt.flags.posts?.wall) {
          rt.flags.posts.wall.focusOnly = false;
          rt.flags.posts.wall.holdFire = false;
        }
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
        rt.say('堀秀政', '菩提川の橋へ進め！　大塔へ火を渡すな！', 3);
        if (alive(F.innerG)) { F.innerG.stay = false; F.innerG.order = 'attack'; F.innerG.seekRange = 40; C.groups.push(F.innerG); }
        // 味方は隊のまま門をくぐり、橋の手前で揃ってから大塔の前へ（ばらばらに走らせない）
        F.friends().forEach((g, i) => { g.order = 'attack'; g.seekRange = 16; g.anchor = P(i % 2 ? 6 : -6, 20); });   // 橋（二十歩先）の守りへは届かない幅。門の内の行人方とだけ当たる
        [F.ramG, F.sengokuG].forEach((g, i) => { if (g && g.count) { g.order = 'attack'; g.seekRange = 16; g.anchor = P(i ? 16 : 6, i ? 12 : 18); } });   // 11/18 k365-cloud-45：二組が同じ一点を目指し、仙石の手が(−2,2)で重なって止まった。持ち場を分ける
        // 11/18 夜50-38（act bot 401秒「仙石秀久の手・7人が (−4,2) で一点に重なる・号令 attack」）：門の外の右手から持ち場へ真っ直ぐ向かい、門の脇の塀に当たって門口で詰まった。
        //   門の外の正面 → 門口 → 門の内の順に縦に通してから持ち場で打ち掛かる。丸太の組（門の前に居る）が先、仙石の手が後
        const c0 = { x: 0, y: 0, z: 0 };
        [F.ramG, F.sengokuG].forEach((g, i) => {
          if (!g || !g.count) return;
          g.center(c0);
          if (toL(c0.x, c0.z).z > 2) return;   // もう門の内
          const fin = P(i ? 16 : 6, i ? 12 : 18), a = P(0, -9 - i * 4), b = P(0, 2), c = P(0, 8);
          g.order = 'path'; g.path = [[a.x, a.z], [b.x, b.z], [c.x, c.z], [fin.x, fin.z]]; g.pathIdx = 0;
          g.anchor = { x: c0.x, z: c0.z }; g._ngGate = true; g._ngForm = g.formation; g._ngColW = g.colW; g.formation = 'column'; g.colW = 2;
          g.onArrive = (gg) => { gg._ngGate = false; gg.formation = gg._ngForm; gg.colW = gg._ngColW; gg.order = 'attack'; gg.seekRange = 16; };
        });
        // 大門の後詰も門をくぐり、境内の左手で厚い塊のまま待つ（門の外に残ると、境内を向く本人の前が空いた・11/18 照らし直し）
        C.groups.push(C.bridgeG = enemyGroup(rt, { faction: 'saika', fixed: true, name: '橋の行人方', anchor: P(0, 50), facing: Math.PI + ROT, order: 'hold', seekRange: 9, aggro: 12, width: 8, morale: 100, noRout: true, fleeDir: dirL(0, 1), dmgMult: 0.5 },
          dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5 }, { type: 'ashigaru', n: 5, o: SOHEI_LK }], NEGORO)));   // 行人方は裹頭の僧兵を混ぜる（関所1）
        // 11/18 20:05 クラウド持ち主（POSLOG 二回目：味方の新手二十余りが本人より先に橋へ着き、本人が着く前に 9→3。本人の討ち取り0）：
        //   橋の守りが退くまで、本人でない者からの傷は四分の一（今福の守将と同じ takeNonPlayer）。味方の数と刃は変えない
        for (const u of C.bridgeG.units) u.takeNonPlayer = 0.25;
        rt.obj('dp', GOALS[4], 'main');
        rt.marker('dp', TOWER_FRONT, '大塔の前', { h: 4 });
        fireStart(rt, NG);
      },
      tick(rt, C, m, ctx, el, dt) {
        const F = rt.flags, pu = rt.player.u, p = toL(pu.pos.x, pu.pos.z);
        // 火の回る橋から守り手が実際に退く時に知らせる。台詞だけ先に退却させない。
        // 11/18 k365-cloud-45：45秒より先に大塔の前へ着くと、退きを待って何も起きない間があった。着いたら退きを始める
        // 11/18 17時 クラウド持ち主（act bot 段⑤「橋の行人方と本人が当たらない・討ち取り0」）：本人が門口に居る間に45秒で退いていた。
        //   本人が橋の手前（門の内二十八歩）へ来るまで退かせない（来なければ百十秒で退く）
        //   さらに（17時 二回目・act bot 段⑤ 36秒で大塔へ着いて討0）：大塔へ着いた時に退かせると、橋で一度も刃を合わせずに抜けた。
        //   橋の守りが半ば討たれるか、百秒で退く。本人が橋を渡る時、橋の守りは橋の上で本人へ打ち掛かる
        const bg = C.bridgeG, bAlive = bg && !C.retreat ? bg.units.filter(remaining).length : 0;   // 崩れない守り（noRout）。退くのは半ば討たれてから
        // 11/18 19:55 クラウド持ち主（POSLOG：段⑤ 本人が門の内で鉄砲衆と当たる間に、橋の守りが seekRange 30 で橋を離れ、味方の新手へ寄って 9→3 に十三秒で討たれた）：
        //   本人が橋の手前へ来るまでは橋の上に留まる（hold・届く幅9）。来たら本人へ打ち掛かる
        if (!C.met && bAlive && p.z > 22) { C.met = true; bg.order = 'attack'; bg.anchor = P(0, 40); bg.seekRange = 34; bg.focus = pu; }
        if (C.bridgeN0 == null) C.bridgeN0 = bAlive;
        // 橋の守りが本人の二十歩内に来たら、その間は「橋で斬り合う所に着いた」扱い（素直な遊び手は目の前の敵を払ってから進む。bot も同じに）
        if (bAlive && !C.retreat) { const c = bg.center(); C.arr = Math.hypot(c.x - pu.pos.x, c.z - pu.pos.z) < 20; } else C.arr = false;
        if (!C.retreat && (bAlive <= C.bridgeN0 * 0.35 || el >= 100)) {   // 半ばでは八秒で退く回があった。三分の二を討たれるまで橋に踏み止まる
          C.retreat = true;
          if (bg) for (const u of bg.units) u.takeNonPlayer = null;
          const retreating = C.groups.some(alive);
          for (const g of C.groups) flee(g);
          if (retreating) rt.say('使番', '根来の衆、奥の谷へ退き始めました！　大塔へ火を渡させぬよう、お進みください', 4);
        }
        // 門の内の守りが崩れたら、味方は橋を渡って大塔の前へ
        //   味方が先に橋へ出て橋の守りを皆受けないよう、本人が門の内十四歩へ入るまで（または九十秒）味方は門の内に留める
        //   （17時 三回目・act bot 段⑤ 討0：本人より先に味方が橋の守りを討ち尽くした回）橋の守りが退くまで味方は橋へ出さない
        if (!C.over && (!alive(F.innerG) || F.innerG.count <= 4 || el > 40) && (C.retreat || el > 90)) {
          C.over = true;
          F.friends().forEach((g, i) => { g.order = 'attack'; g.seekRange = 30; g.anchor = { x: TOWER_FRONT.x + dirL(i % 2 ? 6 : -6, 0).x, z: TOWER_FRONT.z + dirL(i % 2 ? 6 : -6, 0).z }; });
          [F.ramG, F.sengokuG].forEach((g, i) => {
            if (!g || !g.count) return;
            const q = P(i ? 12 : 0, TOWER_FRONT_L - (i ? 12 : 8));
            // 門を縦に通っている間は道の終わりだけを大塔の前へ替える（途中で真っ直ぐ向かわせて門口で詰まらせない）
            if (g._ngGate && g.order === 'path' && g.path) { g.path[g.path.length - 1] = [q.x, q.z]; g.onArrive = (gg) => { gg._ngGate = false; gg.formation = gg._ngForm; gg.colW = gg._ngColW; gg.order = 'attack'; gg.seekRange = 30; }; return; }
            g.order = 'attack'; g.seekRange = 30; g.anchor = q;
          });
          rt.say('羽柴秀次', '橋を渡れ！　大塔の前を押さえよ！', 3);
        }
        C.goal = p.z < 6 ? P(0, 8) : p.z < 34 ? P(0, 36) : TOWER_FRONT;
        rt.objProgress('dp', `大塔の前まで あと ${Math.max(0, Math.round(Math.hypot(pu.pos.x - TOWER_FRONT.x, pu.pos.z - TOWER_FRONT.z)))}m`);
        // 橋の守りが退き、本人が大塔へ着けば次へ。到着後に二分待たせない。
        // 炎の連鎖は次の守備・奥の院でも続け、到着を時間で代用しない。
        return fighting(pu) && !rt.retryOpen && !!C.retreat && Math.hypot(pu.pos.x - TOWER_FRONT.x, pu.pos.z - TOWER_FRONT.z) < 14;
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
        // 11/18 09時 クラウド持ち主（act bot POSLOG：段6に入って三十八秒、本人の二十五歩内は逃げる者だけ・討ち取り0の回あり）：
        //   四十〜五十五歩先から歩いて来るので、着くまで「守れ」の下に何も起きなかった。寄せを早め（0・14・28秒）、松明を持って駆けて来る。
        //   最初の組は本人を狙う
        { t: 0, say: ['足軽', '奥の谷から行人方じゃ！　松明を持っておる！', 3], foes: () => [{ ...self.towerWave('奥の谷の行人方', P(0, 122)), hunt: true }] },
        // 北山の組も本人へ（奥の谷の組を討ち終えた頃に二の寄せが本人に当たる）。前山の組は左の翼の味方が受ける
        { t: 14, say: ['組頭', '北山の坂からも来る！　大塔の縁へ寄せるな！', 3], foes: () => [{ ...self.towerWave('北山の行人方', P(40, 116)), hunt: true }] },
        { t: 28, say: ['足軽', '前山の側からも！　橋の方へ回らせるな！', 3], foes: () => [self.towerWave('前山の行人方', P(-40, 100))] },
      ],
      reward: '大塔を焼かせずに守った' });
    return {
      ...h, max: Infinity, idleAdvance: false,
      start(rt, C, m, ctx) {
        h.start(rt, C, m, ctx);
        // 味方の隊は大塔の前の左右の翼に並んで受ける。
        // 11/18 夜50-38（act bot 2回とも段6の本人の討ち取り0〜1）：前は本人の四歩先に横一列で並び、三方の寄せを皆先に受け止めて、
        //   本人を狙う奥の谷の組も本人へ届かなかった。真ん中（奥の谷から大塔の前への道）を本人の持ち場に空け、味方は左右の十四歩へ
        rt.flags.friends().forEach((g, i) => { const q = dirL([-14, 14, 0][i] || 0, [1, 1, -6][i] ?? 0); g.order = 'hold'; g.seekRange = 14; g.anchor = { x: TOWER_FRONT.x + q.x, z: TOWER_FRONT.z + q.z }; });
      },
      tick(rt, C, m, ctx, el, dt) {
        const held = C.inT;
        h.tick(rt, C, m, ctx, el, dt);
        // 鉄砲の間合いで止まると、守備範囲の外から撃つだけで大塔へ寄せてこない。
        // 各組が現れて二十秒は撃ち、その後は筒を置いて刀で攻め込む。
        // 起き上がった撃ち手も拾い、退いた組や後送される者は呼び戻さない。
        for (const g of C.groups) if (alive(g)) {
          // 大塔の前の十四歩の外では駆け足（松明を持って走り込む）。着いたら共通の足に戻す
          if (!g._ngRan) {
            g.center(TW_C);
            if (Math.hypot(TW_C.x - C.at.x, TW_C.z - C.at.z) > 14) g.speed = 4.2; else { g.speed = 0; g._ngRan = true; }
          }
          if (g._ngTowerChargeAt == null) g._ngTowerChargeAt = el + 20;
          if (el < g._ngTowerChargeAt) continue;
          for (const q of g.units) if (fighting(q) && remaining(q) && q.type === 'gun' && !q.sidearm) {
            rt.army.drawSidearm(q);
            q.target = null;
          }
        }
        // 共通の守備は範囲の外三十歩も数える。大塔では範囲内で守った時間だけ数え、離れて待って最後に戻るだけでは果たせない。
        const u = rt.player.u;
        const defending = fighting(u) && !rt.retryOpen && Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) < 16;
        C.inT = held + (defending ? dt : 0);
        if (C.inT < 45) rt.objProgress('dp', `守る あと${Math.max(0, Math.ceil(45 - C.inT))}秒`);
        // 三方の三十六人を八割以上崩し、現地で四十五秒守ったら残兵は退く。
        // 守りを崩した後も百五十秒まで待たせない。長引く戦いの上限は保つ。
        if (!C.retreat && !C.waves.length && el >= 45 && C.inT >= 45 && defending && (heads(C.groups) <= 7 || el >= 180)) {
          C.retreat = true;
          const retreating = C.groups.some(alive);
          for (const g of C.groups) flee(g);
          if (retreating) rt.say('組頭', '行人方が崩れた！　大塔の前から退いていくぞ！', 3);
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
    // 三方で三十六人。共通の増員倍率を掛けると五十七人になり、守りを崩した後も残兵待ちが延びる。
    return { name, from, scale: 1, list: [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 2 }], dmg: 0.5, mass: 0, noRout: 20 };
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
        if (t.goal != null) {
          const L = toL(cx, cz);
          // 坊舎の間は参道を通り、最後の塀を抜けてから門前へ広がる。
          // 坊舎の手前で横へ開くと、外側の押し手が囲いと建物に突き当たった。
          const narrow = t.goal > -28 && L.z < -26;
          const x = t.g.lane * (narrow ? 1 : t.wide || 1);
          let z = Math.min(t.goal, L.z + 2.6, t.z0 + 1.1 * (rt.t - t.t0));
          if (narrow && Math.abs(L.x - x) > 1.4) z = Math.min(z, L.z);
          t.g.order = 'move';
          t.g.anchor.x = x * CR + z * SR; t.g.anchor.z = -x * SR + z * CR;
        }
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
    // 11/18 23:30 クラウド持ち主（act bot「簡単すぎ・もっと強い奴と」・受けた傷 侍0）：根来衆の侍・頭は本人の軽い突きでは振りを止めない
    //   （千石堀・太田城・雑賀と同じ共通の u.poiseVsP。兵の数と強さは変えない）。一秒に一度、途中で出る組にも付ける
    if (rt.t >= (F._poiseAt || 0)) {
      F._poiseAt = rt.t + 1;
      const myTeam = rt.player.u.team;
      for (const g of rt.army.groups) if (g.team !== myTeam && !g.civ) for (const u of g.units || []) if (!u.poiseVsP && (u.type === 'samurai' || u.type === 'busho')) u.poiseVsP = true;
    }
    // 11/18 05時 クラウド持ち主（中学生 bot 二回目：竹束の段で谷の外の山の向こう＝ゲームの角 (-176,-176) まで迷い出て、戦の終わりまで戻れなかった）：
    //   根来の谷（参道から左右百歩・後ろは本陣まで・奥は奥の院の先）の外へは出さない。字は出さず、谷の縁で足が止まるだけ（K341⑤）
    { const pu = rt.player?.u;
      if (pu && pu.alive) { const L = toL(pu.pos.x, pu.pos.z), x = Math.max(-100, Math.min(100, L.x)), z = Math.max(-205, Math.min(145, L.z));
        if (x !== L.x || z !== L.z) { const q = P(x, z); pu.pos.x = q.x; pu.pos.z = q.z; if (pu.vel) { pu.vel.x *= 0.3; pu.vel.z *= 0.3; } } } }
    F.hiddenGuns?.tick(dt, F.step >= 1 && !F.ending);
    // 丸太の組は斬り合わない：参道を門の前まで担いで歩き、着いてから門扉を打つ（途中の敵に取り付いて、門へ着かなかった）
    //   担ぎ手は二列に並んで丸太の左右につき、組の真ん中（F.ramZ）は皆が揃っている時だけ歩く速さで前へ進む
    if (F.ramG && F.step === 3 && F.gate.alive) this.carryRam(rt, dt);
    if (F.ram) F.ram.tick(dt);
    // 11/18 クラウド k365-cloud-07（cloud-27 の照らし ✕ 四度目：二百秒の本人の居場所は毎回違い、塀や路地の際では後詰の持ち場が画面に入らなかった）：
    //   坊舎の段から僧坊の段の間（段2〜4）、後詰の二組は本人の左右（六歩・半歩前）について歩き、どこに立っても本人の両脇に塊が写る。
    //   斬り合いには出ず狙われない（後詰の作り）。行き先が歩けない所（塀・堂の中）の時はその秒は動かさない
    // 二段目（坊舎の鉄砲衆）から出す：本人の二十五歩後ろ（画面の外）に生み、左右へ寄ってくる。幟は背の指物で（持ち場の幟の林は大門の段の塀の前に立てない）
    if (!F.gozumeGs && F.step >= 2 && F.step <= 4 && rt.player && rt.player.u && rt.player.u.alive) {
      const pu = rt.player.u, yaw = rt.player.yaw || 0, fx = Math.sin(yaw), fz = Math.cos(yaw);
      F.gozumeGs = [-1, 1].map((sd) => {
        let q = { x: pu.pos.x - fx * 25 + fz * sd * 5, z: pu.pos.z - fz * 25 - fx * sd * 5 };
        if (rt.world.walkable?.(q.x, q.z) === false) q = P(sd * 8, -40);
        const g = allyGroup(rt, { faction: 'oda', armor: HASHIBA.armor, name: sd < 0 ? '大門の後詰' : '大門の右の後詰', anchor: q, facing: yaw, width: 6, aggro: 0, seekRange: 0, order: 'move', fixed: true, noRout: true, formation: 'yari', dmgMult: 0.85 },
          dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16, o: { keep: true } }], HASHIBA));
        for (const u of g.units) { u.invuln = true; u.noTarget = true; }
        return g;
      });
      F.gozumeG = F.gozumeGs[0];
    }
    if (F.gozumeGs && (F.step >= 2 && F.step <= 4) && rt.player && rt.player.u && rt.player.u.alive) {
      F.escortT = (F.escortT || 0) - dt;
      if (F.escortT <= 0) {
        F.escortT = 1;
        const pu = rt.player.u, yaw = rt.player.yaw || 0, fx = Math.sin(yaw), fz = Math.cos(yaw);
        F.gozumeGs.forEach((g, i) => {
          if (!g.count) return;
          const sd = i ? 6 : -6, x = pu.pos.x + fz * sd + fx * 0.5, z = pu.pos.z - fx * sd + fz * 0.5;
          if (rt.world.walkable?.(x, z) === false) return;
          g.noAI = false; g.stay = false; g.order = 'move'; g.anchor = { x, z }; g.facing = yaw; g.speed = 4.5;
        });
      }
    }
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
    huntPlayer(rt, F, dt);
    idleSpread(rt, F, dt);
    gateUnstick(F, dt);
    // 11/18 クラウド持ち主（act bot 138秒 段2「突撃を出したが組の五人が皆逃げている」）：竹束の陰の寄せ（段1・2）と大門の丸太（段3）は、
    //   組が竹束と門の前で撃たれても背を向けずに付いて来る（竹束は弾を受ける楯。崩れるのは境内に入ってからの斬り合いで）。崩れ済みの組は共通の立て直しに任せる
    if ((F._sqT = (F._sqT || 0) - dt) <= 0) {
      F._sqT = 1;
      // 11/18 03時 クラウド持ち主（act bot 236秒 段4「突撃を出したが組の二人が皆逃げている」）：僧坊の路地（段4）も狭い路地で本人の後ろに付く組。崩れは大門の内の広場（段5〜）から
      const keep = F.step >= 1 && F.step <= 4;
      for (const g of rt.army.groups || []) if (g.isPlayerSquad && !g.routed) g.noRout = keep;
      // 11/18 夜50-38（act bot 295秒 段4「突撃を出したが組の四人が皆逃げている」・士気0・routed）：崩れない決まりの前に崩れた組は段1〜4の間ずっと逃げたままだった。
      //   段1〜4で崩れていたら、深手でない者を本人の後ろへ呼び戻す（一宮城の rallySquad と同じ形）
      if (keep) for (const g of rt.squadGroups || []) {
        if (!g.count || !g.routed) continue;
        g.routed = false; g.order = 'follow'; g.noRout = true;
        g.morale = Math.max(g.morale || 0, 55);
        for (const u of g.units) {
          if (!u.alive || u.gone || u.dying || u.isPlayer || !u.fleeing || u.woundOut || u.rearWound || u.downed || u.hp < u.maxHp * 0.35) continue;
          u.fleeing = false; u.moraleFleeDir = null; u.fright = 0; u.backUntil = 0; u.routIn = undefined;
          u.target = null; u.moveTo = null; u.aiT = 0;
        }
      }
    }
    if (F.fireChain) fireTick(rt, dt, rt.t - F.fireChain.startedAt, NG);
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
    F.ending = true; F.won = true; fallB(rt);
    rt.setPhase('end');
    rt.objDone('main');
    for (const g of rt.army.groups || []) if (g.team === 1 && g.count) { g.noRout = false; g.morale = 0; }
    // 11/18 クラウド持ち主（act bot 426秒 締めで「仙石秀久の手・6人が一点に重なって止まる」・号令 attack・行き先無）：
    //   勝った後は味方の手を今いる所で構えさせ、敵の居ない打ち掛かりの行き先へ皆で寄り集まらせない。
    const c = { x: 0, y: 0, z: 0 };
    // 11/18 夜50-38（act bot 496秒 締め「仙石秀久の手・7人が一点に重なる・号令 hold・行き先183m」）：大塔の前で開いて構えた（idleSpread の hold）手は
    //   遠い前の持ち場を行き先に持ったままだった。打ち掛かり・構え・移りの手を皆、今いる所を持ち場にして構えさせる
    for (const g of rt.army.groups || []) if (g.team === 0 && g.count && !g.isPlayerSquad && !g.stay && (g.order === 'attack' || g.order === 'hold' || g.order === 'move')) {
      g.center(c); g.order = 'hold'; g.anchor = { x: c.x, z: c.z }; g.seekRange = 0; g._ngIdle = 0; g.dest = null;
      // 夜50-38（act bot 466秒 締め「仙石の手8人が(51,-36)で hold のまま重なる」）：門を縦に通る道の途中なら列の並びと道を放し、元の並びで構えさせる
      if (g._ngGate) { g._ngGate = false; g._ngGateT = 0; g.path = null; g.formation = g._ngForm || g.formation; g.colW = g._ngColW || g.colW; }
    }
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
    // 11/17 K355（センゴク権兵衛2巻）：燃える寺の屋根の撃ち手を捕らえるか見逃すか。手柄と人の道の天秤
    rt.after(19.5, () => rt.say('足軽', '屋根の撃ち手が一人、筒を捨てて谷へ逃げてゆく。追いまするか', 3.2));
    rt.after(23, () => rt.say('組頭', 'もう撃たぬ者じゃ。見逃せ。首より、生きて帰る方が大事よ', 3.4));
    // 11/18 K306（権兵衛2巻 第9話）：焼け跡から大きな梵鐘を担ぎ出す者たち（戦の取り分）
    rt.after(27, () => rt.say('足軽', '見よ、寺の鐘を十人がかりで担ぎ出しておる。あれも戦の取り分か', 3.2));
    // 11/18 k41：勝った時に戦場の知らせ（使番・根来の兵ほか四つ）も重なり、締めの声十一が30.5秒に入らず最後の三つが読めずに終わった（描かずの通しで待ち列13秒）→締めを42秒に
    rt.finish({}, 42);
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
    if (F.ekStep !== F.step) { F.ekStep = F.step; F.ekBase = F.ek || 0; }
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1) return;
    rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },
};

// 11/18 クラウド持ち主（act bot 434・404秒 達成・討ち取り25・24・受けた傷は鉄砲25/12・足軽0「ちょっと簡単すぎるかも。もっと強い奴と斬り合いたい」）：
//   僧坊の路地（段4）・大塔の前（段6）・奥の院（段7）で、本人から二十歩内に来た刃の組（鉄砲だけの組と屋根の撃ち手は除く）を一つだけ本人へ向ける
//   （根白坂・木津川口の huntPlayer と同じ形）。敵の数・強さは変えない。本人の命が六割半を切ったら、塀を挟んだら、組が崩れたら放す。
// 11/18 04時 クラウド持ち主（newbie bot 552秒 段6「仙石秀久の手・5人が一点に重なって止まる」・号令 attack・行き先1m）：
//   大塔の前の打ち掛かりの行き先に着いて、三十歩内に敵が居ない間は、その場で横に開いて構える（hold）。敵が三十歩内に来たら打ち掛かりへ戻す
// 11/18 夜50-38（act bot 371秒「仙石秀久の手・6人が (−1,0) で一点に重なる・号令 attack・行き先72m」）：門を破った後、門の外か門口に残った手が
//   大塔の前へ真っ直ぐ向かい、門の脇の塀に当たって門口で詰まった（段④の初めの縦の道は、その時もう門の内に居た手には付かない）。
//   段④より後、門の前後の帯に打ち掛かりで止まった手は、門口→門の内の順に縦に通してから元の行き先へ戻す
function gateUnstick(F, dt) {
  if ((F._guT = (F._guT || 0) - dt) > 0 || !(F.step >= 4) || F.ending) return;
  F._guT = 1;
  const c = F._guC || (F._guC = { x: 0, y: 0, z: 0 });
  for (const g of [F.sengokuG, F.ramG]) {
    if (!g || !g.count || g.routed || g._ngGate || g.order !== 'attack' || !g.anchor) continue;
    g.center(c);
    const L = toL(c.x, c.z), A = toL(g.anchor.x, g.anchor.z);
    const inBand = Math.abs(L.x) < 9 && L.z > -12 && L.z < 3;
    const q = g._guQ || (g._guQ = { x: 0, z: 0, n: 0 });
    if (!inBand || A.z < 6) { q.n = 0; continue; }
    q.n = Math.hypot(c.x - q.x, c.z - q.z) < 1.2 ? q.n + 1 : 0; q.x = c.x; q.z = c.z;
    if (q.n < 3) continue;
    q.n = 0;
    const fin = { x: g.anchor.x, z: g.anchor.z }, a = P(0, Math.min(L.z, -6)), b = P(0, 2), d = P(0, 8);
    g.order = 'path'; g.path = [[a.x, a.z], [b.x, b.z], [d.x, d.z], [fin.x, fin.z]]; g.pathIdx = 0;
    g._ngGate = true; g._ngForm = g.formation; g._ngColW = g.colW; g.formation = 'column'; g.colW = 2;
    g.onArrive = (gg) => { gg._ngGate = false; gg.formation = gg._ngForm; gg.colW = gg._ngColW; gg.order = F.ending ? 'hold' : 'attack'; gg.seekRange = F.ending ? 0 : 30; gg.anchor = fin; };
  }
}

function idleSpread(rt, F, dt) {
  if ((F._spreadT = (F._spreadT || 0) - dt) > 0) return;
  F._spreadT = 1;
  const c = F._spreadC || (F._spreadC = { x: 0, y: 0, z: 0 });
  // 11/18 18時 クラウド持ち主（act bot 311秒 段5「味方の新手・12人が門の外 (−53,14) で一点に重なる・号令 attack・行き先1m」・中学生 bot 366秒 同じ新手が hold で重なる・qualityAbstract11）：
  //   本人から遠く考えを間引かれた兵は、持ち場の一点を行き先にして重なった。半歩内に味方が重なる間引かれた兵だけ、自分の列の持ち場へ
  //   一秒に一歩まで寄せる（田野と同じ形。歩ける足場だけ・瞬間移動はしない・人数と行き先は変えない）
  const list = F._spreadL || (F._spreadL = []);
  list.length = 0; list.push(F.sengokuG, F.ramG);
  // 11/19 02時 クラウド持ち主（act bot 331秒 味方の新手12人 (-39,4)・321秒 雑賀の鉄砲衆10人 (-6,46)）：寄せの名の組だけ見ていたので敵の組は散らず、
  //   持ち場が重なる組（持ち場まで半歩内）も散らなかった。両軍の徒歩の組を全部見て、持ち場が近すぎる兵は重なった相手から半歩離す
  for (const g of rt.army.groups) if (g.count && !g.isPlayerSquad && !g.hidden && !g.civ && !list.includes(g)) list.push(g);
  const probe = F._spreadP || (F._spreadP = { x: 0, z: 0 });
  for (const g of list) {
    if (!g || !g.count || g.routed || typeof g.slotPos !== 'function') continue;
    const al = g.units.filter((u) => u.alive && !u.gone && !u.fleeing && !u.downed && !u.isPlayer && !u.mounted && !u.isStruct);
    if (al.length < 5) continue;
    for (const u of al) {
      if (!(u.qualityAbstract || u.farSim) || u.perch) continue;
      const v0 = al.find((v) => v !== u && Math.abs(v.pos.x - u.pos.x) < 0.5 && Math.abs(v.pos.z - u.pos.z) < 0.5);
      if (!v0) continue;
      const q = g.slotPos(u.slot, g.initial, probe);
      let dx = q.x - u.pos.x, dz = q.z - u.pos.z, dd = Math.hypot(dx, dz);
      if (dd < 0.6) { const a = (u.slot || 0) * 2.39996 + (u.id || 0); dx = u.pos.x - v0.pos.x || Math.cos(a) * 0.1; dz = u.pos.z - v0.pos.z || Math.sin(a) * 0.1; const l = Math.hypot(dx, dz); dx = dx / l * 0.6; dz = dz / l * 0.6; dd = 0.6; }
      const k = Math.min(1, dd) / dd, nx = u.pos.x + dx * k, nz = u.pos.z + dz * k, ny = rt.world.heightAt(nx, nz);
      if (rt.world.walkable?.(nx, nz) === false || Math.abs(ny - u.pos.y) > 1) continue;
      u.pos.x = nx; u.pos.z = nz; u.pos.y = ny;
    }
  }
  // 11/19 02時 クラウド持ち主（act bot 456秒「仙石秀久の手の足軽が (-29,16) で塀の陰に二十秒止まる・行き先 (53,-47)・隊速0」）：
  //   組から二十歩より離れて塀に阻まれた兵は十秒動けないまま残った。本人から見えない所（三十歩より遠く、画面の外か四十五歩より遠く）に限り、
  //   組の要に近い仲間の脇（歩ける足場・高さの差一歩内）へ移す。人数・行き先・寄せ方は変えない
  const me = rt.player?.u;
  if (me) for (const g of rt.army.groups) {
    if (g.team !== me.team || g.isPlayerSquad || g.routed || !g.count || g.hidden || g.order === 'path') continue;
    const al = g.units.filter((u) => u.alive && !u.gone && !u.fleeing && !u.downed && !u.woundOut && !u.isPlayer && !u.mounted && !u.perch);
    if (al.length < 3) continue;
    g.center(c);
    for (const u of al) {
      if (u.target?.alive || u.atk) { u._ngStr = null; continue; }
      const k = u._ngStr || (u._ngStr = { x: u.pos.x, z: u.pos.z, n: 0 });
      if (Math.hypot(u.pos.x - k.x, u.pos.z - k.z) > 0.6) { k.x = u.pos.x; k.z = u.pos.z; k.n = 0; continue; }
      if (++k.n < 10 || Math.hypot(u.pos.x - c.x, u.pos.z - c.z) < 20) continue;
      const dm = Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z);
      if (dm < 30 || !(u.offscreen || dm > 45)) continue;
      let best = null, bd = 1e9;
      for (const v of al) { if (v === u) continue; const d = Math.hypot(v.pos.x - c.x, v.pos.z - c.z); if (d < bd) { bd = d; best = v; } }
      if (!best || bd > 12) continue;
      const a = (u.slot || 0) * 2.39996, nx = best.pos.x + Math.cos(a) * 1.2, nz = best.pos.z + Math.sin(a) * 1.2, ny = rt.world.heightAt(nx, nz);
      if (rt.world.walkable?.(nx, nz) === false || Math.abs(ny - best.pos.y) > 1) continue;
      u.pos.x = nx; u.pos.z = nz; u.pos.y = ny; u.vel && (u.vel.x = u.vel.z = 0); u.aiT = 0; k.x = nx; k.z = nz; k.n = 0;
      u.warpedOnce = true;   // 11/19 04時 クラウド持ち主（act bot 161秒「秀次の先手・味方の新手の足軽が一息で飛んだ」）：本人から見えない所の置き直しは本能寺・志貴山と同じ印を付け、一息の飛びに数えない
    }
  }
  for (const g of [F.sengokuG, F.ramG]) {
    if (!g || !g.count || g.routed) continue;
    // 11/18 夜50-38（act bot 481秒 段7「仙石秀久の手・7人が(−7,4)で重なる・号令 path」）：門を縦に通る道に五十秒（一秒ごとに数える）かかったら、道を捨てて終わりの所で打ち掛かる（門口で詰まったままにしない）
    if (g._ngGate && g.order === 'path' && g.path) {
      if ((g._ngGateT = (g._ngGateT || 0) + 1) > 50) {
        const last = g.path[g.path.length - 1];
        g._ngGate = false; g._ngGateT = 0; g.formation = g._ngForm || g.formation; g.colW = g._ngColW || g.colW;
        g.order = 'attack'; g.seekRange = 30; g.anchor = { x: last[0], z: last[1] }; g.path = null;
      }
      continue;
    }
    if (g.order !== 'attack' && !g._ngIdle) continue;
    g.center(c);
    let foe = false;
    for (const e of rt.army.groups) {
      if (e.team !== 1 || !e.count || e.routed) continue;
      // 11/18 18時 クラウド持ち主（act bot 516秒 段7「仙石秀久の手・7人が大塔の前 (52,−39) で一点に重なる・号令 attack・行き先4m」）：
      //   屋根や楼の撃ち手・逃げる者が三十歩内に居るだけで「敵が居る」とみて構えず、刃の届かない敵を前に持ち場の一点へ寄り集まっていた。
      //   刃で当たれる敵（持ち場に据わらず・逃げていない）だけを数える。さらに持ち場に着いて誰も相手を持たないまま三秒なら構える
      if (e.units.some((u) => u.alive && !u.perch && !u.fleeing && Math.hypot(u.pos.x - c.x, u.pos.z - c.z) < 30)) { foe = true; break; }
    }
    const engaged = g.units.some((u) => u.alive && u.target && u.target.alive);
    if (g._ngIdle) { if (foe || g.order !== 'hold') { if (g.order === 'hold') { g.order = 'attack'; g.seekRange = g._ngIdle; } g._ngIdle = 0; } continue; }
    // 11/19 03時 クラウド持ち主（act bot 501秒 段7「仙石秀久の手・6人が (52,−36) で一点に重なる・号令 attack・行き先7m」）：
    //   持ち場の五歩内へ入れず（大塔の基壇・味方の列に当たる）七歩の所で誰も相手を持たずに詰まっていた。
    //   要が三秒続けて一歩も動かず持ち場の十二歩内なら、着いたと見て同じく開いて構える
    const da = g.anchor ? Math.hypot(c.x - g.anchor.x, c.z - g.anchor.z) : 1e9;
    const sq = g._ngStill || (g._ngStill = { x: c.x, z: c.z, n: 0 });
    sq.n = Math.hypot(c.x - sq.x, c.z - sq.z) < 0.8 ? sq.n + 1 : 0; sq.x = c.x; sq.z = c.z;
    const near = da < 5 || (da < 12 && sq.n >= 3 && !engaged);
    g._ngNoFoeT = near && !engaged ? (g._ngNoFoeT || 0) + 1 : 0;
    if (near && (!foe || g._ngNoFoeT >= 3)) { g._ngIdle = g.seekRange || 30; g.order = 'hold'; g._ngNoFoeT = 0; if (da >= 5) g.anchor = { x: c.x, z: c.z }; }
  }
}

function huntPlayer(rt, F, dt) {
  if ((F._huntT = (F._huntT || 0) - dt) > 0) return;
  F._huntT = 0.5;
  const P = rt.player.u;
  const on = P?.alive && (F.step === 4 || F.step === 5 || F.step === 6 || F.step === 7) && P.hp >= P.maxHp * 0.65;
  const c = F._huntC || (F._huntC = { x: 0, y: 0, z: 0 });
  const ok = (g) => {
    if (!on || g.routed || !g.count || g.order === 'retreat' || g.stay) return false;
    if (!g.units.some((u) => u.alive && !u.perch && (u.type !== 'gun' || u.sidearm))) return false;
    g.center(c); c.y = rt.world.heightAt(c.x, c.z);
    return Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < 20 && !rt.army.wallBetween(c, g.team, P.pos);
  };
  let cur = F._hunter;
  if (cur && (cur.focus !== P || !ok(cur))) {
    if (cur.focus === P) { cur.focus = null; for (const u of cur.units) if (u.target === P) { u.target = null; u.aiT = 0; } }
    cur = F._hunter = null;
  }
  if (cur || !on) return;
  for (const g of rt.army.groups) if (g.team === 1 && !g.focus && !g.isPlayerSquad && ok(g)) { g.focus = P; F._hunter = g; return; }
}

// 両軍の総勢（羽柴勢はおよそ十万。根来寺に残った衆は数千の目安）
t04_negoro.force = (rt) => {
  const F = rt.flags;
  // 討死の記録は一人ずつ。四十倍すると七十五人の討死で三千人全員が消え、残る敵や退却の知らせと食い違う。
  // 11/18 クラウド K358：一人一人だと200秒で 3,000→2,974、勝っても 2,900 台のまま「敵の数が止まる」。七段の進みで減らし、段の中は討った数で少しずつ。勝てば 0
  const s = Math.max(0, Math.min(7, (F.step || 1) - 1)), k = Math.min(1, ((F.ek || 0) - (F.ekBase || 0)) / 40);
  const b = F.won ? 0 : Math.max(60, Math.round(3000 * (1 - (s + k * 0.9) / 7)));
  return { a: Math.max(0, 100000 - (F.ak || 0)), a0: 100000, b, b0: 3000, casualtiesCounted: true };
};
t04_negoro.history = '天正十三年（1585）三月、小牧・長久手の和睦を終えた羽柴秀吉は、およそ十万の兵で紀州へ向かった。鉄砲で名高い根来衆・雑賀衆を攻めるためである。三月二十一日、和泉の千石堀城では根来衆の主力が激しく戦ったが、火が煙硝蔵に入って城は落ちた。二十三日、秀吉勢は根来寺へ入り、坊舎の多くが焼けた。大塔と大師堂は焼け残り、大塔には今も弾の跡が残ると伝わる。史実では根来寺そのものでの抵抗は少なかった。遊びでは寺に残った鉄砲衆の抵抗を厚くし（坊舎の縁・物見・大門の楼・塀の上から撃つ）、竹束での寄せ・堀秀政を狙う鉄砲衆の討ち取り・丸太での大門破り・境内への突入・大塔の守りを一続きの段にまとめた。地形は国土地理院の実測（北山・前山・大門の口）を縮めて写し、堂の並びは今の大門・大伝法堂・大塔・大師堂の位置に合わせた。子院は斜面を削って石垣で平場を作る（発掘による）。寸法と子院の数、秀次・筒井定次の持ち場は推定。';

t04_negoro.botDbg = (b) => { try { const F = b.flags, m = F.ram && F.ram.mesh; const l = m ? toL(m.position.x, m.position.z) : null; const pl = toL(b.player.u.pos.x, b.player.u.pos.z); return `L${pl.x.toFixed(0)},${pl.z.toFixed(0)}R${l ? l.x.toFixed(0) + ',' + l.z.toFixed(0) + (m.visible ? 'v' : 'h') : '-'}g${F.ramG ? F.ramG.count + F.ramG.order : '-'}G${F.gate ? Math.round(F.gate.hp) : '-'}`; } catch (e) { return 'dbg' + e.message; } };
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
  // 11/18 夜50-38（newbie bot 二回とも段3 大門で刻限切れ・印は100m先）：突きの連打で気力が二割二分を切ると b_depth の「味方の中へ下がる」に入り、
  //   連打で気力が五割五分へ戻らないまま門前の百歩手前で下がり続けた。手当ての要らない気力の退きは、二十歩内に敵が居なければ解いて段の的へ向かう
  {
    const pl = b.player, u = pl.u;
    const hurt = u.hp < u.maxHp * 0.5 && pl.treatmentLeft > 0 && !pl.bandaged;
    if (!hurt && !b.army.nearestEnemy(u, 20, (o) => !o.fleeing && !o.noTarget && !o.perch)) {
      b.flags.dpBack = false;
      // 同じコマで b_depth がまた退きへ戻さないよう、気力の下限だけこの一回は見せない（気力そのものは変えない）
      const s0 = pl.sta;
      if (s0 < pl.maxSta * 0.22) pl.sta = pl.maxSta * 0.22;
      depthBot(b, inp, goTo);
      pl.sta = s0;
      return;
    }
  }
  depthBot(b, inp, goTo);
};

// 足した段（src/t04_negoro/）へ渡す道具
Object.assign(NG, { P, dirL, ROT, NEGORO, SOHEI: SOHEI_LK, dress, flee, alive, heads, nearestFighter, OKU: P(-4, 110),
  chain: [SITES[2], P(-18, -66), SITES[6], P(18, -84), P(-20, -40), P(20, -40)] });

// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
withGuard(t04_negoro);

export { t04_negoro };
export default t04_negoro;
