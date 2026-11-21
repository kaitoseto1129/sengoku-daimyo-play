// ======================================================================
// 徳川編 5　第二次上田合戦（慶長五年九月六日・1600　秋・晴）　筋書きの正：docs/chapter3_tokugawa.md の「5.」
// 手本と出所：docs/battle_refs/k05_ueda.md
// 中山道を西へ向かう徳川秀忠の三万八千が、上田城の真田昌幸・信繁（およそ二千五百）に行く手を阻まれた。
// 長男の信之は徳川方で、戸石城を受け取りに行っている（父・弟と分かれた。この戦の場には出ない）。
// 秀忠は染屋台に本陣を置き、牧野康成に城下の稲を刈らせて真田を誘った。城から真田の兵が打って出て刈田の衆を襲い、
// 本多忠政・大久保忠隣の手が押し返して大手門まで追った。門の上の鉄砲と、門から打って出た槍、虚空蔵山の方から横を突く信繁の手に、
// 追い込んだ先手は討たれ、秀忠の命で引き揚げた。城は落ちず、家康の急使を受けた秀忠は西へ急ぎ、関ヶ原（九月十五日）に間に合わなかった。
// 主人公は本多忠政の先手の侍大将（秀忠の本隊と前衛の間）。11/10 docs/ueda2_spec_1109.md で作り直した。目標は七つ（STAGES）：
//   ①城から出た真田勢を退ける ②退く真田を追う（誘い） ③伏兵の囲みを抜ける ④大手門へ寄せる（落ちない）
//   ⑤後方の荷駄を救う（二度目は追わない学び） ⑥関ヶ原からの急使で攻めを止め、神川の岸に兵をまとめる（信繁の一撃） ⑦中山道を西へ急ぐ（振り返ると無傷の上田城）
// 刻限の札は出さない（critic60：話を聞く間も減る・主人公のせいでない負け）。時が経てば味方の働きで話は進む（二の5）。負けは本人が討たれた時だけ（十二の3）。
// 11/3 kaito AP〜AT：見せかけの軍勢（farHost・clash・backOf）は置かず、見える兵は全部本物。旗は徳川・本多・大久保・榊原・真田だけ。
//   総大将の秀忠は神川の東の本陣で旗本に囲まれ、昌幸は城の内から出ない（AT3）。名のある将は全員馬上。
//   兵の比：両軍の総勢は三万八千対二千五百。城下で組む所だけは寄せ手が多いが、門の前と信繁の横撃で押し返される（史実の難しさ）。
// 向き：北が -z。上田城は原点の北、東が +x（神川と染屋台）。地形：国土地理院の標高（dem_ueda.js）。ゲームの 1 が実の 4m。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import DEM from './dem_ueda.js';
import { demSample } from './dem.js';
import { nobori, yagura, hut, tawara, dobei, sumiyagura, jinmaku, yaguramon, tobira, kuruwaBldg, solidRect, makeKitBatch, finalizeKitBatch } from './props.js';
import { enemyGroup, allyGroup, nm, wallLine } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import { farSight } from './far_sight.js';
import { GENERALS } from './units_data.js';
import { STAGES, KILLS, cut } from './stages.js';
import { TEGARA_ON } from './merit.js';
import { sfx } from './audio.js';
import { timeslipField } from './timeslip_field.js';
import { localClear } from './army_local_way.js';
import { S as SETTINGS, MEM_TIGHT } from './settings.js';
import { start as endScene } from './k05/end.js';
import { DEPTH } from './k05/depth_plan.js';   // 陣立て表：染屋台の諸将（仙石・森・奥平ほか）と戸石の信幸（共通の army_depth.js が描く）   // 締め：急使・陣払い・「関ヶ原に間に合わず」
import { isEn, addEn } from './i18n.js';
// K516 英語版：英語の時だけ上田の字の表を読む（日本語の時は読まない・重さ0）。読み終えてから戦を組む
if (isEn()) { try { addEn((await import('./i18n_k05_ueda.js')).default); } catch (e) {} }

const ID = 'k05_ueda';
TEGARA_ON.add(ID);

// ---- 名のある武将の甲冑（無ければ足す）。黒を基本に、威しの色だけで分ける（AV1） ----
const face = (o) => ({ w: 1.05, jaw: 1.1, chin: 1, cheek: 1, gaunt: 0.2, brow: 1.2, nose: 1, nw: 1.1, eye: 1.1, t: 5, hair: 0x15110d, age: 40, ...o });
const give = (name, g) => { GENERALS[name] ||= { horo: 0, haoriMonCol: 0xe6dfcf, skin: 0x9c7453, ...g }; };
give('徳川秀忠', { armor: 0x1c1a18, lace: 0x2a3a58, hat: 'kabuto_s', haori: 0x22283a, mon: 'tokugawa', tack: 0x2a2018, lord: true,
  face: face({ age: 22, jaw: 1, brow: 1, beard: { mus: 0.3, musW: 0.9, droop: 0.2, goat: 0, side: 0, stub: 0.3 } }) });
give('榊原康政', { armor: 0x1e1c1a, lace: 0x2a3a58, hat: 'kabuto_m', haori: 0x2a2a30, mon: 'none',
  face: face({ age: 53, gaunt: 0.4, beard: { mus: 0.7, musW: 1, droop: 0.4, goat: 0.4, side: 0.3, stub: 0.7 } }) });
give('牧野康成', { armor: 0x201e1c, lace: 0x4a3a2a, hat: 'kabuto_w', haori: 0x2e2620, mon: 'kashiwa',   // 牧野家の丸に三つ柏。弘治元年（1555）生まれで慶長五年は数え四十六
  face: face({ age: 46, beard: { mus: 0.6, musW: 1, droop: 0.4, goat: 0.3, side: 0.2, stub: 0.6 } }) });
// 大久保忠隣の陣羽織は自家の上り藤に大の字（隊の旗と同じ。譜代は自家の紋＝U5。葵は秀忠の本陣だけ）
give('大久保忠隣', { armor: 0x1c1c1e, lace: 0x2e3a52, hat: 'kabuto_m', haori: 0x28282a, mon: 'okubo',
  face: face({ age: 48, brow: 1.3, beard: { mus: 0.7, musW: 1, droop: 0.4, goat: 0.3, side: 0.3, stub: 0.7 } }) });
give('真田昌幸', { armor: 0x1c1816, lace: 0x7a2a20, hat: 'kabuto_m', haori: 0x2a1c18, mon: 'sanada', lord: true,
  face: face({ age: 54, gaunt: 0.5, brow: 1.4, beard: { mus: 0.8, musW: 1, droop: 0.5, goat: 0.5, side: 0.3, stub: 0.8 } }) });
// 慶長五年の信繁（永禄十年の生まれで数え三十四・従五位下左衛門佐）。赤備えと鹿角の兜は大坂の陣（1614〜15）の姿なので、この戦では黒の二枚胴（上田市立博物館の伝信繁所用・鉄二枚胴具足）に並の兜。
// 共通の「真田信繁」（大坂の姿）を替えないよう、官途名で別に持つ（十の4：名乗りは年に合わせる）
const NOBU = '真田左衛門佐信繁';
give(NOBU, { armor: 0x1a1816, lace: 0x5a2a22, hat: 'kabuto_m', haori: 0x241a16, mon: 'sanada', tack: 0x2a1e18,
  face: { ...(GENERALS['真田信繁']?.face || face({})), age: 34 } });

// ---- 場所 ----
const C = { x: -10, z: -30 };                  // 上田城の本丸
const GATE = { x: 22, z: -30 };                // 大手門（東向き）
const FRONT = { x: 40, z: -30 };               // 大手門の前の町屋の外れ
const TOWN = { x: 62, z: -20 };                // 城下の町屋
const KARI = { x: 70, z: -66 };                // 城下の北の田（牧野康成の手が稲を刈る）
const KOKUZO = { x: 46, z: -118 };             // 北の林（虚空蔵山の方。信繁の手が出て来る）
const FORD = { x: 112, z: 0 };                 // 神川の浅瀬
const HONJIN = { x: 168, z: 6 };               // 秀忠の本陣（神川の東の染屋台。旗本に囲まれて動かない）
const RET = { x: 146, z: 4 };                  // 退く先（本陣の前）
const START = { x: 92, z: -52 };
const RIVER = [[108, -260], [112, -80], [106, 60], [110, 260]];
const AMA = [[-200, 22], [-60, 23], [10, 25], [56, 36], [107, 48]];   // 尼ヶ淵（崖の下の千曲川の分流。神川へ寄せて合わせる）
// 東の堀（矢出沢川の水を回した。神川は東へおよそ三キロで、城の堀には引いていない。大手門の前だけ土橋で切れる。寄せ手は水に足を取られ、塀の内の鉄砲に撃たれる。BA7・AV9）
// 堀は幅およそ五間（9m）・人の背より深い所もある水堀。大手門の前だけ土橋（幅 12m ほど）で切れる（critic60：幅 3m の帯で道に見えた）
const MOAT_N = [[GATE.x + 7, -37.5], [GATE.x + 7, -64], [-24, -64]];
const MOAT_S = [[GATE.x + 7, -22.5], [GATE.x + 7, 4], [-24, 4]];
// 城下の町屋の小路（北の田から大手門の前へ斜めに抜ける一本の道。両側に軒を連ねた町屋。critic60：草の原に家が二三軒だけ）
const LANE_A = { x: 68, z: -60 }, LANE_B = { x: 46, z: -34 };
const LANE_ESCAPE = [{ x: 90, z: -53 }, { x: 90, z: -59.5 }, { x: 71, z: -59.5 }, { x: 74, z: -66.5 }];
const LANE_GUIDE = { x: 0, z: 0 };
// 稲架と町屋の袋を避ける案内を、人の画面と自動操作で共用する。
// 11/18 09:05 クラウド 上田の持ち主（act bot「本多の先手の侍が門の前 (45,-25) で行き先 (69,-2) へ20秒」「手勢の足軽が小路 (53,-38) で行き先 (48,-4) へ20秒」）：
//   味方の兵が町屋の軒の向こうの持ち場へ真っすぐ向かい、家に当たって立ち尽くした。真っすぐ通れない時だけ、小路の口・門前・城下の東の道の口を一つ経る
const TOWN_WAY = { x: 0, z: 0, t: -1, on: false };
function townWay(army, u, want) {
  const P = army.playerUnit;
  if (!P || u.team !== P.team || u.mounted) return want;
  const q = u._uedaWay || (u._uedaWay = { ...TOWN_WAY });
  if (q.t > army.time) return q.on && Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 1.5 ? q : want;
  q.t = army.time + 0.4; q.on = false;
  const x = u.pos.x, z = u.pos.z;
  if (x < 34 || x > 78 || z < -64 || z > -8) return want;   // 町屋の外は見ない
  if (Math.hypot(want.x - x, want.z - z) < 3 || localClear(army, u.pos, want)) return want;
  const s = (x - LANE_A.x) * -0.647 + (z - LANE_A.z) * 0.765, side = Math.abs((x - LANE_A.x) * 0.765 + (z - LANE_A.z) * 0.647);
  const inLane = s > -2 && s < dist(LANE_A, LANE_B) + 2 && side < 6;
  let wp = null;
  if (inLane) wp = want.z > LANE_B.z || want.x < LANE_B.x ? (dist(u.pos, LANE_B) > 3 ? LANE_B : FRONT) : (dist(u.pos, LANE_A) > 3 ? LANE_A : null);
  else if (z > -36 && x < TOWN_EXIT.x - 4 && want.x >= TOWN_EXIT.x - 4) wp = TOWN_EXIT;
  else if (z > -36 && x > FRONT.x + 6 && want.x < FRONT.x + 2) wp = FRONT;
  if (!wp || !localClear(army, u.pos, wp)) return want;
  q.x = wp.x; q.z = wp.z; q.on = true;
  return q;
}
function lanePoint(pos, F) {
  const x = pos.x, z = pos.z, ux = -0.647, uz = 0.765;
  const s = (x - LANE_A.x) * ux + (z - LANE_A.z) * uz;
  const side = (x - LANE_A.x) * uz - (z - LANE_A.z) * ux;
  // 攻城の段を刻限で抜けた後も、退路で入口・出口を通った事を覚える。
  if (dist(pos, LANE_A) < 6 || (s > 0 && s < dist(LANE_A, LANE_B) && Math.abs(side) < 4.5)) F.laneEntered = true;
  if (dist(pos, LANE_B) < 5) F.throughTown = true;
  if (!F.throughTown) {
    if (x > 76 && x < 92 && z > -55 && z < -44) return LANE_ESCAPE[x < 87.5 ? 0 : 1];
    if (x > 76 && z > -63.6 && z <= -55) return LANE_ESCAPE[2];
    if (x > 78 && z <= -64.4) return LANE_ESCAPE[3];
    // 入口も一点を踏ませず、移動を止める間合いより広く受け取る。
    if ((s < -1 || Math.abs(side) > 4.5) && dist(pos, LANE_A) > 5) return LANE_A;
    return F.laneEntered ? LANE_B : LANE_A;
  }
  // 出口の五歩以内で通過とする判定にそろえる。二歩まで寄せると、
  // 二・五歩で足を止める移動操作が出口の手前を指したまま進めなくなる。
  if (s < dist(LANE_A, LANE_B) - 5) {
    if (Math.abs(side) <= 3) return LANE_B;
    LANE_GUIDE.x = LANE_A.x + ux * (Math.max(0, s) + 4);
    LANE_GUIDE.z = LANE_A.z + uz * (Math.max(0, s) + 4);
    return LANE_GUIDE;
  }
  return FRONT;
}
// 神川の w は半幅（12m）。浅瀬の中心から七歩では水中なので、西岸の外で兵をまとめる。
const FORD_W = { x: FORD.x - 20, z: 0 };      // 神川の西の岸（追い討ちを食い止める所）
// 11/10 作り直し（docs/ueda2_spec_1109.md・kaito 11/9 夜「秀忠の大軍が真田に足止めされる」）
//   面白さは「大軍なのに少数の真田に時間だけを奪われ続ける」。真田は正面から付き合わず、出る・逃げる・誘う・伏せる・退く。
//   真田の小隊の動き：HARASS（撃って足を止める）→RETREAT（寄られたら次の所へ）→LURE（追えば追える間合い）→AMBUSH（狭い道の左右から）→DISENGAGE（林・城へ去る）
//   詰まり対策：真田の全滅を進む条件にしない／着いた所＋時間で次へ／追わなくても話は進む／門は時間＋寄せで進む（落ちない）。
const NIDA = { x: 88, z: -8 };                 // 城下の東の道に止めた荷駄（本隊の兵糧と玉薬）
const WP7 = { x: 79, z: -2 };                   // ⑦で西岸へ向かう時の中継（俵の山の西・町屋の東）
const TOWN_EXIT = { x: 72, z: -14 };          // 町屋を抜けて荷駄・神川へ出る道
const INNER_N = { x: -8, z: -48 }, INNER_E = { x: 4, z: -48 };
const INNER_S = { x: 4, z: -20 }, INNER_GATE = { x: 16, z: -20 };
const INNER_MOUTH = { x: 16, z: GATE.z };
const GATE_EXIT = { x: GATE.x + 7, z: GATE.z };
const LURE = [{ x: 72, z: -70 }, { x: 63, z: -80 }, { x: 55, z: -92 }, { x: 47, z: -103 }, { x: 46, z: -117 }];   // 誘いの退き道（田の畦→林の間の細い道）
const TRAP = { x: 47, z: -103 };               // 林と林の間で道が狭まる所（左右に伏兵）
const OUT = { x: 66, z: -72 };                 // 囲みを抜けて戻る田
const RAID = { x: 74, z: 30 };                 // 荷駄を襲う真田の出る所（尼ヶ淵の岸の藪）
const MARCH = { x: 150, z: 92 };               // 中山道（木曽路）へ向かう道の先
const FORD_E = { x: 132, z: 4 };              // 浅瀬を渡り切った東岸。行軍先へ斜めに渡って深みに入らない
const STEP_TEXT = ['',
  '北の田で、城から出た真田勢を退けろ',
  '北の林へ退く真田勢を追撃せよ',
  '伏兵の囲みを抜け、北の田まで戻れ',
  '上田城の大手門へ寄せよ',
  '城下の東で、後方の荷駄を救え',
  '上田攻めを止め、神川の岸に兵をまとめよ',
  '神川を渡り、中山道を西へ急げ'];
const LAST = STEP_TEXT.length - 1;
const PIN_NAMES = ['', '北の田', '北の林', '北の田', '大手門の前', '城下の東の荷駄', '神川の岸', '中山道'];
// 段ごとの刻限（秒）：途中は味方の働きで次へ進み、最後は街道へ進んだ事も確かめる（札には出さない）。
// 最長の道筋でも共通の十八分より前に撤収できる余裕を残す（導入・行軍・締めを含む）。
const STEP_MAX = [0, 150, 130, 100, 130, 150, 120, 120];   // 段4：160→130（11/18 16:25 クラウド 上田の持ち主：act bot で段4が百五十〜百六十秒・戦が八分半を超えた）。200→160（11/18 クラウド 上田の持ち主：act bot が門の前へ着かないまま二百秒待つ回があった。よい回は75〜115秒）

const XY = 4, DEM0 = demSample(DEM, C.x * XY, C.z * XY);
function height(x, z) {
  let h = (demSample(DEM, x * XY, z * XY) - DEM0) * 0.4;
  h += 0.18 * Math.sin(x * 0.05) * Math.cos(z * 0.04);
  // 城の南は尼ヶ淵の崖（千曲川の分流が段丘を削った。「尼ヶ淵城」の名の元。八の3：地形が守り）
  const cz = Math.min(1, Math.max(0, (z - 9) / 7)), cx = Math.min(1, Math.max(0, (40 - x) / 16));
  h -= 3.4 * cz * cz * (3 - 2 * cz) * cx;
  // 東の土塀の内の土塁（武者走り）：塀の内に高さ 2m ほどの土の段。鉄砲衆がその上から塀越しに撃つ（critic60：塀の内の鉄砲衆が撃たない）。
  //   大手門の口（|z| < 5）は切る（打って出る道）
  const rx = x < GATE.x - 1.8 ? (x > GATE.x - 8 ? 1 : Math.max(0, 1 - (GATE.x - 8 - x) / 3)) : Math.max(0, 1 - (x - (GATE.x - 1.8)) / 1.2);
  const rz = Math.min(1, Math.max(0, (Math.abs(z - GATE.z) - 5) / 2)) * Math.min(1, Math.max(0, (29 - Math.abs(z - GATE.z)) / 2));
  if (rx > 0 && rz > 0) { const k = rx * rz; h += 2.1 * k * k * (3 - 2 * k); }
  return h;
}
// 田（畦で区切った一枚ずつ）。北の田は刈りかけ：北の半分は稲が立ち、南の半分は刈った後の株と稲架
function paddy(x, z) {
  if (x < 48 || x > 100 || z < -92 || z > -46) return 0;
  if (dist({ x, z }, LANE_A) < 8 || dist({ x, z }, START) < 6) return 0;
  const a = Math.abs(((x - 48) % 13) - 6.5), b = Math.abs(((z + 92) % 11.5) - 5.75);
  return a > 5.9 || b > 5.15 ? 0 : 1;
}
const riceAt = (x, z) => z < -73 && paddy(x, z) > 0.6;

// 生存と戦える人数を分ける。倒れた兵や後送中の兵を接敵・射撃・隊の戦力に数えない。
const canFight = (u) => u.alive && !u.gone && !u.fleeing && !u.downed && !u.dying && !u.woundOut && !u.rearWound && !u.evacuatedWound;
const live = (g) => g && g.units.some(canFight);
const aliveN = (g) => (g ? g.units.reduce((n, u) => n + (canFight(u) ? 1 : 0), 0) : 0);
// 段4 門の槍の残り（二の槍がまだ門の内なら、出る前の数を足す）
const yariLeft = (F) => aliveN(F.yari) + (F.yariB ? aliveN(F.yariB) : Math.max(0, F.w4N - (F.yari ? F.yari.units.length : 0)));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// 東の塀の外や西の塀の向こうを城内に数えると、退路が塀を横切ってしまう。
const insideCastle = (p) => p.x > C.x - 30 && p.x < GATE.x && p.z > GATE.z - 30 && p.z < GATE.z + 30;
// 誘いの退き道（田→林の間の細い道）からの距離。道の上には木を立てない
function lureRoad(x, z) {
  let m = 1e9, a = KARI;
  for (const b of LURE) {
    const vx = b.x - a.x, vz = b.z - a.z, L2 = vx * vx + vz * vz, t = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / L2));
    m = Math.min(m, Math.hypot(x - a.x - vx * t, z - a.z - vz * t)); a = b;
  }
  return m;
}
// 真田の兵も黒い具足（赤備えは大坂の陣の時。AV1）。徳川の諸隊はそれぞれの家の旗
//   旗の鍵 'sanada' は赤備えの家（armor_uniform の RED_HOUSE）として胴と陣笠を朱にするので、この戦は別の鍵で持ち、
//   描く時だけ六文銭へ替える（def.flagEra。critic60：門の前の真田の足軽が真っ赤な胴と陣笠）
const SA = { flag: 'sanada1600', mon: 'sanada', armor: 0x221e1b };   // 胴・陣笠の紋も六文銭（前は隊の家の豊臣の桐。K365 11/18）。紋は赤備えの決まり（RED_HOUSE は旗の鍵だけを見る）に掛からない

// ---- 刈りかけの田の稲と稲架（ここだけの形。絵の板でなく、細い葉と穂の束の形） ----
let RICE_MAT = null, STRAW_MATS = null;
// 一株：根元で束ねた細い葉が狭い V に立ち、上で重い穂が外へ弓なりに垂れる（葉は黄土、穂は明るい藁色）
function riceClump() {
  const parts = [], col = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3), k = new THREE.Color(c); for (let i = 0; i < n; i++) { a[i * 3] = k.r; a[i * 3 + 1] = k.g; a[i * 3 + 2] = k.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + (i % 3) * 0.3, lean = 0.05 + (i % 4) * 0.045, h = 0.8 + (i % 3) * 0.1;
    const g = new THREE.ConeGeometry(0.013, h, 3, 1, true); g.translate(0, h / 2, 0); g.rotateZ(lean); g.rotateY(a); parts.push(col(g.toNonIndexed(), i % 2 ? 0x9a8650 : 0x8f7f4c));
  }
  for (let i = 0; i < 4; i++) {
    const g = new THREE.CylinderGeometry(0.022, 0.008, 0.3, 3, 1, true); g.translate(0, -0.15, 0); g.rotateZ(-2.35 - (i % 2) * 0.25); g.translate(0.03, 0.9 + (i % 2) * 0.06, 0); g.rotateY(i * 1.6 + 0.5);
    parts.push(col(g.toNonIndexed(), 0xd2b874));
  }
  const m = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  return m;
}
function riceField(rt) {
  const W = rt.world, pts = [], low = SETTINGS.quality === 'low';
  const sx = low ? 0.62 : 0.44, sz = low ? 0.6 : 0.42;
  for (let z = -91.5; z < -73; z += sz) for (let x = 48.5; x < 100; x += sx) if (riceAt(x, z)) pts.push([x + (Math.sin(x * 7.1 + z) * 0.06), z + Math.cos(z * 5.3 + x) * 0.06]);
  if (!pts.length) return;
  RICE_MAT ||= new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.92, side: THREE.DoubleSide });
  const geo = riceClump(), im = new THREE.InstancedMesh(geo, RICE_MAT, pts.length);
  const d = new THREE.Object3D(), c = new THREE.Color();
  pts.forEach(([x, z], i) => {
    d.position.set(x, W.heightAt(x, z) - 0.03, z); d.rotation.set(0, (i * 2.399) % 6.28, 0);
    const s = 0.85 + ((i * 7919) % 100) / 330; d.scale.set(s, s * (0.95 + ((i * 31) % 10) / 60), s); d.updateMatrix(); im.setMatrixAt(i, d.matrix);
    im.setColorAt(i, c.setScalar(0.88 + ((i * 17) % 10) / 45));
  });
  im.userData.noFreeze = true;
  rt.scene.add(im);
}
// 稲架（はさ）：杭を組み、横木に刈った稲束を掛けて干す。束は横木の両側へ厚く垂れて、遠くからは藁の壁に見える（critic60：尖った束が馬防柵に見えた）
function hasaK(rt, x, z, rot = 0, len = 9, solid = true) {
  const W = rt.world, wood = [], straw = [[], [], []];
  if (solid) solidRect(x, z, len + 0.4, 0.8, rot);
  const n = Math.max(2, Math.round(len / 2.3));
  for (let i = 0; i <= n; i++) {
    const lx = (i / n - 0.5) * len;
    for (const s of [-1, 1]) { const p = new THREE.CylinderGeometry(0.05, 0.06, 2.5, 5); p.rotateX(s * 0.16); p.translate(lx, 1.2, s * 0.2); wood.push(p); }
  }
  const tiers = [0.75, 1.25, 1.75];
  for (const y of tiers) {
    const bar = new THREE.CylinderGeometry(0.035, 0.035, len + 0.4, 5); bar.rotateZ(Math.PI / 2); bar.translate(0, y + 0.05, 0); wood.push(bar);
    for (let k = 0, lx = -len / 2 + 0.1; lx < len / 2 - 0.05; k++, lx += 0.15) {
      for (const s of [-1, 1]) {
        const b = new THREE.BoxGeometry(0.17, 0.62 + ((k * 7) % 5) * 0.03, 0.09);
        b.translate(0, -0.3, 0); b.rotateX(s * (0.16 + ((k * 3) % 4) * 0.03)); b.rotateZ(((k * 11) % 7 - 3) * 0.025); b.translate(lx, y + 0.06, s * 0.05);
        straw[(k + (s > 0 ? 1 : 0)) % 3].push(b);
      }
    }
  }
  // 11/21 K564：稲架一つで木と藁三色の四つの網・材質も毎回新しく作っていた（三基で十二回描く・影でさらに倍）。
  //   色を頂点に持たせて一つの網・一つの材質にまとめる（形と色は同じ）
  STRAW_MATS ||= new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.93 });
  const tint = (L, hex) => { const c = new THREE.Color(hex); return L.map((g) => { const n = g.toNonIndexed(); g.dispose(); const k = n.attributes.position.count, a = new Float32Array(k * 3); for (let i = 0; i < k; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } n.setAttribute('color', new THREE.BufferAttribute(a, 3)); return n; }); };
  const parts = [...tint(wood, 0x5c4a34), ...straw.flatMap((L, i) => tint(L, [0xb39a58, 0xa88f4e, 0xbfa766][i]))];
  const grp = new THREE.Mesh(mergeGeometries(parts), STRAW_MATS);
  parts.forEach((g) => g.dispose());
  grp.position.set(x, W.heightAt(x, z), z); grp.rotation.y = rot;
  grp.castShadow = true; grp.receiveShadow = true;
  rt.scene.add(grp);
}
const camBlock = (o) => { o.traverse((m) => { if (m.isMesh) m.userData.camBlock = true; }); return o; };
const dress = (look) => (list) => list.map((s) => ({ ...s, o: { ...look, ...(s.o || {}) } }));
const saD = dress(SA), tkD = dress({ flag: 'tokugawa' }), hoD = dress({ flag: 'honda' }), okD = dress({ flag: 'okubo' }), skD = dress({ flag: 'sakakibara' }), maD = dress({ flag: 'kashiwa' });
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n }), uB = (n) => ({ type: 'bow', n });
const bu = (name, o = {}) => ({ type: 'busho', n: 1, o: { name, invuln: true, horse: true, ...o } });
const PIN = { x: 0, z: 0, r: 8, hide: 6, hideDistance: 0, always: true, silent: true, enemy: false, unit: null, follow: false, fire: false, gate: false, defend: false, waiting: false, arrived: false, area: false, route: false };

const k05_ueda = {
  resumeSteps: 7,   // 戦の途中の保存（battle_checkpoint.js）：段の始まりを toStep(①〜7) を順に流して作り直す
  // 身の回りの合戦の跡（timeslip_field.js）。上田：九月初め（今の十月）の刈田。乾いた土、稲を刈った後の黄土の草、神川の岸の葦
  timeslip: {
    drawGround: true, maxSlope: 0.22,   // 通し確認：落ちた槍と幟を描く地面に据え、急な岸には置かない。
    wet: 0.15, dust: 0.6, trample: 0.3, debris: 1.1, arrows: 0.9, reeds: 0.4,
    grass: 0xb3a17c, grassTints: [0xffffff, 0xeee1c7, 0xd9c9a8], grassH: 1, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.7,
    flagColors: [0xe6dfcc, 0x24211e, 0x5a4a36],
  },
  spawn: { x: START.x, z: START.z, heading: -Math.PI * 0.75 },
  minutes: 17,
  flagEra: { sanada1600: 'sanada', sakakibara: '榊原の日輪無' },   // 真田の兵の旗の鍵（SA）を六文銭で描く
  noWake: true,
  // 11/21 クラウド 上田の持ち主（描かずの足跡：全戦共通の K457 の起こし（fujin_wake.js）が開戦十秒から城の北・南の野の備と後詰を起こし、
  //   大手門の前 (24,-31) へ六十人余りが詰めて、打って出た真田の小隊三十二人は門を出た所で九秒に十四人討たれ、刈田（本人）へ一人も来なかった＝段1の本人の討ち取り0）：
  //   史実は城の兵が刈田の衆へ打って出た所。伏兵の段（段3）までは徳川の塊を持ち場に置く（真田の塊は起こす。段3からは徳川も起こす）
  fujinWakeHold: (rt, g) => g.team === 0 && (rt.flags.step ?? 0) < 3,
  noFrontFill: true,      // 見せかけの軍勢を重ねない（AA・AF・AP9・AQ6）。見える兵は全部本物
  noDistantBattle: true,
  noLeaderFollow: true,    // 行き先の印は段ごとの一つだけ
  // 11/18 17:20 クラウド 上田の持ち主（描かずの足跡：本人の六歩内に敵が五〜十三人いても、共通の家臣の受け（ally_cover・命の多少に関わらず七歩内の敵を味方へ向け直す）が
  //   溜めを毎秒消し、八分で本人へ届いた刃が0＝受けた傷は鉄砲だけ。act bot「重く斬り合いたい」）：命が六割を切るまでは本人が自分で斬り結ぶ
  allyCover: { below: 0.6 },
  goalSignOnly: true,     // 近くの敵の案内で持ち場の印を消さず、到着後も段が済むまで残す。
  goalSignTriangle: true,
  keepBattleSigns: true,  // 行き先の印を出している間も、両軍の数と武将名を残す。
  compactIntro: true,
  introText: () => '小さな上田城の前に、徳川秀忠の三万八千。城から出る真田を退け、美濃へ急げ。',
  stageGoalsOnly: true,    // 右上は五つの段だけ（「敵を何人討つ」で埋めない。三の1）
  goalsVisibleRows: 5,     // 七つの目標のうち今の五つを並べる（物差し十三の1。共通の既定は三つ）
  forceBarAlways: true,   // 冒頭の会話中も移動中も、三万八千対二千五百の人数の棒を隠さない。
  hideGuideSteps: true,
  noYaguraTask: true,
  // 右上は今の段を番号付きで（始まりの話の間も①。「味方の旗へ」に替えない。三の3・十の1）
  missionHeading: (rt) => '①②③④⑤⑥⑦'[Math.min(LAST, Math.max(1, rt.flags.step || 1)) - 1] + STEP_TEXT[Math.min(LAST, Math.max(1, rt.flags.step || 1))],      // 隅櫓・物見櫓を目標にしない（城は落とさない戦。右上は六つの段だけ・十の1）
  depth: DEPTH,
  lethal: { max: 4, firstAt: 80, gap: 50 },   // 命懸けの戦場（docs/lethal_howto.md）：門の前の流れ弾・組頭の突然の討死
  fearKind: { kind: '城下の罠', note: '小路と門の前で四方から撃たれる', w: { flank: 1.6, losses: 1.3 }, line: '門の上から撃たれておるぞ！' },
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  // 真田の出撃・伏兵・荷駄襲撃・信繁の一撃と、徳川の二の手は段ごとに動かす。
  // 共通の新手を重ねると城内の折れ道で密集し、撤収後も射手が町屋に残る（11/14 感想の二件）。
  ownReserve: true,
  noTaishoRaid: true,
  foeMarks: true,
  enemyTriangleSigns: true, // 行き先を示す間も、見える真田の兵を共通の赤い▼で識別する。
  enemyTriangleAll: true,   // 遠くで重なる真田兵や行き先の近くの兵も、所属の印を間引かない。
  // 11/18 19:55 UTC クラウド 上田の持ち主 ⑥（gate4 写真 中前・中右・中左：段5 荷駄の場で赤い▼が十あまり横に並び、兵より印が目立った）：
  //   岩石城・根白坂と同じ形で、本人へ振りかかる敵と二十五m 内の近い六人だけに▼
  enemySignVisible: (rt, u) => {
    const me = rt.player.u, p = me.pos;
    if (rt._triT !== rt.t) {
      rt._triT = rt.t; const near = rt._triNear || (rt._triNear = new Set()); near.clear();
      const c = rt._triCand || (rt._triCand = []); c.length = 0;
      for (const v of rt.army.units) { if (!v.alive || v.team === me.team || v.isStruct) continue; const d = (v.pos.x - p.x) ** 2 + (v.pos.z - p.z) ** 2; if (d < 625) c.push(d, v); }
      for (let k = 0; k < 6 && c.length; k++) { let bi = 0; for (let j = 2; j < c.length; j += 2) if (c[j] < c[bi]) bi = j; near.add(c[bi + 1]); c.splice(bi, 2); }
    }
    // 荷駄の場は九人ほどが本人を的にする（u.target）ので、的にするだけでは足さない。今まさに振る者（atk）だけ足す（写真の直した後でも▼が十並んだ）
    return u.atk?.target === me || rt._triNear.has(u);
  },
  playerAtkMax: 3,
  playerTaken: 0.5,
  horseHurtMul: 0,         // 馬の命を戻す前に一撃で落馬し、馬が消える事も防ぐ（critic60 X17）
  playerRegen: 0.025,
  closeCombatAssist: true,
  noWinCrane: true,
  // 行き先のピン：段ごとに一つ（字は出さない）。場所は段ごとに決まっている（AW3）
  missionPin(rt) {
    const F = rt.flags;
    // 締めの台詞の間も行軍先を残す。結果の札が出るまでは本人が動ける。
    let p = KARI;
    if (F.step === 1) p = KARI;
    else if (F.step === 2) p = TRAP;   // 北の林の入口。逃げる隊の移動や全滅で行き先を動かさない。
    else if (F.step === 3) p = OUT;
    else if (F.step === 4) p = F.atFront || F.throughTown ? FRONT : F.laneEntered ? LANE_B : LANE_A;
    else if (F.step === 5) p = NIDA;
    else if (F.step === 6) p = FORD_W;
    else if (F.step === 7) p = F.crossedRiver ? MARCH : FORD_E;
    // 門内へ誘われた本人にも、土塀の開口から出る退路を示す。
    // 自動操作だけが家並みを避け、人には壁の向こうを指す案内にしない。
    const me = rt.player?.u.pos;
    let route = false;
    if (me && F.step >= 3 && insideCastle(me)) {
      route = true;
      if (me.x < 1 && (me.x < -2 || me.z < -42)) p = me.z > -45 ? INNER_N : INNER_E;
      else if (me.x < 12) p = me.z < -23 ? INNER_S : INNER_GATE;
      else p = Math.abs(me.z - GATE.z) > 3.5 ? INNER_MOUTH : GATE_EXIT;
    } else if (me && F.step >= 5 && !F.townExitReached && me.x < 76 && dist(me, p) > 20) {
      // 北の田や小路に残っていても、町屋を横切らず同じ小路から広場へ出る。
      // 門前から荷駄へ向かう者は、南の家（46,-18）の北を通る。
      // 小路の途中で z=-34 を越えただけでは荷駄へ向けない。
      // 出口→門前の広場→東の道を順に通り、家並みの角を斜めに横切らない。
      if (dist(me, TOWN_EXIT) < 5 || (me.x >= TOWN_EXIT.x - 2 && me.z > -24)) F.townExitReached = true;
      if (!F.townExitReached) {
        if (dist(me, FRONT) < 6) F.frontExited = true;
        // 11/19 06:05 クラウド 上田の持ち主（描かずの足跡 05:46・05:53：段5の始めに本人が門の前の西（32,-36）に居ると、小路の出口を踏んでいない
        //   ため小路の入口（68,-60）へ戻す案内になり、門の脇で四十秒立ち往生・田の方へ退いた＝荷駄に着かず段5の討ち取り0）：
        //   小路の出口より西（門の前の広場）に居る時は、小路へ戻さず門の前の広場から東の道へ出す
        p = !F.frontExited && me.z < -34 && me.x > LANE_B.x - 2 ? lanePoint(me, F) : !F.frontExited ? FRONT : TOWN_EXIT;
        route = true;
      }
    } else if (me && F.step === 4 && (!F.atFront || (!F.throughTown && me.x > LANE_B.x && me.z < LANE_B.z))) {
      // 味方が先に攻城を始めても、本人の小路の案内を飛ばさない。
      p = lanePoint(me, F); route = p !== FRONT;
    } else if (me && F.step === 7 && !F.crossedRiver && me.x < FORD.x && Math.abs(me.z - FORD_W.z) > 6) {
      // 岸への集合が時間で済んだ場合も、北の田から深みへ斜めに渡らせない。
      // 11/17 クラウド kaito2：城下の北（73,-43）・俵の脇（81,-19）・町屋の口（75,-11）から西岸へ真っ直ぐ向かうと、荷駄の俵の山（84〜96,-6〜-10）と
      //   町屋の角に当たって動けず、act bot が三度 1080 秒の時切れになった。俵の西の空き（WP7）を通ってから岸へ
      p = me.x < WP7.x + 4 && dist(me, WP7) > 4 ? WP7 : FORD_W; route = true;
    }
    PIN.x = p.x; PIN.z = p.z; PIN.r = F.step === 2 ? 10 : 9;
    PIN.route = route;
    PIN.label = route ? (p === FORD_W || p === WP7 ? '神川の西岸' : p === TOWN_EXIT ? '城下の東の道' : p === FRONT ? '大手門の前' : !insideCastle(me) ? '町屋の小路' : '大手門') : p === FORD_E ? '神川の浅瀬' : PIN_NAMES[F.step || 1];
    return PIN;
  },
  talk: {
    // 0:00〜：画面いっぱいの徳川の先に、小さな上田城（油断）
    before: [['本多忠政', 'あれが上田の城か。……思うたより小さいな'],
      ['徳川の足軽', 'これだけおれば、一日で落ちるだろ'],
      // 11/18 K355 クラウド k365-cloud-42（docs/books/sengoku_gonbee_27.md：小諸で降ると申し出て、翌日に翻した時間稼ぎ）
      ['大久保忠隣', '昌幸め、降ると申して二日待たせ、支度が済むと手のひらを返しおった'],
      ['大久保忠隣', '牧野殿に刈田をさせて誘う。出て来た所を叩いて、すぐ西へ上る'],
      ['真田信之', '……あの城に、父と弟がいる'],
      ['本多忠政', '伊豆守殿。……いや、何も申すまい']],
    after: [['真田昌幸', '……行ったか。三万八千、ここで足を止めてやったわ'], ['徳川秀忠', '……美濃の戦に、間に合うか。木曽路を急げ']],
  },
  world: {
    autumn: true,   // 11/19 史実照らし（docs/reki_sky_1119.md）：旧暦九月＝太陽暦十月。枯れ色の草と色づく木
    noFake: true,   // 11/13 K285（kaito「本物の兵しか映したらいけない」）：絵だけの兵（addDistantArmy・addClash・陣立ての軽い備）を作らない。映る兵は全員 戦の中の本物
    seed: 1600906, time: 'day',
    groundHalf: 260, moveLim: 250,
    height,
    waterSlow: true,
    moveWay: townWay,
    streams: [{ pts: RIVER, w: 12, depth: 1.15 }, { pts: AMA, w: 9, depth: 1.4 }, { pts: MOAT_N, w: 4.5, depth: 1.9 }, { pts: MOAT_S, w: 4.5, depth: 1.9 }],
    // 九月初め（今の十月）の田：刈った後の株（stubble）。立っている稲と稲架はこの戦の形で置く（riceField・hasaK）
    fieldStage: 'stubble',
    paddy,
    // 信濃の里山：杉と楢・栗の広葉樹が多く、松は少なめ。竹藪は置かない（critic60：遠くにシュロのような木）
    treeMix: { sugi: 0.5, matsu: 0.56 },
    noBamboo: true,
    sugiAt: () => 0.05,   // 林の中に竹を混ぜない（groves の竹は杉林の印があると置かれない）
    paths: [[[HONJIN.x + 30, 8], [HONJIN.x, 6], [FORD.x + 6, 2], [TOWN.x + 10, TOWN.z + 6], [FRONT.x, FRONT.z], [GATE.x + 2, GATE.z]], [[KARI.x, KARI.z + 2], [LANE_A.x, LANE_A.z], [LANE_B.x, LANE_B.z], [FRONT.x, FRONT.z]], [[KARI.x, KARI.z], ...LURE.map((q) => [q.x, q.z])], [[FORD.x + 6, 2], [MARCH.x - 20, MARCH.z - 40], [MARCH.x, MARCH.z], [MARCH.x + 10, MARCH.z + 40]]],
    tint(x, z, h, c) {
      c.setRGB(c.r * 0.52 + 0.24, c.g * 0.5 + 0.2, c.b * 0.4 + 0.08);   // 秋の刈田
      if (Math.hypot(x - C.x, z - C.z) < 40) c.setRGB(c.r * 0.7 + 0.1, c.g * 0.65 + 0.08, c.b * 0.55 + 0.05);
    },
    clear: (x, z) => (x > -30 && x < 200 && Math.abs(z) < 90) || dist({ x, z }, KOKUZO) < 14 || lureRoad(x, z) < 5,
    trees: 220,
    tufts: 2600,
    treeDensity: (x, z) => (x < -30 || z < -96 || z > 90 ? 1 : 0.1),
    // 11/19 04:55 クラウド 上田の持ち主 ⑥（gate4 写真 終前・終左：神川の岸の段で杉が川面から生えて立つ）：
    //   岸の藪の林（84,46）が尼ヶ淵の流れの真ん中から三歩に置かれ、十二本が半幅九歩の水の中に立っていた。
    //   手前の岸（二の手が出る所）と向こう岸（藪の鉄砲が潜む所）に分け、どちらも水の縁から二歩より外へ。本数は同じ
    groves: [{ x: 86, z: 27, r: 7, sz: 0.6, n: 7 }, { x: 83, z: 59, r: 8, sz: 0.55, n: 5 }, { x: 30, z: -104, r: 18, n: 30 }, { x: 64, z: -108, r: 14, n: 20 }],
    fleeOut: (x, z, team) => (team === 1 ? x < -40 : x > 240),
  },
  sides: { a: { name: '徳川秀忠軍', mon: 'tokugawa' }, b: { name: '真田昌幸・信繁　上田城', mon: 'sanada' } },
  date: () => '慶長五年（1600）九月六日　信濃国 上田・晴',

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const F = rt.flags, W = rt.world, S = rt.scene;
    // 首取りなどの長押し札を、携帯横持ちの右下の「守る」から離す。
    const workStyle = document.createElement('style');
    workStyle.textContent = `
@media (max-height:500px) {
 html.touch body #hud.ueda-work #battle-notices #prompt.work-action:not([hidden]) {
  position:fixed !important; inset:auto auto calc(112px + env(safe-area-inset-bottom, 0px)) 50% !important;
  transform:translateX(-50%) !important; width:200px !important; max-width:34vw; margin:0 !important;
 }
 html.touch body #hud.ueda-work #prompt.work-action button[data-work] { width:100%; max-width:100%; }
}
`;
    document.head.appendChild(workStyle);
    rt.hud.root.classList.add('ueda-work');
    // 11/18 クラウド K365：段の替わりの中央の青い札（右上の任務と同じ字）が上の端で行き先の札と重なっていた（act bot 874×402）。
    //   青い札は出さず、中央の声が出ている間は行き先の字の札を薄くする（天王寺・岡山と同じ扱い）
    if (!document.getElementById('ueda-cc-style')) {
      const st = document.createElement('style'); st.id = 'ueda-cc-style';
      st.textContent = `html:root body #hud:has(#h-prog[data-battle="k05_ueda"]) #center-call .cc.blue { display:none !important; }
html:root body #hud:has(#h-prog[data-battle="k05_ueda"]):has(#center-call .cc:not(.blue)) #goal-sign .gs-tag { opacity:0 !important; }`;
      document.head.appendChild(st);
    }
    const dispose = rt.dispose;
    rt.dispose = function () {
      this.hud.root.classList.remove('ueda-work');
      workStyle.remove();
      return dispose.call(this);
    };
    F.step = 0; F.holdPlayer = false; F.foes = []; F.ending = false; F.ek = 0; F.ak = 0; F.delay = 0;   // delay：真田に奪われた時（0〜100。高いほど締めの秀忠の焦りが強い）
    // ---- 上田城：土塀・大手門（櫓門）・櫓。城は落とせない ----
    // 11/21 K564：土塀の区画（五m ごと・材質ごと）を一つずつ描いていた（乱戦で八十六回。区画は当たりの struct なので静かな物の束にも入らない）。
    //   城ひとつぶんの材質ごとの束に積む（有岡と同じ。区画の当たり・名前・壊れない強さは同じ）
    const KB = makeKitBatch();
    const castle0 = S.children.length;
    wallLine(rt, [[GATE.x, GATE.z - 30], [GATE.x, GATE.z - 4]], { team: 1, hp: 1e9, name: '城の土塀', mesh: dobei, meshOpt: { batch: KB }, segLen: 5, h: 2.4 });
    wallLine(rt, [[GATE.x, GATE.z + 4], [GATE.x, GATE.z + 30]], { team: 1, hp: 1e9, name: '城の土塀', mesh: dobei, meshOpt: { batch: KB }, segLen: 5, h: 2.4 });
    wallLine(rt, [[GATE.x, GATE.z - 30], [C.x - 30, GATE.z - 30], [C.x - 30, GATE.z + 30], [GATE.x, GATE.z + 30]], { team: 1, hp: 1e9, name: '城の土塀', mesh: dobei, meshOpt: { batch: KB }, segLen: 5, h: 2.4 });
    try { S.add(yaguramon(W, GATE.x, GATE.z, 7, Math.PI / 2, { doors: false, inside: true })); } catch (e) { console.warn(e); }
    // 大手門の扉：ふだんは閉じ、真田が打って出る時と城へ引く時だけ内へ開く（寄せ手は門をくぐって本丸へ入れない。十一の2・十一の3）
    F.gate = rt.army.addStruct({ seg: [GATE.x, GATE.z - 4, GATE.x, GATE.z + 4], nx: 1, nz: 0, hp: 1e9, maxHp: 1e9, team: 1, name: '大手門の扉' });
    F.gate.noTarget = true;
    F.door = tobira(W, GATE.x, GATE.z, 7, Math.PI / 2, { h: 3.2 });
    F.door.userData.noFreeze = true;
    F.door.traverse((o) => { if (o.isMesh) o.userData.noBatch = true; });
    F.doorA = 0;
    for (const [x, z] of [[GATE.x - 3, GATE.z - 28], [GATE.x - 3, GATE.z + 28], [C.x - 28, GATE.z - 28]]) S.add(yagura(W, x, z, { mon: 'sanada', team: 1 }));
    // 大手門の左右の二重櫓は置かない（真田の上田城は小さな城。門の脇に大櫓が並ぶと江戸の大城に見えた。critic60）。門の脇は土塁の上の塀と鉄砲衆だけ
    // 六文銭の幟：土塀の内に並べ、寄せ手から城の守りが見えるように（Q・動かない城にだけ）
    for (const [x, z] of [[GATE.x - 10, GATE.z - 14], [GATE.x - 10, GATE.z + 14], [C.x, C.z], [GATE.x - 4, GATE.z - 22], [GATE.x - 4, GATE.z - 16], [GATE.x - 4, GATE.z + 16], [GATE.x - 4, GATE.z + 22],
      [GATE.x - 6, GATE.z - 5], [GATE.x - 6, GATE.z + 5], [C.x + 4, C.z - 8], [C.x + 4, C.z + 8], [C.x - 22, C.z - 22], [C.x - 22, C.z + 22]]) S.add(nobori(W, x, z, 'sanada', 7));
    // 本丸の二重櫓（今の西櫓と同じ下見板と白壁の二重。町屋の屋根越しに城の姿が見える）
    S.add(sumiyagura(W, C.x + 6, C.z - 14, { w: 9, d: 7, base: 4.2 }), sumiyagura(W, C.x + 6, C.z + 16, { w: 8, d: 6, base: 3.6 }));
    // 本丸の御殿（昌幸の居館）と米蔵・番所（四の5：城らしい本丸。天守は置かない＝真田の上田城に天守の確かな記録が無い）
    S.add(hut(W, C.x - 10, C.z + 2, 14, 9, Math.PI / 2), hut(W, C.x - 18, C.z - 8, 8, 6, Math.PI / 2));
    try { S.add(kuruwaBldg(W, 'kura', C.x - 16, C.z + 16, 0, {}), kuruwaBldg(W, 'bansho', C.x + 10, C.z + 20, 0, {})); } catch (e) { console.warn(e); }
    // 城の櫓門・塀・櫓はカメラを通さない（critic60：カメラが櫓門と家の中に入り、画面いっぱいに黒い壁）
    for (const o of S.children.slice(castle0)) camBlock(o);
    farSight(S.children.slice(castle0), { W, ground: { x: C.x + 10, z: C.z, r: 50 } });
    S.add(camBlock(F.door));
    const inner0 = S.children.length;
    // 門内は交互に口を空けた土塀で折れ、同じ道を戻れば必ず脱出できる。
    wallLine(rt, [[10, -60], [10, -27]], { team: 1, hp: 1e9, name: '門内の土塀', mesh: dobei, meshOpt: { batch: KB }, segLen: 5, h: 2.4 });
    wallLine(rt, [[-2, -41], [-2, 0]], { team: 1, hp: 1e9, name: '門内の土塀', mesh: dobei, meshOpt: { batch: KB }, segLen: 5, h: 2.4 });
    for (const o of S.children.slice(inner0)) camBlock(o);
    finalizeKitBatch(rt, KB);
    // ---- 城下の町屋：北の田から大手門の前へ抜ける小路の両側に、軒を連ねた町屋（critic60：小路が無い） ----
    {
      const L = dist(LANE_A, LANE_B), ux = (LANE_B.x - LANE_A.x) / L, uz = (LANE_B.z - LANE_A.z) / L, px = -uz, pz = ux;
      const rot = Math.atan2(-uz, ux);   // 家の長い辺（w）を小路に沿わせる
      // 小路の幅は家の前で 9m ほど（狭いとカメラが軒に入る）。門の前の広場の手前で家並みを切る
      // 11/17 クラウド kaito2：小路の入口（北の田の側）の一列目の二軒（60.5,-60.4 と 72.7,-50.1）の角に馬が挟まり、
      //   act bot が三度に一度 (58,-54) で動けなくなって 1080 秒の時切れ（まとめの枝 k365-cloud-14・描かずの試しで四秒に 2m しか進めない）。
      //   入口の一列目を外して田から小路への口を広げる（二列目から先の家並みと小路の幅は同じ）
      for (let s = 15; s < L - 6; s += 10.5) for (const sd of [-1, 1]) {
        const x = LANE_A.x + ux * s + px * (sd * 8 + (s > 12 ? 2 : -2)), z = LANE_A.z + uz * s + pz * (sd * 8 + (s > 12 ? 2 : -2));
        S.add(camBlock(hut(W, x, z, 7, 5, rot, { minka: false })));
      }
    }
    for (const [x, z, w, d, r] of [[TOWN.x - 4, TOWN.z + 14, 9, 6, 0.2], [TOWN.x + 10, TOWN.z + 12, 8, 5, 0], [FRONT.x + 6, FRONT.z + 12, 8, 5, -0.05]]) S.add(camBlock(hut(W, x, z, w, d, r, { minka: false })));
    S.add(tawara(W, TOWN.x + 20, TOWN.z, 0.3, 4));
    // ---- 北の田：北の半分は稲が立ち、南の半分は刈った後で稲架に稲束を掛ける ----
    // 小路の入口の脇の稲架（81,-55）は当たりを付けない（11/9 二巡：稲架と町屋の間の袋で十五分抜けられなかった）
    // 11/18 クラウド k365-cloud-17：北の田の西の稲架（57,-69）も当たりを外す（act bot が ⑤〜⑦の六百秒、東の端 (61,-70) で小路の入口へ抜けられず時切れ）
    try { riceField(rt); for (const [x, z, r, sd] of [[57, -69, 0.05, false], [84, -64, -0.04, true], [81, -55, 0.02, false]]) hasaK(rt, x, z, r, 9, sd); } catch (e) { console.warn(e); }
    // ---- 秀忠の本陣（神川の東・染屋台）：幕と葵の旗・篝火 ----
    S.add(jinmaku(W, HONJIN.x + 6, HONJIN.z, 18, 12, 6, { mon: 'tokugawa' }));
    for (const dz of [-10, -5, 0, 5, 10]) S.add(nobori(W, HONJIN.x - 6, HONJIN.z + dz, 'tokugawa', 6));
    for (const dz of [-8, 8]) S.add(nobori(W, HONJIN.x + 18, HONJIN.z + dz, 'tokugawa', 6));
    for (const dx of [-6, 0, 6]) S.add(nobori(W, HONJIN.x - 10 + dx, HONJIN.z - 30, 'sakakibara', 6));   // 榊原の陣の後ろ
    // 篝火は置かない（晴れた昼の陣で火は焚かない）
    // 染屋台の奥に三万八千の諸隊の陣（本多正信・酒井家次）。振り返っても本陣と諸隊の陣が見える（十三の4）。譜代は自家の紋（U5）
    for (const [x, z, mon] of [[214, -34, 'honda'], [222, 30, 'katabami'], [238, -2, 'honda']]) {
      S.add(jinmaku(W, x, z, 14, 10, 5, { mon }));
      for (const dz of [-6, 0, 6]) S.add(nobori(W, x - 9, z + dz, mon, 6));
    }
    // 染屋台の尾根に並ぶ三万八千の諸隊（本陣から百歩より奥。戦わずに控える。十二の1：遠くの軍勢も史実の規模で）。
    //   近くには出さない（九の5）。本陣の前（退く先）から 80m より遠い所だけ
    try {
      F.sometai = [];
      for (const [x, z, flag, n, sd] of [[244, -40, 'honda', 220, 51], [250, 34, 'katabami', 200, 52], [256, -4, 'tokugawa', 240, 53], [236, -74, 'okubo', 160, 54], [240, 70, 'sakakibara', 160, 55]])
        F.sometai.push(W.addDistantArmy({ x, z, w: 24, d: 12, count: n, facing: -Math.PI / 2, flag, team: 0, seed: sd, farFill: true, host: false }));   // farFill：持ち場から百四十歩より奥の隊も描く
    } catch (e) { console.warn(e); }
    for (const [x, z, mon] of [[226, -70, 'okubo'], [230, 66, 'sakakibara']]) { S.add(jinmaku(W, x, z, 12, 9, 5, { mon })); for (const dz of [-5, 0, 5]) S.add(nobori(W, x - 8, z + dz, mon, 6)); }
    // 神川の東の岸（浅瀬の口の南）に後詰の幟の林。noFake で軽い大軍が描かれず、⑥⑦に向こう岸が幟数本だけだった（③）。
    //   幟は兵ではない。中山道へ渡る道（FORD_E から北）と浅瀬（z±6）を塞がない所に、家ごとに三本ずつ二列で立てる
    for (const [x0, z0, mon] of [[140, -12, 'sakakibara'], [146, -22, 'honda'], [140, -32, 'okubo'], [152, -10, 'tokugawa']])
      for (const [dx, dz] of [[0, 0], [0, 3], [0, -3], [3, 1.5], [3, -1.5]]) S.add(nobori(W, x0 + dx, z0 + dz, mon, 6));
    KIT.farVillage(rt, 190, 100, { rot: -Math.PI / 2, n: 5, fields: 6, seed: 45 });

    // ---- 徳川方（本物の兵だけ） ----
    F.mine = allyGroup(rt, { faction: 'tokugawa', name: '手勢', fullStrength: true, fixed: true, anchor: { x: START.x + 2, z: START.z + 3 }, facing: -Math.PI * 0.75, width: 5, aggro: 10, speed: 3.6, order: 'hold', noRout: true, dmgMult: 0.9 },
      hoD([uS(4), uA(9), uG(3)]));
    F.honda = allyGroup(rt, { faction: 'tokugawa', name: '本多忠政の先手', fullStrength: true, fixed: true, anchor: { x: START.x + 6, z: START.z - 6 }, facing: -Math.PI * 0.75, width: 7, aggro: 12, speed: 3.6, order: 'hold', noRout: true, formation: 'yari' },
      hoD([bu('本多忠政'), uS(5), uA(16), uG(5)]));
    F.makino = allyGroup(rt, { faction: 'tokugawa', name: '牧野康成の刈田の手', fullStrength: true, fixed: true, anchor: { x: KARI.x + 2, z: KARI.z }, facing: -Math.PI / 2, width: 7, aggro: 10, speed: 3.4, order: 'hold', noRout: true },
      maD([bu('牧野康成', { mon: 'kashiwa' }), uS(3), uA(14)]));   // 牧野の手は自家の三つ柏（葵は徳川の本陣だけ）
    F.okubo = allyGroup(rt, { faction: 'tokugawa', name: '大久保忠隣の手', fullStrength: true, fixed: true, anchor: { x: TOWN.x + 30, z: TOWN.z + 8 }, facing: -Math.PI / 2, width: 7, aggro: 12, speed: 3.6, order: 'hold', noRout: true, formation: 'yari' },
      okD([bu('大久保忠隣'), uS(5), uA(14), uG(3)]));
    // 秀忠の本陣：神川の東で旗本に囲まれ、前に出ない（AR3・AT3）
    F.hide = allyGroup(rt, { faction: 'tokugawa', name: '徳川秀忠の本陣', fullStrength: true, fixed: true, anchor: { x: HONJIN.x, z: HONJIN.z }, facing: -Math.PI / 2, width: 8, aggro: 4, seekRange: 10, order: 'hold', noRout: true },
      tkD([bu('徳川秀忠', { horse: false }), uS(22), uG(6)]));
    F.hideU = F.hide.units.find((u) => u.name === '徳川秀忠');
    if (F.hideU) F.hideU._crouch = true;   // 床几に腰を下ろす
    F.saka = allyGroup(rt, { faction: 'tokugawa', name: '榊原康政の隊', fullStrength: true, fixed: true, anchor: { x: HONJIN.x - 10, z: HONJIN.z - 22 }, facing: -Math.PI / 2, width: 7, aggro: 6, seekRange: 14, order: 'hold', noRout: true, formation: 'yari' },
      skD([bu('榊原康政'), uS(4), uA(10), uG(3)]));
    // 真田信之（徳川方。父と弟の城を前に、何もできない。大げさに泣かせない）
    F.nobu = allyGroup(rt, { faction: 'tokugawa', name: '真田信之の手', fullStrength: true, fixed: true, anchor: { x: START.x + 4, z: START.z + 9 }, facing: -Math.PI * 0.6, width: 4, aggro: 4, seekRange: 8, order: 'hold', noRout: true },
      dress(SA)([bu('真田信之'), uS(3), uA(4)]));
    // 城下の東の道に止めた荷駄（米俵・玉薬の箱と人足）。⑤で真田に襲われる
    // 人足は俵の西に立たせ、信繁の手は二重櫓（C.x+6, C.z+16）の東に控えさせる（当たりの中に立たない。すり抜けの洗い出し 11/11）
    for (const [dx, dz] of [[-4, -2], [0, 1], [4, -1], [8, 2]]) S.add(tawara(W, NIDA.x + dx, NIDA.z + dz, 0.3 + dx * 0.05, 3));
    F.nida = allyGroup(rt, { faction: 'tokugawa', name: '荷駄の人足', fullStrength: true, fixed: true, anchor: { x: NIDA.x - 7, z: NIDA.z }, facing: -Math.PI / 2, width: 5, aggro: 3, seekRange: 6, order: 'hold', noRout: true, dmgMult: 0.4 },
      tkD([uA(6)]));
    // 画面いっぱいの徳川：神川を越えた後詰めの軽い大軍（本物の兵の枠を使わない。締めで木曽路へ動く）
    try { for (const [x, z, flag, n, sd] of [[124, -64, 'okubo', 150, 56], [126, -22, 'honda', 170, 57], [128, 22, 'kashiwa', 130, 58]]) F.sometai.push(W.addDistantArmy({ x, z, w: 20, d: 10, count: n, facing: -Math.PI / 2, flag, team: 0, seed: sd, farFill: true, host: false })); } catch (e) { console.warn(e); }
    for (const g of [F.honda, F.okubo, F.makino]) g.ai = true;
    // 牧野の足軽は田にかがんで稲を刈る（突っ立たせない。一の3）。真田が来れば立って戦う（army_anim が動きと相手で _crouch を解く）
    for (const u of F.makino.units) if (!u.mounted && u.type !== 'busho') u._crouch = true;
    // 真田昌幸は城の内（本丸）にいて出て来ない
    F.masa = this.foe(rt, '真田昌幸の旗本', { x: C.x + 2, z: C.z }, [bu('真田昌幸', { horse: false }), uS(6), uG(2)], { hold: true, width: 5 });
    F.masaU = F.masa.units.find((u) => u.name === '真田昌幸');
    F.masa.seekRange = 3; F.masa.aggro = 3; F.masa.noAI = true; F.masa.stay = true;   // 旗本は本丸の床几の周りを離れない（塀へ寄って立ち尽くさない）
    if (F.masaU) F.masaU._crouch = true;   // 本丸で床几に座り、出て来ない
    // 門の上の鉄砲衆（土塀の内に並ぶ。門へ寄る者を撃つ）。塀から五、六歩下げ、塀の外から槍が届かない（十一の2：塀越しに討てない）
    // 弓も並べる（nippon.com：寄せ手は「矢と鉄炮」で大きな損害）
    //   塀の内の土塁（height の武者走り）に立たせ、塀越しに撃てる高さにする（critic60：塀の陰で一度も撃たなかった）
    F.wallG = this.foe(rt, '大手門の鉄砲衆', { x: GATE.x - 4.5, z: GATE.z - 9 }, [uS(1), uG(7), uB(2)], { hold: true, width: 6, dmg: 0.9 });
    F.wallG2 = this.foe(rt, '大手門の弓衆', { x: GATE.x - 4.5, z: GATE.z + 9 }, [uG(4), uB(3)], { hold: true, width: 6, dmg: 0.9 });
    // 隅櫓の脇の鉄砲衆（北と南の塀の内から、門へ寄る者を横から撃つ。BK3・BJ3）
    F.wallN = this.foe(rt, '北の隅櫓の鉄砲衆', { x: GATE.x - 4.5, z: GATE.z - 18 }, [uG(6)], { hold: true, width: 6, dmg: 0.9 });
    F.wallS = this.foe(rt, '南の隅櫓の鉄砲衆', { x: GATE.x - 4.5, z: GATE.z + 18 }, [uG(6)], { hold: true, width: 6, dmg: 0.9 });
    for (const g of [F.wallG, F.wallG2, F.wallN, F.wallS]) { g.facing = Math.PI / 2; g.seekRange = 48; g.aggro = 0; g.noAI = true; g.stay = true; g.wallShot = true; }
    // 信繁の手は初めから北の林に潜む（伏兵。四の段で林から出る。急に湧かせない AT17・AV10）
    F.nobushige = this.foe(rt, '真田信繁の手', { x: C.x + 17, z: C.z + 8 }, [bu(NOBU), { type: 'cavalry', n: 4 }, uS(3), uA(8)], { hold: true, width: 6, morale: 100, dmg: 0.5 });
    F.nobushige.seekRange = 3; F.nobushige.aggro = 3; F.nobushige.noAI = true; F.nobushige.stay = true;   // ⑥まで城の内に控え、一度だけ後衛を突きに出る
    const T = this.talk.before;
    T.forEach(([who, s], i) => rt.after(0.6 + i * 2.6, () => rt.say(who, s, 2.4)));
    // 油断の間：秀忠の本陣は整然と余裕。少し間を置いてから城の門が開く
    rt.after(0.6 + T.length * 2.6, () => rt.say('秀忠の使番', '中納言様の仰せ。「今日のうちに片付けて西へ上る」', 2.4));
    // 最後の使番の声を流しながら出撃する。兵の動き出しを十五秒より遅らせない。
    rt.after(0.6 + T.length * 2.6 + 1, () => { F.holdPlayer = false; this.toStep(rt, 1); });
  },

  // 真田の隊を出す（見える所に湧かせない。城の門の内か、北の林から）
  foe(rt, name, at, list, o = {}) {
    const F = rt.flags;
    const g = enemyGroup(rt, { faction: 'toyotomi', name, fixed: true, anchor: { x: at.x, z: at.z }, facing: o.facing ?? Math.PI / 2, width: o.width || 6, noRout: true, formation: 'line',
      morale: o.morale || 95, dmgMult: o.dmg || 0.55, order: o.hold ? 'hold' : 'attack', seekRange: o.hold ? 16 : 90, aggro: o.hold ? 12 : 16, speed: 3.8, fire: true }, saD(list));
    // 11/18 クラウド 上田の持ち主（act bot「23人を無傷で」・受けた傷は鉄砲だけ）：真田の槍と刀は本人へは八割五分で当てる（味方へは元の五割五分のまま・数は変えない）
    g.dmgMultPlayer = o.dmgP ?? 0.85;
    if (o.aim) {
      // 田へ向かう隊も門から直進せず、小路を通る。町屋に残った兵の到着を待ち続けない。
      const route = [...(at.x < GATE.x ? [{ x: GATE.x + 7, z: GATE.z }] : []), ...(o.via || []), o.aim];
      let leg = 0;
      g.order = 'move'; g.dest = { ...route[0] };
      g.onArrive = function advance(q) {
        if (q.order !== 'move') return;
        if (++leg < route.length) { q.dest = { ...route[leg] }; q.onArrive = advance; }
        else { q.order = 'attack'; q.dest = null; }
      };
    }
    // 追い討ちは岸の本人と接敵するまで退かない。隊の中心だけが岸へ着いて散ると、殿の相手が来なくなる。
    if (!o.hold) rt.after(40, () => { if (!g._keep) g.noRout = false; });   // 誘い・荷駄の襲いの小隊は崩れず、自分で退く（_keep）
    g._bornT = rt.t;
    F.foes.push(g);
    return g;
  },
  // 城の内へ退かせる（門をくぐったら去らせる）
  back(g) {
    if (!live(g)) return;
    // 往路の到着処理を残すと、城へ着いた後に町屋や川岸へ再出撃してしまう。
    g.onArrive = null;
    g.order = 'retreat'; g.dest = { x: GATE.x - 12, z: GATE.z }; g.speed = 4.3; g.aggro = 0; g.noRout = false;
    // 北の林や田から本丸へ直進すると北の土塀に当たる。城外の隊は、出撃時と同じ門の口を通って戻る。
    if (g.center().x >= GATE.x) {
      // 岸から門へ直進すると町屋（72,-8）を横切る。信繁も出撃時の東の道を戻る。
      const c = g.center();
      const route = c.x > 68 && c.z > -40 ? [TOWN_EXIT, FRONT, GATE_EXIT] : [GATE_EXIT];
      let leg = 0;
      g.dest = { ...route[0] };
      g.onArrive = function advance(q) {
        if (q.order !== 'retreat') return;
        if (++leg < route.length) { q.dest = { ...route[leg] }; q.onArrive = advance; return; }
        q.dest = { x: GATE.x - 12, z: GATE.z };
        q.onArrive = null;
      };
    }
  },

  toStep(rt, n) {
    const F = rt.flags;
    if (F.step >= n || F.ending) return;
    if (F.step) rt.objDone('s' + F.step);
    F.step = n; F.stepT = rt.t;
    rt.obj('s' + n, STEP_TEXT[n], 'main');
    const go = (g, p, then = 'hold', sp = 3.8, via = []) => {
      if (!live(g)) return;
      const c = g.center();
      // 救援・撤収も城下の東の道へ出る。門前から岸へ斜めに向かうと町屋に突き当たる。
      const exit = n >= 5 && c.x < 68 && p.x >= 68
        // 11/18 23:15 クラウド 上田の持ち主（act bot の止まり「231s 本多忠政の先手 ord=move at(46,-38) 敵が遠く歩けず」）：
        //   門前の南（z<-34）から町屋の出口へ斜めに行くと、通りの南の町屋に突き当たって二十秒立った。門前の外れを経て通りに乗る
        ? [...(c.z < -40 ? [LANE_A, LANE_B, FRONT] : c.x < FRONT.x || (c.z < -34 && c.x < 56) ? [FRONT] : []), TOWN_EXIT] : [];
      const route = [...exit, ...via, p];
      let leg = 0;
      // 移動中に将の突撃へ釣られず、小路は縦隊で通る。到着後は元の陣形で接敵する。
      g.keepMoveOrder = true; g.march = true; g.focus = null;
      g.order = 'move'; g.dest = { ...route[0] }; g.speed = sp; g._uedaThen = then;
      g._uedaLegAt = rt.t;
      g.onArrive = function advance(q) {
        if (q.order !== 'move') return;
        q._uedaLegAt = rt.t;
        if (++leg < route.length) { q.dest = { ...route[leg] }; q.onArrive = advance; }
        else { q.order = then; q.anchor = { ...p }; q.dest = null; q.keepMoveOrder = false; q.march = false; }
      };
    };
    if (n === 1) {
      // 2:00 真田が出てくる：信繁の手の若い者の小隊が大手門から打って出て、北の田の刈田の衆を襲う
      sfx('horagai', 0.8);
      // 11/19 06:50 クラウド 上田の持ち主（act bot 段1の本人の討ち取り 1・0・1：小隊三十二人が五十五秒に一度に着き、本人は囲まれて避ける間に段2へ移った）：
      //   段4の門の槍・段5の荷駄と同じく、数と強さは変えず二度に分けて打って出す（二の手は十二秒後に門から）。誘い（段2）は一の手が担い、二の手は林の殿へ退く
      const sortOpt = () => ({ aim: { x: KARI.x - 4, z: KARI.z + 2 }, via: [FRONT, LANE_B, LANE_A], width: 7, morale: 100 });
      F.sortie = this.foe(rt, '打って出た真田の小隊', { x: GATE.x - 6, z: GATE.z - 2 }, [uS(3), uA(11), uG(3)], sortOpt());
      F.sortie.noRout = true; F.sortie._keep = true;
      F.w1A = aliveN(F.sortie); F.w1N = F.w1A + 15; F.k1 = rt.stats?.kills || 0;
      F.sortieB = null;
      rt.after(12, () => { if (F.step !== 1 || F.ending) return; F.sortieB = this.foe(rt, '打って出た真田の小隊', { x: GATE.x - 6, z: GATE.z - 2 }, [uS(2), uA(11), uG(2)], sortOpt()); F.sortieB.noRout = true; F.sortieB._keep = true; });
      // 11/18 07:55 クラウド 上田の持ち主（描かずの書き出し：本多・大久保が寄せ五十歩で町屋の小路 (45,-45) へ迎えに出て、
      //   真田の小隊は刈田（本人の居る北の田）へ着く前に討たれ、本人は段1・段2で討ち取り0だった）。田の東の脇で待ち、田へ来た真田を迎え撃つ
      F.honda.order = 'attack'; F.honda.seekRange = 16; F.honda.anchor = { x: KARI.x + 12, z: KARI.z + 4 };
      //   大久保は南の道から来ると小路で真田の前を塞ぐので、田の東（本多の後ろ）へ回る
      F.okubo.order = 'attack'; F.okubo.seekRange = 12; F.okubo.anchor = { x: KARI.x + 18, z: KARI.z + 8 };
      // 11/18 08:58 クラウド 上田の持ち主（act bot 4回のうち段1の本人の討ち取り0が3回・味方の討ち取り93〜98）：刈田と追撃の間（段1・段2）だけ、
      //   本人の組でない味方（牧野・本多・大久保）の刃を四割半に（三木の出城と同じ形）。数と強さの見た目は変えず、真田の小隊は本人の前まで残る。段3で元へ
      for (const g of [F.makino, F.honda, F.okubo]) if (g && g._dm0 == null) { g._dm0 = g.dmgMult ?? 1; g.dmgMult = g._dm0 * 0.45; }
      // 早く押し返して追撃へ進んだ後に、田へ戻す古い下知を出さない。
      rt.after(3, () => { if (F.step === 1 && !F.ending) rt.say('牧野康成', '城の門が開いた！　真田が刈田を襲うて来るぞ！', 3); });
      rt.after(7, () => { if (F.step === 1 && !F.ending) rt.say('本多忠政', '出て来たわ。田へ走れ、真田勢を退けよ！', 3); });
    } else if (n === 2) {
      // RETREAT→LURE：真田は城と逆の北へ、畦・田・林の間の細い道を、追えば追える間合いでちょこちょこ逃げる
      F.lureI = 0; F.lureT = rt.t;
      const g = F.sortie;
      if (live(g)) { g.noRout = true; g.morale = 100; this.lureNext(rt); }
      if (g?.units.some((u) => u.alive && !u.gone)) {
        rt.say('徳川の足軽', '逃げるぞ！　逃すな！', 2.6);
        rt.after(3.5, () => rt.say('大久保忠隣', '追え、追え！　小勢じゃ、揉み潰せ！', 3));
        rt.after(10, () => rt.say('徳川の足軽', 'ははっ、真田も口ほどにもない！', 2.8));
      } else {
        rt.say('本多忠政', '田は押さえた！　北の林を確かめよ！', 3);
      }
      // 11/18 15:05 クラウド 上田の持ち主（描かずの数え：田の小隊が八十秒までにほぼ討たれ、追撃の段の九十秒に本人の60m内の敵0〜3・K281）：
      //   林の奥（誘いの道の先）から殿の一隊が林の口へ出て、畦の上の徳川を槍と鉄砲で待つ。囲みの段で伏兵と共に撃ち、共に林へ去る
      F.lureRear = this.foe(rt, '林の口の真田の殿', { x: LURE[4].x + 2, z: LURE[4].z - 6 }, [uS(2), uA(10), uG(4)], { hold: true, width: 7, dmg: 0.5, dmgP: 1.1, facing: Math.PI / 4 });   // 本人へは一割増し（act bot「無傷で24人」）
      F.lureRear.order = 'move'; F.lureRear.dest = { x: TRAP.x + 5, z: TRAP.z + 4 }; F.lureRear.seekRange = 0;
      F.lureRear.onArrive = (q) => { if (q.order === 'move') { q.order = 'hold'; q.dest = null; q.anchor = { x: TRAP.x + 5, z: TRAP.z + 4 }; q.seekRange = 20; } };
      // 段1の二の手は誘いの道を先に林の口へ退き、殿と並ぶ（囲みの段で共に撃ち、共に去る）
      if (live(F.sortieB)) { const b = F.sortieB; b.order = 'move'; b.dest = { x: TRAP.x - 4, z: TRAP.z + 4 }; b.seekRange = 0; b.onArrive = (q) => { if (q.order === 'move') { q.order = 'hold'; q.dest = null; q.anchor = { x: TRAP.x - 4, z: TRAP.z + 4 }; q.seekRange = 20; } }; }
      // 本多・大久保の手も追う。追ううちに隊列が田の畦に細く伸びる
      for (const [g2, dx] of [[F.honda, 4], [F.okubo, 10]]) if (live(g2)) { g2.order = 'attack'; g2.seekRange = 18; g2.anchor = { x: LURE[1].x + dx, z: LURE[1].z + 6 }; }
    } else if (n === 3) {
      // AMBUSH：細い道の左右の林から鉄砲、前の真田は向き直る（「追わされた」）
      F.ambT = rt.t;
      for (const g of [F.makino, F.honda, F.okubo]) if (g && g._dm0 != null) { g.dmgMult = g._dm0; g._dm0 = null; }
      const inTrap = dist(rt.player.u.pos, TRAP) < 26;
      F.delay += inTrap ? 18 : 10;
      sfx('volley', 1);
      rt.after(0.6, () => sfx('volley', 0.8));
      F.ambL = this.foe(rt, '林の伏兵', { x: TRAP.x - 13, z: TRAP.z + 2 }, [uS(2), uG(6)], { hold: true, width: 6, dmg: 0.5, facing: Math.PI / 2 });
      F.ambR = this.foe(rt, '林の伏兵', { x: TRAP.x + 13, z: TRAP.z + 2 }, [uS(2), uG(6)], { hold: true, width: 6, dmg: 0.5, facing: -Math.PI / 2 });
      // 林の射手はこの段の下知で撃って退く。共通の立て直しで射撃を止めない。
      for (const g of [F.ambL, F.ambR]) { g.seekRange = 26; g.aggro = 10; g.noAI = true; }
      if (live(F.sortie)) { const s = F.sortie; s.onArrive = null; s.order = 'attack'; s.seekRange = 22; s.aggro = 14; s.speed = 3.8; }
      for (let i = 0; i < 5; i++) rt.army.smoke(TRAP.x - 12, rt.world.heightAt(TRAP.x - 12, TRAP.z) + 1.4, TRAP.z - 6 + i * 3, 1, 0);
      for (let i = 0; i < 5; i++) rt.army.smoke(TRAP.x + 12, rt.world.heightAt(TRAP.x + 12, TRAP.z) + 1.4, TRAP.z - 6 + i * 3, 1, 0);
      rt.after(0.8, () => rt.say('徳川の足軽', '左右の林から撃って来た！', 2.6));
      rt.after(4, () => rt.say('本多忠政', '追わされたか……！　田まで退け、囲みを抜けよ！', 3.2));
      rt.after(9, () => rt.say(NOBU, '深追いは無用。少し削れば、それでよい', 3));
      // 55秒で伏兵は林へ去る（殺し尽くさない。時を奪えばよい）
      rt.after(55, () => { for (const g of [F.ambL, F.ambR, F.sortie, F.sortieB, F.lureRear]) this.away(rt, g, { x: 46, z: -136 }); });
      for (const [g2, p] of [[F.honda, { x: OUT.x - 4, z: OUT.z - 2 }], [F.okubo, { x: OUT.x + 8, z: OUT.z + 4 }]]) rt.after(8, () => go(g2, p, 'attack'));
    } else if (n === 4) {
      // 7:00 城を直接攻める：門と土塀へ短く圧力。一時はかなり近づける
      for (const g of [F.ambL, F.ambR, F.sortie, F.sortieB, F.lureRear]) this.away(rt, g, { x: 46, z: -136 });
      sfx('taiko', 1);
      if (F.hideU) F.hideU._crouch = false;   // 本陣の秀忠が床几から立つ
      rt.say('本多忠政', '……追うては戻るばかり。また時を失うたわ', 3);
      rt.after(3.4, () => rt.say('秀忠の使番', '美濃の方より急使！　「先を急がれよ」との事！', 3.4));
      rt.after(7.2, () => rt.say('徳川秀忠', '外へ出て来るなら、もう城を落とす。大手門へかかれ！', 3.4));
      // 門前の持ち場で出撃兵を迎える。「攻めよ」の三十五歩の寄せで塀内の射手を追わせない。
      for (const [g, p] of [[F.honda, { x: FRONT.x + 8, z: FRONT.z - 6 }], [F.okubo, { x: FRONT.x + 8, z: FRONT.z + 6 }], [F.makino, { x: TOWN.x + 6, z: TOWN.z - 14 }]]) { go(g, p, 'hold', 3.8, g === F.makino ? [] : [LANE_A, LANE_B, FRONT]); if (live(g)) g.seekRange = 14; }
      // 榊原の騎馬は南の町屋（46,-18）に隊列の端を埋めず、東の道で二の手を保つ。
      go(F.saka, { x: 64, z: -24 }, 'hold', 3.8, [{ x: 88, z: -14 }, { x: 72, z: -14 }]);
      F.reAt = 0;
    } else if (n === 5) {
      // 9:00 また後ろから真田：荷駄が襲われ、城攻めを止められる（「あと少しだったのに」）
      sfx('horagai', 0.7);
      F.frontExited = rt.player.u.pos.x >= FRONT.x + 6 && rt.player.u.pos.z >= LANE_B.z;
      F.townExitReached = rt.player.u.pos.x >= 68;
      for (const g of [F.yari, F.yariB, F.yari2, F.re]) this.back(g);
      F.delay += 15;
      // 11/19 06:00 クラウド 上田の持ち主（描かずの足跡 05:46・05:49：荷駄の小隊二十二人が一度に本人へ寄り、本人は四人以上に囲まれて避け続け、
      //   門の前・田の方へ退いた＝段5の本人の討ち取り 0・1・2・0）：段4の門の槍と同じく、数と強さは変えず二度に分けて襲わせる（二の手は十二秒後）
      const raidOpt = () => ({ aim: { x: NIDA.x - 2, z: NIDA.z + 4 }, width: 6, morale: 100, dmg: 0.5 });
      F.raid = this.foe(rt, '荷駄を襲う真田の小隊', RAID, [uS(3), uA(9), uG(3)], raidOpt());   // 11/18 クラウド K365：十六人では荷駄の前で味方に一息で討たれ、本人の40m 内の敵が1人だった。二十八人に
      F.raid.noRout = true; F.raid._keep = true;
      F.w5A = aliveN(F.raid); F.w5N = F.w5A + 13; F.nidaAt = 0; F.k5 = rt.stats?.kills || 0;
      F.raidB = null;
      rt.after(12, () => { if (F.step !== 5 || F.raidGone) return; F.raidB = this.foe(rt, '荷駄を襲う真田の小隊', RAID, [uS(2), uA(9), uG(2)], raidOpt()); F.raidB.noRout = true; F.raidB._keep = true; });
      // 11/18 14:50 クラウド 上田の持ち主（夜50-41 の描かずの通し：200秒＝荷駄の段で本人の30〜60m の敵0・K281）：
      //   荷駄を襲う小隊は本人の前で一息に討たれ、その後ろに敵が居なかった。尼ヶ淵の岸の藪から二の手（鉄砲と槍）を出し、
      //   荷駄から四十〜五十歩の岸の上で二十秒ほど撃ってから荷駄へ寄せる（後ろの層。段の進みには数えない・小隊と共に退く）
      // 11/18 22:50 クラウド 上田の持ち主 ⑥（gate4 写真 中前・中右：川の上に赤い▼だけが浮き、下に兵が見えない）：
      //   二の手は尼ヶ淵の向こう岸（86,60）から出て、川の中（80,38＝流れの真ん中から三歩）に立ち、深さ1.4m の水に体が沈んでいた。
      //   出る所も立つ所も、手前の岸の上（流れの縁から五歩）に置く。荷駄からの間合いは四十歩のまま
      F.raid2 = this.foe(rt, '岸の藪から撃つ真田の二の手', { x: 88, z: 31 }, [uG(8), uA(12), uS(2)], { hold: true, width: 8, dmg: 0.45, facing: -Math.PI / 2 });
      F.raid2.noRout = true; F.raid2._keep = true; F.raid2.order = 'move'; F.raid2.dest = { x: 78, z: 32 };
      F.raid2.onArrive = (q) => { if (q.order === 'move') { q.order = 'hold'; q.dest = null; q.anchor = { x: 78, z: 32 }; q.seekRange = 34; } };
      rt.after(30, () => { if (live(F.raid2) && !F.raid2._away && F.step === 5) { F.raid2.onArrive = null; F.raid2.order = 'attack'; F.raid2.seekRange = 90; F.raid2.aggro = 16; } });
      rt.say('秀忠の使番', '後方に真田勢！　荷駄が襲われております！', 3.2);
      rt.after(3.6, () => rt.say('徳川の足軽', 'あと少しだったのに！　……またかよ', 2.8));
      rt.after(7.5, () => rt.say('本多忠政', '荷駄を失えば西へは上れぬ。戻れ！　深追いはするな', 3.2));
      rt.after(14, () => rt.say('徳川秀忠', 'またか……！　城一つに、何刻かけておる', 3));
      // 11/18 クラウド 上田の持ち主（act bot「本多忠政の先手の兵が門の前 (44,-30) から町屋の出口へ二十秒動かない・近い味方1.2m」）：
      //   大久保の手の持ち場 (56,-26) が門の前から町屋の出口への道の上で、荷駄へ急ぐ本多の兵がその槍衾に詰まった。道の北の空き地（66,-32）へ退ける
      go(F.okubo, { x: FRONT.x + 26, z: FRONT.z - 2 });
      go(F.saka, { x: 72, z: -22 });
      go(F.honda, { x: NIDA.x - 8, z: NIDA.z - 4 }, 'attack');
      // 11/18 クラウド 上田の持ち主（cloud-10 見回りの「敵を前に20秒止まった」）：信之の手は持ち場（94,-44）で寄せ八歩のまま、
      //   二十三歩先へ荷駄の真田が来ても槍を構えて立ち尽くした。持ち場は動かさず、二十五歩の内に来た寄せ手だけ迎え撃つ
      if (live(F.nobu)) F.nobu.seekRange = 25;
    } else if (n === 6) {
      // 11:00 関ヶ原から急使。攻めを止め、神川の岸に兵をまとめる。真田は無理に追わない
      sfx('horagai', 0.9);
      for (const g of [F.raid, F.raidB]) if (live(g)) this.away(rt, g, { x: 86, z: 56 });
      if (live(F.raid2)) this.away(rt, F.raid2, { x: 90, z: 64 });
      // 刈田の小競り合いと急使の到着は別の日。日付を先に示し、声を順に読める間を残す（critic60 X15・U4）。
      rt.banner('九月八日', '');
      rt.after(1.2, () => rt.say('秀忠の使番', '内府様より急使！　「上田にかかずらわず、急ぎ美濃へ上られよ」！', 4));
      rt.after(5.6, () => rt.say('徳川秀忠', '……ここまで来て、退くのか。……いや。攻めを止めよ。西へ急ぐ', 3.6));
      rt.after(10.2, () => rt.say('本多忠政', '負うた者を担げ。鉄砲と荷駄を先に、神川の岸へまとまれ！', 3.4));
      rt.after(16.2, () => rt.say('真田昌幸', '追うな。時は奪うた。それでよい', 3));
      // 集合先は全隊とも西岸。東へ足すと神川（半幅十二歩）の水中に並んでしまう。
      // 11/17 クラウド 上田の持ち主（③：200秒の写真で岸に本人一人・向こう岸に幟が数本だけ＝cloud-08 の見回り）：
      //   榊原の隊は西岸でなく浅瀬の東の口へ渡し、渡る兵を受ける殿の構えで西を向いて並ばせる（本物の兵。数は変えない）。
      //   集まりは急ぎ足（3.7→4.2）にして、本人が岸に着く頃に諸隊が揃って見えるようにする
      for (const [g, p] of [[F.okubo, { x: FORD_W.x - 8, z: -14 }], [F.makino, { x: FORD_W.x - 12, z: 22 }], [F.honda, { x: FORD_W.x - 2, z: FORD_W.z - 6 }], [F.nobu, { x: FORD_W.x - 8, z: FORD_W.z + 8 }]]) go(g, p, g === F.honda ? 'attack' : 'hold', 4.2);
      if (live(F.saka)) { const sc = F.saka.center(); go(F.saka, { x: FORD_E.x - 4, z: -10 }, 'hold', 4.2, sc.x < FORD_E.x - 3 ? [{ x: FORD_W.x, z: FORD_W.z - 4 }, { x: FORD_E.x, z: FORD_E.z - 4 }] : []); }
      if (live(F.nida)) go(F.nida, { x: FORD_W.x - 4, z: 4 }, 'hold', 3.2);
      // 11/18 22:10 クラウド 上田の持ち主（⑥②「神川の渡りで本人ひとり川の中・左右が空」：描かずの数え＝本人が川の中の時、十歩内の味方0〜5人。
      //   殿の榊原は渡りの口から南へ二十二歩、諸隊は西岸の後ろで、本人だけが先に川へ入った）：本多の下知「鉄砲と荷駄を先に」の通り、
      //   荷駄は下知の後に先に渡って東岸の口の北に控え、榊原は口の南の脇で受ける。本人は両の手の間を渡る。数は変えない
      rt.after(14, () => { if (F.step === 6 && live(F.nida)) go(F.nida, { x: FORD_E.x - 6, z: FORD_E.z + 9 }, 'hold', 3.2, [{ x: FORD_W.x, z: FORD_W.z + 4 }, { x: FORD.x, z: FORD.z + 4 }]); });
      F.rallyAt = 0;
      // 11/18 クラウド K365（ジャーニー⑥「城から新手が出て町屋の道を追って来る（姿が見える距離で）」）：岸の段の間、本人の40m 内の敵が0人で、
      //   岸に立つだけだった。門の内から追い討ちの一組を出し、町屋の東の道を岸まで追わせる（崩れず、⑦で城へ戻る）
      // 11/18 クラウド 上田の持ち主（描かずの書き出し：門の内から出た追い討ちが岸へ着くのに七十秒かかり、本人は岸で六十秒ひとりで待った＝「斬り合う相手が少なくて退屈」）：
      //   門の前の道は退く本多・大久保の手で詰まり、門を出た所から出しても町屋で味方とぶつかって進めなかった。
      //   一の段で真田が打って出た北の田（味方の居ない所）から、田の東の畦を岸へ急ぎ足で追わせ、二十秒ほどで岸へ届かせる。数は変えない
      F.chase = this.foe(rt, '追い討ちの真田勢', { x: KARI.x, z: KARI.z }, [uS(5), uA(22), uG(4)], { aim: { x: FORD_W.x - 6, z: FORD_W.z - 2 }, via: [{ x: 88, z: -30 }], width: 7, morale: 100, dmg: 0.45, facing: Math.PI * 0.3 });
      F.chase._keep = true; F.chase.speed = 4.7;
      rt.after(19.6, () => { if (F.step === 6 && live(F.chase)) rt.say('徳川の足軽', '北の田から真田が追うて来る！', 2.6); });
      // 信繁の手が一度だけ後衛へ出て、一撃してすぐ退く（一騎打ちにしない）。22秒後では岸の段の間に届かなかったので12秒後に
      //   11/18 20:55 同上：門から岸まで五十秒かかり、着いて十秒で段が明けた。12→6秒後に出して、岸で斬り合う間を残す
      rt.after(6, () => {
        const nb = F.nobushige;
        if (!live(nb) || F.step !== 6) return;
        F.nbOut = rt.t;
        nb.stay = false; nb.noAI = false;
        // 門内の土塀（x=10）の南の開口を、隊列の幅も空けて回る。
        // 門の外でも岸へ直進せず、町屋の北を通って荷駄の道へ出る。
        const route = [{ x: GATE.x - 6, z: GATE.z + 10 }, { x: GATE.x - 6, z: GATE.z }, { x: GATE.x + 7, z: GATE.z }, FRONT, { x: 72, z: -14 }, { x: FORD_W.x - 10, z: FORD_W.z - 2 }];
        // 11/18 20:55 クラウド 上田の持ち主（描かずの足跡：信繁の手が門内の土塀の角 (11,-29) と東の塀の内 (22,-15〜-24) に六十五秒詰まり、
        //   岸の段で本人の二十歩内の敵が0のまま七十五秒立つだけだった）：曲がり角ごとに move の行き先を替えると、遅れた兵が次の角へ塀を
        //   またいで直進し塀に貼り付いた。道順（path）の縦列で角を一つずつ通し、着いたら本人へ掛かる。数と強さは変えない
        nb.formation = 'column'; nb.colW = 2;
        nb.order = 'path'; nb.path = route.map((p) => [p.x, p.z]); nb.pathIdx = 0; nb.dest = { ...route[route.length - 1] }; nb.anchor = { ...route[0] }; nb.speed = 4.4; nb.seekRange = 0; nb.aggro = 0;
        nb.onArrive = (q) => {
          if (F.step !== 6 || F.nbBack) { q.onArrive = null; return; }
          F.nbAt = rt.t;
          q.order = 'attack'; q.seekRange = 20; q.aggro = 14; q.onArrive = null;
        };
        rt.say('徳川の足軽', '城から騎馬が来る！　六文銭じゃ！', 2.8);
      });
    } else if (n === 7) {
      // 13:00 関ヶ原へ急ぐ：撤退でなく行軍
      sfx('horagai', 0.7);
      F.crossedRiver = rt.player.u.pos.x >= FORD_E.x - 3;
      if (live(F.nobushige) && !F.nbBack) { F.nbBack = true; this.back(F.nobushige); }
      // 追い討ちは城へ戻さず（町屋の口で本人が追って撃ち続け、⑦が十分止まった）、北の藪へ去らせ、狙いから外す
      if (live(F.chase)) { this.away(rt, F.chase, { x: 86, z: 66 }); for (const u of F.chase.units) u.noTarget = true; }
      // 11/17 クラウド kaito2：⑦で本人が城下の北（73,-43）・町屋の口（75,-11）に立ち、城の内や藪の真田を鉄砲で狙い続けて
      //   中山道へ向かわず、act bot が二度 1080 秒の時切れになった（cloud-06 の全戦の流し・自分の流し）。⑦は戦わずに西へ急ぐ段なので、
      //   残る真田の兵は狙いの外にする（真田は無理に追わない＝ueda2_spec の 11:00〜）
      F.noTgt7 = () => { for (const u of rt.army.units) if (u.team === 1 && u.alive && !u.noTarget) u.noTarget = true; };
      F.noTgt7();
      rt.say('本多忠政', '川を渡れ。中山道を西へ、夜通し駆けるぞ', 3);
      rt.after(5, () => rt.say('徳川の足軽', '……もう遅れておるのではないか', 2.6));
      // 11/17 K355 iMac n-kwatch（センゴク権兵衛 27巻から：退路の神川の上の堰を真田が切り、増えた水の中を退いた＝第二次上田の「濁流からの退却」）。
      //   まだ渡っていない時だけ、遠い地鳴り（雷の低い音）と声一つで、急いで渡る訳を足す（川の形と深さは変えない）
      rt.after(9, () => {
        if (F.ending || rt.over || F.crossedRiver) return;
        sfx('thunder', 0.45);
        rt.say('徳川の足軽', '上の堰が切られたぞ！　神川の水が増える、早う渡れ！', 3.2);
      }, true);
      // 11/18 クラウド kaito2（⑥初めての人の目「⑦の行軍の先に長い兵列が見えない」）：諸隊が中山道の一点（MARCH の先）に固まり、
      //   街道を西へ急ぐ列に見えなかった。街道の道筋（MARCH から北の先へ）に沿って、秀忠の本陣を先頭に隊を九歩ごとに並べ、
      //   渡った本人の前に長い縦列が続くようにする（本物の兵のまま。数は変えない）
      const RD = { x: 10 / Math.hypot(10, 40), z: 40 / Math.hypot(10, 40) }, ROAD_MID = { x: MARCH.x - 20, z: MARCH.z - 40 };
      const k = [[F.hide, 80], [F.saka, 70], [F.honda, 60], [F.okubo, 51], [F.makino, 42], [F.nobu, 33], [F.nida, 24], [F.mine, 12]];
      k.forEach(([g, s], i) => {
        if (!live(g)) return;
        g.stay = false;
        // 11/18 22:20 クラウド 上田の持ち主：段6で先に渡った荷駄（東岸の口 126,13）が FORD_E の手前と見なされ、西岸へ戻って渡り直していた。川の真ん中より東は渡らない
        const via = g.center().x < FORD.x ? [FORD_W, FORD_E, ROAD_MID] : [];
        const side = (i % 2 ? 1.5 : -1.5);
        go(g, { x: MARCH.x + RD.x * s + RD.z * side, z: MARCH.z + RD.z * s - RD.x * side }, 'hold', 3.6, via);
      });
      // 11/18 クラウド 上田の持ち主（⑥初めての人の目：⑦の写真で街道の列が二人並びの細い一筋・③太い塊）：神川の東の後詰（本物の兵 約百六十・五隊）が
      //   ⑦の間ずっと岸の南北に立ったままで、渡った本人の前を行くのは二十人足らずの隊ばかりだった。後詰も街道へ入れ、本隊の列の脇の二筋目を歩かせて
      //   幅のある長い行軍に見せる（本物の兵のまま・数は変えない。後詰は既に東岸なので浅瀬は通らない）
      rt.army.groups.filter((g) => g.team === 0 && /後詰/.test(g.name || '') && live(g)).sort((a, b) => b.center().z - a.center().z).forEach((g, i) => {
        g.stay = false; g.noAI = false;
        const s = 18 + i * 15, side = i % 2 ? 7 : -7;
        go(g, { x: MARCH.x + RD.x * s + RD.z * side, z: MARCH.z + RD.z * s - RD.x * side }, 'hold', 3.6);
      });
    }
  },

  // 真田の小隊の LURE：寄られたら次の所へ退き、着いたら向き直って撃つ（HARASS）。追えば追える間合いを保つ
  lureNext(rt) {
    const F = rt.flags, g = F.sortie;
    if (!live(g) || F.lureI >= LURE.length) return;
    const p = LURE[F.lureI];
    g._lureDetour = false;
    g.order = 'move'; g.dest = { ...p }; g.anchor = { ...p }; g.speed = 3.9; g.aggro = 0; g.seekRange = 0;
    g.onArrive = (q) => { q.order = 'hold'; q.aggro = 6; q.seekRange = 12; q.onArrive = null; F.lureAt = rt.t; F.lureI++; };
    F.lureMoveT = rt.t;
  },
  lureTick(rt) {
    const F = rt.flags, g = F.sortie;
    if (F.step !== 2 || !live(g)) return;
    const c = g.center();
    if (g.order === 'move') {
      // 迂回しても進めない小隊は林へ離脱する。到着処理だけを待ち続けない。
      if (rt.t - F.lureT > 75 && F.lureI < LURE.length) {
        this.away(rt, g, { x: 46, z: -136 });
        F.lureI = LURE.length;
        return;
      }
      // 引っかかったら（二十秒進まない）次の所へ自動で退く（詰まり止め③）
      if (rt.t - F.lureMoveT > 20) {
        F.lureMoveT = rt.t;
        // 離れた所でも兵を瞬時に移さない。誘いを打ち切って林へ歩かせ、到着待ちで話も止めない。
        if (dist(c, rt.player.u.pos) > 45) {
          this.away(rt, g, { x: 46, z: -136 });
          F.lureI = LURE.length;
          return;
        }
        else if (!g._lureDetour) {
          // 迂回中に再び詰まっても到着処理を重ねない。重ねると自分自身を戻し続け、追撃が進まなくなる。
          const d = g.dest, arrived = g.onArrive;
          g._lureDetour = true;
          g.dest = { x: KARI.x + 2, z: KARI.z - 4 };
          g.onArrive = (q) => { q.dest = d; q.onArrive = arrived; q._lureDetour = false; };
        }
      }
      return;
    }
    if (F.lureI >= LURE.length) return;
    let dmin = 1e9;
    for (const u of rt.army.units) if (u.team === 0 && u.alive && !u.gone && !u.fleeing) { const d = dist(u.pos, c); if (d < dmin) dmin = d; }
    // 寄られたら退く。誰も来ない時も、十八秒で次の所へ（追わなくても話は進む⑥）
    if (dmin < 12 || rt.t - (F.lureAt || 0) > 18) {
      if (F.lureI === 1) rt.say('真田の足軽', '徳川の大軍も、この小勢を追い切れぬか！', 2.8);
      this.lureNext(rt);
    }
  },
  // DISENGAGE：林・城へ去り、着いたら消える（本物の兵の枠を空ける）
  away(rt, g, to) {
    if (!live(g)) return;
    g.onArrive = null; g.order = 'retreat'; g.dest = { ...to }; g.anchor = { ...to }; g.speed = 4.4; g.aggro = 0; g.seekRange = 0; g.noRout = true; g._away = true;
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    const P = rt.player;
    P.u.invuln = true;
    for (const g of F.foes) if (g !== F.masa && !g.wallShot && g !== F.gateRear) this.back(g);
    // 最後の絵：振り返ると、遠くに無傷の上田城と六文銭の旗、その前に小さく真田の兵
    F.gateRear = this.foe(rt, '大手門の前の真田の兵', { x: GATE.x + 8, z: GATE.z }, [uS(2), uA(6)], { hold: true, width: 5 });
    F.gateRear.noAI = true; F.gateRear.stay = true; F.gateRear.aggro = 0; F.gateRear.seekRange = 0;
    sfx('horagai', 0.5);
    const late = (F.delay || 0) >= 45;
    rt.after(1, () => rt.say('真田信之', '……父上……。', 2.6));
    const talk = [this.talk.after[0], late ? ['徳川秀忠', '……遅れた。美濃の戦に、間に合うか。木曽路を急げ'] : ['徳川秀忠', '……まだ間に合うやもしれぬ。木曽路を急げ']];
    // 締め：急使・陣払い・「関ヶ原に間に合わず」（k05/end.js が finish を呼ぶ）。段の済み・手柄は締めの直前に
    rt.after(4, () => endScene(rt, { armies: F.sometai, talk, done: () => {
      F.won = true;
      F.victoryShown = true;   // 共通の勝鬨と祝勝の動きを重ねない（静かに去る戦）
      rt.objDone('s' + LAST);
      rt.tracker.main = true;
      const good = (F.delay || 0) < 45;
      rt.award((t) => { t.main = true; t.special = { label: good ? '真田に釣られず兵をまとめた' : '上田から兵をまとめて退いた', pts: good ? 25 : 15 }; }, good ? '真田に釣られず兵をまとめた' : '上田から兵をまとめて退いた');
    } }));
  },

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick?.(rt);
    this.gateTick(rt, dt);
    parkPcBlocks(rt);
    if (F.ending || !F.step) return;
    const P = rt.player.u;
    // 田で待った時間だけで出撃を打ち切らない。小隊が届いてから斬り合う間を取る。
    if (F.step === 1 && dist(P.pos, KARI) < 20 && [F.sortie, F.sortieB].some((g) => g?.units.some((u) => canFight(u) && dist(u.pos, P.pos) < 14))) F.kariJoined = (F.kariJoined || 0) + dt;
    if (F.step === 4 && F.atFront && (dist(P.pos, FRONT) < 32 || dist(P.pos, GATE) < 34)) F.reAt += dt;
    if (F.step === 5 && dist(P.pos, NIDA) < 18) F.nidaAt += dt;
    if (F.step === 6 && dist(P.pos, FORD_W) < 24) F.rallyAt += dt;   // 11/18 クラウド 上田の持ち主：十六歩では岸で追い討ちと斬り合う間に輪の外へ出て、段6が刻限の百二十秒まで続いた
    if (F.step === 7 && P.pos.x >= FORD_E.x - 3) F.crossedRiver = true;
    // 手勢は本人の脇に付いて一緒に走る
    if ((F.mineT = (F.mineT || 0) - dt) <= 0) {
      F.mineT = 0.6;
      const g = F.mine, c = live(g) && g.center();
      if (c && F.step < LAST) {
        // 11/18 08:55 クラウド 上田の持ち主（act bot「手勢の足軽が町屋の小路 (53,-38) で行き先 (48,-4) へ20秒動かない」）：
        //   行き先を0.6秒ごとに本人の足元へ付け替えると、兵の詰まりの時計（三歩より大きく行き先が動くと消える）が走る間ずっと消え、
        //   町屋の軒に当たった者が回り込めなかった。行き先は本人が七歩より離れた時だけ付け替える
        if (dist(c, P.pos) > 8) {
          if (g.order !== 'move' || !g.dest || Math.hypot(g.dest.x - P.pos.x - 2, g.dest.z - P.pos.z - 2.5) > 7) { g.order = 'move'; g.dest = { x: P.pos.x + 2, z: P.pos.z + 2.5 }; }
          g.speed = 3.9;
        }
        else { g.order = 'attack'; g.seekRange = 14; }
      }
    }
    // 11/18 クラウド 上田の持ち主（act bot「18人を無傷で討った」：真田の組は味方の隊へ当たり、本人へ来ない）：
    //   攻めの真田の組を一つだけ本人へ向ける（天王寺・岡山口の huntPlayer と同じ形）。数と強さは変えない。将の居る組と城の内の組は向けない。命が六割半を切ったら放す
    if (F.step < LAST) huntPlayer(rt, F, dt);
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.25;
    const el = rt.t - F.stepT, over = el > STEP_MAX[F.step];
    // 小路の角で後列の持ち場が町屋や堀に掛かっても、近くまで来た隊は次の角へ進む。
    // 兵を移さず、要と隊の実位置の両方を確かめてから下知だけを継ぐ。
    // 11/18 クラウド 上田の持ち主（act bot の止まりの書き出し：「荷駄の人足」が106〜131秒に大手門の前 (47〜51,-31〜-45) で攻めの下知のまま立つ）：
    //   人足は荷駄の脇を離れない。段5までに荷駄から十八歩より遠くへ出たら、持ち場へ戻して守りの下知に（兵は移さない・歩いて戻る）
    if (F.step <= 5 && live(F.nida) && F.nida.order !== 'move') {
      const home = { x: NIDA.x - 7, z: NIDA.z };
      if (dist(F.nida.center(), home) > 18) { F.nida.order = 'hold'; F.nida.focus = null; F.nida.dest = null; F.nida.anchor = { ...home }; F.nida.seekRange = 6; F.nida.aggro = 3; }
    }
    for (const g of [F.honda, F.okubo, F.makino, F.saka, F.nobu, F.nida, F.hide]) {
      // 11/18 05:58 クラウド 上田の持ち主（act bot の止まり「榊原康政の隊 ord=move が (65,-23) に六十秒」・三回に二回）：
      //   着いた時の継ぎ（onArrive）が別の下知の間に空振りして、行き先の上で歩く下知のまま立つ。行き先の四歩内なら守りに替える
      if (live(g) && g.order === 'move' && g.dest && !g.onArrive && g.keepMoveOrder && dist(g.center(), g.dest) < 4) {
        g.anchor = { ...g.dest }; g.order = g._uedaThen || 'hold'; g.dest = null; g.keepMoveOrder = false; g.march = false; continue;
      }
      if (!live(g) || g.order !== 'move' || !g.dest || !g.onArrive || g._uedaLegAt == null || rt.t - g._uedaLegAt < 12) continue;
      // 11/18 クラウド 上田の持ち主（act bot「本多忠政の先手が (51,-28) で行き先 (69,-19) へ20秒動かない」）：
      //   角まで遠くても、十秒で一歩半も進まない隊は次の角へ下知を継ぐ（向きが変わって詰まりが解ける。兵は移さない）
      const gc = g.center();
      if (!g._uedaMv || g._uedaMv.leg !== g._uedaLegAt) g._uedaMv = { leg: g._uedaLegAt, x: gc.x, z: gc.z, t: rt.t };
      else if (rt.t - g._uedaMv.t > 10) {
        const stuck = Math.hypot(gc.x - g._uedaMv.x, gc.z - g._uedaMv.z) < 1.5;
        g._uedaMv = { leg: g._uedaLegAt, x: gc.x, z: gc.z, t: rt.t };
        if (stuck) { const next = g.onArrive; g.onArrive = null; next(g); continue; }
      }
      if (dist(g.anchor, g.dest) < 0.5 && dist(g.center(), g.dest) < 10) {
        const next = g.onArrive;
        g.onArrive = null;
        next(g);
      }
    }
    // 城の内へ退いた真田・林へ去った真田は消す（本物の兵の枠を空ける）
    if ((F.gcT = (F.gcT || 0) - 0.25) <= 0) {
      F.gcT = 1;
      for (const g of F.foes) {
        if (g.order === 'retreat' && !g._away) for (const u of g.units) if (u.alive && !u.gone && insideCastle(u.pos) && u.pos.x < GATE.x - 4) rt.army.despawn(u);
        if (g._away) for (const u of g.units) if (u.alive && !u.gone && (dist(u.pos, g.dest) < 8 || dist(u.pos, P.pos) > 70)) rt.army.despawn(u);
      }
    }
    if (live(F.masa) && F.masa.order !== 'hold') { F.masa.order = 'hold'; F.masa.anchor = { x: C.x + 2, z: C.z }; }
    this.wallFire(rt);
    this.lureTick(rt);
    // 本陣の焦り：時が経つほど使番が増え、秀忠の言葉が短くなる（タイマーの代わり）
    // 段の始めの会話を遮らず、二つの催促も同時に出さない。
    if (el > 35 && rt.t - (F.moodAt ?? -99) > 4) {
      if (!F.mood1 && F.step >= 2 && rt.t > 300) { F.mood1 = true; F.moodAt = rt.t; rt.say('秀忠の使番', '中納言様より。「まだ片付かぬか」との仰せ', 3); }
      else if (!F.mood2 && F.step >= 4 && rt.t > 560) { F.mood2 = true; F.moodAt = rt.t; rt.say('徳川秀忠', '日が傾く……。今日のうちに、ここを抜けねばならぬ', 3.2); }
    }
    if (F.step === 1) {
      // 11/18 16:05 クラウド 上田の持ち主（act bot 3回とも段1の本人の討ち取り0・描かずの足跡：真田の小隊は本人の七歩横を
      //   「歩け」の下知のまま刈田へ通り過ぎ、斬り合わずに段2へ移っていた）：本人か刈田の味方の十六歩内へ来たら、その場で斬り掛かる
      for (const so of [F.sortie, F.sortieB]) if (live(so) && so.order === 'move') {
        const sc = so.center();
        if (dist(sc, P.pos) < 16 || dist(sc, KARI) < 14) { so.onArrive = null; so.order = 'attack'; so.dest = null; so.anchor = { x: sc.x, z: sc.z }; so.seekRange = 22; so.aggro = 16; }
      }
      const k = F.w1N - w1Left(F);
      // 最初は簡単に押せる：三割ほど討つか、田で三十秒ぶつかれば、真田は退く（全滅を条件にしない①）
      //   札の数（KILLS）が満ちたのに段が進まず「5/5」のまま止まって見えないよう、味方の手で三割討った時も進める（11/18 クラウドせ・関所の写真 中152秒）
      // 11/18 16:15 クラウド 上田の持ち主（描かずの足跡：小隊は門から田へ来る間に塀の鉄砲と味方に三割を討たれ、本人と触れて六秒で段2へ移った＝段1の本人の討ち取り0）：
      //   田で触れてからは、本人が二人討つか十八秒ぶつかるまで段を留める
      // 11/18 17:55 クラウド 上田の持ち主（act bot 段1 69秒で討0：小隊が田へ着くのが段の十八秒目で、味方の手で三割＋四十秒の抜け道が
      //   本人の斬り合いの途中で段2へ送っていた）：本人が田で触れた後は、その抜け道を六十二秒に（触れずに居る人は四十秒のまま）
      const mine1 = (rt.stats?.kills || 0) - (F.k1 || 0);
      // 11/19 00:45 クラウド 上田の持ち主（討った者を数えた：段1で小隊を討つのは大久保の侍・騎馬、本多の騎馬、牧野の鉄砲が十人、本人0。四割半の刃でも八秒で四割）：
      //   本人が二人討つまでは、牧野・本多・大久保の刃を一割半に（数と動きは変えない）。二人討てば四割半へ戻す
      for (const g of [F.makino, F.honda, F.okubo]) if (g && g._dm0 != null) g.dmgMult = g._dm0 * (mine1 >= 2 ? 0.45 : 0.15);
      if ((F.kariJoined > 6 && ((k >= Math.round(F.w1N * 0.3) && (mine1 >= 2 || F.kariJoined > 24)) || F.kariJoined > 34)) || (k >= Math.round(F.w1N * 0.3) && el > (F.kariJoined > 0 ? 62 : 40)) || over) this.toStep(rt, 2);   // 味方の手で三割：12→40秒（11/18 16:10 クラウド 上田の持ち主：小隊が着いて八秒で段2へ移り、本人が斬る間が無かった）
    } else if (F.step === 2) {
      // 追った先の細い道で伏兵。追わなかった時も、本多の手が追って伏兵に掛かる（話は止まらない⑥）
      const nearTrap = dist(P.pos, TRAP) < 22;
      // 本人が伏兵の道へ着けば罠を起こす。退く小隊の到着待ちにはしない。
      // 11/21 15:50 クラウド 上田の持ち主（K582 携帯の見なし せっかち bot：段2が63秒・『任務札も敵も無い61秒』★★＝本人が林の口へ着かず、
      //   退く小隊は誘いの道の先へ去って、七十五秒の刻限待ち）：二十五歩内に戦える敵が無いまま二十秒経てば、その場で伏兵を起こす
      if (rt.army.nearestEnemy(P, 25, (o) => !o.fleeing && !o.noTarget)) F.q2At = rt.t; else if (F.q2At == null) F.q2At = rt.t;
      const quiet2 = el > 20 && rt.t - F.q2At > 20;
      if ((nearTrap && el > 12) || quiet2 || ((F.lureI >= LURE.length || !live(F.sortie)) && el > 75) || over) this.toStep(rt, 3);
    } else if (F.step === 3) {
      // 囲みを抜けて田へ戻る（伏兵の全滅を待たない）
      // 11/18 クラウド 上田の持ち主（act bot 描かずの足跡：伏兵が起きた時に本人はもう田の口に居て、林の射手へ斬り込み、
      //   林へ去る真田を（46,-136）まで追った。囲みが解けても田へ戻るまで段が進まず、刻限の百秒まで待った）：
      //   伏兵が林へ去った後（五十八秒）に本人の十八歩内に戦える真田が居なければ、囲みは抜けた事にする
      const ringGone = el > 58 && !F.foes.some((g) => !g._away && g.order !== 'retreat' && g.units.some((u) => canFight(u) && dist(u.pos, P.pos) < 18));
      // 11/19 05:20 クラウド 上田の持ち主（描かずの足跡：田の口へ六秒で戻った後、本人は (65,-73) に二十秒立ったまま・一戦が七分を超える回）：
      //   田へ戻った後の待ちを二十五→十六秒に（伏兵の三つの声は十二秒で言い終わる）
      if ((dist(P.pos, OUT) < 12 && el > 16) || ringGone || over) {
        this.toStep(rt, 4);
      }
    } else if (F.step === 4) {
      // 小路の出口から門の前へ。着いたら門から真田の槍が出る。門は落ちない（時間＋寄せで進む⑤）
      if (!F.atFront) {
        // 入口を飛ばして出口だけを示すと、田から町屋を横切る案内になる。
        const along = (P.pos.x - LANE_A.x) * -0.647 + (P.pos.z - LANE_A.z) * 0.765;
        const side = Math.abs((P.pos.x - LANE_A.x) * 0.765 + (P.pos.z - LANE_A.z) * 0.647);
        if (dist(P.pos, LANE_A) < 6 || (along > 0 && along < dist(LANE_A, LANE_B) && side < 4.5)) F.laneEntered = true;
        if (dist(P.pos, LANE_B) < 5) F.throughTown = true;
        // 小路を迂回して門前へ寄せても攻城を始める。出口の一点を踏み損ねても待たせない。
        if (dist(P.pos, FRONT) < 10 || (P.pos.x > GATE.x - 12 && P.pos.x < FRONT.x + 6 && Math.abs(P.pos.z - GATE.z) < 14) || el > 70) {   // 100→70（11/18 16:25 同上）。150→100：門の前へ来ない時も、真田の槍を門から出して寄せの場を始める（11/18 クラウド 上田の持ち主）
          F.atFront = true; F.reAt = 0;
          sfx('taiko', 1); sfx('volley', 0.9);
          for (let i = 0; i < 6; i++) rt.army.smoke(GATE.x - 2, rt.world.heightAt(GATE.x, GATE.z) + 2.6, GATE.z - 8 + i * 3.2, 1, 0);
          // 11/18 09:45 クラウド 上田の持ち主（段4で本人の討ち取り0＝門の前へ着くのが遅い回）：本人がまだ門の前へ来ていない時は、
          //   槍を門の前で止めず小路の出口まで本人の来る道へ押し出す（数と強さは変えない。出口は門の前から十六歩・城の外）
          const late = dist(P.pos, FRONT) > 24;
          // 11/19 01:45 クラウド 上田の持ち主（討った者を数えた：槍三十人が一度に出て本人は四人以上に囲まれ下がり続け、槍の十七人を味方の手が三十秒で討つ＝段4の本人の討ち取り0・0・1）：
          //   昌幸の「引き付けて放て」の通り、槍を十五人ずつ二度に分けて門から突かせる（二の突きは十秒後。合わせて三十人・強さは変えない）
          const yAim = late ? { x: LANE_B.x + 3, z: LANE_B.z - 3 } : { x: FRONT.x + 2, z: FRONT.z };
          F.yari = this.foe(rt, '門から打って出た真田の槍', { x: GATE.x - 8, z: GATE.z }, [uS(3), uA(10), uG(2)],   // 11/18 クラウド K365：二十人では門前で act bot が「斬り合う相手が少ない」。三十人に
             { aim: yAim, via: late ? [FRONT] : [], width: 6, morale: 98 });
          F.w4N = aliveN(F.yari) * 2; F.k4 = rt.stats?.kills || 0;
          rt.after(10, () => {
            if (F.step !== 4 || F.ending || F.ikeru) { F.w4N = aliveN(F.yari); return; }
            const far = dist(P.pos, FRONT) > 24;
            F.yariB = this.foe(rt, '門から突いて出た真田の二の槍', { x: GATE.x - 8, z: GATE.z }, [uS(3), uA(10), uG(2)],
              { aim: far ? { x: LANE_B.x + 3, z: LANE_B.z - 3 } : { x: FRONT.x + 1, z: FRONT.z - 2 }, via: far ? [FRONT] : [], width: 6, morale: 98 });
            sfx('taiko', 0.7);
          });
          const talkWait = Math.max(0, 10.8 - el);   // 先に門へ着いても、急使と秀忠の下知を読み終えてから。
          rt.after(talkWait + 2, () => rt.say('徳川の足軽', '門の上から撃ってくる！', 2.6));
          rt.after(talkWait + 8, () => rt.say('榊原康政', '数はこちらが十倍じゃ。塀に取り付け！', 3));
          rt.after(talkWait + 18, () => rt.say('真田昌幸', '引き付けて放て。門の前に寄せた者から撃て', 3));
        }
      } else {
        // 11/18 18:15 クラウド 上田の持ち主（描かずの足跡：門の槍と新手は「歩け」の下知のまま本人の脇を通り過ぎ、本人は六歩内に敵六〜十四人・
        //   命を削られながら五十秒討ち取り0。動く列を追うだけだった）：本人か門前の十六歩内へ来たら、その場で斬り掛かる（段1の小隊と同じ）
        for (const g of [F.yari, F.yariB, F.yari2]) {
          if (!live(g) || g.order !== 'move' || g !== F.yari2 && F.ikeru) continue;
          const gc = g.center();
          if (dist(gc, P.pos) < 16) { g.onArrive = null; g.order = 'attack'; g.dest = null; g.keepMoveOrder = false; g.march = false; g.anchor = { x: gc.x, z: gc.z }; g.seekRange = 22; g.aggro = 16; }
        }
        // 11/19 03:00 クラウド 上田の持ち主（六回で段4の本人の討ち取り 5・4・2・1・0・1 の揺れ＝槍は本人の手勢と諸隊の手で討たれる）：
        //   天王寺の門徒と同じく、本人が段4で二人討つまで、門の槍が本人でない者から受ける傷を三割に（数と強さ・本人への刃は変えない）
        const soft = (rt.stats?.kills || 0) - (F.k4 || 0) < 2 ? 0.3 : null;
        for (const g of [F.yari, F.yariB]) if (g) for (const v of g.units) v.takeNonPlayer = soft;
        // 11/19 07:50 クラウド 上田の持ち主（描かずの足跡：新手の十九人は門から出て本人へ届く前に味方の手で半ば討たれ、段4が締まった＝新手の本人の討ち取り0）：
        //   新手も、本人が新手の出た後に二人討つまで、本人でない者から受ける傷を三割に（数と強さ・本人への刃は変えない）
        if (F.yari2) { const s2 = (rt.stats?.kills || 0) - (F.k42 ?? 0) < 2 ? 0.3 : null; for (const v of F.yari2.units) v.takeNonPlayer = s2; }
        const k = F.w4N - yariLeft(F);
        // 11/18 22:10 クラウド 上田の持ち主（描かずの足跡：門の槍は味方の手で十二秒のうちに三割討たれて引き、本人の討ち取りは一人＝段4の本人の討ち取り0〜2）：
        //   段5の荷駄と同じく、味方の手で三割討っても本人が二人討つか四十秒までは槍を留める。数と強さは変えない
        if (!F.ikeru && F.reAt > 30 && k >= Math.round(F.w4N * 0.3) && ((rt.stats?.kills || 0) - (F.k4 || 0) >= 2 || F.reAt > 40)) {
          F.ikeru = true;
          const survivors = [F.yari, F.yariB].some((g) => g && g.units.some((u) => u.alive && !u.gone));
          rt.say('徳川の足軽', survivors ? '門の槍が引いた！　いけるぞ！' : '門の槍を討ち果たした！　いけるぞ！', 2.6);
          this.back(F.yari); this.back(F.yariB);
          // 11/18 15:50 クラウド 上田の持ち主（描かずの数え：250秒＝門の槍が引いた後、本人の60m内の敵 7・K281）：
          //   昌幸の「引き付けて放て」の通り、槍が引いて寄せ手が門へ詰め寄った所へ、門がまた開いて新手の槍が突いて出る。段の札には数えない
          rt.after(3, () => {
            if (F.step !== 4 || F.ending) return;
            const far = dist(P.pos, FRONT) > 24;
            F.yari2 = this.foe(rt, '門から突いて出た真田の新手', { x: GATE.x - 8, z: GATE.z }, [uS(3), uA(16)],
              { aim: far ? { x: LANE_B.x + 3, z: LANE_B.z - 3 } : { x: FRONT.x + 1, z: FRONT.z + 1 }, via: far ? [FRONT] : [], width: 7, morale: 100 });
            F.yari2._keep = true; F.y2N = aliveN(F.yari2); F.k42 = rt.stats?.kills || 0;
            sfx('taiko', 0.8);
            rt.say('徳川の足軽', '門がまた開いた！　新手じゃ！', 2.6);
            rt.after(5, () => { if (F.step === 4) rt.say(NOBU, '寄せた者から突き崩せ！', 2.8); });
          });
        }
        // 11/18 クラウド 上田の持ち主（act bot「9分で5人」・段4が156秒）：門の槍が引いた後の待ちを55→42秒に（⑤の荷駄の斬り合いへ早く移る）
        //   新手が出たら、半ば討つか二十六秒斬り合うまで段を留める（上限八十秒は同じ）
        const y2Busy = live(F.yari2) && rt.t - F.yari2._bornT < 26 && (F.y2N - aliveN(F.yari2)) < Math.round(F.y2N * 0.5);
        if (F.reAt > 42 && ((F.ikeru && !y2Busy) || F.reAt > 80)) this.toStep(rt, 5);
      }
      if (over) this.toStep(rt, 5);
    } else if (F.step === 5) {
      // 荷駄を守る：敵0人を待たない④。守り切ったら真田はまた逃げる
      const k = F.w5N - aliveN(F.raid) - (F.raidB ? aliveN(F.raidB) : (F.w5N - F.w5A));
      // 11/19 05:50 クラウド 上田の持ち主（act bot 九回で段5の本人の討ち取り 2・0・0・2・1・0・1・0・8＝荷駄の小隊は本多の手と人足に討たれる）：
      //   段4の門の槍と同じく、本人が段5で二人討つまで、荷駄を襲う小隊が本人でない者から受ける傷を三割に（数と強さ・本人への刃は変えない）
      const soft5 = !F.raidGone && (rt.stats?.kills || 0) - (F.k5 || 0) < 2 ? 0.3 : null;
      for (const g of [F.raid, F.raidB]) if (g) for (const v of g.units) v.takeNonPlayer = soft5;
      // 段の上限より先に退き始め、追うなとの下知を読んでから撤収へ移る。
      if (!F.raidGone && ((F.nidaAt > 20 && (k >= Math.round(F.w5N * 0.4) || F.nidaAt > 45)) || (k >= Math.round(F.w5N * 0.4) && el > 25 && (el > 42 || (rt.stats?.kills || 0) - (F.k5 || 0) >= 2)) ||   /* 11/18 16:20 クラウド 上田の持ち主（act bot 段5の本人の討ち取り0〜2：味方の手で四割討たれると本人が荷駄に着く前に段が閉じた）：本人が二人討つか四十二秒まで留める */ el > STEP_MAX[5] - 13)) {   // 札の数が満ちたら味方の手でも退かせる（段1と同じ・11/18 クラウドせ）
        F.raidGone = rt.t;
        // 戦意を失って逃げる兵も生き残り。戦える人数が零でも全滅とは限らない。
        F.raidWithdrew = [F.raid, F.raidB].some((g) => g && g.units.some((u) => u.alive && !u.gone));
        for (const g of [F.raid, F.raidB]) if (g) this.away(rt, g, { x: 86, z: 58 });
        if (live(F.raid2)) this.away(rt, F.raid2, { x: 90, z: 64 });
        if (F.raidWithdrew) {
          rt.say('徳川の足軽', '真田がまた逃げるぞ！', 2.4);
          rt.after(2.6, () => rt.say('本多忠政', '追うな！　荷駄を守れ。二度は釣られぬ', 3));
        } else rt.say('本多忠政', '荷駄の敵は討ち果たした。兵糧と玉薬を守れ！', 3);
      }
      // 二度目の学び：追えば林の鉄砲に撃たれて、また時を失う。追わなければ損は少ない
      if (F.raidGone && F.raidWithdrew && !F.trap2 && P.pos.z > 24 && rt.t - F.raidGone < 30) {
        F.trap2 = true; F.delay += 10;
        sfx('volley', 0.9);
        // 11/19 04:55 同上：(84,44) は尼ヶ淵の流れの真ん中から一歩半（深さ1.4m の水の中）。向こう岸の藪（水の縁から三歩）から撃つ
        F.grove = this.foe(rt, '藪の鉄砲', { x: 84, z: 55 }, [uG(5)], { hold: true, width: 5, dmg: 0.4, facing: Math.PI });
        F.grove.seekRange = 26;
        rt.after(1, () => rt.say('本多忠政', 'また誘いじゃ！　戻れ！', 2.6));
        rt.after(20, () => this.away(rt, F.grove, { x: 86, z: 70 }));
      }
      if ((F.raidGone && rt.t - F.raidGone > (F.trap2 ? 22 : 12)) || over) this.toStep(rt, 6);
    } else if (F.step === 6) {
      // 兵をまとめる：岸に三十秒いて、信繁の一撃が済む（来なければ刻限で）
      // 11/19 08:22 クラウド 上田の持ち主（描かずの足跡：追い討ちの真田勢は「歩け」の下知のまま本人の八歩内を二十五秒並んで歩き、
      //   本人は命を半ばまで削られて討ち取り0〜1）：段1・段4と同じく、本人の十四歩内へ来たらその場で斬り掛かる（数と強さは変えない）
      if (live(F.chase) && F.chase.order === 'move') {
        const cc = F.chase.center();
        if (dist(cc, P.pos) < 14) { const g = F.chase; g.onArrive = null; g.order = 'attack'; g.dest = null; g.keepMoveOrder = false; g.march = false; g.anchor = { x: cc.x, z: cc.z }; g.seekRange = 22; g.aggro = 16; }
      }
      if (F.nbOut && !F.nbBack) {
        // 一撃の後は居場所にかかわらず退く。途中で詰まる・戦力を失う場合にも打ち切る。
        // 隊の到着だけで一撃を済ませない。隊列が岸の手前で広がっても、本人へ届く時間を残す。
        if (F.nbContact == null && F.nobushige.units.some((u) => canFight(u) && dist(u.pos, P.pos) < 10)) {
          F.nbContact = rt.t;
          // 岸への到着前でも、退く本人に追い付けば一撃して引く。曲がり角の到着待ちで通り過ぎない。
          const nb = F.nobushige;
          nb.onArrive = null; nb.order = 'attack'; nb.seekRange = 20; nb.aggro = 14;
        }
        const spent = F.nbContact != null && rt.t - F.nbContact > 10;
        // 11/21 クラウド 上田の持ち主（K582 携帯の見なし せっかち bot：段6が72秒・岸で六十秒「任務札も敵も無い」待ち＝信繁の手が本人に届かず六十五秒の刻限待ち）：
        //   本人が岸で三十秒集まり、二十五歩内に敵がいない時は、四十秒で一撃を打ち切って退かせる（届いた回は今のまま）
        const idleBank = F.rallyAt > 30 && !rt.army.nearestEnemy(P, 25, (o) => !o.fleeing && !o.noTarget);
        if (spent || !live(F.nobushige) || rt.t - F.nbOut > (idleBank ? 40 : 65)) {
          F.nbBack = true;
          if (live(F.nobushige)) { rt.say(NOBU, '……ここまで。引くぞ', 2.6); this.back(F.nobushige); }
        }
      }
      // 11/18 クラウド 上田の持ち主：信繁がそれまでに討たれて一撃が出ない回は、岸の段が刻限の百二十秒まで続いた（act bot 二回）。出ない時は待たない
      if (!F.nbOut && !live(F.nobushige) && el > 14) F.nbBack = true;
      // 岸の近くで斬り合いを追って輪の外に居続ける回（act bot 三回に一回）も、八十秒で集まりは済んだ事にする（⑦も浅瀬を通る）
      if (((F.rallyAt > 30 || el > 80) && (F.nbBack || el > 120)) || over) this.toStep(rt, 7);
    } else if (F.step === 7) {
      if (F.noTgt7 && (F.noTgt7T ?? 0) <= rt.t) { F.noTgt7T = rt.t + 2; F.noTgt7(); }   // 後から出る兵も狙いの外に
      // 11/19 クラウド29（中学生 bot 356〜417秒：⑦で本人が西岸を六十秒さまよい、印は57m 先・敵も無く『次が分からない』三十秒）：
      //   ⑦は戦わない行軍。段から四十秒たっても渡っておらず十五歩内に敵がいなければ、暗転の間に浅瀬の東岸へ本人を渡す（渡った後は今の三十五秒の締め）
      if (!F.crossedRiver && !F.ford7Warp && el > 40 && P.alive && !rt.army.nearestEnemy(P, 15, (o) => !o.fleeing && !o.noTarget)) {
        F.ford7Warp = true; F.crossedRiver = true; F.step7CrossT = rt.t;
        rt.cutT = rt.t; rt.scene.visible = false; rt.after(0.6, () => { rt.scene.visible = true; }, true);
        P.target = null; P.atk = null; P.swing = null; P.bind = null;
        P.pos.set(FORD_E.x + 2, rt.world.heightAt(FORD_E.x + 2, FORD_E.z + 4), FORD_E.z + 4); if (P.vel) P.vel.x = P.vel.y = P.vel.z = 0; if (P.mesh) P.mesh.position.copy(P.pos);
        sfx('horagai', 0.5);
      }
      // 行軍先の一点で兵列に押し止められても、渡河して街道へ進んだ事で締める。
      // 城下や西岸に留まるだけでは達成にしない。
      // 11/18 cloud-42 の見回り（⑦で137秒なにも起きず時切れ）：渡った後は街道の列に押し止められても、六十秒で締める
      // 11/18 クラウド kaito2（物差し⑤）：刻限を過ぎたら渡った事だけで締め、渡れない時も刻限＋三十秒で締めて時切れにしない（二つの直しを合わせた）
      // 11/19 03:55 クラウド 上田の持ち主（act bot 507秒＝一戦八分半・4〜7分を超える。⑦は戦わない行軍で五十五秒）：渡った後の締めを六十→四十五秒に（街道の縦列は四十五秒で十分見える）
      // 11/19 07:08 クラウド 上田の持ち主（act bot 九回で一戦 349〜498秒・七回が七分超え。⑦は戦わない行軍で六十五〜八十秒）：渡った後の締めを四十五→三十五秒に
      if (dist(P.pos, MARCH) < 14 || (F.crossedRiver && el > 35) || (over && F.crossedRiver)
        || (over && F.crossedRiver && P.pos.x > FORD_E.x - 3 && P.pos.z > MARCH.z - 32 && dist(P.pos, MARCH) < 42)
        || el > STEP_MAX[7] + 30) this.win(rt);
    }
  },

  // 塀の内の土塁の鉄砲と弓：門へ寄る徳川の兵を、塀越しに次々に撃つ（二の7・十の3。critic60：門の前で味方がほとんど倒れない）
  wallFire(rt) {
    const F = rt.flags, A = rt.army;
    if (F.ending) return;
    // 段ではなく射程で守る。先に門へ寄せた者も、撤収中に城の前へ残った者も安全地帯にしない。
    const foes = F._wallFoes || (F._wallFoes = []);
    foes.length = 0;
    for (const u of A.units) if (u.team === 0 && canFight(u) && !u.invuln && u.pos.x > GATE.x + 2 && u.pos.x < GATE.x + 46 && Math.abs(u.pos.z - GATE.z) < 34) foes.push(u);
    const P = rt.player.u;
    // 誘われて門内へ入った本人も射程内なら狙う。門から十二歩より奥が安全地帯にならないようにする。
    if (canFight(P) && !P.invuln && P.pos.x > C.x - 30 && P.pos.x < GATE.x + 46 && Math.abs(P.pos.z - GATE.z) < 34 && !foes.includes(P)) foes.push(P);
    if (!foes.length) return;
    // 本人を狙う射手は、門の正面の組（無ければ次の組）の一人だけ。鉄砲が倒れても弓が引き継ぐ。
    // 四つの組から一人ずつ狙わせない（11/9 見回り 徳川D：⑤の門の前で三十秒で倒れた）。
    let aimU = null;
    if (foes.includes(P)) for (const g of [F.wallG, F.wallG2, F.wallN, F.wallS]) {
      aimU = g?.units.find((v) => canFight(v) && (v.type === 'gun' || v.type === 'bow') && dist(v.pos, P.pos) < 50);
      if (aimU) break;
    }
    for (const g of [F.wallG, F.wallG2, F.wallN, F.wallS]) {
      if (!g) continue;
      for (const u of g.units) {
        if (!canFight(u) || (u.type !== 'gun' && u.type !== 'bow')) continue;
        if (u.gunAmmo !== undefined && u.gunAmmo < 5) u.gunAmmo = 20;
        const last = u.type === 'gun' ? u.gunShotAt ?? -99 : u._wallShotAt ?? -99, every = u.type === 'gun' ? 7 : 4.5;
        if (A.time - last < every + ((u.id || 0) % 7) * 0.4) continue;
        // 的は門の前に寄せた兵から散らして選ぶ（一人に弾が集まらない。主人公だけを狙い撃ちにしない）
        // 主人公を狙う一人以外は味方の兵を狙う。無作為の選択で全員が主人公へ撃つ抜け道も防ぐ。
        let t = u === aimU ? P : null;
        // 抽選が本人や射程外の兵に偏っても、撃てる相手を見落とさない。
        const first = Math.floor(Math.random() * foes.length);
        for (let k = 0; k < foes.length && !t; k++) { const o = foes[(first + k) % foes.length]; if (o !== P && dist(o.pos, u.pos) < 50) t = o; }
        if (!t) continue;
        u.heading = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z);
        if (u.type === 'gun') A.fireGun(u, t); else { u._wallShotAt = A.time; A.shoot(u, t); }
      }
    }
  },

  // 大手門の扉：門の近くに出入りする真田がいる時だけ開け、いなければ閉める。本人が門の口に立つ間は閉めない
  gateTick(rt, dt) {
    const F = rt.flags, P = rt.player?.u;
    if (!F.gate) return;
    if ((F.gateT = (F.gateT || 0) - dt) <= 0) {
      F.gateT = 0.3;
      // 段の間ずっと開けず、真田の出入りの時だけ開ける。
      let need = false;
      for (const g of F.foes) {
        if (g.order === 'hold' && !g.dest) continue;
        if (g.order !== 'retreat' && g.order !== 'move' && rt.t - (g._bornT ?? rt.t) > 12) continue;
        for (const u of g.units) if (u.alive && !u.gone && Math.abs(u.pos.x - GATE.x) < 14 && Math.abs(u.pos.z - GATE.z) < 12) { need = true; break; }
        if (need) break;
      }
      // 真田の出入りが済んでも、門を通る兵を扉で閉じ込めない。
      const inMouth = (P && Math.abs(P.pos.x - GATE.x) < 2.5 && Math.abs(P.pos.z - GATE.z) < 4.5) || rt.army.units.some((u) => u.alive && !u.gone && Math.abs(u.pos.x - GATE.x) < 2.5 && Math.abs(u.pos.z - GATE.z) < 4.5);
      // 本人が先に城外へ戻っても、城内に残った味方を閉じ込めない。西の土塀より外は城内に数えない。
      const inside = (P && P.pos.x > C.x - 30 && P.pos.x < GATE.x - 1 && Math.abs(P.pos.z - GATE.z) < 30) || rt.army.units.some((u) => u.team === 0 && u.alive && !u.gone && u.pos.x > C.x - 30 && u.pos.x < GATE.x - 1 && Math.abs(u.pos.z - GATE.z) < 30);
      // 真田の出撃・退却と、門を通る者の退路を優先する（critic60 11/7：誘い込み中は門を開く）。
      // 寄せ手の接近だけで閉めると、出撃する真田を止め、門の口の本人や味方を扉で挟んでしまう。
      F.gate.alive = !(need || inMouth || inside);
    }
    const want = F.gate.alive ? 0 : 1.25;
    if (F.doorA !== want) {
      F.doorA += Math.sign(want - F.doorA) * Math.min(Math.abs(want - F.doorA), dt * 1.4);
      F.door.userData.leaves.forEach((pv, i) => { pv.rotation.y = (i ? -1 : 1) * F.doorA; });
      for (const c of F.door.children) if (!F.door.userData.leaves.includes(c)) c.visible = F.doorA < 0.05;   // 閂は閉じた時だけ
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    KIT.carrion(rt, v);
  },
  onRout(rt, g) {
    if (g.team === 1 && g.name && !rt.flags.ending) rt.say('足軽', `${g.name}が退いていく！`, 2.5);
  },

  // bot：近い敵を突き、いなければ段の行き先へ
  // bot の足跡に足す（⑦で止まる訳を見る・playbot.js の跡）
  botDbg(b) { const F = b.flags, P = b.player; return `${F.ending ? 'E' : ''}${F.holdPlayer ? 'H' : ''}${P.mounted ? 'M' : ''}${b.botRest ? 'R' : ''}p${Math.round(PIN.x)},${Math.round(PIN.z)}b${F._bs && b.t < F._bs.until ? 1 : 0}${F._dbgE || ''}`; },
  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    if (F.holdPlayer || !F.step || F.ending) return;
    // 寄れない敵（稲架・町屋・味方の列の向こう）を八秒追って近づけない時は、その敵を二十秒は相手にしない
    const IG = F._ign || (F._ign = new Map());
    // 段ごとに相手にする所を絞る：③は囲みの中で斬り合わず田へ戻る、⑤は荷駄の周りだけ（追わない）、⑥は岸だけ、⑦は相手にしない
    const zone = (o) => (F.step === 3 ? dist(o.pos, u.pos) < 3.5 : F.step === 5 ? dist(o.pos, NIDA) < 20 : F.step === 6 ? dist(o.pos, FORD_W) < 20 : F.step === 4 ? o.pos.x > GATE.x + 5 : true);
    // 倒れた者・負傷離脱・敗走の下知が出た隊は追わず、次の持ち場へ進む。
    const ok = (o) => !o.fleeing && !o.downed && !o.dying && !o.woundOut && !o.rearWound && !o.evacuatedWound && !o.group?.routed && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3 && zone(o) && !((IG.get(o) || 0) > b.t);
    // 門内からは折れ道を戻る案内を優先し、小路への直進や敵への寄り道で土塀に当てない。
    const exitCastle = F.step >= 3 && insideCastle(u.pos);
    const lane = F.step === 4 && !exitCastle && (!F.atFront || (!F.throughTown && u.pos.x > LANE_B.x && u.pos.z < LANE_B.z));
    const pin = this.missionPin(b);
    // 11/18 07:55 クラウド 上田の持ち主：①の刈田では、三十歩先の小路の口で始まった斬り合いへ人は走る（九歩では田の持ち場に立ったまま段1・段2で討ち取り0だった）
    // 11/19 03:10 クラウド 上田の持ち主（POSLOG：段4で門の槍が出た後も、小路の出口の東（x>46・z<-34）に居る間は小路の案内だけを歩き、
    //   目の前へ来た槍を相手にせず通り過ぎた＝段4の本人の討ち取り0〜1。人は目の前の槍と斬り合う）：槍が出た後は、小路の上でも九歩内の敵と斬り合う
    const laneOnly = lane && !(F.step === 4 && F.atFront);
    const routeOnly = pin?.route && !(F.step === 4 && F.atFront && !exitCastle);
    const e = exitCastle || laneOnly || routeOnly || F.step === LAST ? null : b.army.nearestEnemy(u, F.step === 1 ? 32 : 9, ok);
    F._dbgE = e ? 'e' : '';
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      const C = F._chase;
      if (!C || C.e !== e) F._chase = { e, t: b.t, d };
      else if (d < C.d - 0.8) { C.d = d; C.t = b.t; }
      else if (d > 2.6 && b.t - C.t > 8) { IG.set(e, b.t + 20); F._chase = null; }
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
      patientStrike(p, inp, e, d, true);
      return;
    }
    inp.guardHold = false;
    let t = pin || MARCH;
    // ②の追撃は畦の道筋に沿う（田の稲架に当たらない）
    if (F.step === 2) { const i = Math.min(LURE.length - 1, Math.max(0, (F.lureI || 0) - 1)); if (dist(u.pos, LURE[i]) > 6 && u.pos.z > LURE[i].z + 4) t = LURE[i]; }
    // ③は来た道を田へ戻る
    if (F.step === 3 && u.pos.z < LURE[1].z - 4) { const i = u.pos.z < LURE[2].z - 3 ? 2 : 1; t = LURE[i]; }
    // ④の小路は画面と同じ missionPin の経路を歩く。
    // 何かに当たって四秒動けない時は、行き先と直角に三秒よける
    const B = F._bs || (F._bs = { x: u.pos.x, z: u.pos.z, t: b.t, until: 0, sgn: 1 });
    if (b.t > B.until) {
      if (Math.hypot(u.pos.x - B.x, u.pos.z - B.z) > 1.2) { B.x = u.pos.x; B.z = u.pos.z; B.t = b.t; }
      else if (b.t - B.t > 4 && dist(u.pos, t) > 4) { B.until = b.t + 3; B.sgn = -B.sgn; B.t = b.t + 3; }
    }
    if (b.t < B.until) {
      const L = Math.max(1, dist(u.pos, t)), ax = (t.x - u.pos.x) / L, az = (t.z - u.pos.z) / L;
      t = { x: u.pos.x + (-az * B.sgn - ax * 0.4) * 6, z: u.pos.z + (ax * B.sgn - az * 0.4) * 6 };
    }
    if (dist(u.pos, t) > 2.5) goTo(p, inp, t.x, t.z, 2); else inp.k.delete('KeyW');
  },
};

// 両軍の総勢：秀忠軍およそ三万八千、上田城の真田勢は二千五百ほど（諸説）
k05_ueda.force = (rt) => {
  const F = rt.flags;
  // 押し返されたのは徳川の先手（critic60：小競り合いで真田が八百も減った）。徳川の討たれは重く、真田の減りは軽く数える
  return { a: Math.max(0, Math.round(38000 - (F.ak || 0) * 40)), a0: 38000, b: Math.max(0, 2500 - (F.ek || 0) * 2), b0: 2500 };
};
k05_ueda.canSkip = (rt) => (!rt.flags.step && rt.t > 3 ? '下知まで待つ' : '');
k05_ueda.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k05_ueda.history = '慶長五年（1600）、会津征伐から引き返した徳川秀忠は、三万八千の軍を率いて中山道を西へ進んだ。信濃の上田城には、豊臣方（西軍）に付いた真田昌幸と次男・信繁がおよそ二千五百で籠った。長男の信之は徳川方で、真田家は父・弟と長男に分かれた。\n秀忠は降伏を勧めたが昌幸は返事を引き延ばして時を稼いだ。九月五日、信之が戸石城に向かうと、信繁は兄と戦うのを避けて上田城へ退いた。翌六日ごろ、秀忠は牧野康成らに城下の稲を刈らせ、城から出た真田の兵と小競り合いになった。本多忠政・大久保忠隣の手が追って大手門に迫ったが、城の鉄砲と伏兵に押し返され、秀忠は兵を引かせた。\n上田城は落ちず、家康から急ぎ美濃へ上れとの使者を受けた秀忠は西へ急いだが、九月十五日の関ヶ原の決戦に間に合わなかった。戦いの細部（伏兵・神川の堰を切った話など）は軍記物の伝えで、小競り合いだったとする見方もある。\nこの遊びでは、家康の急使が城攻めの最中に着いた事にしている（実際に秀忠のもとへ着いたのは九月八日ごろ）。';
k05_ueda.bushou = [{ name: '真田信繁', g: /信繁/ }];

// 本人へ真田の一組だけ向ける（岡山口の huntPlayer の写し。間合い二十四歩・城の内の組は除く）
function huntPlayer(rt, F, dt) {
  if ((F._huntT = (F._huntT || 0) - dt) > 0) return;
  F._huntT = 0.5;
  const P = rt.player?.u;
  const on = P?.alive && P.hp >= P.maxHp * 0.65;
  const ok = (g) => {
    if (!on || g.routed || g.order !== 'attack' || g.team === P.team || g.stay || g.noAI || !live(g) || g.units.some((u) => u.alive && u.type === 'busho')) return false;
    const c = g.center();
    return !insideCastle(c) && dist(c, P.pos) < 32;   // 11/18 08:20 クラウド 上田の持ち主：二十四歩では向けた組が来る前に味方に討たれ「18人を無傷で」が残った
  };
  let cur = F._hunter;
  if (cur && (cur.focus !== P || !ok(cur))) {
    if (cur.focus === P) { cur.focus = null; for (const u of cur.units) if (u.target === P) { u.target = null; u.aiT = 0; } }
    cur = F._hunter = null;
  }
  if (cur || !on) return;
  for (const g of F.foes || []) if (!g.focus && ok(g)) { g.focus = P; F._hunter = g; return; }
}
const st = (n) => (rt) => (rt.flags.step ?? 0) >= n;
STAGES[ID] = STEP_TEXT.slice(1).map((t, i) => (i ? [t, st(i + 1)] : [t]));
// 右上の七つ（goals5.js の def.goals5）：刻限の時計を付けない
k05_ueda.goals5 = () => STEP_TEXT.slice(1).map((text, i) => {
  const kill = [1, 0, 0, 1, 1, 0, 0][i];
  return { kind: 'stage', k: i, text, sec: 0, check: (rt) => (rt.flags.step ?? 0) > i + 1 || !!rt.flags.won, ...(kill ? { count: (rt) => (rt.flags.step === i + 1 ? KILLS[ID](rt) : null) } : {}) };
});
// 倒す数：段が進む判定と同じ数え方
// 段1の小隊は二度に分けて出る。二の手がまだ門を出ていない間は、その数を残りに入れる
function w1Left(F) { return aliveN(F.sortie) + (F.sortieB ? aliveN(F.sortieB) : (F.w1N - F.w1A)); }
KILLS[ID] = (rt) => {
  const F = rt.flags;
  if (F.ending) return null;
  if (F.step === 1) return cut(F.w1N, w1Left(F), F.w1N - Math.round(F.w1N * 0.3));
  if (F.step === 4) return F.yari ? cut(F.w4N, yariLeft(F), F.w4N - Math.round(F.w4N * 0.3)) : null;
  if (F.step === 5) return F.raid ? cut(F.w5N, aliveN(F.raid) + (F.raidB ? aliveN(F.raidB) : (F.w5N - F.w5A)), F.w5N - Math.round(F.w5N * 0.4)) : null;
  return null;
};


// 11/21 クラウド 上田の持ち主（K564 パソコンの重さ）：パソコンは布陣の表の徳川の塊（一塊四十五人・二千二百余り）を全部本物の兵で立て、
//   刈田の段で本人の六十m 内に九百余り・一コマ 115〜200ms（描かず）だった。携帯は idle_far.js が休ませるが、パソコンは休ませていなかった。
//   表が立てた塊（g._fjR）のうち、持ち場で待つだけ（hold・止まっている）・五十m 内に敵がいない組の、本人から四十m より遠い名の無い徒歩の兵だけ、
//   0.5 秒ごとに計算を休ませる（units.js の idleSkip）。パソコンは遠景の束で描かないので、体は場に残したまま（立つ姿のまま止まる）。
//   兵の数は減らさない。敵が寄る・本人が近づく・組が動けば 0.5 秒で起こす。?nopark で切る（前後の比べ用）
function parkPcBlocks(rt) {
  if (MEM_TIGHT) return;
  const F = rt.flags; if ((F._ppT || 0) > rt.t) return;
  F._ppT = rt.t + 0.5;
  if (typeof location !== 'undefined' && /[?&]nopark\b/.test(location.search)) return;
  const me = rt.player?.u, A = rt.army; if (!me || !A) return;
  const P = me.pos, off = rt.over || F.ending || !me.alive;
  for (const g of A.groups) {
    if (!g._fjR || !g.units?.length) continue;
    let idle = !off && !g.isPlayerSquad && !g.routed && (g.order === 'hold' || g.order === 'yari') && !g.marching && (g.anchorSpeed || 0) < 0.1;
    if (idle && A.foeNear(g, 50)) idle = false;
    for (const u of g.units) {
      if (u.idleSkip && !u._ppk) continue;   // ほかの手が休ませた兵はその手に任せる
      const on = idle && u.alive && !u.gone && !u.isPlayer && !u.name && u.type !== 'busho' && !u.mounted && !u.stdHeld && !u.isStandard && !u.atk && !u.fleeing &&
        !u.target && Math.hypot(u.pos.x - P.x, u.pos.z - P.z) > 40;
      if (!!u._ppk === on) continue;
      u._ppk = on; u.idleSkip = on;
    }
  }
}

export { k05_ueda };
export default k05_ueda;
