// ======================================================================
// 豊臣編 10　忍城攻め（天正十八年・1590　六月〜七月　梅雨から夏）　docs/chapter2_toyotomi.md の 10
// 石田三成が忍城を囲み、長い堤（石田堤）を築いて水攻めにする。城は沼の中の浮き城で落ちず、
// 大雨で堤が切れて寄せ手の陣に水が来る（と伝わる）。城代の成田泰季が病死した後、一門の成田長親らが守り通し、小田原の開城の後に城を明け渡す。
// 主人公は三成の下で堤の一つの区を受け持つ。
// ①夜、堤を築く人夫を城の夜討ちから守る ②堤が出来、堰を切って川の水を入れる
// ③六月十八日の夜の大雨に、城兵が堤を切る。水に呑まれる陣から人夫と兵を丸墓山へ逃がす
// ④七月の総攻め：浅野長吉・真田昌幸の手と浅瀬を渡り、佐間口の門へ攻め寄せる
// ⑤門を開いて打って出た正木丹波守の手を迎え撃つ ⑥退く手を庇って門の前に残った城兵を討つ（門は閉まり、城の内へは入れない）
//   （七月に浅野が口を破って首三十余を取っても城へは入れなかった史実の形。城は落ちず、小田原の開城の知らせで戦が終わる）
// 兵数（docs/battle_refs/t10_oshi.md）：寄せ手およそ二万三千、城方三千百十六（侍六十九・足軽四百二十・ほか雑兵）
// 地形：国土地理院の標高（asset_dem_oshi.js・行田）を、ゲームの 1 を実の 8m に縮めて細かな起伏だけ混ぜる。
// 忍城（北西）と丸墓山古墳（南東）の向きと間合いは実の位置を縮めたもの。座標：北が −z、東が +x。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nobori, jinmaku, tawara, hut, yagura, kobune, kabukimon, tobira, bridgeBoard, bridgeWoodMaterial, castleBoardFence, makeSimpleBatch, finalizeSimpleBatch, solidCircle } from './props.js';
import { RANKS } from './state.js';
import { FACTION, GENERALS } from './units_data.js';
import { KACCHU } from './kacchu_data.js';
import { sfx } from './audio.js';
import { gauss, enemyGroup, allyGroup, nm } from './bhelp.js';
import { useTerrain, BATTLE_ASSETS, assetsForBattle } from './asset_manifest.js';
import { demDetail } from './dem.js';
import { STAGES } from './stages.js';
import { TEGARA_ON } from './merit.js';
import { victoryMoment } from './victory_moment.js';
import { distToPolyline } from './world.js';
import { paint } from './units_model.js';
import { rippleWater } from './world_water.js';
import { liteMat } from './world_vegetation_materials.js';
import { withGuard } from './toyo_bot.js';
import { KILLS, broke } from './stages.js';
import { KIT } from './b_nagashinojo.js';
import { addSite } from './map_sites.js';
import { takatabaRow } from './castle_parts.js';
// 15分の構成（kaito 11/8 夜・docs/toyo15_plan_1108.md の 13）で足した段。中身は t10_oshi/ に一段一ファイル
import * as chikara from './t10_oshi/chikara.js';   // 始め：力攻めで城の外の柵へ寄せ、押し返されて丸墓山へ退く
import * as kobuneSt from './t10_oshi/kobune.js';   // 水が満ち、城の小舟が堤の岸へ寄せる
import * as kaijo from './t10_oshi/kaijo.js';
import * as shoshou from './t10_oshi/shoshou.js';   // 二巡：長束正家・関東の諸将の遠景・成田泰季の病の知らせ       // 終幕：小田原開城の知らせで忍城が明け渡される
const ID = 't10_oshi';
// 標高の素材（行田）を支度で読ませ、手柄の点と右上の段にこの戦を入れる（共通の表は直さず、ここから足す）
BATTLE_ASSETS[ID] = Object.freeze([...assetsForBattle(''), 'dem_oshi']);
TEGARA_ON.add(ID);
const s = (n) => (rt) => (rt.flags.step ?? 0) >= n;
// 携帯の横（844）の右上の札に一行で入る長さ（十八字まで）
// 段の順（step）：1 力攻め　2 退く　3 夜討ち　4 堰　5 小舟　6 大雨　7 総攻め　8 打って出　9 門前　10 開城（右上も同じ順。step − 1 が並びの番）
const MISSIONS = ['浅瀬の土手を進み、城の外の柵へ寄せる', '丸墓山の三成の本陣へ退く', '浅瀬の口で夜討ちを防ぐ', '堤の西の堰へ行き、堰を切る', '堤へ寄せる城の小舟を追い払う', '人夫と兵を連れ、丸墓山へ走る',
  '浅野勢と浅瀬を渡り、佐間口の門前へ', '門前で、打って出た城兵を押し返す', '佐間口の門前に残る城兵を討つ',
  '佐間口で、城の明け渡しを見届ける'];
STAGES[ID] = MISSIONS.map((m, i) => (i ? [m, s(i + 1)] : [m]));

let dem = null;
useTerrain('dem_oshi', (d) => { dem = d; });

const XW = 190;                                  // 見えない壁（東西南北 ±190）
const CASTLE = { x: -95, z: -108 };              // 忍城の本丸（浮き城）
const BASIN = { x: -70, z: -80 };                // 城を囲む沼の中心
const MARU = { x: 120, z: 74 };                  // 丸墓山古墳（三成の陣）
const KU = { x: 0, z: 0 };                       // 主人公の受け持つ堤の区
const CAMP = { x: 26, z: 34 };                   // 堤の外の陣（低い所＝堤が切れると水が来る）
const EVAC0 = { x: CAMP.x + 8, z: CAMP.z - 12 };  // 堤が切れた夜に人夫と兵を集める所（陣幕の囲いの外・丸墓山の側）
const WEIR = { x: -62.5, z: 24.4 };              // 川の水を入れる堰（樋門）の脇の堤の上（主人公が立って堰板を抜かせる所）
const WEIR_GATE = { x: -66, z: 24.6 };           // 堤を切り抜いた水路に立てた堰（樋門）
const WEIR_CH = [[-67, 38], [WEIR_GATE.x, WEIR_GATE.z], [-68, 12]];   // 川の端から堤を抜けて沼へ落とす水路
const BREAK = { x: 14, z: -6 };                  // 堤が切れる所
const FORD = { x: -30, z: -34 };                 // 城の口へ続く浅瀬の手前
const GATE = { x: -72, z: -84 };                 // 城の口
const SATAKE = { x: -130, z: 39 };               // 佐竹義宣の手（堰の西・堤の外と川の間。沼にも切れた堤の水にも入らない）
const START = { x: -8, z: 6 };                  // 堤の上（前は外の法の下で、堤の背に隠れて沼の水が見えなかった）
// 石田堤：沼の南東を弧に囲む。区は (−30,20)〜(30,−20)
const DIKE = [[-200, 12], [-110, 30], [-30, 20], [30, -20], [56, -90], [62, -200]];
const DIKE2 = [[30, -20], [76, 28], [MARU.x - 13, MARU.z - 11]];   // 石田堤は丸墓山につながる（docs/battle_refs/t10_oshi.md）
const dikeD = (x, z) => Math.min(distToPolyline(x, z, DIKE), distToPolyline(x, z, DIKE2));
// 忍城の縄張り（正保城絵図・行田市郷土博物館の模型）：沼に浮かぶ島の曲輪を木橋で結ぶ。石垣は無く、縁は土塁、上に狭間の板塀。天守は無い（御三階櫓は1702年）
const HON = { x: CASTLE.x, z: CASTLE.z, r: 12 };   // 本丸
const NI = { x: -78, z: -90, r: 8.5 };             // 二の丸（南東の縁に佐間口＝城の口）
const SAN = { x: -118, z: -96, r: 9 };             // 三の丸
const SUWA = { x: -102, z: -80, r: 7 };            // 諏訪曲輪
const TEN = { x: -70, z: -120, r: 7 };             // 天神曲輪
const ISLES = [HON, NI, SAN, SUWA, TEN];
const BRIDGES = [[NI, HON], [SAN, HON], [SUWA, HON], [TEN, HON], [SUWA, NI]];
const ISLE_TOP = 0.5;                             // 島の上は水を入れた後の水面より一尺ほど高いだけ（低い沼城）
const rimPt = (I, J, k = 0) => { const a = Math.atan2(J.z - I.z, J.x - I.x), r = I.r + k; return [I.x + Math.cos(a) * r, I.z + Math.sin(a) * r]; };
const BRIDGE_SEGS = BRIDGES.map(([I, J]) => [rimPt(I, J, -1), rimPt(J, I, -1)]);
const ISLE_GAPS = [...BRIDGES.flatMap(([I, J]) => [rimPt(I, J, -1.6), rimPt(J, I, -1.6)]), [GATE.x - 1.1, GATE.z - 1.1]];
const RIVER = [[-200, 64], [-130, 52], [-66, 36]];
const LAKE_LO = -2.3, LAKE_HI = -0.6;            // 沼の水面（堰を切る前・後）。前は -3.1 で沼の底とほぼ同じ高さになり、始めに水が見えなかった
const FLOOD_LO = -0.4, FLOOD_HI = 1.25;          // 11/7：前の 1.75 は胸まで浸かり、逃げる八十秒をのろのろ歩くだけになった（critic60）。膝から腿ほどに          // 堤が切れた後の陣の水面
const REAL_CAP = 200;
const FRONT = { x: GATE.x + 7, z: GATE.z + 7 };     // 佐間口の門の前（浅瀬の土橋の端）
const RAIDAT = { x: KU.x - 14.5, z: KU.z - 15.5 };  // 夜討ちを受け止める浅瀬の口（区の足軽が出て迎える所）。11/8 critic60：浅瀬の土手の上へ（前は土手から六歩外れ、沼の中で斬り合った）
const INSIDE = { x: GATE.x - 3.2, z: GATE.z - 3.2 }; // 門の内の枡形（打って出た手が出入りする所。寄せ手は入らない）
const REAR = { x: GATE.x + 3.6, z: GATE.z + 3.6 };    // ⑥ 門の前に残って退く手を庇う城兵の立つ所（門の外）
const WEIR_RAID = { x: -56, z: 6 };                  // ② 堰を壊しに沼の縁を寄せる城兵の出る所（水を入れる前の乾いた泥）
const CUT_AT = { x: 76, z: 28 };                     // ③ 堤を切った城兵が、丸墓山への道の堤の上で待ち構える所

const HOJO = { armor: 0x2c2620, lace: 0x3a2c22, flag: 'narita' };   // 11/8 critic60（BR・四3）：茶の縅で兜の錣が土の塊に見えた。縅を黒に近い焦げ茶に   // 城方は北条方だが、旗は成田氏の月下三引両
const ISHI = { armor: 0x24221f, lace: 0x3a3a4a, flag: 'ishida' };
const SANADA = { armor: ISHI.armor, lace: ISHI.lace };              // 旗は家（sanada_kuro）の六文銭
// 隊の家（11/5 fix3）：隊旗・名札の紋・兵の声の家は隊の家から引く。北条（三つ鱗）・豊臣（桐）の家のままだと、成田の城兵に三つ鱗の隊旗、石田・浅野・真田の手に桐の隊旗が立ち、
//   城兵の声が「北条の兵」になった。家の表に無い成田と、黒の真田（表の真田は大坂の赤備え）だけ、この戦から足す（共通の表は直さない）
if (!FACTION.narita) FACTION.narita = { ...FACTION.hojo, flag: 'narita' };
if (!FACTION.sanada_kuro) FACTION.sanada_kuro = { ...FACTION.tokugawa, flag: 'sanada' };
// 名札と陣羽織の紋（GENERALS の mon）：天正十八年の真田昌幸は独り立ちの大名で六文銭（表は武田の家来の頃の割菱）。大谷・成田長親は紋が空いていた
//   具足の表（KACCHU）の紋も同じに（年代の具足 eraKacchu が表の紋で兵の look.mon を上書きし、昌幸と供の侍の胴が割菱になった）
for (const [nm, m] of [['真田昌幸', 'sanada'], ['大谷吉継', 'otani'], ['成田長親', 'narita']]) for (const T of [GENERALS, KACCHU]) if (T[nm] && (!T[nm].mon || T[nm].mon === 'none' || T[nm].mon === 'takeda')) T[nm].mon = m;
const dress = (list, lk) => list.map((e) => ({ ...e, o: { ...lk, ...(e.o || {}) } }));
const live = (g) => !!g && g.units.some((u) => u.alive && !u.gone);
const fighting = (g) => !!g && !g.routed && g.units.some((u) => u.alive && !u.gone && !u.fleeing);
const near = (a, b, r) => Math.hypot(a.x - b.x, a.z - b.z) < r;
const sm = (t) => { const k = Math.max(0, Math.min(1, t)); return k * k * (3 - 2 * k); };
const aliveReal = (rt) => rt.army.units.reduce((n, u) => n + (u.alive && !u.gone ? 1 : 0), 0);

// ---- 地形 ----
function base(x, z) {
  let h = 1 + 0.25 * Math.sin(x * 0.045 + 0.7) * Math.cos(z * 0.038) + 0.15 * Math.sin(x * 0.13 - z * 0.09);
  // 沼：城のまわりが低い（堰を切ると水が溜まる）
  const rb = Math.hypot(x - BASIN.x, z - BASIN.z);
  h -= 4.2 * (1 - sm((rb - 78) / 24));
  // 浮き城：沼の中の島の曲輪。縁に土塁を盛り、門と橋の口だけ切る
  for (const I of ISLES) {
    const d = Math.hypot(x - I.x, z - I.z);
    if (d > I.r + 6) continue;
    const k = 1 - sm((d - I.r) / 2.5);
    h = h * (1 - k) + ISLE_TOP * k;
    let cut = 1;
    for (const [px, pz] of ISLE_GAPS) cut = Math.min(cut, sm((Math.hypot(x - px, z - pz) - 1.6) / 1.6));
    h += 2.1 * (1 - sm(Math.abs(d - (I.r - 1.6)) / 2.2)) * cut;   // 11/7：土塁を人の背ほどに（前の 1.3 は板塀の下に隠れ、土塁が見えなかった）
  }
  // 城の口へ続く浅瀬（水を入れた後も膝ほど）と、島を結ぶ木橋の下の土の道（橋の下は浅い）
  const dc = distToPolyline(x, z, [[GATE.x, GATE.z], [FORD.x, FORD.z], [KU.x - 8, KU.z - 8]]);
  h = Math.max(h, (LAKE_HI - 0.35) * (1 - sm((dc - 3) / 4)) + h * sm((dc - 3) / 4));
  for (const [a, b] of BRIDGE_SEGS) { const db = distToPolyline(x, z, [a, b]); if (db < 5) h = Math.max(h, (LAKE_HI - 0.5) * (1 - sm((db - 1.5) / 3)) + h * sm((db - 1.5) / 3)); }
  // 丸墓山（日本一の円墳・直径約百五m・高さ約十九m・頂が平ら）と、東の小高い台。
  //   11/7：前は頂の半径五・裾まで二十四の円すいで、尖った高い山に見えた（critic60）。頂の平らを半径十四、裾を半径三十六に広げ、高さ十二（直径と高さの比を実の五・五に近く）
  const dm = Math.hypot(x - MARU.x, z - MARU.z);
  h += 12 * (1 - sm((dm - 14) / 22)) + 2 * gauss(x, z, MARU.x + 30, MARU.z + 30, 2400);
  // 石田堤：土を盛った長い土手（上は三歩ほどの平ら）。丸墓山まで伸びる
  const dd = dikeD(x, z);
  h += 3.6 * (1 - sm((dd - 1.6) / 5));
  // 堰の水路：堤をここだけ切り、川の底の高さまで掘る（前は堰の形が無く、堤の上に立つだけで「堰を切った」になった）
  const dw = distToPolyline(x, z, WEIR_CH);
  if (dw < 4.5) { const k = sm((dw - 1.4) / 2.6); h = Math.min(h, h * k - 1.05 * (1 - k)); }
  // 川筋
  const dr = distToPolyline(x, z, RIVER);
  h -= 1.6 * (1 - sm((dr - 2) / 5));
  return h;
}
function height(x, z) {
  const h = base(x, z);
  return dem ? h + demDetail(dem, x, z, { xy: 8, win: 60, scale: 0.12 }) : h;
}

// 人夫の背の土俵（堤を築く土を詰めた藁の俵を二つ、縄で背負う）。形は全員で共用する
let dohyo = null;
function dohyoLoad() {
  if (dohyo) return dohyo;
  const parts = [];
  for (const [y, z] of [[1.3, -0.3], [1.52, -0.36]]) {
    const b = new THREE.CylinderGeometry(0.17, 0.17, 0.58, 9, 2); const p = b.attributes.position;
    for (let v = 0; v < p.count; v++) { const k = Math.abs(p.getY(v)) > 0.2 ? 0.72 : 1; p.setX(v, p.getX(v) * k); p.setZ(v, p.getZ(v) * k); }   // 俵の両端をすぼめる
    b.computeVertexNormals(); b.rotateZ(Math.PI / 2); b.translate(0, y, z);
    parts.push(paint(b, 0xa58a55));
    for (const x of [-0.17, 0.17]) { const r = new THREE.TorusGeometry(0.172, 0.014, 4, 10); r.rotateY(Math.PI / 2); r.translate(x, y, z); parts.push(paint(r, 0x5e4a2c)); }
  }
  dohyo = mergeGeometries(parts, false); for (const g of parts) g.dispose();
  return dohyo;
}

// ---- 沼と葦：水面は形一つずつ。上げ下げは位置だけ（毎コマ new しない） ----
function waters(rt) {
  const F = rt.flags;
  // 沼の水面は川と同じ作り（空を映す・風のさざ波）。夜も月明かりの空が映り、地面と見分けられる
  const lakeMat = rippleWater(liteMat({ color: 0x6a7a78, roughness: 0.2, metalness: 0, envMapIntensity: 0.8 }), 0.6, 0.8, 3.5, rt.world.hemi?.color, false, null, null, false, true);
  const lake = new THREE.Mesh(new THREE.CircleGeometry(108, 128), lakeMat);   // 11/8 critic60 八1：48 角では水の縁がぎざぎざの多角形に見えた
  lake.rotation.x = -Math.PI / 2; lake.position.set(BASIN.x, LAKE_LO, BASIN.z); lake.renderOrder = 2;
  rt.scene.add(lake);
  // 切れた堤から来る水：沼と同じ水の作り（空を映す・さざ波）で、泥の濁りの色。前は茶色の平たい板一枚で、水に見えなかった
  const floodMat = rippleWater(liteMat({ color: 0x5a5242, roughness: 0.25, metalness: 0, envMapIntensity: 0.6 }), 0.9, 1.2, 3.5, rt.world.hemi?.color, false, null, null, false, true);
  const flood = new THREE.Mesh(new THREE.CircleGeometry(96, 128), floodMat);
  flood.rotation.x = -Math.PI / 2; flood.position.set(CAMP.x + 14, FLOOD_LO, CAMP.z + 10); flood.visible = false; flood.renderOrder = 2;
  rt.scene.add(flood);
  // 切れた堤から落ちる濁り水（板一枚）
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.2), floodMat);
  fall.position.set(BREAK.x + 2, rt.world.heightAt(BREAK.x, BREAK.z) + 0.8, BREAK.z + 2);
  fall.rotation.set(-0.9, Math.atan2(1, 1), 0); fall.visible = false;
  rt.scene.add(fall);
  F.lake = lake; F.flood = flood; F.fall = fall; F.lakeY = LAKE_LO; F.floodY = FLOOD_LO;
  // 堰の水路の水：川の側は初めから、沼の側は堰板を抜いてから
  const ch = (a, b, y) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, L), lakeMat);
    m.rotation.order = 'YXZ'; m.rotation.set(-Math.PI / 2, Math.atan2(b[0] - a[0], b[1] - a[1]), 0);
    m.position.set((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2); m.renderOrder = 2; rt.scene.add(m); return m;
  };
  ch(WEIR_CH[0], [WEIR_CH[1][0], WEIR_CH[1][1] + 0.4], -0.55);
  F.chIn = ch([WEIR_CH[1][0], WEIR_CH[1][1] - 0.4], WEIR_CH[2], -0.7); F.chIn.visible = false;
}
// 堰（樋門）：水路の両岸に太い柱と冠木、間に堰板を積む。堰を切る時は堰板を抜く（板の束を消す）
function weirGate(rt) {
  const W = rt.world, F = rt.flags;
  const [a, b] = [WEIR_CH[0], WEIR_CH[2]], rot = Math.atan2(b[0] - a[0], b[1] - a[1]);
  const bed = -1.05, top = W.heightAt(WEIR_GATE.x + Math.cos(rot) * 4, WEIR_GATE.z - Math.sin(rot) * 4) + 0.6;
  const frame = [], boards = [];
  const put = (list, g, lx, ly, lz) => { g.rotateY(rot); g.translate(WEIR_GATE.x + Math.cos(rot) * lx + Math.sin(rot) * lz, ly, WEIR_GATE.z - Math.sin(rot) * lx + Math.cos(rot) * lz); list.push(g); };
  const H = top - bed + 0.4;
  for (const sx of [-1.75, 1.75]) for (const sz of [-0.32, 0.32]) put(frame, bridgeBoard(0.32, H, 0.32, true), sx, bed + H / 2 - 0.2, sz);
  put(frame, bridgeBoard(4.4, 0.34, 0.36, true), 0, top + 0.1, -0.32); put(frame, bridgeBoard(4.4, 0.34, 0.36, true), 0, top + 0.1, 0.32);
  // 堰板：柱の溝に横板を積む（水を止める高さまで）
  for (let y = bed + 0.15; y < 2.4; y += 0.3) put(boards, bridgeBoard(3.3, 0.28, 0.12, true), 0, y, 0);
  const mk = (list) => { const g = mergeGeometries(list); for (const x of list) x.dispose(); const m = new THREE.Mesh(g, bridgeWoodMaterial()); m.castShadow = m.receiveShadow = true; rt.scene.add(m); return m; };
  mk(frame); F.weirBoards = mk(boards);
}
function reeds(rt) {
  const W = rt.world, h01 = (k) => { const v = Math.sin(k * 12.9898) * 43758.5453; return v - Math.floor(v); };
  const pts = [];
  for (let i = 0; pts.length < 520 && i < 6000; i++) {
    const a = h01(i) * Math.PI * 2, r = 60 + h01(i + 0.5) * 50, x = BASIN.x + Math.cos(a) * r, z = BASIN.z + Math.sin(a) * r;
    if (dikeD(x, z) < 7 || ISLES.some((I) => near({ x, z }, I, I.r + 3)) || BRIDGE_SEGS.some(([a, b]) => distToPolyline(x, z, [a, b]) < 3)) continue;
    pts.push([x, z, 0.8 + h01(i + 3) * 0.7, h01(i + 4)]);
  }
  const blades = [];
  for (let b = 0; b < 7; b++) {
    const a = b * 2.4, lean = 0.12 + (b % 3) * 0.08, hgt = 1.3 + (b % 4) * 0.22;
    const g = new THREE.PlaneGeometry(0.07, hgt, 1, 2), pp = g.attributes.position;
    for (let v = 0; v < pp.count; v++) { const y = pp.getY(v) + hgt / 2; pp.setX(v, pp.getX(v) * (1 - y / hgt * 0.8)); pp.setY(v, y); pp.setZ(v, y * y * lean); }
    g.rotateY(a); g.translate(Math.cos(a) * 0.14, 0, Math.sin(a) * 0.14);
    const c = pp.count, cl = new Float32Array(c * 3);
    for (let v = 0; v < c; v++) { const y = pp.getY(v) / hgt; cl[v * 3] = 0.3 + y * 0.3; cl[v * 3 + 1] = 0.36 + y * 0.2; cl[v * 3 + 2] = 0.16 + y * 0.1; }
    g.setAttribute('color', new THREE.BufferAttribute(cl, 3)); g.deleteAttribute('uv');
    blades.push(g);
  }
  const geo = mergeGeometries(blades); for (const g of blades) g.dispose();
  const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), pts.length);
  const o = new THREE.Object3D();
  pts.forEach(([x, z, sc, v], i) => { o.position.set(x, W.heightAt(x, z) - 0.05, z); o.rotation.set(0, v * 6.28, 0); o.scale.set(sc, sc * (1 + v * 0.5), sc); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
  m.computeBoundingSphere(); rt.scene.add(m);
}
// 浮き城：沼に浮かぶ五つの島の曲輪。土塁の上に狭間の板塀（屏風に折って横矢を掛ける）、木橋、佐間口の冠木門と枡形、井楼櫓、屋形
function castle(rt) {
  const W = rt.world, add = (o) => { if (o) rt.scene.add(o); };
  // 板塀（狭間あり・壊せる）。全部を一つの束にまとめて描く（区画の束の遠い粗い形では薄い板が消え、浅瀬から塀が見えなかった）
  const wb = makeSimpleBatch(); wb.mergeFence = true;
  const wall = (pts) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az);
      if (len < 0.3) continue;
      const seg = [ax, az, bx, bz], s = rt.army.addStruct({ seg, nx: -(bz - az) / len, nz: (bx - ax) / len, hp: 520, maxHp: 520, team: 1, name: '柵', idx: i });
      s.samaStep = 1.5; s.kind = '板塀';
      // 11/7：boardCap で板塀の上に笠木を通し、尖った杭と乱杭を出さない（前は先の尖った丸太の柵の砦に見えた・critic60）
      s.mesh = castleBoardFence(W, seg, { h: 2.4, samaStep: 1.5, batch: wb, boardCap: true });
    }
  };
  // 板塀：島ごとに、橋と門の口を空けて輪に回す
  for (const I of ISLES) {
    const rw = I.r - 1.6, gaps = ISLE_GAPS.filter(([px, pz]) => Math.abs(Math.hypot(px - I.x, pz - I.z) - rw) < 0.5).map(([px, pz]) => Math.atan2(pz - I.z, px - I.x));
    const N = Math.max(8, Math.round(Math.PI * 2 * rw / 4.5)), half = 2.4 / rw;
    const open = (a) => gaps.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < half);
    let arc = [];
    const flush = () => { if (arc.length > 1) wall(arc); arc = []; };
    const g0 = gaps.length ? gaps[0] + half : 0;
    const P = (i) => { const a = g0 + i / (N * 4) * Math.PI * 2, rr = rw * (1 + (Math.round(i / 4) % 2 ? 0.05 : -0.03)); return [I.x + Math.cos(a) * rr, I.z + Math.sin(a) * rr]; };   // 屏風折れ
    for (let i = 0; i <= N * 4; i++) {
      if (open(g0 + i / (N * 4) * Math.PI * 2)) { if (arc.length && (i - 1) % 4) arc.push(P(i - 1)); flush(); continue; }
      if (i % 4 && i !== N * 4 && arc.length) continue;
      arc.push(P(i));
    }
    flush();
  }
  // 木橋：板の床と両の桁、水に立つ橋脚
  const boards = [];
  for (const [[ax, az], [bx, bz]] of BRIDGE_SEGS) {
    const L = Math.hypot(bx - ax, bz - az), rot = Math.atan2(bx - ax, bz - az), y = Math.max(W.heightAt(ax, az), W.heightAt(bx, bz)) + 0.12;
    const put = (g, lx, ly, lz) => { g.rotateY(rot); g.translate(ax + (bx - ax) * lz / L + Math.cos(rot) * lx, y + ly, az + (bz - az) * lz / L - Math.sin(rot) * lx); boards.push(g); };
    for (let s = 0.2; s < L; s += 0.38) put(bridgeBoard(2.6, 0.1, 0.34, true), 0, 0, s);
    for (const sx of [-1.2, 1.2]) { put(bridgeBoard(0.16, 0.22, L, true), sx, -0.16, L / 2); put(bridgeBoard(0.1, 0.1, L, true), sx, 0.75, L / 2); }
    for (let s = 1.6; s < L - 1; s += 2.6) for (const sx of [-1.2, 1.2]) { put(bridgeBoard(0.2, 3.2, 0.2, true), sx, -1.6, s); put(bridgeBoard(0.08, 0.85, 0.08, true), sx, 0.38, s); }
  }
  if (boards.length) { const g = mergeGeometries(boards); for (const b of boards) b.dispose(); const m = new THREE.Mesh(g, bridgeWoodMaterial()); m.castShadow = m.receiveShadow = true; rt.scene.add(m); }
  // 佐間口（二の丸の南東）：冠木門。内は塀で折れて（枡形）まっすぐ入れない。脇の井楼櫓から横矢
  const gx = GATE.x - 1.1, gz = GATE.z - 1.1, ux = -Math.SQRT1_2, uz = -Math.SQRT1_2, px = Math.SQRT1_2, pz = -Math.SQRT1_2;
  add(kabukimon(W, gx, gz, 4.2, -Math.PI * 3 / 4, { doors: false }));
  // 冠木門の本柱・控柱にも当たりを付ける（扉の当たりだけでは柱へ入り込む）。
  for (const side of [-1, 1]) for (const back of [0, 1.6]) solidCircle(gx + px * side * 2.27 - ux * back, gz + pz * side * 2.27 - uz * back, back ? 0.24 : 0.35);
  wall([[gx + ux * 4.2 - px * 0.8, gz + uz * 4.2 - pz * 0.8], [gx + ux * 4.2 + px * 3.4, gz + uz * 4.2 + pz * 3.4], [gx + ux * 0.8 + px * 3.4, gz + uz * 0.8 + pz * 3.4]]);
  finalizeSimpleBatch(rt, wb);
  const ya = Math.atan2(GATE.z - NI.z, GATE.x - NI.x);
  // 11/7：井楼は土塁の上から塀を見下ろすほどの低い板囲い（前の既定の高井楼は十mの格子の塔で、天守より高く見えた・critic60）
  const y1 = [NI.x + Math.cos(ya - 0.62) * (NI.r - 2.6), NI.z + Math.sin(ya - 0.62) * (NI.r - 2.6)];
  add(yagura(W, y1[0], y1[1], { height: 5.2, boarded: true }));
  const ha = Math.atan2(NI.z - HON.z, NI.x - HON.x);
  const y2 = [HON.x + Math.cos(ha + 0.5) * (HON.r - 3), HON.z + Math.sin(ha + 0.5) * (HON.r - 3)];
  add(yagura(W, y2[0], y2[1], { height: 5.8, boarded: true }));
  // 11/8 critic60 十5：板囲いの井楼の柱の間から格子の中へ入り込み、カメラが板に埋まった。囲いの内は通れない
  for (const [x, z] of [y1, y2]) solidCircle(x, z, 1.7);
  // 屋形（板葺き）：本丸に城代の屋形と台所、三の丸と諏訪曲輪に小屋
  add(hut(W, HON.x - 3, HON.z - 4, 10, 7, 0.3, { roof: 0x4a4038 }));
  add(hut(W, HON.x - 5, HON.z + 4, 7, 5, -0.2, { roof: 0x4a4038 }));
  add(hut(W, SAN.x - 1, SAN.z, 7, 5, 0.5, { roof: 0x4a4038 }));
  add(hut(W, SUWA.x, SUWA.z - 0.5, 4, 3, 0.2, { roof: 0x4a4038 }));
  // 11/8 critic60（九5・五2）：夜は竿が見えず、遠い島の白黒の旗だけが竹やぶの上の空に浮いて見えた。旗は屋形の前と佐間口の近くだけ、竿を短く
  rt.flags.naritaFlags = [];   // 開城の時に下げる（t10_oshi/kaijo.js）
  for (const [x, z] of [[HON.x + 5, HON.z - 6], [HON.x - 8, HON.z], [NI.x + 1, NI.z - 4], [NI.x - 3, NI.z + 2]]) { const f = nobori(W, x, z, 'narita', 4.5); add(f); if (f) rt.flags.naritaFlags.push(f); }
}
// 寄せ手の陣：堤の外の低い所に陣幕と旗、俵。丸墓山の上に三成の陣
function camps(rt) {
  const W = rt.world, F = rt.flags;
  rt.scene.add(jinmaku(W, CAMP.x, CAMP.z, 14, 10, 4, { mon: 'ishida' }));
  F.campFlags = [[CAMP.x - 8, CAMP.z - 7], [CAMP.x + 8, CAMP.z - 7], [CAMP.x, CAMP.z + 8]].map(([x, z]) => { const f = nobori(W, x, z, 'ishida', 5); rt.scene.add(f); return f; });
  for (const [x, z, r] of [[KU.x + 4, KU.z + 9, 0.6], [KU.x - 10, KU.z + 14, 0.4], [KU.x + 14, KU.z + 2, 0.8]]) rt.scene.add(tawara(W, x, z, r, 6));
  rt.scene.add(jinmaku(W, MARU.x, MARU.z, 12, 9, 4, { mon: 'ishida' }));
  for (const [dx, dz] of [[-6, -5], [6, -5], [0, 6]]) rt.scene.add(nobori(W, MARU.x + dx, MARU.z + dz, 'ishida', 7));
  // 見せかけの軍勢・軽い作りの乱戦は置かない（kaito AA・AF・AQ6）。寄せ手の厚みは、本物の組の後ろに付く控え（寄れば本物の兵に替わる）で見せる
  addSite(rt, 'fort', MARU.x, MARU.z, '丸墓山（石田三成の陣）');
  // 佐間口の扉（閉じている。打って出る時に開く）。門の口は扉の当たりで塞ぐ
  const gx = GATE.x - 1.1, gz = GATE.z - 1.1, px = Math.SQRT1_2, pz = -Math.SQRT1_2;
  F.door = tobira(W, gx, gz, 4.0, -Math.PI * 3 / 4, { h: 2.9 });
  rt.scene.add(F.door);
  F.doorSt = rt.army.addStruct({ seg: [gx - px * 2.1, gz - pz * 2.1, gx + px * 2.1, gz + pz * 2.1], nx: Math.SQRT1_2, nz: Math.SQRT1_2,
    hp: 99999, maxHp: 99999, team: 1, name: '佐間口の門', mesh: F.door });
}

// 打って出た二手（正木丹波守・甲斐姫）の討った数と、退かせるのに要る数（六割）。二手目が出るまでは数を出さない
function sortieCount(F) {
  if (F.sorties.length < 2) return null;
  // 討てない正木丹波守は数えない。逃げ出した者は討った数に入れる（goals5.js の t10_oshi と同じ数え方）
  let all = 0, down = 0;
  for (const g of F.sorties) for (const u of g.units) { if (u.invuln) continue; all++; if (!u.alive || u.gone || u.fleeing) down++; }
  const need = Math.ceil(all * 0.6);
  return need ? [Math.min(down, need), need] : null;
}
// 時が飛ぶ所で、本人と組を次の場所へ移す（歩くだけの間を作らない。kaito AT7・AT10）
function warp(rt, x, z, heading) {
  const P = rt.player, u = P.u;
  const put = (o, px, pz) => {
    o.pos.set(px, rt.world.heightAt(px, pz), pz);
    if (o.vel) o.vel.x = o.vel.y = o.vel.z = 0;
    if (o.push) { o.push.x = 0; o.push.z = 0; }
    if (o.mesh) o.mesh.position.copy(o.pos);
  };
  put(u, x, z);
  if (u.alive && u.maxHp) u.hp = u.maxHp;   // 11/8：時が飛ぶ所（日や月が替わる）では傷を癒やして始める。十五分の戦で傷が積もり、最後の門前で倒れ続けた
  u.heading = heading; P.yaw = heading; P.camYawOff = 0;
  if (P.vel) P.vel.x = P.vel.y = P.vel.z = 0;
  (rt.squad || []).forEach((o, i) => { if (o.alive && !o.gone) put(o, x - Math.sin(heading) * (2 + (i >> 2)) + ((i % 4) - 1.5) * 1.3, z - Math.cos(heading) * (2 + (i >> 2))); });
}
// 佐間口の扉を開く（打って出る時。退く時も閉め切れない）
function openDoor(rt) {
  const F = rt.flags;
  if (F.doorOpen) return;
  F.doorOpen = true;
  F.door?.userData.open?.();
  if (F.doorSt) { F.doorSt.alive = false; F.doorSt.opened = true; }
  sfx('taiko', 0.9);
}

// 段のファイル（t10_oshi/*.js）へ渡す座標と道具
const C = { MISSIONS, FORD, GATE, NI, KU, CAMP, MARU, START, RAIDAT, BASIN, FRONT, INSIDE, LAKE_HI, ISHI, HOJO, KIT, dress, live, fighting, near, warp, openDoor, def: null };

const t10_oshi = {
  // 任務と同じ十段で再開する。前の段の after は再開時には流れないため、
  // 水を入れる処理と、時が飛ぶ時の兵の片付けも各段の入口で行う。
  resumeSteps: [
    [1, (rt) => chikara.start(rt, C)],
    [2, (rt) => chikara.retreat(rt, C)],
    [3, function (rt) {
      const K = rt.flags.chi;
      for (const g of [K?.foe, K?.foe2, ...(K?.shot || []), K?.ally]) if (g) for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u);
      if (K?.clash?.mesh) K.clash.mesh.visible = false;
      this.night(rt);
    }],
    [4, 'weir'],
    [5, function (rt) { this.openWeir(rt); kobuneSt.start(rt, C); }],
    [6, function (rt) {
      const K = rt.flags.kob;
      for (const g of [...(K?.groups || []), K?.guns]) if (g) for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u);
      for (const b of K?.boats || []) b.mesh.visible = false;
      this.storm(rt);
    }],
    [7, 'ford'],
    [8, function (rt) { this.sortie(rt, 0); }],
    [9, 'tsukeiri'],
    [10, (rt) => kaijo.start(rt, C)],
  ],
  resumeAt(rt, step) {
    // 前段の印へ自動的に戻すと、避難再開時に西の堰へ置かれてしまう。
    const at = step === 2 ? RAIDAT : step === 4 ? { x: START.x - 4, z: START.z + 4 } :
      step === 5 ? { x: KU.x + 2, z: KU.z + 4 } : step === 6 ? { x: EVAC0.x + 4, z: EVAC0.z + 2 } :
      step === 7 ? { x: FORD.x + 6, z: FORD.z + 8 } : step >= 8 ? FRONT : START;
    return { x: at.x, z: at.z };
  },
  missionStyle: 'lesson',
  noCouriers: true, noTaisho: true, noReserve: true, noWake: true,
  frontlineDensity: false,
  enemyTactics: false,
  prelude: false,
  playerAtkMax: 3,
  strictFireOrders: true,   // 退却時は近い主人公にも「撃つな」を守る。弓だけが退く背を撃ち続けない。
  missionSingleLine: true, hideGuideSteps: true, noPlayerFoot: true,
  // 行き先は頭上の印一つ（kaito AL・AS・AV15）。ついていく相手の青い印は出さない。名札は近くの将だけ
  // 11/8 critic60（五2・N・AS）：途中で出たり消えたりする小さな地図は出さない。城代の長親の名札は門の前から見せない
  noMiniMap: true, hideNameTag: (u) => u?.name === '成田長親',
  nearAllyFadeRadius: 3,   // 11/8 critic60 九7：堤を走る時、カメラの前の味方の黒い背中が自分を塞いだ。視線の上の味方を広めに透かす
  noLeaderFollow: true, nameRange: 30, goalSignOnly: true,   // 本丸の城代（成田長親）の名と命の棒を門の前から見せない（kaito AS：総大将は討てる所に見せない）
  // 時が飛ぶ所だけ、画面の真ん中に次の目標を短く出す（kaito AT7）
  bannerAllowed: (rt, t) => rt.over || !!rt.flags.ending || /^(その夜|六月　堤が出来た|六月　城は水に浮かぶ|六月十八日の夜|七月の総攻め|七月　小田原開城)/.test(t),
  nearbyAllySignLimit: 0, foeMarks: true, enemyTriangleSigns: true, foeMarkRange: 30,
  missionPinCaption: '',
  goalSignNoLabel: true,     // 11/4 jin：▼の上に「敵をたおせ」などの字を出さない（字は使わない・kaito 10/23）
  meleeGuide: () => false,   // 11/4 jin（Simple・BH6）：「敵をたおせ」の札と敵を指す矢印は出さない。敵は頭上の▼で分かる
  noFrontFill: true,          // 共通の奥の乱戦は沼の水の上に立ってしまう（水面が見えず、水攻めの広さが出ない）。乱戦は土橋の上に置く（camps）
  learningFight: true, playerTaken: 0.45, playerRegen: 0.03,   // 11/8：十五分の戦。傷が積もりすぎないよう戻りを少し早く
  autoTargetCamera: true, steadyMeleeCamera: true, closeCombatAssist: true,
  noWinCrane: true, compactIntro: true,
  // 11/5 fix3：井楼櫓を取る別の目標と入口の印・「櫓の入口から中へ」の札を出さない（印はいつも一つ・目標は段の六つだけ）
  noYaguraTask: true,
  // 兵の声の家の名（隊の家の鍵 → 声の「〇〇の兵」）
  speakerHouse: { narita: '成田', ishida: '石田', asano: '浅野', sanada_kuro: '真田', otani: '大谷', satake: '佐竹' },
  introText: () => '石田三成の下で、沼に浮かぶ忍城を囲む。まずは力で、浅瀬の土手から城の外の柵へ寄せる。',
  minutes: 16,
  // 11/9 軍勢の厚み（docs/army_depth_howto.md）：沼を囲む寄せ手の陣立て（石田・大谷・佐竹と、湖の向こうの長束・中江の手）。城方は島の曲輪ごとに。
  //   囲みと籠城なので、どちらの備も自分からは出ない（hold）。本物の隊は bind で結ぶ
  depth: {
    A: { name: '寄せ手', facing: -Math.PI * 0.75, honjin: { x: MARU.x, z: MARU.z }, mpu: 8, formation: '鶴翼', terrain: 'marsh', flag: 'ishida', armor: 0x24221f, openAt: 9999, attrition: 0,
      sonae: [
        { id: 'guard', layer: 'sakite', wing: 'center', men: 1500, taisho: '', bind: (rt) => rt.flags.guard, hold: true },
        { id: 'satake', layer: 'ichi', wing: 'left', men: 5000, taisho: '佐竹義宣', flag: 'satake', bind: (rt) => rt.flags.satake, hold: true },
        { id: 'nagatsuka', layer: 'ichi', wing: 'right', men: 3000, taisho: '長束正家', at: { x: 40, z: -150 }, hold: true },
        { id: 'otani', layer: 'ni', wing: 'center', men: 1500, taisho: '大谷吉継', flag: 'otani', bind: (rt) => rt.flags.otani, hold: true },
        { id: 'honjin', layer: 'hatamoto', wing: 'center', men: 6000, taisho: '石田三成', bind: (rt) => rt.flags.mitsunari, hold: true },
      ] },
    B: { name: '成田', facing: Math.PI * 0.25, honjin: { x: CASTLE.x, z: CASTLE.z }, mpu: 8, formation: '方円', terrain: 'castle', flag: 'narita', armor: 0x2c2620, openAt: 9999, attrition: 0,
      sonae: [
        { id: 'hon', layer: 'hatamoto', wing: 'center', men: 1500, taisho: '成田長親', bind: (rt) => rt.flags.narita, hold: true },
      ] },
    honjinView: { A: false, B: false },   // 陣幕と本丸は戦のファイルが作る
  },
  spawn: { x: START.x, z: START.z, heading: Math.atan2(-1, -1) },
  world: {
    seed: 1590,
    time: 'day',   // 11/8：始めの力攻めは昼。夜討ちの段（night）で夜にする
    // 夜の月明かりの持ち上げを控えめに（既定の 3.4 では黒い具足が青白く光り、白い兵の塊に見えた・kaito 十5）
    nightLift: 1.8,
    // 11/8 critic60（四3・十5・四6）：夜の具足が真っ白な銀に光り、城兵と見分けがつかなかった。月の照り返しを抑え、夜の増感を下限に。梅雨の昼は一面の薄雲
    unitNightScale: .5, lowNightExposure: 1.1, overcast: true,
    lightning: true,            // 六月十八日の夜の豪雨の稲光
    muddy: 0.6,
    height,
    paths: [DIKE, DIKE2],
    mountainScale: 0.12, mountainHaze: 0.85,
    mergeFenceBatches: true,                   // 忍城の板塀を一つの束に（castle）   // 関東の平らな低地。近くに山は無い（遠い秩父を低く霞ませるだけ）
    streams: [{ pts: RIVER, w: 6, depth: 1.1 }],
    tint(x, z, h, c) {
      // 沼の泥と、堤の盛り土
      const rb = Math.hypot(x - BASIN.x, z - BASIN.z);
      if (rb < 100) { const k = 1 - sm((rb - 70) / 30); c.setRGB(c.r * (1 - 0.5 * k) + 0.2 * k, c.g * (1 - 0.5 * k) + 0.2 * k, c.b * (1 - 0.5 * k) + 0.14 * k); }
      const dd = dikeD(x, z);
      if (dd < 6) { const k = 1 - dd / 6; c.setRGB(c.r * (1 - 0.6 * k) + 0.36 * k, c.g * (1 - 0.6 * k) + 0.3 * k, c.b * (1 - 0.6 * k) + 0.22 * k); }
    },
    fieldStage: 'seedling',
    paddy(x, z) {
      // 堤の外の田（沼・堤・丸墓山・陣は外す）
      if (Math.hypot(x - BASIN.x, z - BASIN.z) < 112 || dikeD(x, z) < 10 || near({ x, z }, MARU, 40) || near({ x, z }, CAMP, 16)) return 0;
      if ((Math.floor(x / 14) + Math.floor(z / 12)) % 3 === 1) return 0;
      const ex = Math.min(((x % 14) + 14) % 14, 14 - ((x % 14) + 14) % 14), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.8;
    },
    trees: 260, tufts: 3600,
    treeDensity: (x, z) => (Math.hypot(x - BASIN.x, z - BASIN.z) < 120 || dikeD(x, z) < 12 ? 0 : x > 140 || z > 130 ? 1 : 0.2),
    clear: (x, z) => dikeD(x, z) < 10 || near({ x, z }, CAMP, 18) || near({ x, z }, MARU, 38),
    fleeOut: (x, z, team) => team === 1 && near({ x, z }, CASTLE, 14),
  },
  sides: { a: { name: '寄せ手（石田三成）', mon: 'ishida' }, b: { name: '忍城（成田）', mon: 'narita' } },

  setup(rt) {
    const F = rt.flags, W = rt.world;
    F.step = 0; F.ek = 0; F.ak = 0; F.raid = 0; F.raids = []; F.sorties = []; F.holdWaves = 0;
    waters(rt); reeds(rt); castle(rt); camps(rt); weirGate(rt);
    // 11/8 critic60（八1・四6）：沼と堤の切れた水の上に血の赤い丸を置かない（沼の水面は戦の作りなので、共通の水の調べに掛からない）
    { const st0 = rt.army.stain.bind(rt.army); rt.army.stain = (x, z, ...a) => {
      const h = W.heightAt(x, z);
      const lake = near({ x, z }, BASIN, 108) && h < F.lakeY + 0.05;
      const flood = F.flood?.visible && Math.hypot(x - F.flood.position.x, z - F.flood.position.z) < 96 && h < F.floodY + 0.05;
      return lake || flood ? null : st0(x, z, ...a);
    }; }
    // 11/5 fix3（Simple・kaito 五1）：戦い方の説明の札（横腹の数・塀の陰・刃の光の構え・下がる所）は出さない。兵の叫びはそのまま
    const bark0 = rt.bark.bind(rt);
    rt.bark = (text, warn) => (/横腹を突いている|の陰に入った|刃が光った。|味方のいる所まで下がれ|櫓の入口|構えでは防げない|囲まれる前に動け/.test(text || '') ? undefined : bark0(text, warn));
    // 主人公の組と、区を守る三成の足軽
    const n = RANKS[rt.G.rank]?.squad;
    if (n) rt.makeSquad({ x: START.x + 3, z: START.z + 3 }, Math.atan2(-1, -1), [{ kind: 'spear', n }]);
    F.guard = allyGroup(rt, { faction: 'ishida', name: '石田勢の足軽', anchor: { x: RAIDAT.x + 3, z: RAIDAT.z + 3 },   // 11/7：浅瀬の口で主人公と並んで夜討ちを受ける（前は区の奥に残り、主人公の 25m 内の味方が 0 人だった・critic60）
  facing: Math.atan2(-1, -1), width: 8, aggro: 7, noRout: true, formation: 'line', dmgMult: 0.6 },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 2 }], ISHI));
    F.guard.ai = false; F.guard.order = 'hold';   // 区の足軽は人夫の前を離れない（沼の中まで夜討ちを迎えに出ない）
    F.guard.stay = true;
    // 区の足軽は三度の夜討ちを受けても半ばは残る（前は②の始まりに一人しか残らず、③で連れる兵がいなかった）
    for (const u of F.guard.units) { u.maxHp *= 2; u.hp = u.maxHp; }   // 共通の「一緒に突っ込む」（ally_charge）で区の足軽が城の口まで駆けて行き、夜討ちと向こうで斬り合っていた
    // 区の足軽の後ろに、堤に沿って並ぶ石田勢の控え（寄せ手二万三千の一手）
    KIT.backOf(rt, F.guard, { flag: 'ishida', armor: ISHI.armor, kind: 'spear', w: 18, depth: 8, count: 160, gap: 4, seed: 10901 });
    // 堤を築く人夫（逃がす時も、この組を数える）
    F.porters = allyGroup(rt, { faction: 'ishida', name: '堤の人夫', fullStrength: true, anchor: { x: KU.x - 3, z: KU.z + 3 }, facing: Math.atan2(-1, -1), width: 5, aggro: 0, fixed: true },
      [{ type: 'porter', n: 10, o: { flag: null, hat: 'none', armor: 0x4a4034, lace: 0x5a4e3c, cloth: 0x6a5a44, haori: null, mon: null, porterLoad: dohyoLoad() } }]);
    F.porters.stay = true;
    // 11/7：人夫は狙わせない（前は夜討ちに十人のうち半ばを討たれ、③で連れて逃げる者が五人しか残らなかった・critic60）
    for (const u of F.porters.units) u.noTarget = true;   // 人夫は斬り込まない（前は「一緒に突っ込む」で土俵を背負ったまま浅瀬の城兵へ駆けて行き、討たれた）
    // 総大将の石田三成は丸墓山の上の本陣を動かない。旗本・馬廻の何百に囲まれる（kaito AR3・AV7）
    F.mitsunari = allyGroup(rt, { faction: 'ishida', name: '石田三成の旗本', anchor: { ...MARU }, facing: Math.atan2(-1, -1), width: 8, aggro: 0, fixed: true, noAI: true },
      dress([{ type: 'busho', n: 1, o: { name: '石田三成', invuln: true, horse: false, hat: 'kabuto_m', flag: 'ishida' } }, { type: 'samurai', n: 8 }, { type: 'ashigaru', n: 6 }], ISHI));
    // 11/4 jin（AV7）：総大将の三成は本陣の床几に座る。大谷吉継は馬上で脇に控える
    const mitsu = F.mitsunari.units.find((u) => u.name === '石田三成'); if (mitsu) mitsu._crouch = true;
    KIT.backOf(rt, F.mitsunari, { flag: 'ishida', armor: ISHI.armor, kind: 'mixed', w: 20, depth: 10, count: 260, gap: 3, seed: 10902 });
    // 大谷吉継は三成の脇に、自分の家の対い蝶の旗と供回りで控える（三成の旗の中に混ぜない）
    F.otani = allyGroup(rt, { faction: 'otani', name: '大谷吉継の手', fullStrength: true, anchor: { x: MARU.x - 7, z: MARU.z + 4 }, facing: Math.atan2(-1, -1), width: 5, aggro: 0, fixed: true, noAI: true },
      [{ type: 'busho', n: 1, o: { name: '大谷吉継', invuln: true, horse: true, hat: 'kabuto_m', flag: 'otani', mon: 'otani', armor: ISHI.armor, lace: ISHI.lace } },
        { type: 'samurai', n: 3, o: { flag: 'otani', mon: 'otani', armor: ISHI.armor, lace: ISHI.lace } }, { type: 'ashigaru', n: 3, o: { flag: 'otani', mon: 'otani', armor: ISHI.armor, lace: ISHI.lace } }]);
    // 11/6 専門家の目：寄せ手の半ばは佐竹義宣ら北関東の大名衆（battle_learn）。石田の旗だけの寄せ手にしない。佐竹の手は堰の西の堤の外（川との間）に陣取る
    shoshou.install(rt, { MARU, ISHI });
    F.satake = allyGroup(rt, { faction: 'satake', name: '佐竹義宣の手', fullStrength: true, anchor: { ...SATAKE }, facing: Math.atan2(-0.3, -1), width: 6, aggro: 0, fixed: true, noAI: true },
      [{ type: 'busho', n: 1, o: { name: '佐竹義宣', invuln: true, horse: true, hat: 'kabuto', flag: 'sashi:satake:#202638:#c9a653', mon: 'satake' } },
        { type: 'samurai', n: 3, o: { flag: 'satake', mon: 'satake', armor: ISHI.armor, lace: ISHI.lace } }, { type: 'ashigaru', n: 6, o: { flag: 'satake', mon: 'satake', armor: ISHI.armor, lace: ISHI.lace } }]);
    KIT.backOf(rt, F.satake, { flag: 'satake', armor: ISHI.armor, kind: 'spear', w: 14, depth: 6, count: 120, gap: 3, seed: 10906 });
    // 城代の成田長親は本丸の屋形の前を動かない
    F.narita = enemyGroup(rt, { faction: 'narita', name: '成田長親の手', anchor: { x: CASTLE.x + 3, z: CASTLE.z + 3 }, facing: Math.PI / 4, width: 6, aggro: 0, fixed: true, noAI: true, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '成田長親', invuln: true, horse: false, hat: 'kabuto_m' } }, { type: 'samurai', n: 6 }], HOJO));
    F.naritaU = F.narita.units[0];
    if (F.naritaU) F.naritaU._crouch = true;   // 城代は本丸の屋形の前の床几に座る（11/4 jin・AV7）
    // 本丸の屋形の周りを固める城兵の控え（島に収まる小さな塊。kaito AT4・AV7）
    KIT.backOf(rt, F.narita, { flag: 'narita', armor: HOJO.armor, kind: 'mixed', w: 9, depth: 6, count: 90, gap: 0, seed: 10905 });
    // 戦の前の会話（史実：水攻めは秀吉の命。六月十二日の書状）
    const me = nm(rt);
    rt.obj('main', MISSIONS[0], 'main');
    rt.after(0.8, () => rt.say('石田三成', '忍の城、まずは力で当たる。浅瀬の土手から、城の外の柵を破れ', 3.4));
    rt.after(4.6, () => rt.say(me, 'まわりは沼と深田……寄れる道は土手一本でござるな', 3.2));
    rt.after(8.2, () => rt.say('大谷吉継', '城主の成田氏長は小田原に籠もっておる。城を守るは一門の長親じゃ', 3.6));
    rt.after(12, () => chikara.start(rt, C));
  },

  // ① 夜討ち：城から三度、堤の人夫へ寄せてくる
  night(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('night');
    rt.world.setTime('night');
    rt.obj('main', MISSIONS[2], 'main');
    rt.world.setRainTarget?.(0.5);   // 11/7：梅雨の夜（星空の晴れた夜にしない）。11/8：0.25 では一粒も見えなかった
    this.raid(rt);
  },
  raid(rt) {
    const F = rt.flags;
    if (F.raid >= 4 || F.step !== 3) return;
    const i = F.raid++, side = i % 2 ? 1 : -1;
    F.raidT = rt.t;
    // 11/4 jin：夜討ちは城の口から浅瀬の土手（水を入れる前は乾いた道）を伝って来る。前は沼の深みに出て、兵が首まで沈んで見えた
    const at = i % 2 ? { x: FORD.x - 6, z: FORD.z - 6 } : { x: (FORD.x + GATE.x) / 2 + side, z: (FORD.z + GATE.z) / 2 };
    const g = enemyGroup(rt, { faction: 'narita', name: '城の夜討ち', anchor: at, facing: Math.PI * 0.75, fleeDir: { x: -1, z: -1 }, width: 5, noRout: true, formation: 'line', morale: 80,
      order: 'move', dest: { x: RAIDAT.x, z: RAIDAT.z }, speed: 3.2, aggro: 5, dmgMult: 0.32 },   // 11/8：夜討ちを四度にしたので一度の重さを下げる   // 11/7：浅瀬の口へ（前は区の奥の人夫へ向かった）
    dress([{ type: 'samurai', n: i === 3 ? 3 : 1 }, ...(i === 3 ? [{ type: 'busho', n: 1, o: { name: '正木丹波守', invuln: true, horse: true, hat: 'kabuto_m' } }] : []), { type: 'ashigaru', n: 5 + Math.min(i, 2) }, { type: i === 3 ? 'gun' : 'bow', n: 1 }], HOJO));
    // 11/8 critic60（十5）：真っ直ぐ口へ向かうと沼の深みを胸まで浸かって渡った。浅瀬の土手の筋（城の口→浅瀬の手前→口）を伝わせる
    g.order = 'path'; g.path = [[FORD.x, FORD.z], [RAIDAT.x, RAIDAT.z]]; g.pathIdx = 0;
    g.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; q.seekRange = 12; q.aggro = 12; };
    F.raids.push(g);
    if (i === 1) rt.after(6, () => rt.say('石田三成', '堤は半ばまで出来た。夜明けまでに西の堰まで繋げよ', 3.4));
    if (i === 3) rt.say('石田勢の足軽', '正木丹波の旗じゃ！　城の口の守り頭が出てきた！', 3.2);
    rt.army.play('eshout', at, 1.2);
    if (i === 0) rt.say('石田勢の足軽', '城から夜討ちじゃ！　人夫を守れ！', 3);
  },

  // ② 堤が出来る。堰を切って川の水を入れる
  weir(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t; F.weirT = 0;
    rt.setPhase('weir');
    // 時が飛ぶ（夜討ちを凌いだ夜から、堤が出来上がった日へ）。夜討ちの残りは城へ戻っている。主人公と組は区の堤の上へ戻し、真ん中に次の目標を出す
    //   前は夜が昼に替わっても、浅瀬で逃げる夜討ちの残りを一分追い続けた
    for (const g of F.raids) for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u);
    for (const g of [F.guard, F.porters]) for (const u of g.units) if (u.alive && !u.gone) { u.target = null; u.fleeing = false; }
    // 堰へ寄せる七人を主人公一人に任せず、区の足軽も堤を伝って援護する。
    if (live(F.guard)) {
      F.guard.routed = false; F.guard.order = 'path'; F.guard.speed = 4;
      F.guard.path = [[START.x - 4, START.z + 4], [WEIR.x + 5, WEIR.z]]; F.guard.pathIdx = 0;
      F.guard.onArrive = (g) => { g.onArrive = null; g.order = 'hold'; g.aggro = 12; };
    }
    warp(rt, START.x - 4, START.z + 4, Math.atan2(WEIR.x - START.x, WEIR.z - START.z));
    rt.banner('六月　堤が出来た', '堤の西の堰へ行き、堰を切れ');
    rt.world.setTime('day'); rt.world.setRainTarget?.(0.3);   // 11/7：梅雨の昼（真っ青な晴天にしない）
    sfx('taiko', 0.8);
    rt.obj('main', MISSIONS[3], 'main');
    rt.say('石田三成', '堤は出来た。堰を切れ。川の水を入れよ', 3.4);
  },
  // ② 堰へ寄せる城兵（11/7：堤と堰の間の二分に敵が一人も来ず、散歩になった・critic60）。城は水を入れさせまいと、沼の縁を伝って堰の普請へ斬り込む
  weirRaid(rt) {
    const F = rt.flags;
    if (F.weirRaid) return;
    F.weirRaidT = rt.t;
    F.weirRaid = enemyGroup(rt, { faction: 'narita', name: '堰へ寄せる城兵', anchor: { ...WEIR_RAID }, facing: Math.PI * 0.85, fleeDir: { x: 0, z: -1 }, width: 4, noRout: true, formation: 'line', morale: 80,
      order: 'move', dest: { x: WEIR.x + 2, z: WEIR.z - 3 }, speed: 3.2, aggro: 6, dmgMult: 0.4 },
    dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5 }, { type: 'bow', n: 1 }], HOJO));
    F.weirRaid.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; q.seekRange = 26; q.aggro = 12; };
    rt.army.play('eshout', WEIR_RAID, 1.1);
    rt.say('石田勢の足軽', '城の者が沼の縁を来る！　堰を壊させるな！', 3);
  },
  openWeir(rt) {
    const F = rt.flags;
    if (F.weirOpen) return;
    F.weirOpen = true; F.fillT = rt.t;
    // 堰板を抜く：板が無くなり、川の水が水路を沼へ落ちる
    if (F.weirBoards) F.weirBoards.visible = false;
    if (F.chIn) F.chIn.visible = true;
    sfx('wood', 0.9); sfx('wade', 1);
    rt.army.play('shout', WEIR, 1.2);
    rt.say('石田勢の足軽', '水が入るぞ！', 2.6);
    rt.after(10, () => rt.say(nm(rt), '……城の島は、沈まぬ', 3));
    rt.after(13, () => kobuneSt.start(rt, C));   // 水が満ち、城の小舟が寄せる段（t10_oshi/kobune.js）。済むと大雨の夜へ
  },

  // ③ 大雨で堤が切れる。陣の人夫と兵を丸墓山へ
  storm(rt) {
    const F = rt.flags;
    if (F.step >= 6) return;
    F.step = 6; F.stepT = rt.t;
    rt.setPhase('flood');
    // 六月十八日の夜の豪雨：夜のまま大雨と稲光（前は 'storm' の昼の明るさで、夜にも雨にも見えなかった）
    rt.world.setTime('night'); rt.world.setRainTarget(0.95);
    sfx('taiko', 1); sfx('thunder', 0.8);
    // 時が飛ぶ（堰を切った日から六月十八日の夜へ）。陣幕の囲いの外（丸墓山の側）へ戻し、真ん中に次の目標を出す
    //   前は陣幕の囲いの中へ戻し、主人公も組も幕に閉じ込められて丸墓山へ出られなかった
    warp(rt, EVAC0.x + 4, EVAC0.z + 2, Math.atan2(MARU.x - EVAC0.x, MARU.z - EVAC0.z));
    rt.banner('六月十八日の夜　大雨', '切れた堤から、人夫と兵を丸墓山へ');
    rt.after(6, () => {
      F.broken = true; F.breakT = rt.t;
      F.flood.visible = true;   // 落ちる水の板（fall）は宙に浮いた板に見えたので出さない
      rt.army.play('shout', BREAK, 1.4);
      // 軍記物の伝え：豪雨で本丸まで水が来そうになり、下忍口の本庄泰展の手が夜半に堤を二か所切った（一次史料では決められない）
      rt.say('石田勢の足軽', '城の者が堤を切った！　水がこっちへ来るぞ！', 3);
      rt.after(3.4, () => rt.say(nm(rt), '人夫も兵も、丸墓山へ上がれ！　わしに付いて来い！', 3.4));
      // 11/7：堤を切った城兵（伝えでは本庄泰展の手）が、丸墓山への道の堤の上に残っている。逃げる途中に斬り合いがある
      rt.after(10, () => {
        if (F.step !== 6) return;
        F.cutters = enemyGroup(rt, { faction: 'narita', name: '堤を切った城兵', anchor: { ...CUT_AT }, facing: Math.PI * 1.2, fleeDir: { x: -1, z: -1 }, width: 3, noRout: true, formation: 'line', morale: 75,
          order: 'hold', aggro: 14, seekRange: 22, dmgMult: 0.35 }, dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 4 }], HOJO));
        rt.army.play('eshout', CUT_AT, 1);
        rt.say('石田勢の足軽', '堤の上に城の者が残っておる！　堤を切った奴らじゃ！', 3);
      });
    });
    rt.obj('main', MISSIONS[5], 'main');
    // 逃がす組：人夫と区の足軽。数えるのは今生きている者
    // 区の足軽も人夫と同じ下知で動く（前は自由な AI に戻し、陣の水の中に立ち尽くした）
    F.porters.fixed = false; F.guard.ai = false; F.porters.stay = F.guard.stay = false;
    F.evac = [F.porters, F.guard].filter(live);
    F.evac0 = F.evac.reduce((a, g) => a + g.units.filter((u) => u.alive && !u.gone).length, 0);
    // 逃がす組は散り散りに逃げ出さず、呼ぶ声の方へ寄る（夜討ちで崩れた足軽も立て直して付いて来る）
    for (const g of F.evac) { g.routed = false; g.noRout = true; g.morale = 100; g.onArrive = null; }
    // 11/4 jin：時が飛ぶので、夜討ちで沼へ散った人夫と足軽も陣の小屋のそばへ戻す（前は城の前の沼に残り、丸墓山まで遠すぎて水に取られた）
    let k = 0;
    for (const g of F.evac) g.anchor = { ...EVAC0 };   // 隊の要も移す（要が区に残ると、皆が区へ戻ってしまう）
    for (const g of F.evac) for (const u of g.units) {
      if (!u.alive || u.gone) continue;
      const x = EVAC0.x - 3 + (k % 5) * 1.6, z = EVAC0.z - 2 + Math.floor(k / 5) * 1.6; k++;
      u.fleeing = false; u.target = null;
      u.pos.set(x, rt.world.heightAt(x, z), z); if (u.vel) u.vel.x = u.vel.z = 0; if (u.mesh) u.mesh.position.copy(u.pos);
    }
    for (const g of F.raids) if (live(g)) { g.noRout = false; g.morale = 0; }
  },

  // ④ 七月の総攻め：浅野長吉・真田昌幸の手と浅瀬を渡り、佐間口の門の前へ攻め寄せる（時が飛ぶ。浅瀬の手前へ移す）
  ford(rt) {
    const F = rt.flags;
    if (F.step >= 7) return;
    F.step = 7; F.stepT = rt.t;
    rt.setPhase('ford');
    rt.world.setTime('day'); rt.world.setRainTarget(0);
    F.flood.visible = false; F.fall.visible = false;
    // 六月の夜討ちの残り（沼の中に立ち尽くす者）は、七月には城へ戻っている
    for (const g of F.raids) for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u);
    warp(rt, FORD.x + 6, FORD.z + 8, Math.atan2(FRONT.x - FORD.x, FRONT.z - FORD.z));
    rt.banner('七月の総攻め', '浅瀬を渡り、佐間口の門の前へ攻め寄せよ');
    rt.obj('main', MISSIONS[6], 'main');
    rt.after(1, () => rt.say('浅野長吉', '水では落ちぬ。浅野と真田で佐間口を押す。続け！', 3.6));
    rt.after(5, () => rt.say('石田勢の足軽', '門の上の狭間に、鉄砲の火縄が見えるぞ', 3));
    // 舟（城の口の脇へ寄せる）と、浅瀬を渡る寄せ手の二つの手。どちらも門の前へ進む（kaito AQ7：味方の隊も目標へ動く）
    F.boats = [[-44, -52], [-54, -60], [-36, -62]].map(([x, z]) => { const b = kobune(x, F.lakeY + 0.05, z, Math.atan2(GATE.x - x, GATE.z - z), 7); if (b) rt.scene.add(b); return b; });
    F.fordAlly = allyGroup(rt, { faction: 'asano', name: '浅野長吉の手', fullStrength: true, anchor: { x: FORD.x + 2, z: FORD.z + 4 }, facing: Math.atan2(-1, -1), width: 7, aggro: 10, noRout: true,
      order: 'move', dest: { x: FRONT.x + 3, z: FRONT.z + 3 }, speed: 2.6, dmgMult: 0.5 },
    // 浅野の手は浅野家の違い鷹の羽（豊臣の桐は殿下の本隊の物）
    dress([{ type: 'busho', n: 1, o: { name: '浅野長吉', invuln: true, horse: true, hat: 'kabuto_m', flag: 'asano' } }, { type: 'samurai', n: 3, o: { flag: 'asano' } }, { type: 'ashigaru', n: 12, o: { flag: 'asano' } }, { type: 'gun', n: 3, o: { flag: 'asano' } }], ISHI));
    F.fordAlly.ai = false;   // 11/4 jin：自由な AI だと浅瀬の手前に留まり、門へ来なかった（AQ7）。下知どおりに進む
    F.fordAlly.onArrive = (q) => { q.onArrive = null; q.order = 'hold'; q.anchor = { x: FRONT.x + 3, z: FRONT.z + 3 }; q.aggro = 16; };
    KIT.backOf(rt, F.fordAlly, { flag: 'asano', armor: ISHI.armor, kind: 'spear', w: 14, depth: 10, count: 180, gap: 4, seed: 10903 });
    F.sanada = allyGroup(rt, { faction: 'sanada_kuro', name: '真田昌幸の手', fullStrength: true, anchor: { x: FORD.x + 14, z: FORD.z + 2 }, facing: Math.atan2(-1, -1), width: 6, aggro: 10, noRout: true,
      order: 'move', dest: { x: FRONT.x + 7, z: FRONT.z - 1 }, speed: 2.6, dmgMult: 0.5 },
    // 11/4 jin（AV1）：赤備えは大坂の陣の信繁の物。天正十八年の昌幸の手は黒の具足に六文銭の旗
    //   11/5 fix3：家の表の真田は大坂の赤備えの色（朱の陣笠）なので、旗は六文銭のまま家を黒の真田（sanada_kuro）に。胴の紋も武田の菱でなく六文銭
    dress([{ type: 'busho', n: 1, o: { name: '真田昌幸', invuln: true, horse: true, hat: 'kabuto_w', mon: 'sanada' } }, { type: 'samurai', n: 2, o: { mon: 'sanada' } }, { type: 'ashigaru', n: 8, o: { mon: 'sanada', hatColor: 0x1c1916 } }], SANADA));
    F.sanada.ai = false;
    F.sanada._avReal = true;   // 後から足す兵（av_host）は仲間の旗から赤備えの家を引くので足さない。厚みは控えで見せる
    F.sanada.onArrive = (q) => { q.onArrive = null; q.order = 'hold'; q.anchor = { x: FRONT.x + 7, z: FRONT.z - 1 }; q.aggro = 16; };
    // 控えは真田の家紋の結び雁金（六文銭の控えは寄れば武田の家の兵に替わってしまう・b_nagashinojo.js の MON_FAC）
    KIT.backOf(rt, F.sanada, { flag: 'sanada2', armor: ISHI.armor, kind: 'mixed', w: 12, depth: 8, count: 120, gap: 4, seed: 10904 });
    // 11/7：寄せ手は竹束を立てて浅瀬を寄せる（前は竹束が一つも無かった・critic60）。土橋の両脇に二重に立て、真ん中は通れるように空ける
    if (!F.takeTaba) {
      F.takeTaba = true;
      const ux = (GATE.x - FORD.x), uz = (GATE.z - FORD.z), L = Math.hypot(ux, uz), dx = ux / L, dz = uz / L, px = -dz, pz = dx;
      for (const k of [12, 20]) {
        const cx = FRONT.x - dx * k, cz = FRONT.z - dz * k;
        for (const sd of [-1, 1]) takatabaRow(rt, [[cx + px * sd * 2.2, cz + pz * sd * 2.2], [cx + px * sd * 6.4, cz + pz * sd * 6.4]], { spacing: 2.0, side: -1 });
      }
    }
    // 城そのものが兵器：佐間口の塀の内と櫓の下から、鉄砲と弓が寄せ手を撃つ（門に近づくほど当たる）
    const ya = Math.atan2(GATE.z - NI.z, GATE.x - NI.x);
    F.wallShot = [ya + 0.45, ya - 0.45].map((wa) => enemyGroup(rt, { faction: 'narita', name: '佐間口の塀の鉄砲', anchor: { x: NI.x + Math.cos(wa) * (NI.r - 3), z: NI.z + Math.sin(wa) * (NI.r - 3) }, facing: Math.PI * 0.25, width: 4, noRout: true,
      order: 'hold', aggro: 36, fixed: true, dmgMult: 0.16 }, dress([{ type: 'gun', n: 3 }, { type: 'bow', n: 2 }], HOJO)));   // 11/4 jin：門の前で三発で倒れた。煙と音は残し、当たりを軽く
  },
  // ⑤ 門を開いて、正木丹波守の手が打って出る（佐間口の守り頭。史実で生き残るので討てない）。続いて甲斐姫の手（後の軍記の言い伝え）
  sortie(rt, i) {
    const F = rt.flags;
    if (i === 0) {
      if (F.step >= 8) return;
      F.step = 8; F.stepT = rt.t;
      rt.setPhase('sortie');
      rt.obj('main', MISSIONS[7], 'main');
      openDoor(rt);
      rt.after(16, () => this.sortie(rt, 1));
    }
    if (F.step !== 8) return;
    const g = enemyGroup(rt, { faction: 'narita', name: i ? '甲斐姫の手' : '正木丹波守の手', anchor: { ...INSIDE }, facing: Math.PI * 0.25, fleeDir: { x: -1, z: -1 }, width: 5, noRout: true, formation: 'yari', morale: 90,
      order: 'move', dest: { x: FRONT.x - 1, z: FRONT.z - 1 }, speed: 3.6, aggro: 3, dmgMult: 0.42 },
    dress(i ? [{ type: 'samurai', n: 1, o: { name: '甲斐姫', invuln: true, horse: true, hat: 'hachimaki', haori: 0x8a2a2a } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 9 }]
      : [{ type: 'busho', n: 1, o: { name: '正木丹波守', invuln: true, horse: true, hat: 'kabuto_m' } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 15 }], HOJO));
    g.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; q.seekRange = 30; q.aggro = 14; };
    F.sorties.push(g);
    rt.army.play('eshout', GATE, 1.3);
    // 浅野・真田の手は門の前へ詰め、打って出た手を一緒に受け止める（自分だけが戦わない・AP5）
    for (const a of [F.fordAlly, F.sanada]) if (live(a)) { a.order = 'move'; a.dest = { x: FRONT.x + 2, z: FRONT.z + 2 }; a.speed = 3.6; a.seekRange = 24; a.aggro = 18; a.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; q.seekRange = 24; }; }
    if (i === 0) rt.say('浅野長吉', '門が開いた！正木丹波が打って出たぞ。門の前で受け止めよ！', 3.6);
    else { rt.say('浅瀬の寄せ手', '女武者が先頭じゃ！成田の姫か！', 3.2); rt.after(3.4, () => rt.say('甲斐姫', '忍の城は、女子供まで戦うぞ！', 3)); }
  },
  // ⑥ 打って出た手が半ばを討たれて退く。門の前に残って退く手を庇う城兵を討つ（史実：七月の寄せは口を破って首を取っても、城の内へは入れなかった）
  //   11/7：前は門の内の枡形へ付け入り、二の丸の口まで払っていた。城に入れなかった史実と合わず、⑥は十秒で済んで勝ちになった（critic60）
  tsukeiri(rt) {
    const F = rt.flags;
    if (F.step >= 9) return;
    F.step = 9; F.stepT = rt.t;
    rt.setPhase('tsukeiri');
    rt.obj('main', MISSIONS[8], 'main');
    rt.award((t) => { t.side.push('打って出た正木丹波守の手を退けた'); }, '打って出た城兵を退けた');
    // 打って出た手の残りは門の内へ退く（門の内へ入ったら見えなくなる）
    for (const g of F.sorties) if (live(g)) { g.noRout = false; g.order = 'move'; g.dest = { ...INSIDE }; g.speed = 4; g.aggro = 0; for (const u of g.units) if (u.alive && !u.gone) { u.fleeing = true; u.target = null; } }
    // 門の前に残って、退く手を庇う城兵（門の外で槍を並べる）
    F.rear = enemyGroup(rt, { faction: 'narita', name: '門前に残った城兵', anchor: { ...REAR }, facing: Math.PI * 0.25, fleeDir: { x: -1, z: -1 }, width: 5, noRout: true, formation: 'yari', morale: 85,
      order: 'hold', aggro: 10, fixed: true, dmgMult: 0.34 }, dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }], HOJO));   // fixed：門の外に踏み止まる（門の内へ押し込まれて討てなくならない）
    F.rear0 = F.rear.units.length;
    rt.say('浅野長吉', '退くぞ！門の前に残った者を討て。首を取れ！', 3.6);
    // 打って出た手が内へ入ると門を閉める（寄せ手は門の内へ入れない）
    rt.after(7, () => { for (const g of F.sorties) for (const u of g.units) if (u.alive && !u.gone && u.fleeing) rt.army.despawn(u); this.closeDoor(rt); });
    rt.after(4, () => { if (!F.ending) rt.say(nm(rt), '門を閉める前に、門の前の者を討つ！', 3); });
    // 浅野・真田の手も門の前の城兵へ寄る（門の内へは入らない）
    for (const a of [F.fordAlly, F.sanada]) if (live(a)) { a.order = 'move'; a.dest = { x: REAR.x + 3, z: REAR.z + 3 }; a.speed = 3.2; a.onArrive = (q) => { q.onArrive = null; q.order = 'hold'; q.anchor = { x: REAR.x + 3.5, z: REAR.z + 3.5 }; q.aggro = 9; }; }
  },
  // 門を閉める（打って出た手と門の前の城兵が内へ入った後）
  closeDoor(rt) {
    const F = rt.flags;
    if (!F.doorOpen) return;
    F.doorOpen = false;
    for (const pv of F.door?.userData.leaves || []) pv.rotation.y = 0;
    if (F.doorSt) { F.doorSt.alive = true; F.doorSt.opened = false; }
    sfx('wood', 1);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '忍城の明け渡しを見届けた', pts: 20 }; }, '忍城の明け渡しを見届けた');
    rt.player.u.invuln = true;
    // 戦の後の会話（史実：城は自力では落ちず、小田原の開城の後に明け渡された。開城の段は t10_oshi/kaijo.js）
    rt.say('石田三成', '水で囲んでも、浮き城は沈まなんだ', 3.2);
    rt.after(3.6, () => rt.say('大谷吉継', '関東の城で、最後まで開かなんだのはこの城だけじゃ', 3.4));
    rt.after(7.4, () => rt.say('石田三成', '……殿下へは、ありのままを申し上げる', 3));
    rt.after(3, () => victoryMoment(rt, '勝'));
    rt.finish({ scriptedEnd: true }, 14);
  },
  lose(rt, why) {
    const F = rt.flags;
    if (F.ending || !rt.canFailMission()) return;
    F.ending = true;
    rt.objFail('main');
    rt.tracker.main = false;
    rt.say('石田三成', why === 'evac' ? '人夫も兵も、水に呑まれたか……' : '門の前で崩れたか……退け！', 3.4);
    rt.finish({ failureReason: why === 'evac' ? '逃がす人夫と兵が半分を切った' : '佐間口の寄せが崩れた' }, 5);
  },

  missions: MISSIONS,
  missionOf(rt) { return Math.max(0, Math.min(MISSIONS.length - 1, (rt.flags.step || 1) - 1)); },
  missionPin(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive) return null;
    for (const st of [chikara, kobuneSt, kaijo]) { const q = st.pin(rt, C); if (q !== undefined) return q; }
    if (F.step <= 3) return { x: RAIDAT.x, z: RAIDAT.z, r: 10, label: '浅瀬の口' };
    if (F.step === 4) return F.weirOpen ? null : { x: WEIR.x, z: WEIR.z, r: 4, label: '堤の西の堰' };
    if (F.step === 6) return F.broken ? { x: MARU.x, z: MARU.z, r: 14, label: '丸墓山' } : null;
    if (F.step <= 8) return { x: FRONT.x, z: FRONT.z, r: 6, label: '佐間口の門前' };
    return { x: REAR.x, z: REAR.z, r: 5, label: '佐間口の門前' };
  },

  update(rt, dt) {
    const F = rt.flags;
    if (!F.lake) return;
    KIT.backTick(rt);
    // 水面：堰を切ると沼が満ちる。堤が切れると陣に水が来る
    if (F.weirOpen && F.lakeY < LAKE_HI) { F.lakeY = Math.min(LAKE_HI, F.lakeY + dt * (LAKE_HI - LAKE_LO) / 18); F.lake.position.y = F.lakeY; }
    if (F.broken && F.floodY < FLOOD_HI) { F.floodY = Math.min(FLOOD_HI, F.floodY + dt * (FLOOD_HI - FLOOD_LO) / 14); F.flood.position.y = F.floodY; }
    if (F.broken && F.campFlags && rt.t - F.breakT < 20) {
      // 陣の旗が流される
      for (const [i, f] of F.campFlags.entries()) { f.position.x += dt * (0.9 + i * 0.3); f.position.z += dt * 0.5; f.rotation.z = Math.min(1.2, f.rotation.z + dt * 0.08); f.position.y -= dt * 0.12; }
    }
    if (F.ending) return;
    const P = rt.player.u;
    if (!rt.timeLimit?.up) for (const u of rt.army.units) {
      if (!u.alive || u.gone) continue;
      if (u.pos.x > XW) u.pos.x = XW; else if (u.pos.x < -XW) u.pos.x = -XW;
      if (u.pos.z > XW) u.pos.z = XW; else if (u.pos.z < -XW) u.pos.z = -XW;
    }
    chikara.tick(rt, dt, C); kobuneSt.tick(rt, dt, C); kaijo.tick(rt, dt, C);   // 足した段（t10_oshi/）
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.5;
    // 11/4 jin：門が開いて城兵が打って出た後は、塀の上からの矢の雨（siege_feel の volley）を止める（味方を射る事になる。前は門の前で矢の雨と打って出の挟みで数秒で倒れた）
    F.noVolley = F.step >= 8;
    // 11/4 jin：井楼櫓の中の守り（shironaka.js が城兵から上げる）は門の前を射すくめ、数秒で倒れた。撃つのは残し、当たりを塀の鉄砲と同じに軽く
    for (const g of rt.army.groups) if (g.team === 1 && g.dmgMult !== 0.05 && /櫓の守り$/.test(g.name || '')) g.dmgMult = 0.05;
    if (F.step === 3) {
      // 前の夜討ちが崩れたら次。三度退けば堤が出来る
      const cur = F.raids[F.raids.length - 1];
      // 道沿いの下知では全員の整列待ちで斬り合いへ移れない事がある。
      // 口へ届いた手だけ迎撃に替える。途中で追撃に替えて沼を横切らせない。
      if (cur && cur.order === 'path' && fighting(cur) && near(cur.anchor, RAIDAT, 6) &&
          cur.units.some((u) => u.alive && !u.gone && !u.fleeing && near(u.pos, RAIDAT, 8))) {
        cur.order = 'attack'; cur.seekRange = 12; cur.aggro = 12; cur.onArrive = null;
      }
      // 区の足軽は浅瀬の口から離れて追わない（前は夜討ちの残り一人を城の口まで追い、次の夜討ちとそこで斬り合って、主人公の前に敵が来なかった）
      for (const u of F.guard.units) if (u.alive && !u.gone && !near(u.pos, F.guard.anchor, 14)) { u.target = null; u.watch = null; }
      // 夜討ちが一人二人になったら城へ引き揚げ、次の夜討ちが来る（残り一人を待って一分止まらない）
      for (const g of F.raids) if (fighting(g) && g.units.filter((u) => u.alive && !u.gone && !u.fleeing).length <= 2 && g.units.length > 4) {
        g.noRout = false; g.morale = 0; g.order = 'move'; g.dest = { x: GATE.x, z: GATE.z }; g.aggro = 0;
        for (const u of g.units) if (u.alive && !u.gone) u.fleeing = true;   // 前の手も残さず、討てない正木丹波守も城へ退く
      }
      // 次の夜討ちは、前が崩れて五秒後か、前が粘っても三十秒で浅瀬に寄せる（夜討ちは間を空けず次々と来る）
      // 11/8 15分の構成：夜討ちは四度。間に普請の進む間（十二秒）を置き、段は二分半から三分
      if (cur && F.raid < 4 && fighting(cur) && rt.t - F.raidT > 34) { F.nextT = 0; this.raid(rt); }
      else if (cur && !fighting(cur)) { if (F.raid < 4) { if (!F.nextT) F.nextT = rt.t + 12; if (rt.t >= F.nextT) { F.nextT = 0; this.raid(rt); } } else if (!F.raids.some(fighting) && rt.t - F.stepT > 140 && P.alive && near(P.pos, RAIDAT, 18)) this.weir(rt); }
      // 時刻だけで夜討ちを消さない。四度とも退け、本人も浅瀬の口を守ってから夜明けへ。
      // 二巡（11/9 bot）：四度目の後、浅瀬の口から二十 m より遠くで立ち尽くす夜討ちの残りが段を十分止めた。四度出て百九十秒過ぎたら、遠くの残りは城へ戻す
      if (F.raid >= 4 && rt.t - F.stepT > 190) for (const g of F.raids) if (fighting(g)) for (const u of g.units) if (u.alive && !u.gone && !near(u.pos, RAIDAT, 20)) rt.army.despawn(u);
    } else if (F.step === 4) {
      if (!F.weirOpen) {
        if (!F.weirRaid && (near(P.pos, WEIR, 30) || rt.t - F.stepT > 30)) this.weirRaid(rt);
        // 堰へ寄せた城兵を退けるまで、堰板は抜けない（主人公が着いて立つだけでは切れない）
        const raidOn = F.weirRaid && fighting(F.weirRaid) && F.weirRaid.units.filter((u) => u.alive && !u.gone && !u.fleeing).length > 1;
        if (F.weirRaid && !raidOn && fighting(F.weirRaid)) { F.weirRaid.noRout = false; F.weirRaid.morale = 0; for (const u of F.weirRaid.units) if (u.alive && !u.gone) u.fleeing = true; }
        F.weirT = P.alive && near(P.pos, WEIR, 4.5) && F.weirRaid && !raidOn ? F.weirT + 0.5 : 0;
        if (F.weirT >= 2) this.openWeir(rt);
      }
    } else if (F.step === 6) {
      if (!F.broken) return;
      // 人夫と兵は主人公の呼ぶ方へ付いて来る。離れただけで無作為に討死させない。
      let alive = 0, safe = 0;
      for (const g of F.evac) {
        // 主人公のそばの組は丸墓山へ。離れた組（堤の西の端の人夫・浅瀬で斬り合う足軽）は、呼ぶ声の方へ寄って来る
        //   11/4 jin：組は主人公と同じ足で丸墓山へ走る（前は水の中で 2.2 に落ち、主人公だけ先に着いて組が水に取られた・BH3）
        // 11/7：組は主人公の後ろ三歩に付いて走る（前は先に丸墓山へ向けて走らせ、水の中で散り、主人公のそばは一〜四人だった・critic60）
        const to = g._evTo || (g._evTo = { x: 0, z: 0 });
        const hd = Math.atan2(MARU.x - P.pos.x, MARU.z - P.pos.z);
        if (near(P.pos, MARU, 30)) { to.x = MARU.x - 6; to.z = MARU.z - 6; } else { to.x = P.pos.x - Math.sin(hd) * 3; to.z = P.pos.z - Math.cos(hd) * 3; }
        g.order = 'move'; g.dest = to; g.speed = 5.2; g.aggro = 0;
        for (const u of g.units) {
          if (!u.alive || u.gone) continue;
          alive++;
          if (near(u.pos, MARU, 24)) safe++;
        }
      }
      // 堤が切れて二十秒は、散った組を呼び集める間（すぐ負けにしない）。
      if (!F.arrived && rt.t - F.breakT > 20 && alive < F.evac0 * 0.4) { this.lose(rt, 'evac'); if (F.ending) return; }
      // 時が来ただけでは済ませない。主人公が丸墓山の上に着き、組が付いて来たら、三成が迎えて次へ（11/7・critic60「着いたら何かが起きて次へ」）
      if (!F.arrived && P.alive && near(P.pos, MARU, 18) && safe > 0 && safe >= Math.ceil(F.evac0 * 0.5)) {
        F.arrived = true;
        rt.award((t) => { t.side.push('人夫と兵を逃がした'); }, '人夫と兵を逃がした');
        for (const g of F.evac) { g.order = 'hold'; g.anchor = { x: MARU.x - 6, z: MARU.z - 6 }; }
        if (live(F.cutters)) { F.cutters.noRout = false; F.cutters.morale = 0; }
        rt.army.play('shout', MARU, 1.2);
        rt.say('石田三成', `よう連れて来た。${safe}人、生きて上がったか`, 3.2);
        rt.after(3.4, () => rt.say(nm(rt), '陣は水の底じゃ……', 2.6));
        rt.after(6.4, () => this.ford(rt));
      }
    } else if (F.step === 7) {
      // 本人も門前へ寄せてから打って出を受ける。浅瀬の途中で任務を済ませない。
      if (P.alive && near(P.pos, FRONT, 9)) this.sortie(rt, 0);
    } else if (F.step === 8) {
      // 打って出た二手の六割を討つと退く（右上の数と同じ数え方。討てない正木丹波守と甲斐姫は数えない）
      const k = sortieCount(F);
      if (k && k[0] >= k[1] && P.alive && near(P.pos, FRONT, 18)) this.tsukeiri(rt);
    } else if (F.step === 9) {
      // 退く手の残りは門の内へ入ったら消える（門の内に城兵が溜まらない）
      for (const g of F.sorties) for (const u of g.units) if (u.alive && !u.gone && u.fleeing && near(u.pos, INSIDE, 3)) rt.army.despawn(u);
      // 寄せ手の兵は門の内へ追って入らない（城の内へは入れない）
      for (const g of [F.fordAlly, F.sanada]) if (g) for (const u of g.units) if (u.alive && !u.gone && u.target?.fleeing && near(u.target.pos, GATE, 4)) u.target = null;
      const killed = F.rear ? F.rear.units.filter((u) => !u.alive).length : 0;
      // 門の前の城兵を七割討ち、主人公が門の前にいれば済む（時が来ただけでは勝ちにしない・十秒で済まない）
      if (P.alive && F.rear0 > 0 && near(P.pos, FRONT, 16) && killed >= Math.ceil(F.rear0 * 0.7)) kaijo.start(rt, C);   // 門前を払っても城へは入れず、小田原の開城を待つ（t10_oshi/kaijo.js）
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },

  // bot：段ごとの行き先へ。近い敵は突く
  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    if (!u.alive || F.ending || !F.step) return;
    const T = { goTo, patientStrike };
    if (chikara.bot(b, inp, T, C) || kobuneSt.bot(b, inp, T, C) || kaijo.bot(b, inp, T, C)) return;
    const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3 && b.world.heightAt(o.pos.x, o.pos.z) > (F.lakeY ?? -9) - 0.5;   // 沼の深みへは追わない
    const range = F.step === 6 ? 8 : F.step === 4 ? 14 : F.step === 7 ? 6 : F.step === 3 ? 30 : 14;
    const home = F.step === 8 ? FRONT : F.step === 3 ? RAIDAT : F.step === 9 ? REAR : null;
    const e = b.army.nearestEnemy(u, range, (o) => ok(o) && (!home || near(o.pos, home, F.step === 3 ? 14 : F.step === 9 ? 10 : 16)));
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
      patientStrike(p, inp, e, d, true);
      return;
    }
    inp.guardHold = false;
    if (F.step === 3) { goTo(p, inp, RAIDAT.x, RAIDAT.z, 3); return; }   // 堤の内の法で、城から来る夜討ちを待つ
    if (F.step === 4) { if (!F.weirOpen) goTo(p, inp, WEIR.x, WEIR.z, 1.5); else goTo(p, inp, KU.x, KU.z + 6, 3); return; }
    if (F.step === 6) {
      if (!F.broken) { goTo(p, inp, EVAC0.x + 4, EVAC0.z + 2, 3); return; }
      // 組を待つ：人夫と兵の真ん中から十八歩より離れない（水に取られた一人を追って立ち止まらない）
      let cx = 0, cz = 0, n = 0;
      for (const g of F.evac || []) for (const o of g.units) { if (!o.alive || o.gone || !near(o.pos, u.pos, 45)) continue; cx += o.pos.x; cz += o.pos.z; n++; }
      if (n && Math.hypot(cx / n - u.pos.x, cz / n - u.pos.z) > 18) goTo(p, inp, cx / n, cz / n, 4); else goTo(p, inp, MARU.x, MARU.z, 4);
      return;
    }
    if (F.step <= 8) { goTo(p, inp, FRONT.x, FRONT.z, 3); return; }
    goTo(p, inp, REAR.x + 2, REAR.z + 2, 2);
  },
};

t10_oshi.force = (rt) => {
  const F = rt.flags;
  return { a: Math.max(0, 23000 - (F.ak || 0) * 30), a0: 23000, b: Math.max(0, 3116 - (F.ek || 0) * 12), b0: 3116 };
};
t10_oshi.date = (rt) => {
  const st = rt.flags.step || 0;
  return st <= 2 ? '天正十八年六月の初め　曇' : st === 3 ? '天正十八年六月　梅雨・夜' : st <= 5 ? '天正十八年六月　曇' : st === 6 ? '天正十八年六月十八日　大雨の夜' : st === 10 ? '天正十八年七月　開城' : '天正十八年七月　総攻め';
};
t10_oshi.history = '天正十八年（1590）、豊臣秀吉の小田原攻めの中で、石田三成は北条方の忍城（武蔵国）を囲んだ。城は沼と深田に囲まれた浮き城で、三成は長い堤（石田堤）を築いて川の水を引き入れ、水攻めにした。城は沈まず、大雨で堤が切れて寄せ手の側に水が出たと伝わる（同じころの日記に大雨の記しが無く、雨で切れたか人が切ったかは確かでない）。城の者は守り通し、小田原の開城の後に城を明け渡した。寄せ手はおよそ二万三千、城方は三千百十六（侍六十九・足軽四百二十・ほかは百姓や町人の雑兵）と伝わる。六月十八日の大雨の夜、本丸まで水が来るのを恐れた下忍口の本庄泰展の手が堤を切り、寄せ手におよそ二百七十の死者が出たという。主人公の受け持つ区、夜討ちの数と人数、浅瀬の寄せ、佐間口の打って出と門前の追い討ちの細かな流れは、遊びのための復元（寄せ手は口に迫って首を取っても、城の内へは入れなかった）。忍城と丸墓山の向きと間合いは実の位置を縮めたもの。城方の旗は成田氏の月下三引両。寄せ手には大谷吉継・長束正家がつき、七月には浅野長吉（のちの長政）・真田昌幸らも加わって城の口を攻めたが、城は落ちなかった。城主の成田氏長は小田原に籠もっており、城代の成田泰季が囲みの中で病死した後は、一門の成田長親が城を守った。正木丹波守らが城の口を固めた。氏長の娘の甲斐姫が自ら打って出て戦ったという話は、後の軍記に残る言い伝え（史実とは分けて扱う。佐間口に出るのは遊びのための形で、姫は開城の後も生きた）。同じころの書状では、水攻めは秀吉の命で、三成はむしろ先に攻め寄せたいと考えていた。七月初めに浅野長吉が皿尾口を破って首三十余を取ったが、秀吉は「ともかく水攻めにせよ」と返した。忍城は小田原の開城の後、七月十六日に氏長の言葉を受けて明け渡された。城兵と領民は罪に問われなかったと伝わる。地形は国土地理院の標高をもとにした。';

// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
// 倒す数（kaito 11/2 O）：右上の任務の一行に「（倒した数／倒す数）」。段が進む判定と同じ数え方（stages.js）
// 討ち取りが条件の⑤⑥は、段を進める判定と同じ人数を出す。
KILLS.t10_oshi = (rt) => {
  const F = rt.flags;
  if (F.ending) return null;
  // 丸墓山へ着いた人数を、段の達成に必要な人数と同じ物差しで出す。
  if (F.step === 6 && F.evac0 > 0) {
    let safe = 0;
    for (const g of F.evac || []) for (const u of g.units) if (u.alive && !u.gone && near(u.pos, MARU, 24)) safe++;
    const need = Math.ceil(F.evac0 * 0.5);
    return [Math.min(safe, need), need];
  }
  if (F.step === 8) return sortieCount(F);
  if (F.step === 9 && F.rear0 > 0) return [F.rear.units.filter((u) => !u.alive).length, Math.ceil(F.rear0 * 0.7)];
  return null;
};
C.def = t10_oshi;
withGuard(t10_oshi);

export { t10_oshi };
