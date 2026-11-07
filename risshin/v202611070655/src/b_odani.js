import { fireGlow } from './fire_glow.js';
import { pressureTick } from './battle_pressure.js';
import { dressSlope } from './terrain_slope.js';
import { battleJin, installBattleJinkei } from './b_jinkei_layout.js';
// ======================================================================
// 織田家編　小谷城の戦い（天正元年八月〜九月）　docs/late6-1573-1575-spec.md 14〜37章
// 刀根坂で朝倉を破った信長は、その足で北近江の小谷城を囲んだ。羽柴秀吉は夜、清水谷から尾根の真ん中の
// 京極丸へ攻め上り、南の本丸（浅井長政）と北の小丸（父の久政）とを切り離した。
// 足軽は羽柴秀吉の手。①清水谷（浅井の居館と屋敷の谷）を登る ②京極丸を取る ③分断：両方からの寄せを受ける
// ④小丸へ攻め上がる。久政・長政の最期とお市の退去は戦後の知らせ。
// 南の大手は番所前の攻防と控えを遠景で補う。同夜に各曲輪を順に落としたとは断定せず、閉じた門を越えない。
// 「本丸を取れば終わり」でなく、城の真ん中を割って崩す戦。
// 縄張りは castles/odani.js（梯郭の曲輪・大堀切・門・櫓・清水谷の道）。大将格（長政・久政）は前線に出さない。
// 向き：主尾根は南北（北 -z が高い）。清水谷は尾根の西（-x）。信長の本陣（虎御前山）は南西の別の丘。
// ======================================================================
import * as THREE from 'three';
import { S } from './settings.js';
import { isTouch } from './touch.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { yokoyaZa, hiddenGunNest, nobori, hut, campfire, ishigaki, kagaribi, umatsunagi, lumber, kabukimon, dorui, takaDorui, palisade, castleBoardFence, tawara, takataba, solidRect, solidSeg, castleMat, makeKitBatch, finalizeKitBatch, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { buildOdaniUpper } from './odani_upper.js';
import { flagTexture } from './textures.js';
import { barkTex, dirtTex } from './nature.js';
import { ODANI_KACCHU } from './kacchu_data.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { sightPoint, sightUnit } from './battle_sight.js';
import { goalsTick } from './hud_goals.js';
import { enemyGroup, allyGroup, nm, centerOf, unitPos } from './bhelp.js';
import { evRemove } from './b_ev6.js';
import { applyLook, dress, gone } from './b_inabayama.js';
import { clash } from './b_sekigahara.js';
import { buildCastlePlan, heightOf, inPoly } from './castle_plan.js';
import { goten, horiboriHeight, dobeiLine, kabukiGate, sakamogiRow, takatabaRow, donouRow, seiro } from './castle_parts.js';
import { siegePlan, siegeHeight, buildSiege } from './siege_kit.js';
import { castlePartOver } from './cgt_castle.js';
import { Garan } from './temple1571.js';
import { reset as flReset, groundAt } from './floors.js';
import { timeslipField, fieldGrassGeo } from './timeslip_field.js';
import { rockShape } from './rock_shape.js';
import { KIT } from './b_nagashinojo.js';
import { dressStage } from './stage_dress.js';
import { odaniExtraHeight, odaniExtraClear, buildOdaniFukugen } from './odani_fukugen.js';
import {
  ODANI_PLAN as ODANI_BASE_PLAN, RIDGE, STONE_KURUWA, SOUTH_SHIFT, crestAt, BANSHO, OCHAYA, ONMAYA, SAKURABABA, OOHIROMA, HON, NAKAMARU, NAKAMARU_YOKOYA, KYOGOKU as KYO, KOMARU as KOM, SANNOMARU as SANNO, SANNO2, KYOGOKU2, OKURIDGE, UPPER,
  UMAARAI, OHORIKIRI, GATE_KURO, GATE_NAKA_KYO, GATE_KYO_KOMA, GATE_WEST, MASU_WEST, SHIMIZU, SHIMIZU_FLOOR, CLIMB_UP, KOMA_WEST, demH, KUICHIGAI, NESTS, YOKOYA, ONOGI, AKAO, KYOKAN, TERA, YASHIKI, ROAD_RIDGE, OTE_CLIMB,
} from './castles/odani.js';

// 門の上の建物は形を確定できない。冠木門と木戸で補い、位置・開口・曲輪は保つ。
// 元の縄張りを書き換えず、この戦の組み立てにだけ渡す。
// 保存管理計画表7：桜馬場は切岸で守られ、土塁は存在しない。柵・門の開口は保つ。
// 切岸は歩行と同じ地面で描き、斜面から浮く上張りを作らない。
const ODANI_PLAN = { ...ODANI_BASE_PLAN, terrainBanks: true,
  kuruwa: ODANI_BASE_PLAN.kuruwa.map((k) => k.id === SAKURABABA.id ? { ...k, dorui: 0 }
    : k.id === NAKAMARU.id ? { ...k, get poly() { return S.quality === 'high' ? NAKAMARU_YOKOYA : k.poly; } } : k),
  koguchi: ODANI_BASE_PLAN.koguchi.map((g) =>
  g.gate === 'yagura' ? { ...g, gate: 'kabuki' } : g) };
// 虎御前山は小谷山の南西。距離と丘の高さは遊びのために縮めた推定復元。
// 長浜市の保存管理計画・国会図書館のレファレンス協同データベースを参照。
const TORAGOZEN = { x: -52, z: 246, h: 24 };
const KINGO = { id: 'kingo', name: '金吾丸', x: -24, z: 190 + SOUTH_SHIFT, flag: null };
// 縄張りの床は回転した標高の尾根に沿わせ、清水谷と門の道だけ歩ける幅にならす。
const KC = { x: KYO.x, z: KYO.cz };                       // 京極丸の真ん中
const KOMC = { x: KOM.x, z: KOM.cz };
const HONC = { x: HON.x, z: HON.cz };
const MOUTH = { x: -93, z: 86 };   // 清水谷の中ほど（羽柴の手が集まる所。谷の口から忍んで入った）
// 11/2 点付け（小谷72）：25秒は秀吉の脇に潜む所（-92,96）で南（谷の口）を向く。ここから9〜10m は門・林の木を立てず、肩越しの画面をふさがない。
const HIDE25 = { x: -92, z: 96 };
const HEAD = { x: SHIMIZU[SHIMIZU.length - 1][0], z: SHIMIZU[SHIMIZU.length - 1][1] };   // 谷の奥
// 長浜市保存管理計画85頁：伝知善院跡の池は検出長14m・幅5m、北寄りに5m×3.5mの島状遺構。
// 東端は未確認。谷を縮めた位置と当夜の水位は復元で、寺の南・谷道の西へ置く。
const TEMPLE_GARDEN = { x: TERA.x, z: TERA.z + 14, level: null };
// 保存管理計画33頁・表7：知善院跡の周囲は溝で区画される。
// https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
// 谷の寺にも区画溝を補う。位置・幅2m・深さ70cm・開口は推定で、当夜の水位は不明。
// 東の堂への入口と南の民の退路を空け、池・堂・小屋・清水道を削らない。
// 既存の地面だけを削り、形・材質や毎コマの入れ物は増やさない。
const TEMPLE_DITCHES = [
  [[12, -4], [12, -18], [-12, -18], [-12, 21], [-2, 21]],
  [[8, 21], [12, 21], [12, 4]],
].map((pts) => horiboriHeight(pts.map(([x, z]) => [TERA.x + x, TERA.z + z]), { width: 2, depth: .7 }));
// 保存管理計画86頁：寺の入口へ通じる東西道の北側に幅3m・深さ42cmの素掘溝。
// 区画溝とは別に短い一部を補う。位置・長さ・断面と当夜の水位は不明。
// 東の入口の北へ離し、清水道の歩く幅に届く前で止める。
const TEMPLE_ROAD_DITCH = horiboriHeight([
  [TERA.x + 12, TERA.z - 6], [TERA.x + 16, TERA.z - 6],
], { width: 3, depth: .42 });
function templeDip(x, z) {
  if (S.quality !== 'high' || x < TERA.x - 13 || x > TERA.x + 17.5
    || z < TERA.z - 19 || z > TERA.z + 22) return 0;
  return Math.min(TEMPLE_DITCHES[0](x, z), TEMPLE_DITCHES[1](x, z), TEMPLE_ROAD_DITCH(x, z));
}
// 保存管理計画表7・34頁：谷道には高さ約五メートルの蛙岩がある。
// 道の西へ離した位置・幅・形は縮めた谷での推定。道と屋敷の庭を空ける。
const KAERU_ROCK = { x: -99, z: 60, h: 5 };
// 保存管理計画表7・31頁：中丸から京極丸へ登る左手の刀洗い池は、岩盤を掘った水の手。
// 場所は尾根道の西に寄せた推定。寸法・当夜の水位は復元で、木戸と反撃の道幅は保つ。
const KATANA_POND = { x: -9, z: (NAKAMARU.z0 + KYO.z1) / 2, w: 4.8, d: 2.4, level: null };
// 保存管理計画31頁・表7：中丸の清水谷側には南北35m・東西10mの御局屋敷跡。
// https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
// 高画質だけ西下の斜面に細長い平場を補う。位置・縮尺・比高は推定。
// 建物と当夜の居住者は断定せず、大堀切・刀洗い池・西の登り道と銃座は避ける。
const OTSUBONE = { x: -21, z: -40, hw: 2, hd: 7 };
// 保存管理計画表7・31頁：京極丸の東の土塁の下には四段の曲輪がある。
// https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
// 高画質の東斜面に四つの平場を補う。座標・幅・比高は縮めた地形での推定。
// 土塁と櫓、南北の門、中央の乱戦と西の攻め道から離し、既存の地面だけを使う。
const KYO_EAST = Array.from({ length: 4 }, (_, i) => ({
  x: KYO.x + 28 + i * 7, z: KYO.cz, level: KYO.level - 4 - i * 3,
}));
function kyoEastWeight(x, z, p) {
  return Math.max(0, Math.min(1, 3.5 - Math.abs(x - p.x), (9 - Math.abs(z - p.z)) / 2));
}
function kyoEastAt(x, z) {
  if (S.quality !== 'high' || x <= KYO.x + 24.5 || x >= KYO.x + 52.5
    || Math.abs(z - KYO.cz) >= 9) return null;
  const p = KYO_EAST[Math.max(0, Math.min(3, Math.round((x - KYO.x - 28) / 7)))];
  return kyoEastWeight(x, z, p) > 0 ? p : null;
}
function otsuboneWeight(x, z) {
  if (S.quality !== 'high') return 0;
  return Math.max(0, Math.min(1,
    (OTSUBONE.hw + 1.5 - Math.abs(x - OTSUBONE.x)) / 1.5,
    (OTSUBONE.hd + 1.5 - Math.abs(z - OTSUBONE.z)) / 1.5));
}
// 保存管理計画表7・30頁：大広間の北東隅に長さ3.3m・横2.7m・深さ0.9mの石組み井戸と溝。
// 向きと溝の短い東向きの取り回しは推定。館・中央の道・守備兵の持ち場を避ける。
const HIROMA_WELL = { x: OOHIROMA.x + OOHIROMA.hw - 4, z: OOHIROMA.z0 + 4.5, w: 3.3, d: 2.7, depth: .9 };
const HIROMA_DRAIN_END = OOHIROMA.x + OOHIROMA.hw - .7;
const BELOW = { x: CLIMB_UP[2][0], z: CLIMB_UP[2][1] };   // 京極丸の西の口の下
const CLIMB = [...SHIMIZU, ...CLIMB_UP.slice(1)];
// 閉じた木戸へは扉の手前まで。曲輪内の終点を追って塀の脇で止まらない。
// 清水谷の西の段の出曲輪（浅井の砦）。谷道へ向く大手：枡形虎口・角馬出し・横矢の張り出し・畝のある空堀・切岸・土橋・逆茂木。
// 縄張りは推定（小谷の清水谷の屋敷群の西の段。docs/layout-ref/odani）。土の山城なので塀は板塀と柵（白壁にしない）。
// 門の位置 G は谷道（-79.7,36）から西へ 33m。25秒で登る谷道の左前に馬出しと塀が入る。外向き（局所 +b）は谷道の側。
const SIEGE = siegePlan({ x: -111.1, z: 26, rot: Math.atan2(.953, .303), W: 16, koguchi: 'masu', turn: 1,
  // 横矢の張り出しに出隅の井楼（上の床から門の前を横から撃つ）。角馬出しの柵の下に土塁を盛る（城攻めの共通部品 1.6.5）
  yokoya: { at: 10.5, w: 4.5, d: 3, yagura: { height: 5.2 } }, moat: { w: 5, depth: 2.4, une: 3.2 }, kirigishi: 1.1,
  umadashi: { kind: 'kaku', r: 4, moatW: 2.6, depth: 1.8, bank: 0.9 }, sakamogi: { at: 6 }, shiyori: false });
const SIEGE_H = siegeHeight(SIEGE);
// 出曲輪の縄張りの内か（pad だけ外へ広げる）。草木・屋敷・塀をここへ置かない
function inSiege(x, z, pad = 0) {
  const [a, b] = SIEGE.loc(x, z);
  return Math.abs(a) < SIEGE.W + 6 + pad && b > -14 - pad && b < 28 + pad;
}
const WEST_APPROACH = [...CLIMB_UP.slice(0, -2), [GATE_WEST.x - 1.4, GATE_WEST.z]];
const WEST_FACE = { x: GATE_WEST.x - 1.4, z: GATE_WEST.z };
const ONO_PIN = { x: ONOGI.x, z: ONOGI.z + 4 };   // 大野木屋敷の庭（▼の固定の所）
// 九十九折りの長い区間は十メートルごとに角を足す（遠い角へ一直線に向かうと、坂の肩から谷底へ外れる）。
// 元の角（番兵の持ち場・登り口）は同じ番号のまま残す。
function densify(pts, from, step = 10) {
  const out = pts.slice(0, from + 1);
  for (let i = from + 1; i < pts.length; i++) {
    const [ax, az] = out[out.length - 1], [bx, bz] = pts[i], n = Math.floor(Math.hypot(bx - ax, bz - az) / step);
    for (let k = 1; k <= n; k++) if (Math.hypot(bx - ax, bz - az) * (1 - k / (n + 1)) > 3) out.push([ax + (bx - ax) * k / (n + 1), az + (bz - az) * k / (n + 1)]);
    out.push(pts[i]);
  }
  return out;
}
const VALLEY_ROUTE = densify([[MOUTH.x, MOUTH.z], ...CLIMB.slice(2, SHIMIZU.length + 2)], 4);
const AMBUSH_IDS = ['yakata', 'watch', 'patrol'];
const KYO_HOLD = 12;   // 京極丸を押さえて保つ秒（一戦を四〜七分に収める）
const AMBUSH_TIMES = [12, 35, 58];
const NO_VALLEY_PURSUIT = [];
const AMBUSH_LINES = ['一組目じゃ！　道の見張りを味方と退けよ', '二組目じゃ！　屋敷の陰を見よ。列を離れるな', '最後の組じゃ！　登り口を味方と切り開け'];
const LOOKOUT_WAY = [[KYO.x + 9, KYO.z0 + 15], [KYO.x + 9, KYO.z0 + 7.9]];
const LOOKOUT_RAMP = { ha: null, hb: null };
// 待ち伏せの後続は、初めに決めた持ち場で待つ。三人ずつ交代する。
function ambushSpace(army, u) {
  if (u.odaniWait && !u.odaniReleased) return u.odaniWait;
  return null;
}

// 櫓を取る別任務と、京極丸の地上を押さえる主命を分ける。
// 上の守りを地上の印で追わせない。降りた守りは主命でも相手にする。
function inKyoLookout(rt, u) {
  return !!rt.flags.kyoLookoutGuards?.has(u) && u.pos.y > rt.world.heightAt(u.pos.x, u.pos.z) + 2;
}

// 谷と尾根の口を結ぶ道。組の後ろへ直進せず、曲がり角を一つずつ通す。
const ROUTE_N = [...CLIMB, [KC.x, KC.z], ...ROAD_RIDGE.filter((q) => q[1] < KC.z)];
const ROUTE_S = [...CLIMB, [KC.x, KC.z], ...ROAD_RIDGE.filter((q) => q[1] > KC.z).reverse()];
const ROUTE_W = [...CLIMB, ...KOMA_WEST];
// 大野木屋敷は南の木戸から入る。谷の兵が屋敷の横の柵へ直進しない。
const ROUTE_O = [...CLIMB.slice(0, SHIMIZU.length + 1), [-49, -77], [ONOGI.x, ONOGI.z + ONOGI.hd + 3], [ONOGI.x, ONOGI.z + 4]];
const ONO_RETURN = [...ROUTE_O].reverse();
// 屋敷を取った後も、南の木戸から来た坂へ戻って西木戸へ折れる。
// 庭から登り道へ直接合流させると、屋敷の柵と切岸で印も先手も止まる。
// 枝道の途中から登り道へ斜めに渡らず、来た坂の分かれ目まで戻って折り返す。
// 両方の坂が近い斜面でも、歩く高さと肩の形は違う。
// 屋敷へは寄らない（一戦を四〜七分に）。谷の上から九十九折りを上り、西木戸へ。
const ONO_WEST_APPROACH = densify([...SHIMIZU.slice(0, -1), ...WEST_APPROACH], SHIMIZU.length - 1);   // 谷で退いても、同じ一本の道で案内し直せる
// 京極丸の西の枡形虎口（MASU_WEST）：一の門（縄張りの西木戸）の内に四角い広場、三方を土塀、折れて二の門（櫓門）。
// 形は castle_parts の masugata と同じ式。一の門は縄張りの物を使うので、ここでは塀と二の門だけを建てる。
const MASU = (() => {
  const M = MASU_WEST, [gx, gz] = M.at, hs = M.size, turn = M.turn, rot = M.rot;
  const ux = Math.sin(rot), uz = Math.cos(rot), px = turn * uz, pz = -turn * ux;
  const cx = gx - ux * hs, cz = gz - uz * hs;
  const P2 = (a, b) => [cx + px * a - ux * b, cz + pz * a - uz * b];
  const [ix, iz] = P2(hs, -hs * .35);
  return { M, hs, turn, rot, ux, uz, px, pz, cx, cz, P2, ix, iz, inRot: rot + turn * Math.PI / 2,
    face: P2(hs - 1.4, -hs * .35), out: P2(hs + 3.5, -hs * .35) };
})();
const MASU_MID = [MASU.cx, MASU.cz], MASU_EAST = MASU.P2(MASU.hs + 3, MASU.hs + 3.5);   // 広場の真ん中・塀の東の外の角
function masuExit(p) {
  // 一の門の通り（櫓門の下）にいる間は、まず広場の真ん中へ出る（門の柱の陰から斜めに抜けない）。
  const fromGate = -((p.x - MASU.cx) * MASU.ux + (p.z - MASU.cz) * MASU.uz);
  if (fromGate < -MASU.hs + 2.5 && Math.hypot(p.x - MASU.cx, p.z - MASU.cz) > 1.5) return MASU_MID;
  return Math.hypot(p.x - MASU.face[0], p.z - MASU.face[1]) > 1.5 && Math.hypot(p.x - MASU.ix, p.z - MASU.iz) > 2 ? MASU.face : MASU.out;
}
// 道の角のうち、平たい距離と高さの違いで一番近い角の番号。
function nearWay(rt, path, c, y) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < path.length; i++) {
    const q = path[i], d = Math.hypot(q[0] - c.x, q[1] - c.z) + Math.abs(rt.world.heightAt(q[0], q[1]) - y) * 4;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
// 門前（半径 r）に着いている羽柴方の人数（掛矢の打ち手）。
function gateCrew(rt, x, z, r) {
  let n = 0;
  rt.army.forNear(x, z, r, (u) => { if (u.team === 0 && u.alive && !u.fleeing && !u.isStruct) n++; });
  return n;
}
function inMasu(x, z) {
  const a = (x - MASU.cx) * MASU.px + (z - MASU.cz) * MASU.pz, b = -((x - MASU.cx) * MASU.ux + (z - MASU.cz) * MASU.uz);
  return Math.abs(a) < MASU.hs && Math.abs(b) < MASU.hs;
}
const ONO_WEST_ENTRY = [...ONO_WEST_APPROACH, CLIMB_UP.at(-1), MASU.face, MASU.out];
// 屋敷を取った後、屋敷の側（南木戸から分かれ目までの枝道）に居る時の道。分かれ目（-49,-77）は九十九折りの上にあり、
// そこから登り口へ続く。谷道の道へ投影すると枝道の外と見なされ、印が前の角と足元の足跡を行き来して進めなかった。
const ONO_VIA_APPROACH = densify([[ONOGI.x, ONOGI.z + 4], [ONOGI.x, ONOGI.z + ONOGI.hd + 3], [-49, -77], ...WEST_APPROACH.slice(2)], 2);
const ONO_VIA_ENTRY = [...ONO_VIA_APPROACH, CLIMB_UP.at(-1), MASU.face, MASU.out];
const VIA_ROAD = { x: 0, z: 0, s: 0, d: 0 }, WEST_ROAD = { x: 0, z: 0, s: 0, d: 0 };
// 枝道の方が近い時だけ屋敷側の道を使う（登り口より上の共通の道では、元の道と番号のまま）。
function onoViaPath(rt, breached) {
  const F = rt.flags, p = rt.player.u.pos;
  roadPoint(ONO_VIA_APPROACH, p, VIA_ROAD, null, null, 1, 3);
  roadPoint(ONO_WEST_APPROACH, p, WEST_ROAD);
  const via = F.kyoVia ? VIA_ROAD.d < WEST_ROAD.d + .5 : VIA_ROAD.d + .5 < WEST_ROAD.d;
  if (via !== !!F.kyoVia) { F.kyoVia = via; F.kyoViaIdx = 0; }
  return via ? breached ? ONO_VIA_ENTRY : ONO_VIA_APPROACH : null;
}
const ROUTE_FROM = { x: 0, z: 0, s: 0, d: 0 }, ROUTE_TO = { x: 0, z: 0, s: 0, d: 0 };
const ROAD_TEST = { x: 0, z: 0 };
const ROAD_PLAYERS = new WeakMap();
function onRidge(p) {
  if (Math.abs(p.x) < 2.6) return true;
  for (const k of ODANI_PLAN.kuruwa) if (inPoly(k.poly, p.x, p.z)) return true;
  return false;
}
function westWay(p) { return p.x < -3 && p.z < KYO.z0 + 4 && p.z > KOM.z0; }
// 食い違い土塁は兵の塀とは別の当たり。通路の案内にも体の幅を含めて使う。
function earthPointDistance2(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return (x - ax - dx * t) ** 2 + (z - az - dz * t) ** 2;
}
function earthBetween(a, b) {
  for (const s of KUICHIGAI) {
    // 実際の当たりは裾1.5m＋歩兵の半幅0.45mの丸い端。
    // 四角く広げると端を回れる道を塞ぎ、1.6mだけでは体が土へ押し戻される。
    const pad = 1.65, dx = b.x - a.x, dz = b.z - a.z;
    const x0 = Math.min(s[0], s[2]) - pad, x1 = Math.max(s[0], s[2]) + pad;
    const z0 = Math.min(s[1], s[3]) - pad, z1 = Math.max(s[1], s[3]) + pad;
    let lo = 0, hi = 1;
    if (Math.abs(dx) < 1e-6) { if (a.x < x0 || a.x > x1) continue; }
    else {
      const t0 = (x0 - a.x) / dx, t1 = (x1 - a.x) / dx;
      lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
    }
    if (Math.abs(dz) < 1e-6) { if (a.z < z0 || a.z > z1) continue; }
    else {
      const t0 = (z0 - a.z) / dz, t1 = (z1 - a.z) / dz;
      lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
    }
    if (lo > hi) continue;
    const sx = s[2] - s[0], sz = s[3] - s[1], cross = dx * sz - dz * sx;
    if (Math.abs(cross) > 1e-8) {
      const ox = s[0] - a.x, oz = s[1] - a.z;
      const t = (ox * sz - oz * sx) / cross, u = (ox * dz - oz * dx) / cross;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
    }
    const d2 = Math.min(
      earthPointDistance2(a.x, a.z, ...s), earthPointDistance2(b.x, b.z, ...s),
      earthPointDistance2(s[0], s[1], a.x, a.z, b.x, b.z),
      earthPointDistance2(s[2], s[3], a.x, a.z, b.x, b.z));
    // 押し戻された境目から外へ歩く時も、同じ当たりの境目で通す。
    if (d2 < pad * pad - 1e-6) return true;
  }
  return false;
}
function roadClear(army, u, a, b) {
  if (earthBetween(a, b)) return false;
  // 攻撃用の味方の柵越しの例外は使わない。取った屋敷の塀も歩いては越せない。
  if (army.wallBetween(a, -1, b, false)) return false;
  const W = army.world, d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.min(128, Math.ceil(d / .75));
  const player = ROAD_PLAYERS.get(u);
  let y = groundAt(W, a.x, a.z, u.pos.y), px = a.x, pz = a.z;
  // 道の指定があっても、切岸や屋敷の台の段差は歩いて越せない。
  // 足元だけが歩ける点を結ぶと、印が壁際へ向き続けてしまう。
  for (let i = 1; i <= n; i++) {
    const x = a.x + (b.x - a.x) * i / n, z = a.z + (b.z - a.z) * i / n;
    let h = groundAt(W, x, z, y);
    // 本人の印は実際の一歩と同じ判定。道の横の急斜面だけで、歩ける縦の坂を塞がない。
    const walk = player ? player.canStep(px, pz, x, z, y) : W.walkable(x, z, y);
    if (!walk || h - y > .91 || y - h > (W.def.maxWalkDrop ?? 1.2)) {
      if (!player) return false;
      // 粗い検査で二段を一度にまたいだ時だけ、本人と同じ二十センチの歩幅で確かめる。
      // 壁の検査は上で済ませ、崖や一段の高すぎる段差はここでも通さない。
      const steps = Math.ceil(Math.hypot(x - px, z - pz) / .2);
      let sx = px, sz = pz;
      for (let j = 1; j <= steps; j++) {
        const nx = px + (x - px) * j / steps, nz = pz + (z - pz) * j / steps;
        const ny = groundAt(W, nx, nz, y);
        if (!player.canStep(sx, sz, nx, nz, y) || ny - y > .91 || y - ny > (W.def.maxWalkDrop ?? 1.2)) return false;
        sx = nx; sz = nz; y = ny;
      }
      h = y;
    }
    y = h; px = x; pz = z;
  }
  return true;
}
function roadPoint(path, p, out, army, u, lo = 1, hi = path.length - 1) {
  out.d = Infinity;
  for (let i = Math.max(1, lo); i <= Math.min(hi, path.length - 1); i++) {
    const a = path[i - 1], b = path[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    // 最短の合流点が壁や段差の向こうなら、同じ区間の両端も探す。
    // 屋敷の脇で、通れる角があるのに古い印を残さない。
    for (let j = 0; j < (army ? 3 : 1); j++) {
      const f = j === 0 ? t : j === 1 ? 0 : 1;
      const x = a[0] + dx * f, z = a[1] + dz * f, d = Math.hypot(p.x - x, p.z - z);
      if (d >= out.d) continue;
      if (army) { ROAD_TEST.x = x; ROAD_TEST.z = z; if (!roadClear(army, u, p, ROAD_TEST)) continue; }
      out.x = x; out.z = z; out.s = i - 1 + f; out.d = d;
    }
  }
}
// 歩ける斜面でも、休む旗で谷道の外へ誘わない。道の幅と曲輪・屋敷の庭を使う。
// 共通の探索は半秒ごと。投影の入れ物は使い回し、壁と段差は roadClear で別に確かめる。
const RETREAT_ROAD = { x: 0, z: 0, s: 0, d: 0 };
function retreatOnRoad(rt, point) {
  if (onRidge(point)) return true;
  if (rt.flags.step >= 2 && Math.abs(point.x - ONOGI.x) < ONOGI.hw &&
    Math.abs(point.z - ONOGI.z) < ONOGI.hd) return true;
  const F = rt.flags;
  const path = F.step <= 1 ? CLIMB : F.step === 2
    ? F.onoDone ? ONO_WEST_ENTRY : ROUTE_O
    : F.komaAttack ? ROUTE_W : ONO_WEST_ENTRY;
  roadPoint(path, point, RETREAT_ROAD);
  return RETREAT_ROAD.d <= 3;
}
// 道へ直に戻れない時は、実際に歩いた足跡を一つずつ戻る。
// 壁や切岸の判定は省かず、初めに作った足跡の枠だけを使う。
function returnTrail(rt) {
  const F = rt.flags, p = rt.player.u.pos;
  let target = null, skipped = 0;
  for (let i = 0; i < F.walkCount; i++) {
    const q = F.walkTrail[(F.walkHead - 1 - i + F.walkTrail.length) % F.walkTrail.length];
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d <= .2 || d > 12 || !roadClear(rt.army, rt.player.u, p, q)) continue;
    target = q; skipped = i;
    // 開けた所では二メートルほど戻す。角の直前では近い足跡も残す。
    if (d >= 2) break;
  }
  if (!target) return false;
  F.trailPoint.x = target.x; F.trailPoint.z = target.z;
  if (!F.guideReturning) F.returnSince = rt.t;
  F.guideBlocked = false; F.guideReturning = true;
  // 印を選んだだけでは足跡を捨てない。角まで戻る前に次の印へ移すと、
  // 曲がり角の手前の足跡を失い、塀際で戻る先がなくなる。
  F.returnTrailSkip = skipped + 1;
  return true;
}

// 戻る案内が二秒おきに付いたり消えたりする時（谷の口で足跡と道を行き来する等）、
// 右上の目標は「登れ」と「戻れ」を入れ替えない。三秒続けて戻る時だけ「戻れ」と書く。
function retShown(rt) {
  const F = rt.flags;
  if (!F.guideReturning) { F.retSeen = null; return false; }
  F.retSeen ??= rt.t;
  return rt.t - F.retSeen >= 3;
}

// 足場が横向きに歩けても、案内で九十九折りの外の切岸を横切らせない。
// 本人の案内だけ半秒ごとに調べ、投影用の座標は使い回す。
const TRAIL_SAMPLE = { x: 0, z: 0 }, TRAIL_ROAD = { x: 0, z: 0, s: 0, d: 0 };
function trailClear(rt, path, from, to) {
  const n = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / .75));
  for (let i = 1; i <= n; i++) {
    TRAIL_SAMPLE.x = from.x + (to.x - from.x) * i / n;
    TRAIL_SAMPLE.z = from.z + (to.z - from.z) * i / n;
    roadPoint(path, TRAIL_SAMPLE, TRAIL_ROAD);
    if (TRAIL_ROAD.d > 1.8) return false;
  }
  return roadClear(rt.army, rt.player.u, from, to);
}

// 道の角を一つずつ進める。近さだけで切岸や塀の向こうの角へ飛ばさない。
function wayTrail(rt, path, idx) {
  const p = rt.player.u.pos;
  if (rt.flags.guideReturning) return trailAhead(rt, path, idx);
  idx = Math.max(1, Math.min(idx, path.length - 1));
  while (idx < path.length - 1) {
    const d = Math.hypot(p.x - path[idx][0], p.z - path[idx][1]);
    const seg = Math.hypot(path[idx + 1][0] - path[idx][0], path[idx + 1][1] - path[idx][1]);
    const dn = Math.hypot(p.x - path[idx + 1][0], p.z - path[idx + 1][1]);
    // 先の角の方が近くても、段の上下違い（九十九折りの隣の道）や道の縁の向こうなら飛ばさない。
    const nx = path[idx + 1][0], nz = path[idx + 1][1];
    ROAD_TEST.x = nx; ROAD_TEST.z = nz;
    const skip = d < 8 && dn < seg && Math.abs(rt.world.heightAt(nx, nz) - p.y) < 2.5;
    // 登り口（九十九折りの上の端）は味方が溜まる所。角を踏まずに、近づいたら次の角（虎口の折れ）へ向かう。
    const reach = path[idx] === CLIMB_UP[2] ? 7 : 3;
    if ((d < reach && Math.abs(rt.world.heightAt(path[idx][0], path[idx][1]) - p.y) < 3 || skip) && trailClear(rt, path, p, ROAD_TEST)) idx++; else break;
  }
  // 遠い角は十二メートル以内の歩ける途中点に切り、通れなければ来た足跡へ戻す。
  return trailAhead(rt, path, idx);
}
// 遠い角へ一直線に登らせず、通れる道の合流点と十二メートル先を示す。
// 合戦中は半秒ごとに呼び、座標の入れ物は使い回す。
function trailAhead(rt, path, index) {
  const F = rt.flags, p = rt.player.u.pos, r = F.guideRoad;
  if (F.guideReturning) {
    const d = Math.hypot(F.trailPoint.x - p.x, F.trailPoint.z - p.z);
    // 足跡は四十センチ刻み。半メートル手前で到着にすると、
    // 塀の角を曲がった足跡まで捨ててしまい、戻る道も塞がる。
    // 斬り合いや手当てで足跡から六メートル離れた時と、十秒たっても着けない時（味方の列に押される等）は、
    // 古い足跡を捨てて今の場所から道へ案内し直す。「戻れ」のまま止めない。
    F.returnSince = F.returnSince ?? rt.t;
    const stale = d >= 6 || rt.t - F.returnSince > 10;
    if (stale) { F.walkCount = 0; F.returnSince = null; }
    else if (d > .2 && roadClear(rt.army, rt.player.u, p, F.trailPoint)) return index;
    if (d <= .2) {
      const used = Math.min(F.walkCount, F.returnTrailSkip || 0);
      F.walkCount -= used;
      F.walkHead = (F.walkHead - used + F.walkTrail.length) % F.walkTrail.length;
      // 二メートル戻るたびに近い斜面へ案内し直すと、同じ場所へ登っては戻る。
      // 道の中へ戻り、次の角へ歩いて進めるまでは、残る足跡を続けてたどる。
      roadPoint(path, p, r, rt.army, rt.player.u);
      // 道の肩も、通常の案内と同じ幅で合流とする。中心から六十センチだけでは
      // 歩ける道に戻っても足跡を谷までたどり続けてしまう。
      let joined = Number.isFinite(r.d) && r.d <= 1.5;
      if (joined) {
        const next = Math.min(path.length - 1, Math.floor(r.s) + 1);
        // 遠い角全体が見通せなくても、直近の足場から登り直せる。
        // この先は通常の案内で刻んで調べ、壁と切岸の検査は省かない。
        const dx = path[next][0] - r.x, dz = path[next][1] - r.z;
        const t = Math.min(1, 2 / (Math.hypot(dx, dz) || 1));
        ROAD_TEST.x = r.x + dx * t; ROAD_TEST.z = r.z + dz * t;
        joined = trailClear(rt, path, p, ROAD_TEST);
      }
      if (!joined && returnTrail(rt)) return index;
    }
  }
  F.guideReturning = false;
  roadPoint(path, p, r, rt.army, rt.player.u);
  if (r.d > 1.5) {
    // 最短の投影点と道の両端が塞がっても、その間に通れる合流点がある。
    // 道を外れた本人の案内だけで探し、全兵の移動の検査は増やさない。
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / .5));
      for (let j = 1; j < steps; j++) {
        ROAD_TEST.x = a[0] + (b[0] - a[0]) * j / steps;
        ROAD_TEST.z = a[1] + (b[1] - a[1]) * j / steps;
        const d = Math.hypot(ROAD_TEST.x - p.x, ROAD_TEST.z - p.z);
        if (d > 12 || d >= r.d || !roadClear(rt.army, rt.player.u, p, ROAD_TEST)) continue;
        r.x = ROAD_TEST.x; r.z = ROAD_TEST.z; r.s = i - 1 + j / steps; r.d = d;
      }
    }
  }
  // 谷の口の集まり場（秀吉の旗の列は南へ二十メートルほど伸びる）から出る時は、谷道の始まりへそのまま向かう。
  // 十二メートルの合流探しの外でも「戻れ」で止めない（11/6：出発してすぐ「来た道の角へ戻れ」と出て、bot は足踏みした）。
  if (!Number.isFinite(r.d) && Math.hypot(path[0][0] - MOUTH.x, path[0][1] - MOUTH.z) < 1 && Math.hypot(p.x - MOUTH.x, p.z - MOUTH.z) < 36) {
    r.x = path[0][0]; r.z = path[0][1]; r.s = 0; r.d = Math.hypot(r.x - p.x, r.z - p.z);
  }
  // 途中の合流点が見つかったら、塞がった古い判定を残さない。
  // 戻る下知と前へ進む印が食い違い、歩ける坂でも足跡へ引き返していた。
  F.guideBlocked = !Number.isFinite(r.d);
  if (!Number.isFinite(r.d)) {
    // 合流できる所がない時は、壁の向こうの古い印を追わせない。
    F.trailPoint.x = p.x; F.trailPoint.z = p.z;
    returnTrail(rt);
    return index;
  }
  // 途中点を探して合流先が見つかった時も、古い「通れない」を解除する。
  F.guideBlocked = false;
  const next = Math.min(path.length - 1, Math.floor(r.s) + 1);
  // 道を外れた時は、次の角へ斜めに登る前に歩ける合流点へ戻す。
  // 合流点は上で壁と段差まで検査済み。本人の位置や移動速度は変えない。
  if (r.d > 1.5) {
    const t = Math.min(1, 12 / r.d);
    F.trailPoint.x = p.x + (r.x - p.x) * t;
    F.trailPoint.z = p.z + (r.z - p.z) * t;
    // 歩ける山肌でも、離れた道へ斜めに渡らせない。
    // 九十九折りの外へ出たら、実際に歩いた足跡から道へ戻す。
    // 同じ高さの平らな所（谷の口の陣など）は、壁と段差を確かめた合流点へ直に戻す。
    // 足跡へ引き返すのは、九十九折りの別の段へ斜面を渡る時だけ。
    // 屋敷の枝道や京極丸の前でも同じ（合流点は上で壁と段差を確かめ済み）。足跡へ戻すと、足元の足跡と前の印を行き来して止まる。
    const level = (F.step <= 1 || F.step === 2) && Math.abs(rt.world.heightAt(F.trailPoint.x, F.trailPoint.z) - rt.world.heightAt(p.x, p.z)) < 2.5;
    if (!level && !trailClear(rt, path, p, F.trailPoint)) {
      F.guideBlocked = true;
      const jx = F.trailPoint.x, jz = F.trailPoint.z;
      F.trailPoint.x = p.x; F.trailPoint.z = p.z;
      // 足跡が無い（谷の口の陣から道の脇へ出た時など）は、壁と段差を確かめた合流点へ直に戻す。
      // 足元に印を置いたまま「戻れ」で止めない。
      if (!returnTrail(rt)) { F.guideBlocked = false; F.trailPoint.x = jx; F.trailPoint.z = jz; }
    }
    return next;
  }
  // 足踏みの下知で進めた角も、通れる時だけ保つ。毎回戻すと次の印へ進めない。
  index = Math.max(next, Math.min(path.length - 1, index));
  ROAD_TEST.x = path[index][0]; ROAD_TEST.z = path[index][1];
  if (!trailClear(rt, path, p, ROAD_TEST)) index = next;
  while (index < path.length - 1 && Math.hypot(path[index][0] - p.x, path[index][1] - p.z) < 3) {
    ROAD_TEST.x = path[index + 1][0]; ROAD_TEST.z = path[index + 1][1];
    if (!trailClear(rt, path, p, ROAD_TEST)) break;
    index++;
  }
  const q = path[index], d = Math.hypot(q[0] - p.x, q[1] - p.z);
  const t = d > 12 ? 12 / d : 1;
  // 道の肩からも次の角へ進む。合流点だけを追うと、印のそばで足踏みしてしまう。
  F.trailPoint.x = p.x + (q[0] - p.x) * t;
  F.trailPoint.z = p.z + (q[1] - p.z) * t;
  if (!trailClear(rt, path, p, F.trailPoint)) {
    F.trailPoint.x = r.x; F.trailPoint.z = r.z;
    // 十二メートル先が角や障害物の向こうでも、手前の歩ける道を示す。
    // 足元の合流点へ戻して「０メートル」のまま止めない。壁と段差の判定は保つ。
    for (let ahead = Math.min(12, d) / 2; ahead >= 1.5; ahead /= 2) {
      ROAD_TEST.x = p.x + (q[0] - p.x) * ahead / d;
      ROAD_TEST.z = p.z + (q[1] - p.z) * ahead / d;
      if (!trailClear(rt, path, p, ROAD_TEST)) continue;
      F.trailPoint.x = ROAD_TEST.x; F.trailPoint.z = ROAD_TEST.z;
      break;
    }
    // 道の肩から角へ引いた直線が塞がる時は、道上の途中点へ合流する。
    // 同じ直線を短くするだけでは、歩ける折れ道があっても足元の印に戻る。
    // 先の角を飛ばさず、半秒ごとに十二メートル以内だけ調べる。
    if (Math.hypot(F.trailPoint.x - p.x, F.trailPoint.z - p.z) < 1.5) {
      let best = r.s;
      for (let i = Math.floor(r.s) + 1; i <= index; i++) {
        const a = path[i - 1], b = path[i];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const steps = Math.max(1, Math.ceil(len / .5));
        const start = i === Math.floor(r.s) + 1 ? Math.floor((r.s - i + 1) * steps) + 1 : 1;
        for (let j = start; j <= steps; j++) {
          const s = i - 1 + j / steps;
          if (s <= best) continue;
          ROAD_TEST.x = a[0] + (b[0] - a[0]) * j / steps;
          ROAD_TEST.z = a[1] + (b[1] - a[1]) * j / steps;
          const distance = Math.hypot(ROAD_TEST.x - p.x, ROAD_TEST.z - p.z);
          if (distance < 1.5 || distance > 12 || !trailClear(rt, path, p, ROAD_TEST)) continue;
          best = s; F.trailPoint.x = ROAD_TEST.x; F.trailPoint.z = ROAD_TEST.z;
        }
      }
    }
  }
  // 次の角へ進めず足元の印しか残らない時は、距離札で到着と誤解させない。
  F.guideBlocked = d > 1.6 && Math.hypot(F.trailPoint.x - p.x, F.trailPoint.z - p.z) < .6;
  if (F.guideBlocked) returnTrail(rt);
  return index;
}
// 庭に入ったら道の終点を追わせず、見えていて歩いて届く守りへ案内する。
// 塀の外から敵へ直進させない。調べるのは既存の案内と同じ半秒ごと。
function onogiGuide(rt) {
  const F = rt.flags, p = rt.player.u.pos;
  F.onoInGarden = Math.abs(p.x - ONOGI.x) < ONOGI.hw - .8 && Math.abs(p.z - ONOGI.z) < ONOGI.hd - .5;
  const reliefOnly = gone(F.ono) && F.reliefOn && !gone(F.relief);
  if (!F.onoInGarden && !reliefOnly) return false;
  let target = null, nearest = 24;
  for (let i = 0; i < 2; i++) for (const u of (i ? F.relief : F.ono).units) {
    if (!battleReady(u)) continue;
    const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
    if (d >= nearest || !sightPoint(rt, u.pos) || !roadClear(rt.army, rt.player.u, p, u.pos)) continue;
    target = u; nearest = d;
  }
  // 庭を取った後は館の戸口へ戻さず、入ってきた南木戸から道へ戻す。
  // 道へ出た後も、屋敷へ入り直す印には切り替えない。
  if (!target && reliefOnly) {
    roadPoint(ONO_RETURN, p, ROUTE_FROM, rt.army, rt.player.u);
    trailAhead(rt, ONO_RETURN, Number.isFinite(ROUTE_FROM.d) ? Math.ceil(ROUTE_FROM.s) : 0);
    return true;
  }
  const goal = target ? target.pos : F.onoHouse.doorOut;
  F.guideReturning = false;
  F.guideBlocked = !roadClear(rt.army, rt.player.u, p, goal);
  F.trailPoint.x = F.guideBlocked ? p.x : goal.x;
  F.trailPoint.z = F.guideBlocked ? p.z : goal.z;
  if (F.guideBlocked) returnTrail(rt);
  return true;
}
const westAttackControl = (rt) => isTouch ? rt.player.weapon === 'sword' ? '「きる」' : '「つく」' : '左クリック';
// 退き口に着いた後は、距離の案内も任務札と同じ手当ての手順にする。
function retreatCareText(rt) {
  if (rt.player.treating) return '手当て中。終わるまで止まれ';
  if (rt.player.treatmentLeft <= 0) return '手当ての布はない。味方の後ろで敵に構えよ';
  if (rt.player.treatmentNext > rt.t)
    return `手当てまであと${Math.ceil(rt.player.treatmentNext - rt.t)}秒。味方の後ろで構えよ`;
  return rt.player.treatmentReady ? '止まって「手当て」を三秒長押し'
    : '味方の後ろで止まれ。「手当て」が出たら三秒長押し';
}
// 屋敷を取っても、西木戸へは南の出口と来た坂を経由する。
// 遠い木戸だけを見出しにすると、庭から西の塀や切岸へ直進してしまう。
function onogiExitTask(rt) {
  const F = rt.flags, p = rt.player.u.pos;
  if (!F.onoDone || F.C.kuruwa.kyogoku.test(p.x, p.z)) return '';
  if (Math.abs(p.x - ONOGI.x) < ONOGI.hw + .5 &&
    p.z > ONOGI.z - ONOGI.hd - .5 && p.z < ONOGI.z + ONOGI.hd + 1.5)
    return '屋敷の南木戸から出よ';
  // 折り返す分かれ目は経路の三つ目の区間の終わり。そこで初めて登り道へ向ける。
  if (Number.isFinite(F.guideRoad.d) && F.guideRoad.s < 3)
    return '清水谷の道へ戻れ';
  return '';
}
function assaultTrailLabel(rt) {
  const F = rt.flags;
  if (F.retreatOn || F.guideBlocked) return '';
  if (F.guideReturning) return F.onoDone ? '南木戸から清水谷の道へ戻れ' : '清水谷の道へ戻れ';
  if (!F.onoDone && gone(F.ono) && F.reliefOn && !gone(F.relief))
    return F.onoInGarden ? '南木戸から道の小隊へ' : '道の小隊を退けよ';
  if (!F.onoDone) return F.onoInGarden ? '庭の敵を退けよ' : '屋敷の南木戸へ';
  const exit = onogiExitTask(rt);
  if (exit) return exit;
  const gate = F.westGate?.struct;
  if (gate && !gate.opened && gate.hp > 0)
    return F.westCanStrike ? `西木戸へ${westAttackControl(rt)}` : '清水谷の道を登り、西木戸へ進め';
  return F.C.kuruwa.kyogoku.test(rt.player.u.pos.x, rt.player.u.pos.z)
    ? F.kyoTarget ? '京極丸の残る守りへ' : '京極丸を味方と守れ'
    : '西木戸を抜け、京極丸へ';
}
function roadWay(army, u, want) {
  const q = u._odaniWay || (u._odaniWay = { x: 0, z: 0, t: -1, active: false });
  if (q.t > army.time && (!q.active || Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 1)) return q.active ? q : want;
  q.t = army.time + 0.3; q.active = false;
  if (roadClear(army, u, u.pos, want)) return want;
  // 横陣の持ち場が切岸の上にある時は、組頭のいる道へ合流する。
  // 「かかれ」の旗持ちと、指定の敵がいない者も組頭に付く。道の端の持ち場で止めない。
  const g = u.group;
  const joinPlayer = g?.isPlayerSquad && (g.order === 'follow' || g.order === 'attack' && !u.target && (u.stdHeld || !g.focus?.alive));
  const target = joinPlayer && army.playerUnit ? army.playerUnit.pos : want;
  // 西の切岸の外も x 座標だけなら尾根に見えてしまう。曲輪の内か、中央の道かで分ける。
  const inOnogi = Math.abs(target.x - ONOGI.x) < ONOGI.hw && Math.abs(target.z - ONOGI.z) < ONOGI.hd + 3;
  const leavingOnogi = Math.abs(u.pos.x - ONOGI.x) < ONOGI.hw + 2 && Math.abs(u.pos.z - ONOGI.z) < ONOGI.hd + 3
    && !inOnogi && (onRidge(target) || westWay(target));
  const ridge = onRidge(u.pos) ? u.pos : target;
  const path = u.group?.order === 'path' && u.group.path ? u.group.path : inOnogi ? ROUTE_O : leavingOnogi ? ONO_WEST_ENTRY : westWay(u.pos) || westWay(target) ? ROUTE_W : onRidge(u.pos) && onRidge(target) ? ROAD_RIDGE : ridge.z > KC.z ? ROUTE_S : ROUTE_N;
  roadPoint(path, u.pos, ROUTE_FROM, army, u); roadPoint(path, target, ROUTE_TO);
  if (ROUTE_FROM.d > 40 || ROUTE_TO.d > 40) {
    if (!ROAD_PLAYERS.has(u)) return want;
    // 合流できない本人へ、歩けないと判定した目的地を返さない。
    // 足元を返して、案内側で来た道の足跡へ戻す。
    q.active = true; q.x = u.pos.x; q.z = u.pos.z;
    return q;
  }
  q.active = true;
  if (ROUTE_FROM.d > 3) { q.x = ROUTE_FROM.x; q.z = ROUTE_FROM.z; return q; }
  const forward = ROUTE_TO.s > ROUTE_FROM.s;
  let i = forward ? Math.floor(ROUTE_FROM.s) + 1 : Math.ceil(ROUTE_FROM.s) - 1;
  i = Math.max(0, Math.min(path.length - 1, i));
  if (Math.hypot(path[i][0] - u.pos.x, path[i][1] - u.pos.z) < 1.3) i += forward ? 1 : -1;
  if (i < 0 || i >= path.length || (forward ? i > ROUTE_TO.s : i < ROUTE_TO.s)) { q.x = ROUTE_TO.x; q.z = ROUTE_TO.z; }
  else { q.x = path[i][0]; q.z = path[i][1]; }
  // 道の近くにいても、角を斜めに切ると塀に当たる。まず歩ける合流点まで寄る。
  if (!roadClear(army, u, u.pos, q) && ROUTE_FROM.d > 0.2) { q.x = ROUTE_FROM.x; q.z = ROUTE_FROM.z; }
  if (ROAD_PLAYERS.has(u) && !roadClear(army, u, u.pos, q)) { q.x = u.pos.x; q.z = u.pos.z; }
  return q;
}
// 添付の足軽の写真：黒漆の胴と草摺に薄い威。陣羽織を重ねない。
const FOOT_LOOK = { armor: 0x2a2622, lace: 0xb5aa8a, haori: 0, doStyle: 'sugake' };
const ODA = { ...FOOT_LOOK, flag: 'oda' };
const AZAI = { ...FOOT_LOOK, flag: 'azai' };
const ODANI_LOOK = Object.fromEntries(Object.entries(ODANI_KACCHU).map(([name, look]) => [name, { ...look, haori: 0 }]));
const AZ_ARMOR = 0x2e2a26, ODA_ARMOR = 0x2a2622;
// 足軽大将ほどの身分（信長で遊ぶ時は除く）：羽柴の先手の一隊を預かる
const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
const nextObj = (rt, text) => {
  if (rt.flags.ending) return;
  // 手当ての間に攻めが進んでも、復帰先は新しい持ち場にする。
  if (rt.flags.retreatOn) {
    rt.flags.retreatTask = text;
    text = '退き口へ下がれ';
  }
  // 羽柴の先手の持ち場は、その場の下知。遠い本陣の使番を待たせない。
  // 下知は二秒は替えない（道の角や敵の出入りで札が毎秒行き来していた）。退き口と終わりはすぐ出す。
  const F = rt.flags, cur = rt.objectives.find((o) => o.id === 'main')?.text;
  if (cur !== text && cur !== '退き口へ下がれ' && text !== '退き口へ下がれ' && rt.t - (F.objSetAt ?? -99) < 2) { F.objPending = text; return; }
  F.objPending = null;
  if (cur !== text) F.objSetAt = rt.t;
  rt.obj('main', text, 'main', true);
};
// 守る秒数が戻る時だけ理由を知らせる。札は増やさず、同じ下知は八秒あける。
function holdInterrupted(rt, elapsed, inside, enemies, ready, reason = '味方の守りが足りぬ！　揃ってから、初めから守れ') {
  if (elapsed <= 0 || inside && enemies === 0 && ready) return;
  const F = rt.flags;
  if (rt.t < (F.holdNoticeAt || 0)) return;
  F.holdNoticeAt = rt.t + 8;
  rt.say('先手組頭', F.retreatOn ? '今は退き口へ下がれ。戻ったら初めから守れ'
    : !inside ? '持ち場へ戻れ！　守る秒数は初めからじゃ'
    : enemies > 0 ? '敵が入った！　退けてから、初めから守れ'
      : reason, 4);
}
// 小谷当夜の秀吉の装備は ODANI_KACCHU の復元案を近景・遠景ともに使う。
// 八月二十七日の夜の攻め。月齢・晴雨は断定せず、暗い空を保つ。
// 小谷だけの月明かりと地面の照り返しで、岩肌・木・曲輪の輪郭を読めるようにする。
// 旧暦八月末（初秋）の夜。空からの光を抑え、土と草の色と篝火の明暗を残す。
// 夜襲の間に朝へ移さない。足元を読む照り返しの強さは保ち、空と遠山を夜の色へそろえる。
// 11/6 fixc2103（critic60「曇りの昼にしか見えない」）：空・霧・月・照り返しを一段落とし、遠くの山と屋敷は影絵に沈める。
const NIGHT_ATTACK = { time: 'night', sky: 0x141c28, fog: 0x1a222c, sun: 0x8fa3b8, sunI: 0.7, hs: 0x8a9ea8, hg: 0x3a4234, hI: 1.7, top: 0x0a1018, glow: 0.04, dir: [0.3, 0.7, 0.45], mount: 0x141c1a };
const battleReady = (u) => u.alive && !u.fleeing && !u.gone && !u.woundOut && !u.noTarget && !u.campProtected;
// 制圧と同じ持ち場から選ぶ。上の櫓や居所の大将、退いた兵へ誘わない。
function odaniNearestFoe(rt) {
  const F = rt.flags, p = rt.player.u.pos;
  if (F.ending || rt.over || F.fallen || F.komaDown && !F.honAttack || F.retreatOn || F.guideReturning) return null;
  if (F.foeScanAt === rt.t && F.foeScanStep === F.step && F.foeScanOno === F.onoDone && F.foeScanKoma === F.komaAttack && F.foeScanHon === F.honAttack &&
      (!F.nearestFoe || battleReady(F.nearestFoe) && !F.nearestFoe.dying && !F.nearestFoe.downed)) return F.nearestFoe;
  let target = null, best = Infinity;
  for (const u of rt.army.units) {
    if (u.team !== 1 || !battleReady(u) || u.isStruct || u.dying || u.downed || inKyoLookout(rt, u)) continue;
    let eligible = false;
    if (F.step === 1) eligible = F.yakataOn && u.group === F.yakata || F.watchOn && u.group === F.watch || F.patrolOn && u.group === F.patrol;
    else if (F.step === 2 && !F.onoDone) eligible = (u.group === F.ono || F.reliefOn && u.group === F.relief) &&
      (F.onoInGarden || Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 12);
    else if (F.step === 2 || F.step === 3 && !F.komaAttack) eligible =
      F.C.kuruwa.kyogoku.test(p.x, p.z) && F.C.kuruwa.kyogoku.test(u.pos.x, u.pos.z);
    else if (F.step === 3 && F.honAttack) eligible = u.group === F.honGuard || u.group === F.south || u.group === F.kyoAid || u.group === F.nagamasa && !!F.nagaCharge;
    else if (F.step === 3 && F.komaAttack) eligible =
      F.C.kuruwa.koma.test(p.x, p.z) && F.C.kuruwa.koma.test(u.pos.x, u.pos.z);
    if (!eligible) continue;
    const d = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2 + (u.pos.y - p.y) ** 2 * 4;
    if ((F.step === 1 || F.honAttack) && d > 24 * 24) continue;
    if (d < best) { target = u; best = d; }
  }
  F.foeScanAt = rt.t; F.foeScanStep = F.step; F.foeScanOno = F.onoDone; F.foeScanKoma = F.komaAttack; F.foeScanHon = F.honAttack;
  return (F.nearestFoe = target);
}
// 京極丸の守備は、攻め込んだ組を口から押し返す任務。遠い弓兵の全滅までは求めない。
// 一度も来ていない組は待つ。実兵が曲輪へ入った事と、口の近くに敵がいない事を確かめる。
function counterRepelled(rt, g, mouthZ) {
  if (gone(g)) return true;
  let near = false;
  for (const u of g.units) if (battleReady(u)) {
    if (rt.flags.C.kuruwa.kyogoku.test(u.pos.x, u.pos.z)) g.odaniReachedKyo = true;
    if (Math.hypot(u.pos.x - KC.x, u.pos.z - mouthZ) < 12) near = true;
  }
  return !!g.odaniReachedKyo && !near;
}
// 最も近い一人が画面外でも、道で向き合う別の兵を見落とさない。
// 間近の敵は振り向いても戦闘中とし、遠のく時は少し余裕を持たせる。
function valleyEncounter(rt) {
  const p = rt.player.u.pos, radius = rt.flags.valleyFighting ? 12 : 10;
  let target = null, nearest = radius * radius;
  for (const u of rt.army.units) {
    if (u.team === rt.player.u.team || u.isStruct || !battleReady(u)) continue;
    const dx = u.pos.x - p.x, dz = u.pos.z - p.z, d2 = dx * dx + dz * dz;
    if (d2 >= nearest || Math.abs(u.pos.y - p.y) > 2.4) continue;
    // 塀や切岸の向こうの兵では、谷道を登る案内を消さない。
    if (rt.army.wallBetween(p, rt.player.u.team, u.pos) || rt.army.terrainBlocks(p, u.pos)) continue;
    if (!(d2 < 25 || sightPoint(rt, u.pos)) || !roadClear(rt.army, rt.player.u, p, u.pos)) continue;
    target = u; nearest = d2;
  }
  return target;
}
// 斬り合いで道から外れて屋敷の段や帯曲輪へ上がった時は、まず今の角の前後の道へ戻る（段の縁を越えて直進しない）。
const BOT_ROAD = { x: 0, z: 0, s: 0, d: 0 };
function botBackToRoad(b, p, inp, u, goTo, path, idx) {
  if (!idx) return false;
  // 案内と同じ壁・段差の検査を通す。近いだけの合流点は切岸の上かもしれない。
  roadPoint(path, u.pos, BOT_ROAD, b.army, u, Math.max(1, idx - 2), idx);
  if (!Number.isFinite(BOT_ROAD.d) || BOT_ROAD.d <= 5) return false;
  const q = BOT_ROAD;   // 道の真上の点へまっすぐ（尾根用の迂回は使わない）
  goTo(p, inp, q.x, q.z, .5, true);
  return true;
}
// bot が土塁や塀の袋で五秒動けない時は、一番遠くまで歩ける向きへ三メートル抜ける（人が身をよじって出るのと同じ）。
function odaniBotEscape(b, p, inp, u, goTo) {
  const st = b.odaniStuck;
  if (!st) return false;
  if (st.esc && b.t < st.escT) { goTo(p, inp, st.esc.x, st.esc.z, .3); return true; }
  if (b.t - st.t > 5 && p.canStep) {
    let best = null, far = 0;
    for (let k = 0; k < 16; k++) {
      const a = k * Math.PI / 8;
      let ok = 0, px = u.pos.x, pz = u.pos.z;
      for (let n = 1; n <= 12; n++) {
        const x = u.pos.x + Math.sin(a) * n * .3, z = u.pos.z + Math.cos(a) * n * .3;
        if (!p.canStep(px, pz, x, z, u.pos.y) || b.world.heightAt(x, z) < u.pos.y - 1.2 || b.army.wallBetween({ x: px, z: pz }, -1, { x, z }, false)) break;
        ok = n; px = x; pz = z;
      }
      if (ok > far) { far = ok; best = { x: px, z: pz }; }
    }
    st.t = b.t;
    if (best) { st.esc = best; st.escT = b.t + 2.5; goTo(p, inp, best.x, best.z, .3); return true; }
  }
  return false;
}
// 退く道順は保ち、追ってくる敵へ構えたまま後ろ・横へ歩く。
function withdrawAlongRoad(rt, inp, target, radius, goTo) {
  const p = rt.player, u = p.u, q = roadWay(rt.army, u, target);
  // 途中の角では到着範囲を狭め、次の角へ切り替わる所まで歩く。
  // 選んだ道を共通の移動補助でもう一度選び直さない。
  goTo(p, inp, q.x, q.z, q === target ? radius : Math.min(radius, .2), true);
  // 敵が離れた後も走って息を使い切らない。退路は歩き、手当ての支度へつなぐ。
  inp.runHeld = false;
  const foe = rt.army.nearestEnemy(u, 8, battleReady);
  if (!foe || rt.army.wallBetween(u.pos, -1, foe.pos) || rt.army.terrainBlocks(u.pos, foe.pos)) return;
  const moving = inp.k.has('KeyW'), moveYaw = p.yaw;
  p.yaw = Math.atan2(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z);
  inp.guardHold = true; inp.runHeld = false;
  inp.k.delete('KeyW');
  if (!moving) return;
  const forward = Math.cos(moveYaw - p.yaw), across = Math.sin(p.yaw - moveYaw);
  if (Math.abs(forward) > .3) inp.k.add(forward > 0 ? 'KeyW' : 'KeyS');
  if (Math.abs(across) > .3) inp.k.add(across > 0 ? 'KeyD' : 'KeyA');
}

// 谷の資材だけを皮付きの短い丸太にする。元の俵と同じ当たりの範囲を保つ。
function valleyTimber(W, x, z, rot) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const c = canvas.getContext('2d');
  c.fillStyle = '#927044'; c.fillRect(0, 0, 128, 128);
  for (let r = 6; r < 64; r += 6) {
    c.strokeStyle = r % 12 ? '#705133' : '#aa8554'; c.lineWidth = 2;
    c.beginPath(); c.ellipse(61, 66, r, r * .94, .15, 0, Math.PI * 2); c.stroke();
  }
  c.strokeStyle = '#493523'; c.lineWidth = 2;
  for (const a of [.3, 2.8, 4.7]) { c.beginPath(); c.moveTo(64 + Math.cos(a) * 36, 64 + Math.sin(a) * 36); c.lineTo(64 + Math.cos(a) * 64, 64 + Math.sin(a) * 64); c.stroke(); }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  // 夜の照明に暗い茶を重ねると、年輪も樹皮も黒い団子になる。
  const bark = new THREE.MeshLambertMaterial({ map: barkTex('cedar'), color: 0xc7b79d });
  const end = new THREE.MeshLambertMaterial({ map, color: 0xffffff });
  const bodyGeo = new THREE.CylinderGeometry(.26, .28, .9, 12, 1, true); bodyGeo.rotateZ(Math.PI / 2);
  const endGeo = new THREE.CircleGeometry(.255, 16); endGeo.rotateY(Math.PI / 2);
  const pile = new THREE.Group(), transform = new THREE.Object3D();
  const bodies = new THREE.InstancedMesh(bodyGeo, bark, 6), caps = new THREE.InstancedMesh(endGeo, end, 12);
  let n = 0;
  for (let row = 0; row < 3; row++) for (let i = 0; i < 3 - row; i++) {
    const y = .26 + row * .46, zz = (i - (2 - row) / 2) * .54;
    transform.position.set(0, y, zz); transform.rotation.set(0, 0, 0); transform.updateMatrix(); bodies.setMatrixAt(n, transform.matrix);
    for (const side of [-1, 1]) {
      transform.position.set(side * .451, y, zz); transform.rotation.y = side < 0 ? Math.PI : 0; transform.updateMatrix(); caps.setMatrixAt(n * 2 + (side > 0 ? 1 : 0), transform.matrix);
    }
    n++;
  }
  bodies.receiveShadow = caps.receiveShadow = true; pile.add(bodies, caps);
  // 谷の斜面に水平な山を置くと、下側の丸太が宙へ出る。
  // 設営時だけ坂へ寝かせ、下段の端を調べて土へ少し埋める。
  const normal = new THREE.Vector3(W.heightAt(x - .5, z) - W.heightAt(x + .5, z), 1,
    W.heightAt(x, z - .5) - W.heightAt(x, z + .5)).normalize();
  pile.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  pile.rotateY(rot);
  const foot = new THREE.Vector3();
  let base = W.heightAt(x, z);
  for (const xx of [-.45, 0, .45]) for (const zz of [-.54, 0, .54]) {
    foot.set(xx, -.02, zz).applyQuaternion(pile.quaternion);
    base = Math.min(base, W.heightAt(x + foot.x, z + foot.z) - foot.y);
  }
  pile.position.set(x, base - .04, z);
  return pile;
}

// ---------------- 地形 ----------------
// 点 (x,z) から折れ線への最短距離と、線の上の位置（0〜1）
const LINE_LENGTHS = new Map();
const LINE_POS = { d: 0, t: 0 };
function alongLine(pts, x, z) {
  let best = Infinity, bt = 0, acc = 0;
  let info = LINE_LENGTHS.get(pts);
  if (!info) {
    const lens = []; let tot = 0;
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); lens.push(l); tot += l; }
    info = { lens, tot }; LINE_LENGTHS.set(pts, info);
  }
  const { lens, tot } = info;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], l = lens[i - 1] || 1e-6;
    let t = ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (l * l); t = Math.max(0, Math.min(1, t));
    const dx = x - (ax + (bx - ax) * t), dz = z - (az + (bz - az) * t);
    const d = dx * dx + dz * dz;
    if (d < best) { best = d; bt = (acc + t * l) / tot; }
    acc += l;
  }
  LINE_POS.d = Math.sqrt(best); LINE_POS.t = bt; return LINE_POS;
}
function floorAt(t) {
  const n = SHIMIZU_FLOOR.length - 1, f = t * n, i = Math.min(n - 1, Math.floor(f));
  return SHIMIZU_FLOOR[i] + (SHIMIZU_FLOOR[i + 1] - SHIMIZU_FLOOR[i]) * (f - i);
}
// 周りの砦（推定復元）：西尾根の山崎丸・福寿丸、主郭背後の月所丸。大嶽以外は当夜の軍旗を断定しない。
// 長浜市保存管理計画32頁：大嶽から福寿丸、さらに下って山崎丸。南北が逆だった名と囲いを正す。
// 二つの平場の位置・高さと、清水谷の進路は保つ（距離と曲輪の寸法は遊びの補い）。
// 信長公記巻六：八月十二日に大嶽を攻め取り、織田方の番手を入れた。
// https://ja.wikisource.org/wiki/信長公記
// 二十七日当夜の番手の顔触れ・人数は確定せず、少人数の遠景で占領を示す。
const OTAKE = { id: 'otake', name: '大嶽', x: -128, z: -190, h: 0, flag: 'oda' };
const OTAKE_GUARD = { x: OTAKE.x, z: OTAKE.z + 3 };
// 保存管理計画32頁・表7：六坊は山王丸と大嶽の鞍部にある七区画の曲輪。
// https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
// 高画質の既存地面に平場を補う。座標・寸法・比高は縮めた地形での推定。
// 六寺の名から六区画とはせず、当夜の建物・所属・兵数は断定しない。
// 同計画表7：六坊には随所に横矢を設ける。谷側の縁を折り、隣の斜面を横から守る形にする。
// 四つの張り出し・南向き・最大2.5mという寸法は推定。北の鞍部と南の竪堀は保つ。
const ROKUBO = Array.from({ length: 7 }, (_, i) => ({ x: -38 - i * 10, z: -199, flank: i % 2 === 0 ? 2.5 : 0, level: null }));
function rokuboAt(x, z) {
  if (S.quality !== 'high' || z <= -206 || z >= -189.5 || x <= -103 || x >= -33) return null;
  const p = ROKUBO[Math.max(0, Math.min(6, Math.round((-38 - x) / 10)))];
  return rokuboWeight(x, z, p) > 0 ? p : null;
}
function rokuboWeight(x, z, p) {
  const dx = Math.abs(x - p.x);
  const flank = p.flank * Math.max(0, Math.min(1, (4 - dx) / 1.5));
  return Math.max(0, Math.min(1, (5 - dx) / 2,
    (z - p.z + 7) / 2, (p.z + 7 + flank - z) / 2));
}
// 保存管理計画28頁：山王丸背後の鞍部にある六坊は竪堀で守られている。
// https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
// 南の斜面を下る空の溝を一条補う。条数・方角・位置・幅・深さは推定。
// 七つの平場と主尾根・清水谷の攻め道を避け、高画質だけ既存の地面を削る。
// 地形と除草で同じ関数を使い、形・材質・毎コマの入れ物は増やさない。
const ROKUBO_TATEBORI = horiboriHeight([[-79, -188], [-79, -166]], { width: 4, depth: 2 });
function rokuboTateDip(x, z) {
  if (S.quality !== 'high' || x < -81 || x > -77 || z < -190 || z > -164) return 0;
  return ROKUBO_TATEBORI(x, z);
}
// 保存管理計画125頁：焼尾丸は大嶽城の西尾根上の細長い曲輪で、土塁・竪堀はない。
// https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
// 八月十二日の浅見対馬守の寝返りが大嶽攻略につながった場所。座標・寸法・比高は推定。
// 主郭の堀と谷道から離し、既存の地面だけをならす。当夜の番手や建物は断定しない。
const YAKIO = { x: OTAKE.x - 65, z: OTAKE.z + 5, hw: 16, hd: 4, level: null };
function yakioWeight(x, z) {
  if (S.quality !== 'high') return 0;
  return Math.max(0, Math.min(1,
    (YAKIO.hw + 4 - Math.abs(x - YAKIO.x)) / 4,
    (YAKIO.hd + 3 - Math.abs(z - YAKIO.z)) / 3));
}
// 保存管理計画32頁・表7：大嶽城の北東部には犬走りがある。
// https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
// 土塁の外に細い平場を補う。位置・幅・比高は縮めた地形での推定。
// 北西の堀切・南の番手・主郭の足もとは避け、既存の地面だけをならす。
const OTAKE_WALK = [[OTAKE.x + 2, OTAKE.z - 12], [OTAKE.x + 11, OTAKE.z - 6]];
function otakeWalkWeight(x, z) {
  if (S.quality !== 'high' || x < OTAKE.x || x > OTAKE.x + 14
    || z < OTAKE.z - 15 || z > OTAKE.z - 3) return 0;
  const d = alongLine(OTAKE_WALK, x, z).d;
  return Math.max(0, Math.min(1, (2.1 - d) / 1.2,
    (Math.hypot(x - OTAKE.x, z - OTAKE.z) - 9.8) / 1.2));
}
// 保存管理計画32頁・表7：大嶽城の北西から南西には曲輪と段状の切岸がある。
// https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
// 西と南西の平場に加え、南西の尾根筋を遮断する小曲輪も補う。
// 数・位置・寸法・比高は縮めた地形での推定。
// 主郭・番手・堀切と竪堀を避け、既存の地面だけを加工する。
const OTAKE_SHELVES = [
  { x: OTAKE.x - 17, z: OTAKE.z, drop: 3 },
  { x: OTAKE.x - 12, z: OTAKE.z + 15, drop: 5 },
  // 表7：南西には尾根筋を遮断する小曲輪と切岸。尾根を横切る細長い平場にする。
  // 主郭と既存の竪堀から離す。形・材質は増やさず、除草も同じ輪郭を使う。
  { x: OTAKE.x - 10, z: OTAKE.z + 30, drop: 7, hw: 7, hd: 2.5 },
];
function otakeShelfWeight(x, z, p) {
  if (S.quality !== 'high') return 0;
  return Math.max(0, Math.min(1, ((p.hw ?? 4) - Math.abs(x - p.x)) / 1.2,
    ((p.hd ?? 4) - Math.abs(z - p.z)) / 1.2));
}
function otakeShelfAt(x, z) {
  if (S.quality !== 'high' || x < OTAKE.x - 21 || x > OTAKE.x - 3
    || z < OTAKE.z - 4 || z > OTAKE.z + 32.5) return null;
  for (const p of OTAKE_SHELVES) if (otakeShelfWeight(x, z, p) > 0) return p;
  return null;
}
// 「月所丸」は昭和四十六年の確認時の仮称。当夜の曲輪名としては使わない。
const GESSHO = { id: 'gessho', name: '搦め手の曲輪', x: 18, z: -218, h: 0, flag: null };
const FORTS = [
  OTAKE,
  KINGO,
  { id: 'fukuju', name: '福寿丸', x: -154, z: 64, h: 0, flag: null },
  { id: 'yamazaki', name: '山崎丸', x: -150, z: 142, h: 0, flag: null },
  GESSHO,
];
const YAMAZAKI = FORTS.find((f) => f.id === 'yamazaki');
// 保存管理計画32頁・表7：山崎丸の南には虎口につながる腰曲輪がある。
// https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
// 高画質だけ南の斜面を削平。寸法・比高・接続の勾配は推定で、主郭の土塁は動かさない。
// 既存の地面を使い、形・材質や毎コマの入れ物を増やさない。
function yamazakiShelfWeight(x, z) {
  if (S.quality !== 'high') return 0;
  return Math.max(0, Math.min(1, (9 - Math.abs(x - YAMAZAKI.x)) / 3,
    (z - YAMAZAKI.z - 7.5) / 3, (YAMAZAKI.z + 24 - z) / 4));
}
// 保存管理計画32頁・表7：山崎丸には切岸と犬走りがある。
// 西斜面に細い平場を補う。方角・幅・比高は推定。南虎口と腰曲輪は空ける。
// 既存の地面をならすだけで、形・材質や毎コマの処理は増やさない。
function yamazakiWalkWeight(x, z) {
  if (S.quality !== 'high') return 0;
  return Math.max(0, Math.min(1,
    (1.8 - Math.abs(x - YAMAZAKI.x + 16)) / 1,
    (8 - Math.abs(z - YAMAZAKI.z)) / 3));
}
// 保存管理計画32頁・表7：月所丸の北東外側には尾根を断つ二条の堀切がある。
// https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
// 縮めた地形での位置・長さ・幅・深さは推定。主尾根の道と曲輪の外だけを削る。
// 既存の地面へ窪みを混ぜ、形・材質・毎コマの入れ物を増やさない。
const GESSHO_DITCHES = [
  [[-2, -15], [13, 0]],
  [[4, -21], [19, -6]],
].map((pts) => horiboriHeight(pts.map(([x, z]) => [GESSHO.x + x, GESSHO.z + z]), { width: 4, depth: 2 }));
function gesshoDip(x, z) {
  if (S.quality !== 'high' || x < GESSHO.x - 4 || x > GESSHO.x + 21
    || z < GESSHO.z - 23 || z > GESSHO.z + 2) return 0;
  return GESSHO_DITCHES[0](x, z) + GESSHO_DITCHES[1](x, z);
}
// 保存管理計画32頁・表7：月所丸には堀切とは別に二か所の竪堀がある。
// 上記の長浜市資料を根拠に、斜面を下る溝を補う。方角・位置・寸法は推定。
// 縮めた縄張りでは東の斜面に置き、平場・主尾根の道・堀切から離す。
// 高画質だけ既存の地面を削る。溝の関数は初期化時に作って使い回す。
const GESSHO_TATEBORI = [
  [[17, 2], [35, 12]],
  [[12, 9], [28, 26]],
].map((pts) => horiboriHeight(pts.map(([x, z]) => [GESSHO.x + x, GESSHO.z + z]), { width: 4, depth: 2 }));
function gesshoTateDip(x, z) {
  if (S.quality !== 'high' || x < GESSHO.x + 10 || x > GESSHO.x + 37
    || z < GESSHO.z || z > GESSHO.z + 28) return 0;
  return GESSHO_TATEBORI[0](x, z) + GESSHO_TATEBORI[1](x, z);
}
// 保存管理計画28・32頁、表7：大嶽は大型土塁で囲い、北西の尾根を二条の堀切で断つ。
// https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
// 位置・向き・寸法は縮めた地形での推定。番手の平場・清水谷・任務の道から離す。
// 地面そのものを削るため、描く形や材質、毎コマの入れ物は増やさない。
const OTAKE_DITCHES = [
  [[-26, -4], [-4, -26]],
  [[-32, -10], [-10, -32]],
].map((pts) => horiboriHeight(pts.map(([x, z]) => [OTAKE.x + x, OTAKE.z + z]), { width: 4, depth: 2 }));
function otakeDip(x, z) {
  if (S.quality !== 'high' || x < OTAKE.x - 34 || x > OTAKE.x - 2
    || z < OTAKE.z - 34 || z > OTAKE.z - 2) return 0;
  return OTAKE_DITCHES[0](x, z) + OTAKE_DITCHES[1](x, z);
}
// 保存管理計画32頁・表7：大嶽の南西には尾根筋と並行する竪堀が残る。
// 上記の長浜市資料を根拠に、尾根を横断する堀切とは別に斜面を下る空の溝を補う。
// 位置・向き・寸法は縮めた地形での推定。砦の入口・番手・主尾根の攻め道の外へ置く。
// 高画質だけ既存の地面を削り、初期化時に作る関数を地形と除草で使い回す。
const OTAKE_TATEBORI = horiboriHeight([
  [OTAKE.x - 18, OTAKE.z + 10], [OTAKE.x - 24, OTAKE.z + 40],
], { width: 4, depth: 2 });
function otakeTateDip(x, z) {
  if (S.quality !== 'high' || x < OTAKE.x - 26 || x > OTAKE.x - 16
    || z < OTAKE.z + 8 || z > OTAKE.z + 42) return 0;
  return OTAKE_TATEBORI(x, z);
}
// 保存管理計画32頁・表7：北西部にも、二条の堀切とは別に竪堀が記録される。
// https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
// 堀切の西端の外から北西斜面へ下る溝として補う。位置・向き・寸法は推定。
// 平場・番手・攻め道から離し、既存の地形と除草に同じ関数を使う。
const OTAKE_NW_TATEBORI = horiboriHeight([
  [OTAKE.x - 35, OTAKE.z - 12], [OTAKE.x - 49, OTAKE.z - 32],
], { width: 4, depth: 2 });
function otakeNwTateDip(x, z) {
  if (S.quality !== 'high' || x < OTAKE.x - 51 || x > OTAKE.x - 33
    || z < OTAKE.z - 34 || z > OTAKE.z - 10) return 0;
  return OTAKE_NW_TATEBORI(x, z);
}
// 保存管理計画32頁・表7：福寿丸の北東虎口の前面には空堀と切岸がある。
// https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
// 空堀の位置・長さ・幅・深さは縮めた地形での推定。平場と虎口の内側は削らない。
// 地面を削る既存の仕組みを使い、描く形・材質や毎コマの入れ物は増やさない。
const FUKUJU = FORTS.find((f) => f.id === 'fukuju');
const FUKUJU_DITCH = horiboriHeight([
  [FUKUJU.x + 3, FUKUJU.z - 16], [FUKUJU.x + 15, FUKUJU.z - 4],
], { width: 4, depth: 2 });
function fukujuDip(x, z) {
  if (S.quality !== 'high' || x < FUKUJU.x + 1 || x > FUKUJU.x + 17
    || z < FUKUJU.z - 18 || z > FUKUJU.z - 2) return 0;
  return FUKUJU_DITCH(x, z);
}
// 屋敷の平場：斜面を削って平らにする（大野木屋敷・赤尾屋敷）。高さは中心の元の高さ
const VILLAGE = [[-104, 167, .1], [-130, 174, -.2], [-75, 170, .1], [-143, 158, -.1]];
// 長浜市保存管理計画29頁：北国脇往還は西麓を南下し、郡上から東へ折れて清水谷口で清水道に合流、再び南下する。
// 東西に貫く街道にはしない。谷口は既存の清水道の端に接続し、道幅・距離・細かな曲がりは縮めた推定。
// https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
const HOKKOKU_WAKI = [[-184, 110], [-178, 145], [-154, 151], [-132, 156], SHIMIZU[0], [-112, 194], [-112, 234], [-116, 276], [-122, 316]];
// 信長公記巻五：虎御前山から宮部へ、幅三間の道と敵側の築地を普請した。
// 南口から宮部へ向かう連絡路の一部だけを補う。距離・曲がり・盛土の高さは縮めた推定復元。
// https://ja.wikisource.org/wiki/信長公記
const MIYABE_ROAD = [[TORAGOZEN.x, TORAGOZEN.z + 16], [-52, 280], [-58, 300], [-64, 320]];
// 清水谷の寺・屋敷と西麓の町屋は、長浜市『史跡小谷城跡保存管理計画書』を参照。
// https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
// 城下は以前の攻撃で焼かれている。残った里の者が遠巻きに様子を見る場とし、賑わう市は置かない。
// 人数・立ち位置・避難の道筋は遊びの補い。尾根へ登らず、谷口から西の平野側へ退く。
// 村の戸口と田の北の畦を通り、南西の虎御前山の本陣へは向かわない。
// 地面の端ぎりぎりでは三メートル先の足場を選べない。田の北に余白のある畦を残す。
const PEOPLE_EXIT = [[-119, 174], [-142, 174], [-170, 174]];
const PEOPLE_PATHS = [
  // 堂の南西の庭から見守る。東の谷道の兵へ寄らず、堂の西から南へ退く。
  // 福寿丸の東裾と西の民家の間を通り、家の北の畦へ合流する（道筋は推定）。
  [[TERA.x - 10, TERA.z + 12], [-132, 130], [-128, 143], [-117, 163], ...PEOPLE_EXIT],
  // 町屋の焼け跡を望む西の肩。谷口の軍道から離れ、寺の退き道へ合流する。
  [[-126, 151], [-117, 163], ...PEOPLE_EXIT],
  [[VILLAGE[0][0] + 7, VILLAGE[0][1] + 8], [-113, 174], ...PEOPLE_EXIT],
  // 西の残存民家の家族。東の谷口へ折り返さず、家の西から南西の畦へ退く（推定）。
  // 福寿丸へ登らず、田の北側を通って共通の里道の西端へ出る。
  [[VILLAGE[3][0] - 8, VILLAGE[3][1] + 6], [-158, 174], PEOPLE_EXIT.at(-1)],
];
// 民が火や兵をよける肩まで草木を空ける。地面に描く細い里道とは幅を分ける。
// 幅は避難判定と共用し、草木の配置時だけ折れ線を調べる。
const PEOPLE_RETREAT_WIDTH = 6;
function clearPeopleWay(x, z) {
  if (x < -178 || x > -90 || z < 116 || z > 181) return false;
  for (const path of PEOPLE_PATHS) {
    if (alongLine(path, x, z).d <= PEOPLE_RETREAT_WIDTH + .5) return true;
  }
  return false;
}
const PEOPLE_KINDS = [
  ['monk', 'monk', 'woman', 'child'],
  ['townsman', 'merchant', 'woman', 'child', 'elder'],
  ['farmer', 'farmer', 'woman', 'child', 'elder'],
  ['farmer', 'woman', 'child'],
];
// 西の家族はそのまま西端へ。ほかの三組は東側から順に畦で待ち、退避の途中で東へ戻さない。
const PEOPLE_WAIT_OFFSETS = [6, 16, 26, 0];
const PEOPLE_BANDS = PEOPLE_PATHS.map((p, i) => ({
  // 寺の僧と身を寄せた母子も、町人・百姓と同じく遠巻きに見守ってから逃げる。
  x: p[0][0], z: p[0][1], kinds: PEOPLE_KINDS[i], mode: 'watch',
  // 尾根上の両軍の重心ではなく、庭・町屋・村から見える清水谷の軍道を見守る。
  watchAt: { x: SHIMIZU[i === 0 ? 1 : 0][0], z: SHIMIZU[i === 0 ? 1 : 0][1] },
  // 庭や畦に散った見物人は、まず里道の起点へ合流してから角を曲がる。
  // 家族の人数分だけ待つ区間を離す。共通の直線上の角は省き、待つ場所を通り過ぎて戻らない。
  route: p.flatMap(([x, z], j) => i < 3 && j === p.length - 2 ? []
    : [{ x: x + (j === p.length - 1 ? PEOPLE_WAIT_OFFSETS[i] : 0), z }]),
  // 包囲の外へ出たとは断定せず、里道の先で待つ。火や兵が迫れば共通の仕組みで再び退く。
  routeEnd: 'wait',
}));
// 長浜市保存管理計画29頁：清水谷の入口には防御施設の堀が確認される。
// https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
// 当夜の姿・位置・断面・水位は不明。谷口の両脇に空の溝を補う推定復元。
// 中央の清水道と民の退路は広く残す。地面と除草で同じ関数を使い、形や材質を増やさない。
const VALLEY_ENTRY_DITCH = horiboriHeight([[-139, 143], [-88, 143]], { width: 3, depth: 1.2 });
function valleyEntryDip(x, z) {
  if (S.quality !== 'high' || x < -141 || x > -86 || z < 141.5 || z > 144.5) return 0;
  const edge = Math.max(0, Math.min(1, (Math.abs(x + 111) - 9) / 3));
  return edge * VALLEY_ENTRY_DITCH(x, z);
}
const TERR = [{ ...TORAGOZEN, r: 20 }, ...VILLAGE.map(([x, z]) => ({ x, z, r: 6 })), { x: ONOGI.x, z: ONOGI.z, r: 12 }, { x: AKAO.x, z: AKAO.z, r: 12 }, ...FORTS.map((f) => ({ x: f.x, z: f.z, r: 9, f })),
  // 清水谷の居館・家臣の屋敷・寺も、斜面を削った平場に建てる（谷の高さのまま。家の下に高い白い台を立てない）
  { x: KYOKAN.x, z: KYOKAN.z, r: 15, own: true }, { x: TERA.x, z: TERA.z, r: 7, own: true }, ...YASHIKI.map(([x, z]) => ({ x, z, r: 6, own: true, low: z > 90 }))];
// 谷の口の二つの屋敷（low）は谷道の 15m 東の段の上にあり、平場が谷底より 2.5m 高く、道の脇まで急な土手が伸びて
// 押された兵と供が崖に張り付いて見えた（11/2）。平場を同じ z の谷道の脇の高さ +0.4m まで下げ、土手を低くする（削った山側は屋敷の裏に残る）
// 登り道（九十九折り）：谷の奥から京極丸の西の口へ。道の高さは長さに沿って一定の勾配で上る
const CLIMB_LEN = [0];
for (let i = 1; i < CLIMB_UP.length; i++) CLIMB_LEN.push(CLIMB_LEN[i - 1] + Math.hypot(CLIMB_UP[i][0] - CLIMB_UP[i - 1][0], CLIMB_UP[i][1] - CLIMB_UP[i - 1][1]));
function climbGrade(x, z) {
  let bestD = Infinity, bestH = 0, sum = 0, weight = 0;
  for (let i = 1; i < CLIMB_UP.length; i++) {
    const [ax, az] = CLIMB_UP[i - 1], [bx, bz] = CLIMB_UP[i], l = CLIMB_LEN[i] - CLIMB_LEN[i - 1] || 1e-6;
    let t = ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (l * l); t = Math.max(0, Math.min(1, t));
    const dx = x - (ax + (bx - ax) * t), dz = z - (az + (bz - az) * t);
    const d = dx * dx + dz * dz;
    const h = climbH(CLIMB_LEN[i - 1] + t * l);
    if (d < bestD) { bestD = d; bestH = h; }
    // 折れ返しで近い道が切り替わっても、高さが飛ばないよう肩をつなぐ。
    if (d < 100) { const w = (1 - Math.sqrt(d) / 10) ** 2; sum += h * w; weight += w; }
  }
  CLIMB_GRADE.d = Math.sqrt(bestD); CLIMB_GRADE.h = weight ? sum / weight : bestH;
  return CLIMB_GRADE;
}
const CLIMB_GRADE = { d: 0, h: 0 };
function climbH(s) {
  const h0 = SHIMIZU_FLOOR[SHIMIZU_FLOOR.length - 1], h1 = KYO.level, sg = CLIMB_LEN[2];
  return h0 + (h1 - h0) * Math.min(1, s / sg);
}
function baseTerrain(x, z) {
  let h = valleyTerrain(x, z);
  for (const t of TERR) {
    // 保存管理計画32頁・表7：福寿丸は南北50m・東西44mほどの方形。
    // 高画質では囲いと同じ方形に削平する。半幅7m・半奥行8mは縮めた推定。
    // 北東虎口の空堀はこの後に削り、既存の小屋・荷と谷の攻め道は保つ。
    const d = S.quality === 'high' && t.f === FUKUJU
      ? Math.max(Math.abs(x - t.x) * 9 / 7, Math.abs(z - t.z) * 9 / 8)
      : Math.hypot(x - t.x, z - t.z);
    if (d >= t.r + 6) continue;
    if (t.h == null) t.h = t.own ? valleyTerrain(t.x, t.z) : baseRaw(t.x, t.z);
    if (t.low && !t.lowered) { t.lowered = true; t.h = Math.min(t.h, valleyTerrain(t.x - 12, t.z) + 0.4); }
    const k = d <= t.r ? 1 : 1 - (d - t.r) / 6;
    h += (t.h - h) * k * k * (3 - 2 * k);
  }
  // 保存管理計画32頁・表7：大嶽城の最高部の平坦地は二段。
  // https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
  // 北側を八十センチ上げる推定復元。段の方角・高さ・境は遺構の実測値ではない。
  // 外周の土塁と南口、南側の番手の足場は保ち、二メートルの坂で段をつなぐ。
  // 高画質だけ既存の地面へ加え、形・材質や毎コマの入れ物は増やさない。
  if (S.quality === 'high' && Math.abs(x - OTAKE.x) < 5.5
    && z > OTAKE.z - 6 && z < OTAKE.z + 1.5) {
    const edge = Math.max(0, Math.min(1,
      (5.5 - Math.abs(x - OTAKE.x)) / 1.5, (z - OTAKE.z + 6) / 1.5));
    const rise = Math.max(0, Math.min(1, (OTAKE.z + 1.5 - z) / 2));
    h += .8 * edge * edge * (3 - 2 * edge) * rise;
  }
  // 保存管理計画32頁・表7：月所丸は中ほどの土塁で区切る二段の曲輪。
  // https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
  // 北を八十センチ上げる推定復元。仕切りの中央口は二メートルの坂でつなぐ。
  // 外縁と南の入口は元の高さに保ち、小屋・土塁も同じ地面に載せる。
  // 高画質だけ既存の地面を使い、形・材質や毎コマの入れ物は増やさない。
  if (S.quality === 'high' && Math.abs(x - GESSHO.x) < 6.5
    && z > GESSHO.z - 8 && z < GESSHO.z + 2.2) {
    const edge = Math.max(0, Math.min(1,
      (6.5 - Math.abs(x - GESSHO.x)) / 1.5, (z - GESSHO.z + 8) / 1.5));
    const rise = Math.max(0, Math.min(1, (GESSHO.z + 2.2 - z) / 2));
    h += .8 * edge * edge * (3 - 2 * edge) * rise;
  }
  const walk = otakeWalkWeight(x, z);
  if (walk > 0) {
    const top = OTAKE.walkTop ??= baseRaw(OTAKE.x, OTAKE.z);
    h += (top - 1.8 - h) * walk * walk * (3 - 2 * walk);
  }
  const otakeShelf = otakeShelfAt(x, z);
  if (otakeShelf) {
    const weight = otakeShelfWeight(x, z, otakeShelf);
    const top = OTAKE.walkTop ??= baseRaw(OTAKE.x, OTAKE.z);
    h += (top - otakeShelf.drop - h) * weight * weight * (3 - 2 * weight);
  }
  const yakio = yakioWeight(x, z);
  if (yakio > 0) {
    const top = YAKIO.level ??= baseRaw(YAKIO.x, YAKIO.z);
    h += (top - h) * yakio * yakio * (3 - 2 * yakio);
  }
  const rokubo = rokuboAt(x, z);
  if (rokubo) {
    const weight = rokuboWeight(x, z, rokubo);
    const top = rokubo.level ??= baseRaw(rokubo.x, rokubo.z);
    h += (top - h) * weight * weight * (3 - 2 * weight);
  }
  const shelf = yamazakiShelfWeight(x, z);
  if (shelf > 0) {
    const top = YAMAZAKI.shelfTop ??= baseRaw(YAMAZAKI.x, YAMAZAKI.z);
    // 南虎口の開口から腰曲輪へ下る短い坂。両脇は一段低い平場と切岸にする。
    const ramp = Math.max(0, 1 - Math.max(0, Math.abs(x - YAMAZAKI.x) - 1.8) / 1.2)
      * Math.max(0, 1 - (z - YAMAZAKI.z - 7.5) / 5);
    const target = top - 2.5 + 2.5 * ramp;
    h += (target - h) * shelf * shelf * (3 - 2 * shelf);
  }
  const yamazakiWalk = yamazakiWalkWeight(x, z);
  if (yamazakiWalk > 0) {
    const top = YAMAZAKI.shelfTop ??= baseRaw(YAMAZAKI.x, YAMAZAKI.z);
    h += (top - 2 - h) * yamazakiWalk * yamazakiWalk * (3 - 2 * yamazakiWalk);
  }
  // 出曲輪の段：谷底の高さ（谷道の縁の高さ +0.35m）にならす。外は 9m で元の斜面へ戻す（裏は切岸の段に見える）
  {
    const [a, b] = SIEGE.loc(x, z), e = Math.max(Math.abs(a) - SIEGE.W - 6, -12 - b, b - 27);
    if (e < 9) {
      const [rx, rz] = SIEGE.L(Math.max(-SIEGE.W - 6, Math.min(SIEGE.W + 6, a)), 33), k = e <= 0 ? 1 : 1 - e / 9;
      h += (valleyTerrain(rx, rz) + .35 - h) * k * k * (3 - 2 * k);
    }
  }
  return Math.max(0, h + gesshoDip(x, z) + gesshoTateDip(x, z) + Math.min(otakeDip(x, z), otakeNwTateDip(x, z)) + otakeTateDip(x, z) + fukujuDip(x, z) + rokuboTateDip(x, z));
}
function valleyTerrain(x, z) {
  let h = baseRaw(x, z);
  // 清水谷の谷底の道沿い：平らに（屋敷の並ぶ平場）。谷の奥は登り道へつながる
  if (x < 4) {
    const L = alongLine(SHIMIZU, x, z);
    if (L.d < 32) {
      const k = L.d < 11 ? 1 : 1 - (L.d - 11) / 21, kk = k * k * (3 - 2 * k);
      h += (floorAt(L.t) + L.d * 0.05 - h) * kk;
    }
    // 谷道の外だけを加工。屋敷と登り道の平場は、この後の処理で保つ。
    const bank = Math.max(0, Math.min(1, (L.d - 11) / 5, (65 - L.d) / 12,
      (z + 70) / 15, (175 - z) / 15));
    if (bank > 0) {
      const floor = floorAt(L.t), rise = h - floor;
      // 等高線に沿う四段の屋敷段。各段は高さ1.2m、縁だけ滑らかにつなぐ。
      if (rise > 0 && rise < 6) {
        const tier = Math.min(3, Math.floor(rise / 1.2));
        const edge = Math.min(1, (rise / 1.2 - tier) / 0.25);
        const shelf = floor + (tier + edge * edge * (3 - 2 * edge)) * 1.2;
        const blend = bank * Math.min(1, rise / 0.6, (6 - rise) / 1.2);
        h += (shelf - h) * blend;
      }
      // 五〜八メートル周期、最大振幅0.5m。格子・地面の広さは増やさない。
      h += bank * (0.3 * Math.sin(x * Math.PI * 2 / 5 + z * 0.18)
        + 0.2 * Math.sin(z * Math.PI * 2 / 8 - x * 0.13));
    }
    const G = climbGrade(x, z);
    if (G.d < 28) {
      const k = G.d < 4.5 ? 1 : 1 - (G.d - 4.5) / 23.5, kk = k * k * (3 - 2 * k);
      h += (G.h - h) * kk;
    }
  }
  // 麓の田の平場。畦の外では草の斜面へなだらかにつなぐ。
  if (z > 176 && z < 229 && x > -154 && x < -61) {
    const edge = Math.min(z - 176, 229 - z, x + 154, -61 - x);
    const k = Math.min(1, edge / 3);
    h += (Math.max(0, SHIMIZU_FLOOR[0] - 4) - h) * k;
  }
  return h;
}
// 国土地理院の標高を下地にした推定復元。谷・曲輪・道は加工しており、実測地形そのものではない。
// 尾根の背の広さ（曲輪の半幅＋2m。曲輪の間は外へ薄れる）：背をこの幅で平らにし、両側へ 0.75 の勾配で落とす。
// 実測の背は曲輪より細く、そのままだと曲輪の縁が数十 m の垂直の壁になる
const RIDGE_ALL = [...RIDGE, KYOGOKU2, SANNO2, ...OKURIDGE];
function ridgeHW(z) {
  let w = 9;
  for (const k of RIDGE_ALL) w = Math.max(w, k.hw + 3 - Math.max(0, k.z0 - z, z - k.z1) * 0.35);
  return w;
}
function baseRaw(x, z) {
  const dem = demH(x, z);
  const shoulder = Math.max(0, Math.abs(x) - ridgeHW(z) - 1.2 * Math.sin(z * 0.09));
  const plat = crestAt(z) - (Math.hypot(shoulder, 4) - 4) * 0.75;
  const joined = Math.max(dem, plat) + Math.max(0, 3 - Math.abs(dem - plat)) ** 2 / 12;
  // 虎御前山は独立した丸い丘ではなく、南西へ尾根の延びる独立丘陵。
  // 長浜市保存管理計画51頁に合わせ、縮めた本陣の南西に尾根を補う（寸法は推定）。
  // 北の谷道・田・大手道と本陣の平場は元の高さを保つ。
  const hill = Math.hypot((x - TORAGOZEN.x) / 44, (z - TORAGOZEN.z) / 58);
  const hillH = hill < 1 ? TORAGOZEN.h * (1 - hill * hill) ** 2 : 0;
  const tailZ = z - TORAGOZEN.z;
  const tail = Math.hypot((x - TORAGOZEN.x + tailZ * .45) / 30, (tailZ - 48) / 65);
  const tailH = tailZ > 20 && tail < 1 ? 18 * (1 - tail * tail) ** 2 * Math.min(1, (tailZ - 20) / 20) : 0;
  return Math.max(hillH, tailH, joined + 0.35 * Math.sin(x * 0.07 + 0.3) * Math.cos(z * 0.05) + 0.2 * Math.sin(z * 0.11 + x * 0.03));
}
// 門の上がり坂：曲輪の切岸は縁で 2.7m ほど切れ落ちるので、口の所だけ下の曲輪から上の曲輪へ坂でつなぐ
const RAMPS = [];
for (let i = 0; i < RIDGE.length - 1; i++) {
  const lo = RIDGE[i] === KYO ? KYOGOKU2 : RIDGE[i], up = RIDGE[i + 1];
  // 比高を増やした大手側だけ曲輪の中央まで坂を延ばす（勾配0.7未満）。
  const south = i < 3;
  RAMPS.push({ a: [0, south ? lo.cz : lo.z0 + 3], b: [0, south ? up.cz : up.z1 - (up === SANNO ? 5 : 3)],
    w: up === HON ? 3.4 : 2.6, ...(south ? { ha: lo.level, hb: up.level } : {}) });
}
const OTE_LEN = [0];
for (let i = 1; i < OTE_CLIMB.length; i++) OTE_LEN.push(OTE_LEN[i - 1] + Math.hypot(OTE_CLIMB[i][0] - OTE_CLIMB[i - 1][0], OTE_CLIMB[i][1] - OTE_CLIMB[i - 1][1]));
const oteFoot = baseTerrain(...OTE_CLIMB[0]);
// 金吾丸を大手道の尾根先へ置く。平場の高さも同じ登り道へ合わせる。
TERR.find((t) => t.f === KINGO).h = oteFoot + (BANSHO.level - oteFoot) * OTE_LEN[2] / OTE_LEN.at(-1);
for (let i = 1; i < OTE_CLIMB.length; i++) RAMPS.push({ a: OTE_CLIMB[i - 1], b: OTE_CLIMB[i], w: 1.2, ha: oteFoot + (BANSHO.level - oteFoot) * OTE_LEN[i - 1] / OTE_LEN.at(-1), hb: oteFoot + (BANSHO.level - oteFoot) * OTE_LEN[i] / OTE_LEN.at(-1) });
RAMPS.push({ a: [0, KYOGOKU2.z1 + 5], b: [0, KYOGOKU2.z1 - 2], w: 2.6 });
for (let i = 0; i < OKURIDGE.length; i++) {
  const lo = i ? OKURIDGE[i - 1] : SANNO2, up = OKURIDGE[i];
  RAMPS.push({ a: [0, lo.z0 + 2], b: [0, up.z1 - 2], w: 2.2 });
}
RAMPS.push({ a: [0, BANSHO.z1 + 10], b: [0, BANSHO.z1 - 3], w: 2.6 });
RAMPS.push({ a: [0, SANNO2.z1 + 5], b: [0, SANNO2.z1 - 2], w: 2.2 });
// 西の脇道は、曲輪の平場から小丸の脇口まで坂をつなぐ。堀全体や切岸はならさない。
const WEST_LEN = [0];
for (let i = 1; i < KOMA_WEST.length; i++) WEST_LEN.push(WEST_LEN[i - 1] + Math.hypot(KOMA_WEST[i][0] - KOMA_WEST[i - 1][0], KOMA_WEST[i][1] - KOMA_WEST[i - 1][1]));
const westH = (i) => KYO.level + (KOM.level - KYO.level) * Math.max(0, (WEST_LEN[i] - WEST_LEN[2]) / (WEST_LEN[WEST_LEN.length - 1] - WEST_LEN[2]));
for (let i = 1; i < KOMA_WEST.length; i++) RAMPS.push({ a: KOMA_WEST[i - 1], b: KOMA_WEST[i], w: 1.4, ha: westH(i - 1), hb: westH(i) });
const ONO_RAMPS = [];
for (let i = ROUTE_O.length - 2; i < ROUTE_O.length; i++) {
  const r = { a: ROUTE_O[i - 1], b: ROUTE_O[i], w: 1.6, onogi: true };
  RAMPS.push(r); ONO_RAMPS.push(r);
}
// 民の通る里道も平場同士の坂でつなぐ。建物・田・城の切岸には道を通さない。
// 共通の畦道は一度だけ足し、兵の登り道と乱戦の持ち場は変えない。
const peopleEdges = new Set();
for (const p of PEOPLE_PATHS) for (let i = 1; i < p.length; i++) {
  const key = `${p[i - 1]}:${p[i]}`;
  if (peopleEdges.has(key)) continue;
  peopleEdges.add(key);
  RAMPS.push({ a: p[i - 1], b: p[i], w: 3.2 });
}
// 堀切の窪みを世界の高さへ混ぜる。大堀切の端と土橋だけ、小谷の実寸に合わせる。
const HORI = ODANI_PLAN.hori.map((h) => {
  const dip = horiboriHeight(h.pts, { depth: h.deep, width: h.w });
  if (h.kind !== 'horikiri' || h.pts[0][1] !== OHORIKIRI.z) return dip;
  const side = Math.sign(h.pts[0][0]);
  // 線の丸い端は幅15mの半径で土橋と反対側まで削る。大堀切だけ東西40mの範囲へ切り、土橋を残す。
  return (x, z) => {
    const ax = x * side;
    if (ax <= 2.6 || ax >= OHORIKIRI.len / 2) return 0;
    return dip(x, z) * Math.min(1, (ax - 2.6) / 1.5, (OHORIKIRI.len / 2 - ax) / 1.5);
  };
});
const baseWithHori = (x, z) => HORI.reduce((a, f) => a + f(x, z), baseTerrain(x, z));
// 坂の両端を直線で切らず、端の外だけ元の斜面へ戻す。
// 区間内の勾配と幅は保ち、重なる坂の端に縦の裂け目を作らない。
function rampHeight(r, x, z, h, shoulder) {
  const along = ((x - r.a[0]) * r.dx + (z - r.a[1]) * r.dz) / (r.len * r.len);
  const t = Math.max(0, Math.min(1, along));
  const end = Math.abs(along - t) * r.len;
  if (end >= shoulder) return h;
  const side = Math.abs((x - r.a[0]) * r.dz - (z - r.a[1]) * r.dx) / r.len;
  if (side >= r.w + shoulder) return h;
  const edge = 1 - end / shoulder;
  const k = Math.min(1, (r.w + shoulder - side) / shoulder) * edge * edge * (3 - 2 * edge);
  return h + (r.ha + (r.hb - r.ha) * t - h) * k;
}
let H0 = null;
function height(x, z) {
  if (!H0) {
    H0 = heightOf(ODANI_PLAN, baseWithHori, 4.8);
    for (const r of RAMPS) {
      r.ha ??= H0(r.a[0], r.a[1]); r.hb ??= H0(r.b[0], r.b[1]);
      r.dx = r.b[0] - r.a[0]; r.dz = r.b[1] - r.a[1];
      r.len = Math.hypot(r.dx, r.dz) || 1;
      const pad = r.w + (r.onogi ? 3 : 1.5);
      r.x0 = Math.min(r.a[0], r.b[0]) - pad; r.x1 = Math.max(r.a[0], r.b[0]) + pad;
      r.z0 = Math.min(r.a[1], r.b[1]) - pad; r.z1 = Math.max(r.a[1], r.b[1]) + pad;
    }
  }
  let h = H0(x, z) + SIEGE_H(x, z);
  const otsubone = otsuboneWeight(x, z);
  if (otsubone > 0) {
    h += (NAKAMARU.level - 3 - h) * otsubone * otsubone * (3 - 2 * otsubone);
  }
  // 曲輪の切岸を重ねても深さ10mを埋め戻さない。南北の縁を結ぶ高さから堀底を取る。
  if (Math.abs(z - OHORIKIRI.z) < OHORIKIRI.w / 2) {
    const dip = HORI[0](x, z) + HORI[1](x, z);
    if (dip < 0) {
      const t = (HON.z0 - z) / (HON.z0 - NAKAMARU.z1);
      h = Math.min(h, HON.level + (NAKAMARU.level - HON.level) * t + dip);
    }
  }
  // 中央の土橋と小丸の脇道は、今までの歩ける坂を最後に重ねる。
  for (const r of RAMPS) {
    // 遠い坂の投影は省く。高さと歩ける道の形は変えない。
    if (r.onogi) continue;
    if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
    h = rampHeight(r, x, z, h, 1.5);
  }
  // 曲輪の切岸を重ねた後にも、西の口までの幅9mの足場を残す。
  // 板塀と食い違い土塁の当たりはそのまま効く。
  if (x < GATE_WEST.x + 5 && z < -35) {
    const g = climbGrade(x, z);
    if (g.d < 7) {
      const k = g.d <= 4.5 ? 1 : (7 - g.d) / 2.5;
      h += (g.h - h) * k * k * (3 - 2 * k);
    }
  }
  // 谷の歩く幅だけは、屋敷段や里道の坂を重ねた後にも元の勾配を保つ。
  // 広い肩は残し、頭の登り道へは同じ高さでつなぐ。
  if (z >= HEAD.z && z <= SHIMIZU[0][1] && x < -30) {
    const L = alongLine(SHIMIZU, x, z);
    if (L.d < 3.2) {
      const k = Math.min(1, (3.2 - L.d) / 1.6, (SHIMIZU[0][1] - z) / 8);
      h += (floorAt(L.t) - h) * k * k * (3 - 2 * k);
    }
  }
  // 屋敷へ折れる坂を最後に戻す。西木戸への広い坂が上書きすると、
  // 南木戸の手前に勾配二倍超の段ができ、往復とも切岸で止まっていた。
  for (const r of ONO_RAMPS) {
    if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
    h = rampHeight(r, x, z, h, 3);
  }
  // 屋敷の台と腰曲輪は、描く平場と歩く高さをそろえる。
  // 桜馬場の東西二段もここだけで補う。西側を二度下げず、推定の比高六十センチに保つ。
  h = odaniExtraHeight(x, z, h);
  const kyoEast = kyoEastAt(x, z);
  if (kyoEast) {
    const weight = kyoEastWeight(x, z, kyoEast);
    h += (kyoEast.level - h) * weight * weight * (3 - 2 * weight);
  }
  // 京極丸の櫓へは南の広場から緩く登る。切岸のほかの部分は残す。
  const a = LOOKOUT_WAY[0], b = LOOKOUT_WAY[1];
  if (LOOKOUT_RAMP.ha == null) {
    LOOKOUT_RAMP.ha = odaniExtraHeight(a[0], a[1], H0(a[0], a[1]));
    LOOKOUT_RAMP.hb = odaniExtraHeight(b[0], b[1], H0(b[0], b[1]));
  }
  const t = (z - a[1]) / (b[1] - a[1]), side = Math.abs(x - a[0]);
  if (t >= 0 && t <= 1 && side < 2.8) {
    const k = side <= 1.4 ? 1 : (2.8 - side) / 1.4;
    h += (LOOKOUT_RAMP.ha + (LOOKOUT_RAMP.hb - LOOKOUT_RAMP.ha) * t - h) * k;
  }
  // 池の石組みの内側だけ浅く下げる。御馬屋の土塁を水面へ重ねない。
  const pd = Math.max(Math.abs(x - UMAARAI.x) - UMAARAI.w / 2, Math.abs(z - UMAARAI.z) - UMAARAI.d / 2);
  if (pd < 0.4) {
    const k = pd <= 0 ? 1 : 1 - pd / 0.4;
    h += (ONMAYA.level - 0.35 - h) * k;
  }
  const pond = KATANA_POND;
  const pe = Math.max(Math.abs(x - pond.x) - pond.w / 2, Math.abs(z - pond.z) - pond.d / 2);
  if (pe < .5 && S.quality === 'high') {
    if (pond.level == null) pond.level = odaniExtraHeight(pond.x, pond.z, H0(pond.x, pond.z));
    const k = pe <= 0 ? 1 : 1 - pe / .5;
    h += (pond.level - .45 - h) * k;
  }
  // 井戸の内側を実際に掘り下げ、石積みで囲っただけの土の台にしない。
  // 当夜の水位は不明。溝は曲輪内で止め、東の切岸や塀の足もとは削らない。
  if (S.quality === 'high') {
    const well = HIROMA_WELL;
    const edge = Math.max(Math.abs(x - well.x) - well.w / 2, Math.abs(z - well.z) - well.d / 2);
    if (edge < .2) h = Math.min(h, OOHIROMA.level - well.depth * Math.min(1, 1 - edge / .2));
    if (x >= well.x + well.w / 2 && x <= HIROMA_DRAIN_END && Math.abs(z - well.z) < .45)
      h = Math.min(h, OOHIROMA.level - .25 * Math.min(1, (.45 - Math.abs(z - well.z)) / .15));
  }
  const garden = TEMPLE_GARDEN, gx = Math.abs(x - garden.x), gz = Math.abs(z - garden.z);
  if (gx < 8 && gz < 3.5) {
    if (garden.level == null) garden.level = baseTerrain(garden.x, garden.z);
    const edge = Math.max(gx - 7, gz - 2.5);
    const island = gx <= 2.5 && Math.abs(z - (garden.z - .6)) <= 1.75;
    const bed = garden.level - (island ? 0 : .3);
    const k = edge <= 0 ? 1 : 1 - edge;
    h += (bed - h) * k;
  }
  // 谷の平場をならした後に削り、堀の描画と歩く高さをそろえる。
  h += valleyEntryDip(x, z);
  h += templeDip(x, z);
  return h;
}


// 見た目だけの復元説。床・門の幅・壁の区間・西の攻め道の当たりは組み立て済みの物を使う。
// 御馬屋の推定復元。西の庭へ長い庇を開き、東の板壁と柱で屋根を受ける。
// 旧小屋と同じ範囲を当たりに使い、池・尾根道・兵の置き場は動かさない。
function addOdaniStable(rt) {
  const W = rt.world, x = ONMAYA.x + 6, z = ONMAYA.cz - 2, w = 5, d = 14;
  let y = W.heightAt(x, z);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) y = Math.max(y, W.heightAt(x + sx * w / 2, z + sz * d / 2));
  const parts = [];
  const box = (px, py, pz, bw, bh, bd, color, tilt = 0) => parts.push([px, py, pz, bw, bh, bd, color, tilt]);
  const wood = 0x5f4b37;
  for (let i = 0; i <= 7; i++) {
    const zz = -d / 2 + i * 2;
    for (const sx of [-1, 1]) {
      const xx = sx * w / 2, foot = Math.min(y, W.heightAt(x + xx, z + zz)) - .12;
      box(xx, (foot - y + 2.65) / 2, zz, .19, y + 2.65 - foot, .19, wood);
      box(xx, foot - y + .04, zz, .38, .16, .36, 0x80796a);
    }
    box(0, 2.6, zz, w + .25, .17, .17, wood);
    if (i > 0 && i < 7) {
      // 馬房の仕切りは腰まで。庭側の柱間を塞がない。
      box(.8, .7, zz, 3.2, .1, .12, 0x796047);
      box(.8, 1.2, zz, 3.2, .1, .12, 0x796047);
    }
  }
  for (let i = 0; i < 28; i++) {
    const zz = -d / 2 + (i + .5) * .5;
    box(w / 2, 1.34, zz, .07, 2.5, .485, i % 4 ? 0x75614b : 0x887359);
  }
  for (const sx of [-1, 1]) box(sx * w / 2, 2.62, 0, .22, .22, d + .5, wood);
  // 薄板の切妻。軒を庭側へ張り、棟と押さえ木を灰茶の板より暗くする。
  const reach = w / 2 + .75, rise = reach * .38, angle = Math.atan2(rise, reach);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 28; i++) box(side * reach / 2, 2.65 + rise / 2, -7.5 + (i + .5) * 15 / 28,
      Math.hypot(reach, rise), .09, 15 / 28 - .012, [0x796247, 0x70604c, 0x887258, 0x655744][i % 4], -side * angle);
    for (const xx of [1.1, 2.6]) box(side * xx, 2.75 + rise - xx * .38, 0, .1, .1, 15.2, 0x514330, -side * angle);
  }
  box(0, 2.78 + rise, 0, .2, .18, 15.4, 0x514330);
  box(1.9, .55, 0, .6, .15, 12, 0x46392a);
  box(1.9, .72, 0, .08, .2, 12, wood);
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95 }), parts.length);
  const pose = new THREE.Object3D(), color = new THREE.Color();
  parts.forEach(([px, py, pz, bw, bh, bd, tint, tilt], i) => {
    pose.position.set(x + px, y + py, z + pz); pose.scale.set(bw, bh, bd); pose.rotation.set(0, 0, tilt); pose.updateMatrix();
    mesh.setMatrixAt(i, pose.matrix); mesh.setColorAt(i, color.setHex(tint));
  });
  mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true; mesh.receiveShadow = true; rt.scene.add(mesh);
  solidRect(x, z, w + .18, d + .18, 0);
}

function dressOdaniCastle(rt, C) {
  const W = rt.world;
  // 門と館の当たりを保ち、曲輪の足もとの野面積みを補う。
  const batch = makeKitBatch(), growth = [];
  for (const k of STONE_KURUWA.filter((k) => !UPPER.includes(k))) {
    const walls = C.walls.filter((w) => w.seg && w.name === k.name), runs = [];
    let run = null;
    for (const w of walls) {
      const [ax, az, bx, bz] = w.seg, end = run?.[run.length - 1];
      if (!end || Math.hypot(end[0] - ax, end[1] - az) > 0.1) { run = [[ax, az]]; runs.push(run); }
      run.push([bx, bz]);
    }
    // 多角形の始めと終わりもつなぐ。切れ目は既存の虎口と脇口だけ。
    if (runs.length > 1) {
      const last = runs[runs.length - 1], end = last[last.length - 1], first = runs[0];
      if (Math.hypot(end[0] - first[0][0], end[1] - first[0][1]) < 0.1) { runs[0] = [...last, ...first.slice(1)]; runs.pop(); }
    }
    for (const pts of runs) {
      // 門の前には石の張り出しを置かない。元の開口より少し広く空ける。
      for (const [i, j] of [[0, 1], [pts.length - 1, pts.length - 2]]) {
        const a = pts[i], b = pts[j], len = Math.hypot(b[0] - a[0], b[1] - a[1]), t = Math.min(0.7, len / 3) / len;
        a[0] += (b[0] - a[0]) * t; a[1] += (b[1] - a[1]) * t;
      }
      const top = k.level + (ODANI_PLAN.kuruwa.find((q) => q.id === k.id).dorui ?? 1.3);
      ishigaki(W, pts, { topY: top, minH: k === HON ? 4.2 : 4, maxH: k === HON ? 4.5 : 4, lean: 0.14, out: 1, big: 1.8, faceSegments: 2, capIn: 0.35, batch, noKit: true });
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
        const n = Math.floor(len / 6), nx = -dz / len, nz = dx / len, rot = Math.atan2(-dz, dx);
        for (let j = 0; j < n; j++) {
          const t = (j + 0.5) / n, x = a[0] + dx * t, z = a[1] + dz * t;
          // 門の開口には置かず、下段にも苔と天端の草を添える。見た目だけで当たりは足さない。
          growth.push([x + nx * 0.3, top - 0.6 - j % 3 * 0.35, z + nz * 0.3, 0.65, 0.22, 0.08, rot, 0x586046]);
          growth.push([x - nx * 0.2, top + 0.15, z - nz * 0.2, 0.06, 0.3, 0.2, j * 1.7, 0x697047]);
        }
      }
    }
  }
  finalizeKitBatch(rt, batch);
  if (growth.length) {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), growth.length);
    const dummy = new THREE.Object3D(), color = new THREE.Color();
    for (let i = 0; i < growth.length; i++) {
      const g = growth[i];
      dummy.position.set(g[0], g[1], g[2]); dummy.scale.set(g[3], g[4], g[5]); dummy.rotation.y = g[6]; dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, color.setHex(g[7]));
    }
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; mesh.receiveShadow = true;
    rt.scene.add(mesh);
  }
  // 元の塀を残す。別の壁部品で覆うと、笠と壁の位置がずれて見える。
}

// 西木戸の石畳。石の四隅を地面へ沿わせ、幅広の平らな板を浮かせない。
function addOdaniSteps(rt) {
  const positions = [], colors = [], color = new THREE.Color();
  for (let row = 0; row < 10; row++) for (let col = 0; col < 8; col++) {
    const x = GATE_WEST.x - 5 + row * .5, z = GATE_WEST.z - 2 + col * .5;
    // 土の目地を残し、篝火にも白く光らない灰茶の自然石にする。
    const corners = [[x + .025, z + .025], [x + .475, z + .025], [x + .475, z + .475], [x + .025, z + .475]];
    color.setHex([0x625b4e, 0x706755, 0x59564b][(row + col * 2) % 3]);
    for (const i of [0, 2, 1, 0, 3, 2]) {
      const [px, pz] = corners[i];
      positions.push(px, rt.world.heightAt(px, pz) + .018, pz);
      colors.push(color.r, color.g, color.b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = true; rt.scene.add(mesh);
}

// 道の土は元の地形で描く。上張りを重ねず、案内の短い印だけを残す。
function addOdaniTrail(rt) {
  const W = rt.world;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const c = canvas.getContext('2d');
  // 黒い菱形の板で道を覆わず、土が透ける短い道しるべにする。
  c.strokeStyle = '#c7bda7'; c.lineWidth = 5; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(64, 20); c.lineTo(64, 108);
  c.moveTo(34, 78); c.lineTo(64, 108); c.lineTo(94, 78); c.stroke();
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const signGeo = new THREE.PlaneGeometry(1.1, 1.1, 8, 8); signGeo.rotateX(-Math.PI / 2);
  const sign = rt.flags.trailSign = new THREE.Mesh(signGeo, new THREE.MeshBasicMaterial({ map, transparent: true, opacity: .55, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  rt.flags.trailBase = signGeo.attributes.position.array.slice();
  sign.visible = false; rt.scene.add(sign);
  // 距離は任務の札に一本化する。兵や道を隠す浮いた距離札は置かない。
  // 草の斜面と同じ色だった登り道を、踏み固めた土でつなぐ。
  // 地形の既存の頂点へ一度だけ記録し、上張りの板・絵・描画回数は増やさない。
  const terrainPos = W.terrain.geometry.attributes.position;
  const road = new Float32Array(terrainPos.count);
  const roads = [CLIMB, ROUTE_O, ONO_WEST_ENTRY, ROAD_RIDGE, KOMA_WEST];
  for (let i = 0; i < terrainPos.count; i++) {
    const x = terrainPos.getX(i), z = terrainPos.getZ(i);
    let d = Infinity;
    for (const path of roads) d = Math.min(d, alongLine(path, x, z).d);
    const t = Math.max(0, Math.min(1, (3.2 - d) / 2));
    road[i] = t * t * (3 - 2 * t);
  }
  W.terrain.geometry.setAttribute('odaniRoad', new THREE.BufferAttribute(road, 1));
  // 歩行の三角形は保ち、照明と土・草の混ぜ方を同じ頂点法線でつなぐ。
  const mat = W.terrain.material, compile = mat.onBeforeCompile;
  mat.flatShading = false;
  const key = mat.customProgramCacheKey();
  mat.customProgramCacheKey = () => key + '|odani-slope-smooth-soil-road';
  mat.onBeforeCompile = (sh, renderer) => {
    compile.call(mat, sh, renderer);
    sh.vertexShader = 'attribute float odaniRoad; varying float vOdaniRoad;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vOdaniRoad = odaniRoad;');
    sh.fragmentShader = 'varying float vOdaniRoad;\n' + sh.fragmentShader;
    // 乾いた曲輪の土に、大きな蹄の輪を一面へ押さない。
    // 既存の窪みを細かく浅くし、画像の読み出しも地面の面も増やさない。
    sh.fragmentShader = sh.fragmentShader
      // 面ごとの傾きで土・草・岩を切り替えると、照明をならしても三角の継ぎ目が残る。
      // 既存の頂点法線を使い、地形の面数・高さ・当たりは変えない。
      .replace('vec3 gN = normalize(cross(dFdx(vWP), dFdy(vWP)));', 'vec3 gN = normalize(vWN);')
      .replace('vec2 clodUv = ruv * vec2(1.6, 2.4)', 'vec2 clodUv = ruv * vec2(5.6, 8.4)')
      .replace('float clodHollow =', 'clodK *= 0.5;\n          float clodHollow =');
    // 小谷の仕上げも同じ法線で混ぜ、平場から坂への色を連続させる。
    sh.fragmentShader = sh.fragmentShader.replace('#include <alphamap_fragment>', `
      #include <alphamap_fragment>
      vec3 odaniNormal = abs(normalize(vWN));
      float odaniSlope = smoothstep(0.08, 0.4, 1.0 - odaniNormal.y);
      if (odaniSlope < 1.0) {
        float gravel = smoothstep(0.55, 0.85, sin(vWP.x * 0.7) * sin(vWP.z * 0.43) * 0.5 + 0.5);
        vec3 earth = mix(texture2D(tDirt, vWP.xz * 0.32).rgb, texture2D(tStone, vWP.xz * 0.25).rgb, gravel * 0.3);
        diffuseColor.rgb = mix(diffuseColor.rgb, earth, (1.0 - odaniSlope) * 0.18);
      }
      // 谷底の平らな所も、道の外は夏草の緑にまだらに覆う（灰の一枚にしない）。
      {
        float odaniWildFlat = max(smoothstep(21.0, 29.0, abs(vWP.x)), max(smoothstep(172.0, 182.0, vWP.z), smoothstep(196.0, 206.0, -vWP.z)));
        float odaniMott = sin(vWP.x * 0.21 + sin(vWP.z * 0.17) * 1.7) * sin(vWP.z * 0.19 - vWP.x * 0.05) * 0.5 + 0.5;
        vec3 odaniLawn = texture2D(tGrass, vWP.xz * 0.3).rgb * (0.85 + 0.3 * odaniMott);
        diffuseColor.rgb = mix(diffuseColor.rgb, odaniLawn, (1.0 - odaniSlope) * odaniWildFlat * (1.0 - clamp(vOdaniRoad, 0.0, 1.0)) * (0.35 + 0.35 * odaniMott));
      }
      // 曲輪・切岸・堀切のある尾根の背から離れた山肌は、夏の雑木と下草の暗い緑にする。
      float odaniWild = max(smoothstep(21.0, 29.0, abs(vWP.x)), max(smoothstep(172.0, 182.0, vWP.z), smoothstep(196.0, 206.0, -vWP.z)));
      float odaniArea = 1.0;
      if (odaniSlope * odaniArea > 0.01) {
        vec2 ow = odaniNormal.xz / max(0.001, odaniNormal.x + odaniNormal.z);
        float odaniPatch = sin(vWP.x * 0.7 + sin(vWP.y * 0.6)) * sin(vWP.z * 0.43) * 0.5 + 0.5;
        // 切岸の模様を縦横の同じ間隔で並べず、大きな土のうねりに沿わせる。
        // 絵を読む回数と地形の面数は増やさない。道と当たりの高さも保つ。
        vec2 odaniBend = vec2(sin(vWP.y * 0.19 + vWP.x * 0.07), sin(vWP.z * 0.13 + vWP.y * 0.11)) * 1.4;
        vec2 odaniSide = vWP.zy + odaniBend, odaniFront = vWP.xy + odaniBend.yx;
        vec3 soil = texture2D(tDirt, odaniSide * 0.32).rgb * ow.x + texture2D(tDirt, odaniFront * 0.32).rgb * ow.y;
        vec3 rock = texture2D(tStone, odaniSide * 0.25).rgb * ow.x + texture2D(tStone, odaniFront * 0.25).rgb * ow.y;
        vec3 grass = texture2D(tGrass, odaniSide * 0.3).rgb * ow.x + texture2D(tGrass, odaniFront * 0.3).rgb * ow.y;
        vec3 detail = mix(soil, rock, smoothstep(0.55, 0.85, odaniPatch) * 0.6);
        detail = mix(detail, grass, (1.0 - smoothstep(0.2, 0.5, odaniPatch)) * 0.7);
        detail = mix(detail, grass, odaniWild * 0.8);
        // 高さの縞（横の帯）を作らず、まだらな土と草の濃淡だけにする。
        detail *= 0.9 + 0.12 * sin(vWP.x * 0.31 + vWP.z * 0.23) * sin(vWP.z * 0.37 - vWP.y * 0.11);
        diffuseColor.rgb = mix(diffuseColor.rgb, detail, odaniSlope * odaniArea * 0.8);
      }
      // 初秋の夜：月明かりの灰色で雪のように白く飛ばさず、暗い土と枯れかけた草の色に沈める。
      float odaniLum = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
      float odaniGrass = max(odaniWild, (1.0 - odaniSlope) * smoothstep(0.35, 0.75, sin(vWP.x * 0.13 + sin(vWP.z * 0.09) * 2.0) * sin(vWP.z * 0.11) * 0.5 + 0.5));
      vec3 odaniTone = mix(vec3(1.2, 1.02, 0.8), mix(vec3(0.98, 1.08, 0.78), vec3(0.85, 1.06, 0.74), odaniWild), odaniGrass);
      // 斜面を灰の一枚にしない：土・石・草の絵の色を残し、少しだけ明るく。
      diffuseColor.rgb = mix(vec3(odaniLum) * odaniTone, diffuseColor.rgb, 0.78 + odaniWild * 0.15) * 0.72;
      // 林の下は暗い緑。遠い斜面が月で灰白く浮かないように沈める。
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.075, 0.083, 0.048) * (0.8 + odaniLum * 0.6), odaniWild * 0.24);
      // 同じ夜の明るさで、道だけ草の緑を弱める。発光する案内帯にはしない。
      float odaniRoadLight = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.18, 1.0, 0.74) * odaniRoadLight,
        clamp(vOdaniRoad, 0.0, 1.0) * 0.35);
      // 等間隔の筋を止め、共通の土塊・踏み荒れの陰影を道にも残す。
    `);
    // 草と土の山肌は艶を持たない。上から見下ろすと月の照り返しで斜面が灰白く光っていた。
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      reflectedLight.directSpecular *= 0.15; reflectedLight.indirectSpecular *= 0.15;`);
  };
  mat.needsUpdate = true;
}

// 京極丸の篝火と櫓の灯り。影を足さない二灯だけで石垣と旗を照らす。
function addOdaniNight(rt) {
  const W = rt.world;
  for (const [x, z] of [[KYO.x - 9, KYO.cz + 8], [KYO.x + 9, KYO.z0 + 9]]) {
    rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.3, size: .55 });
    const light = fireGlow(0xffca83, 24, 18, 1.6);
    light.position.set(x, W.heightAt(x, z) + 3, z); rt.scene.add(light);
  }
  const glow = new THREE.MeshBasicMaterial({ color: 0xffd299 });
  const geo = new THREE.PlaneGeometry(0.45, 0.65);
  const tower = rt.flags.C.towers.find((t) => t.id === 'monomi_kyo');
  if (tower?.naka) {
    const y = tower.naka.levels?.[0]?.y ?? W.heightAt(KYO.x + 9, KYO.z0 + 8) + 3;
    for (const side of [-1, 1]) {
      const pane = new THREE.Mesh(geo, glow);
      pane.position.set(KYO.x + 9 + side * 0.9, y + 1, KYO.z0 + 5 + 1.4);
      rt.scene.add(pane);
    }
  }
  // 道の先で探せる高い指物。敵は門の内、味方は西の攻め口に置く。
  rt.scene.add(nobori(W, GATE_WEST.x + 6, GATE_WEST.z + 2, 'azai', 6),
    nobori(W, MOUTH.x + 3, MOUTH.z + 2, 'oda', 5),
    nobori(W, HEAD.x - 2, HEAD.z + 3, 'oda', 5),
    nobori(W, BELOW.x - 2, BELOW.z + 3, 'oda', 5));
  // 攻め口に宙へ浮く案内板は置かない。道案内は既存の印と任務の札で行う。
}

// 九十九折りの上の段（水の手から登り口）と、堀切の土橋の両縁。先に登った物見が打った杭に白布を結び、道の縁を示す（字は出さない）。
// 縁の外へは踏み外さない（人も兵も）。杭と布は一つずつの束で描く。
function addTrailRails(rt) {
  const W = rt.world, rails = [];
  const leg = (a, b, off) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz), nx = -dz / len, nz = dx / len;
    for (const s of [-1, 1]) rails.push([[a[0] + nx * off * s, a[1] + nz * off * s], [b[0] + nx * off * s, b[1] + nz * off * s], nx * s, nz * s]);
  };
  leg([CLIMB_UP[1][0] + (CLIMB_UP[2][0] - CLIMB_UP[1][0]) * .3, CLIMB_UP[1][1] + (CLIMB_UP[2][1] - CLIMB_UP[1][1]) * .3], [CLIMB_UP[2][0] - 2, CLIMB_UP[2][1] - 3], 3.2);
  // 大野木屋敷への枝道（分かれ目 -49,-77 から南木戸へ）が東の縁を横切る所は空ける。縁が枝道をふさぎ、人も兵も屋敷へ行けなかった。
  { const r = rails.at(-1)[1][0] > rails.at(-2)[1][0] ? rails.length - 1 : rails.length - 2, [a, b, nx, nz] = rails[r];
    const jx = -49, jz = -77, gx = ONOGI.x - jx, gz = ONOGI.z + ONOGI.hd + 3 - jz;
    const ex = b[0] - a[0], ez = b[1] - a[1], den = gx * ez - gz * ex;
    const t = Math.abs(den) > 1e-6 ? -((jx - a[0]) * ez - (jz - a[1]) * ex) / den : -1;   // 枝道の上の交わる所（0〜1 が枝道の中）
    if (t > 0 && t < 1) {
      const cx = jx + gx * t, cz = jz + gz * t, len = Math.hypot(ex, ez), u = ((cx - a[0]) * ex + (cz - a[1]) * ez) / len, half = 3;
      const at = (d) => [a[0] + ex * d / len, a[1] + ez * d / len];
      rails.splice(r, 1, [a, at(u - half), nx, nz], [at(u + half), b, nx, nz]);
    } }
  // 登り口（水の手の上の段）の南の縁。一段下の帯曲輪へ落ちない。
  rails.push([[BELOW.x - 8, BELOW.z + 3.8], [BELOW.x + 1.5, BELOW.z + 1.3], .26, -.97], [[BELOW.x + 1.5, BELOW.z + 1.3], [-29.2, BELOW.z + 1.3], 0, -1]);
  // 大堀切の縁（南北の肩と西の端）。深さ十メートルの堀底へ落ちると上がれない。土橋（真ん中）だけ空ける。
  { const z0 = OHORIKIRI.z - OHORIKIRI.w / 2 - .6, z1 = OHORIKIRI.z + OHORIKIRI.w / 2 + .6, x1 = OHORIKIRI.len / 2 + 1;
    rails.push([[-x1, z0], [-2.75, z0], 0, -1], [[2.75, z0], [x1, z0], 0, -1], [[-x1, z1], [-2.75, z1], 0, 1], [[2.75, z1], [x1, z1], 0, 1], [[-x1, z0], [-x1, z1], -1, 0], [[x1, z0], [x1, z1], 1, 0]); }
  // 堀切の土橋（大堀切・京極丸と小丸・中丸と京極丸・小丸と山王丸）
  for (const [z, w] of [[OHORIKIRI.z, OHORIKIRI.w], [GATE_KYO_KOMA.z, 4.4], [GATE_NAKA_KYO.z, 4.4], [(KOM.z0 + SANNO.z1) / 2, 4.4]]) {
    for (const s of [-1, 1]) rails.push([[2.75 * s, z - w / 2 - .3], [2.75 * s, z + w / 2 + .3], s, 0]);
  }
  const poles = [], cloths = [], pole = new THREE.CylinderGeometry(.035, .045, 1.3, 5), cloth = new THREE.PlaneGeometry(.12, .55);
  cloth.translate(.07, -.3, 0);
  for (const [a, b, nx, nz] of rails) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(len / 8));
    for (let i = 0; i < n; i++) {
      const ax = a[0] + (b[0] - a[0]) * i / n, az = a[1] + (b[1] - a[1]) * i / n, bx = a[0] + (b[0] - a[0]) * (i + 1) / n, bz = a[1] + (b[1] - a[1]) * (i + 1) / n;
      solidSeg(ax, az, bx, bz, .15);
      const st = rt.army.addStruct({ seg: [ax, az, bx, bz], nx, nz, hp: 1e9, maxHp: 1e9, team: 1, name: '道の縁' });
      st.noTarget = true; st.wall = true;
    }
    for (let d = 0; d <= len; d += 6) {
      const x = a[0] + (b[0] - a[0]) * d / len, z = a[1] + (b[1] - a[1]) * d / len, y = W.heightAt(x, z);
      poles.push(pole.clone().translate(x, y + .65, z));
      const c = cloth.clone(); c.rotateY(Math.atan2(nx, nz) + (d % 12 ? .6 : -.6)); c.translate(x, y + 1.25, z); cloths.push(c);
    }
  }
  if (!poles.length) return;
  const pm = new THREE.Mesh(mergeGeometries(poles), new THREE.MeshLambertMaterial({ color: 0x5a4632 }));
  const cm = new THREE.Mesh(mergeGeometries(cloths), new THREE.MeshLambertMaterial({ color: 0xe8e2d0, side: THREE.DoubleSide, emissive: 0x2a2620 }));
  rt.scene.add(pm, cm);
  for (const g of [...poles, ...cloths, pole, cloth]) g.dispose();
}

// 尾根の曲輪ごとの篝火の明かり。夜の霞の向こうでも、山王丸から番所まで火の段が続いて見える（城の大きさを字でなく火で）。
// 光る点だけを一つの束で描く（灯りは足さない。霧で消さない）。近い篝火の炎は曲輪ごとの物をそのまま使う。
function addRidgeGlow(rt) {
  const W = rt.world, pos = [];
  for (const k of [SANNO, KOM, KYO, NAKAMARU, HON, OOHIROMA, SAKURABABA, ONMAYA, OCHAYA, BANSHO]) {
    const hw = Math.max(3, k.hw - 1.5), x = k.x || 0;
    for (const [dx, z] of [[-hw, k.z0 + 2], [hw, k.z0 + 2], [-hw, k.z1 - 2], [hw, k.z1 - 2], [-hw * .3, k.cz]]) pos.push(x + dx, W.heightAt(x + dx, z) + 2.4, z);
  }
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,196,110,1)'); gr.addColorStop(.15, 'rgba(255,150,60,.8)'); gr.addColorStop(.5, 'rgba(230,100,30,.25)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ map: new THREE.CanvasTexture(c), color: 0xff8c38, size: 12, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  // 近く（四十メートル内）では消し、遠いほど見える。近い篝火は炎そのものを見せる。
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vFar;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFar = smoothstep(40.0, 90.0, -mvPosition.z);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFar;')
      .replace('#include <premultiplied_alpha_fragment>', '#include <premultiplied_alpha_fragment>\ngl_FragColor *= vFar;');
  };
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 2;
  rt.scene.add(pts);
}

// 後日の知らせは共通の札に収める。
function odaniFarewell(rt) {
  rt.banner('後日の知らせ', 'お市の方と三人の娘は、小谷の城を出た');
}

// 南西の琵琶湖・竹生島・平野の村。位置と縮尺は遠景用の補い、城の中へ当たりを増やさない。
function addOdaniView(rt) {
  const groups = { land: [], water: [], wall: [], roof: [], crop: [], bank: [] };
  const box = (key, x, y, z, w, h, d, rot = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateY(rot); g.translate(x, y, z); groups[key].push(g); };
  if (S.quality === 'high') {
    // 長浜市保存管理計画30頁・表7：主郭尾根の最先端の出丸は、上下二段・土塁・空堀からなる。
    // https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
    // 金吾丸より南の遠景に補う。位置・寸法・高低の向き・入口・堀の取り回しは推定。
    // 建物の存在は不明なので置かず、当夜の所属・将名・兵数も断定しない。
    // 遠景の地面は歩く地面の外なので、farH に接続する一枚の地形を既存の土の束へ加える。
    // 兵の持ち場・大手道・虎御前山と宮部への道を空け、毎コマの処理は増やさない。
    const x = -8, z = 300, hw = 7, hd = 9;
    const ground = rt.world.farH;
    const top = Math.max(ground(x - hw, z - hd), ground(x + hw, z - hd),
      ground(x - hw, z + hd), ground(x + hw, z + hd), ground(x, z)) + 4;
    const geo = new THREE.PlaneGeometry(30, 42, 30, 42);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const dx = pos.getX(i), dz = pos.getZ(i), px = x + dx, pz = z + dz;
      const base = ground(px, pz);
      const edge = Math.max(0, Math.min(1, (15 - Math.abs(dx)) / 8, (21 - Math.abs(dz)) / 12));
      // 北を一メートル高くし、中央を二メートルの坂でつなぐ二段の平場。
      const tier = Math.max(0, Math.min(1, (1 - dz) / 2));
      // 三方の低い土塁。北の中央口は三メートル空ける。
      const side = Math.max(0, 1 - Math.abs(Math.abs(dx) - 6) / 1.5) * Math.max(0, Math.min(1, hd - Math.abs(dz)));
      const north = Math.max(0, 1 - Math.abs(dz + 8) / 1.5) * Math.max(0, Math.min(1, Math.abs(dx) - 1.5, hw - Math.abs(dx)));
      const bank = .8 * Math.max(side, north);
      // 南の空堀は盛り上げた尾根の肩に掘り、下にある遠景の地面を露出させない。
      const ditch = 1.2 * Math.max(0, 1 - Math.abs(dz - 12) / 2) * Math.max(0, Math.min(1, 10 - Math.abs(dx)));
      const y = base + Math.max(0, (top + tier + bank - base) * edge - ditch) + .04;
      pos.setXYZ(i, px, y, pz);
    }
    geo.computeVertexNormals();
    groups.land.push(geo);
  }
  // 平野の上面は高さ0。湖面（-0.5）より上へ出し、村の周りを湖に沈めない。
  box('land', -265, -1, 300, 410, 2, 270, -0.22);
  // 山麓の外の平野へ続く畑と村。家も田も材質ごとに一つへまとめる。
  for (let i = 0; i < 24; i++) {
    const x = -130 - (i % 6) * 28, z = 205 + Math.floor(i / 6) * 36;
    box('land', x, 0, z, 22, 0.3, 25, -0.22);
    // 遠い田は稲一本ずつを作らず、畦と作物の面で区画を読む。村の敷地は空ける。
    if (i % 3 !== 0) {
      const turn = -.22, c = Math.cos(turn), s = Math.sin(turn);
      const plot = (key, dx, dz, w, d, y, h) => box(key, x + dx * c + dz * s, y, z - dx * s + dz * c, w, h, d, turn);
      plot('crop', 0, 0, 20, 23, .23, .13);
      for (const dx of [-10.7, 0, 10.7]) plot('bank', dx, 0, .5, 25, .3, .28);
      for (const dz of [-12.2, 12.2]) plot('bank', 0, dz, 22, .5, .3, .28);
    }
    if (i % 3 === 0) {
      box('wall', x, 1.5, z, 8, 3, 5);
      for (const sd of [-1, 1]) {
        const roof = new THREE.BoxGeometry(9, 0.12, 3.6); roof.rotateX(sd * 0.48); roof.translate(x, 3.6, z + sd * 1.5); groups.roof.push(roof);
      }
    }
  }
  const lake = new THREE.CircleGeometry(1, 40); lake.rotateX(-Math.PI / 2); lake.scale(360, 1, 270); lake.rotateY(-0.25); lake.translate(-650, -0.5, 365); groups.water.push(lake);
  // 竹生島は湖岸から離れた沖の島。平野の外へ二つの峰を一緒に移し、水面で岸と隔てる。
  // 出典：長浜市広報（2015年6月）竹生島。方角・距離・島影の寸法は縮めた推定復元。
  // https://www.city.nagahama.lg.jp/cmsfiles/contents/0000002/2123/20150601-151923.pdf
  const island = new THREE.SphereGeometry(1, 12, 6); island.scale(26, 17, 15); island.translate(-600, 0, 280); groups.land.push(island);
  const peak = new THREE.SphereGeometry(1, 10, 6); peak.scale(14, 13, 12); peak.translate(-617, 0, 283); groups.land.push(peak);
  const colors = { land: 0x394433, water: 0x455f70, wall: 0x65553e, roof: 0x3d382e, crop: 0x555b32, bank: 0x62583e };
  for (const key of Object.keys(groups)) {
    const geo = mergeGeometries(groups[key]), mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: colors[key] }));
    mesh.receiveShadow = false; mesh.castShadow = false; rt.scene.add(mesh);
    for (const g of groups[key]) g.dispose();
  }
}

// 清水谷の東の斜面（持ち場から右手に見上げる山肌）。灰色の一枚に見えないよう、
// 下草と岩、切岸の段と柵、上に板葺きの番所を置く。形と材質は一度だけ作り、束で描く。
// 草の株：細い葉を七枚、外へ反らせて扇に開く（円錐の束は夜に黒い撒き菱に見えた）。高さ1・広がり半径1。
let odaniClumpGeo = null;
function odaniGrassClump() {
  if (odaniClumpGeo) return odaniClumpGeo;
  // 葉は細く九枚、根から中ほどで外へ折れて垂れる（幅広の三角を七枚の星形は、切り紙の葉に見えた 10/28）。
  const pos = [];
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4 + .3, ca = Math.cos(a), sa = Math.sin(a), w = .045 + (i % 3) * .012;
    const lean = .35 + (i % 3) * .2, h = .55 + (i % 4) * .14, bx = ca * .1, bz = sa * .1;
    const m = [bx + ca * lean * .35, h * .62, bz + sa * lean * .35], t = [bx + ca * lean, h * (.72 + (i % 2) * .2), bz + sa * lean];
    const L0 = [bx - sa * w, 0, bz + ca * w], R0 = [bx + sa * w, 0, bz - ca * w];
    const L1 = [m[0] - sa * w * .7, m[1], m[2] + ca * w * .7], R1 = [m[0] + sa * w * .7, m[1], m[2] - ca * w * .7];
    pos.push(...L0, ...R0, ...R1, ...L0, ...R1, ...L1, ...L1, ...R1, ...t);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  // 根元は暗い土色寄り、葉先ほど明るい（一色の切り紙に見せない）。
  const col = []; for (let i = 1; i < pos.length; i += 3) { const k = .38 + .62 * Math.min(1, pos[i] / .8); col.push(k, k * .97, k * .9); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * .3, 1, n.getZ(i) * .3);
  n.normalize?.();
  return (odaniClumpGeo = g);
}

function addOdaniEastSlope(rt, boardHut, scenery) {
  const W = rt.world, pose = new THREE.Object3D(), color = new THREE.Color();
  let seed = 15738;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  // 持ち場から谷の奥を向いた前と右（x,z）。位置はこの二つの向きで決める。
  const ox = MOUTH.x + .5, oz = MOUTH.z + 7, fx = .89, fz = -.46, rx = .46, rz = .89;
  const at = (d, s) => [ox + fx * d + rx * s, oz + fz * d + rz * s];
  const keep = (x, z) => {
    if (alongLine(SHIMIZU, x, z).d < 4.5) return false;
    for (const [hx, hz] of YASHIKI) if (Math.hypot(x - hx, z - hz) < 8) return false;
    return Math.hypot(x - KYOKAN.x, z - KYOKAN.z) > 17 && !inSiege(x, z, 3);
  };
  const tuft = fieldGrassGeo();
  const bush = new THREE.IcosahedronGeometry(1, 1);
  const rock = new THREE.IcosahedronGeometry(1, 1);
  const sets = [{ geo: tuft, list: [], side: THREE.DoubleSide }, { geo: bush, list: [] }, { geo: rock, list: [] }];
  const put = (k, x, z, y, sx, sy, sz, ry, c) => {
    if (inSiege(x, z, 2)) return;
    pose.position.set(x, W.heightAt(x, z) + y, z); pose.scale.set(sx, sy, sz);
    pose.rotation.set((rnd() - .5) * .3, ry, (rnd() - .5) * .3); pose.updateMatrix();
    sets[k].list.push([pose.matrix.clone(), c]);
  };
  // 入った向きは場面で変わる。谷の東の山肌をぐるりと埋め、谷底の道と屋敷の庭は空ける。
  for (let i = 0; i < 560; i++) {
    const a = -1.6 + rnd() * 3.8, d = 5 + rnd() * 40, x = ox + Math.cos(a) * d, z = oz + Math.sin(a) * d;
    if (!keep(x, z)) continue;
    const r = rnd();
    if (r < .62) {
      // 下草：細い円錐を寄せて株にする。夜の暗い緑と枯れた黄土を混ぜる。
      const g = rnd(), c = rnd() < .3 ? 0x847a5a : rnd() < .5 ? 0x66704a : 0x56623e;
      put(0, x, z, -.03, .45 + g * .4, .4 + g * .5, .45 + g * .4, rnd() * 6, c);
    } else if (r < .85) {
      // 低い灌木：つぶした塊を斜面に沈める。道から7m より内はカメラの前をふさぐので置かない。
      if (alongLine(SHIMIZU, x, z).d < 7) continue;
      const k = .35 + rnd() * .55;
      put(1, x, z, k * .25, k * 1.2, k * .7, k, rnd() * 6, rnd() < .5 ? 0x34422a : 0x2e3a26);
    } else {
      // 岩：半分を土に埋め、苔の色を混ぜる。道の近くは小さく。
      const k0 = alongLine(SHIMIZU, x, z).d < 8 ? .45 : 1, k = (.45 + rnd() * 1.1) * k0;
      put(2, x, z, -k * .25, k * 1.3, k * .8, k, rnd() * 6, rnd() < .4 ? 0x5a6048 : 0x6a655a);
    }
  }
  // 手前の平らな地面の斑：湿った暗い土・乾いた明るい土・苔の薄い円を地面すれすれに、小石と草の株を散らす。
  const patch = new THREE.CircleGeometry(1, 14); patch.rotateX(-Math.PI / 2);
  const pm = []; const pc = new THREE.Color();
  for (let i = 0; i < 230; i++) {
    const d = 2 + rnd() * 30, da = (rnd() - .5) * 1.9, [x, z] = [MOUTH.x + 1.2 + Math.sin(.733 + da) * d, MOUTH.z + 5 + Math.cos(.733 + da) * d];
    if (YASHIKI.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 8) || Math.hypot(x - KYOKAN.x, z - KYOKAN.z) < 17 || inSiege(x, z, 2)) continue;
    const h0 = W.heightAt(x, z);
    if (Math.abs(W.heightAt(x + 2, z) - h0) > .9 || Math.abs(W.heightAt(x, z + 2) - h0) > .9) continue;
    const r = rnd(), k = .7 + rnd() * 1.5;
    const kx = k * (1 + rnd() * .8), ry = rnd() * 6;
    // 平らな円は斜面で縁が浮き、谷道の低いカメラの真ん前で黒い板に見えた（10/30 点付け）。縁の八点の高さを見て、
    // 地面との差が 0.2m を超える所には置かず、置く時は縁の一番低い所へ沈める（乱数の順は変えない）。
    let lo = h0, hi = h0;
    for (let j = 0; j < 8; j++) { const hy = W.heightAt(x + Math.cos(j * .785) * kx, z + Math.sin(j * .785) * kx); lo = Math.min(lo, hy); hi = Math.max(hi, hy); }
    if (hi - lo < .2) {
      pose.position.set(x, lo + .02, z); pose.scale.set(kx, 1, k); pose.rotation.set(0, ry, 0); pose.updateMatrix();
      pm.push([pose.matrix.clone(), r < .4 ? 0x4a4434 : r < .7 ? 0x7c755c : 0x4f5a34]);
    }
    if (rnd() < .5) put(2, x + (rnd() - .5) * 2, z + (rnd() - .5) * 2, -.12, .22 + rnd() * .2, .16, .2 + rnd() * .15, rnd() * 6, 0x6a655a);
    if (rnd() < .4) put(0, x + (rnd() - .5) * 1.2, z + (rnd() - .5) * 1.2, -.03, .4, .3 + rnd() * .3, .4, rnd() * 6, 0x6e8044);
  }
  // 沈めても縁の立った平らな円は持ち場の足元で黒い板に見えた（10/30 点付け・odani7 の後も残った）。描かない（乱数の順は変えない）。
  patch.dispose();
  if (0) { const mesh = new THREE.InstancedMesh(patch, new THREE.MeshLambertMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), pm.length);
    pm.forEach(([m, c], i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, pc.setHex(c)); });
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere(); mesh.castShadow = false; mesh.receiveShadow = false;
    rt.scene.add(mesh); W.viewCull([mesh], 0, 70, false); }
  for (const b of sets) {
    const mesh = new THREE.InstancedMesh(b.geo, new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: !!b.geo.attributes.color, side: b.side || THREE.FrontSide }), b.list.length);
    b.list.forEach(([m, c], i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, color.setHex(c)); });
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere(); mesh.castShadow = false; mesh.receiveShadow = false;
    rt.scene.add(mesh); W.viewCull([mesh], 0, 90, false);
  }
  // 切岸の段：斜面の等高線に沿って土の段を三つ。段ごとに杭の柵を立てる。
  const contour = (x, z) => {
    const gx = W.heightAt(x + 1, z) - W.heightAt(x - 1, z), gz = W.heightAt(x, z + 1) - W.heightAt(x, z - 1);
    const l = Math.hypot(gx, gz) || 1;
    return { tx: -gz / l, tz: gx / l, nx: -gx / l, nz: -gz / l };
  };
  // 東（谷の奥へ向いた右手）と南東（谷口を向いた前）の二つの山肌に段を刻む。
  const steps = [[18, 0, 14], [23, 2, 16], [28, 4, 14], [33, 6, 12]].map(([d, s, l]) => [...at(d, s), l]);
  for (const d of [26, 32, 38]) steps.push([ox + .6 * d, oz + .8 * d, 14]);
  for (const [cx, cz, len] of steps) {
    if (!keep(cx, cz)) continue;
    const c = contour(cx, cz);
    const seg = [cx - c.tx * len / 2, cz - c.tz * len / 2, cx + c.tx * len / 2, cz + c.tz * len / 2];
    const earth = dorui(W, seg, c.nx, c.nz, { batch: scenery, w: 1.6, h: .6, surfaceOnly: true, bareSoil: true, capEnds: true });
    if (!earth.isBatchedPart) rt.scene.add(earth);
    const fence = palisade(W, seg, { batch: scenery, h: 1.8 });
    if (fence && !fence.isBatchedPart) rt.scene.add(fence);
  }
  // 段の上の番所：板葺きの屋根を斜面の向きにそろえる。
  // 谷道の東の縁：道に沿う土の段と柵、その奥の番所。持ち場の右手すぐに見える所。
  const ux = .24, uz = -.97, vx = .97, vz = .24, near = (f, r) => [ox + ux * f + vx * r, oz + uz * f + vz * r];
  for (const [f0, f1, r] of [[3, 17, 6.5], [6, 22, 14.5]]) {
    const [ax, az] = near(f0, r), [ex, ez] = near(f1, r), seg = [ax, az, ex, ez];
    const earth = dorui(W, seg, vx, vz, { batch: scenery, w: 1.4, h: .55, surfaceOnly: true, bareSoil: true, capEnds: true });
    if (!earth.isBatchedPart) rt.scene.add(earth);
    const fence = palisade(W, seg, { batch: scenery, h: 1.7 });
    if (fence && !fence.isBatchedPart) rt.scene.add(fence);
  }
  // 始めの画面（持ち場から向いた先）に番所の屋根が入るよう、前の斜面の下と左の段にも置く。
  const pf = (d, da) => [MOUTH.x + 1.2 + Math.sin(.733 + da) * d, MOUTH.z + 5 + Math.cos(.733 + da) * d];
  for (const [bx, bz] of [near(10, 10.5), at(37, 6), [ox + .6 * 43, oz + .8 * 43], pf(21, .12), pf(30, -.28)]) {
    if (!keep(bx, bz)) continue;
    const c = contour(bx, bz);
    boardHut(W, bx, bz, 4.6, 3.4, Math.atan2(c.tx, c.tz));
  }
}

// 25秒で登る清水谷の道（z 30〜105）に、土留めの丸太の段と両端の杭。茶の一枚の坂を山城の登り道に見せる。
// 見せるだけ（地面すれすれに半分埋める）。当たり・歩く高さは変えない。形二つ・材質一つ、準備時だけ。
function addOdaniLogSteps(rt) {
  const W = rt.world, spots = [];
  for (let i = 1; i < SHIMIZU.length; i++) {
    const [ax, az] = SHIMIZU[i - 1], [bx, bz] = SHIMIZU[i], len = Math.hypot(bx - ax, bz - az);
    for (let d = 0; d < len; d += 2.7) {
      const x = ax + (bx - ax) * d / len, z = az + (bz - az) * d / len;
      if (z < 30 || z > 105) continue;
      const k = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453, r = k - Math.floor(k);
      const px = x + (r - .5) * .6, a = Math.atan2(bx - ax, bz - az);
      const half = 1.45 + r * .3, cx = Math.cos(a), sx = -Math.sin(a);
      const yl = W.heightAt(px - cx * half, z - sx * half), yr = W.heightAt(px + cx * half, z + sx * half);
      // 両端が道の肩に乗っても、真ん中が谷なら横木が宙に浮く。
      // 全長を調べ、地面に沿わない所には土留めを置かない（生成時だけ）。
      let grounded = Math.abs(yr - yl) < .5;
      for (let j = 1; grounded && j < 8; j++) {
        const t = j / 8, offset = (t * 2 - 1) * half;
        grounded = Math.abs(W.heightAt(px + cx * offset, z + sx * offset) - (yl + (yr - yl) * t)) < .12;
      }
      if (grounded) spots.push([px, z, a, r, half, yl, yr]);
    }
  }
  const mat = new THREE.MeshLambertMaterial({ color: 0x4e3f2c });
  const logGeo = new THREE.CylinderGeometry(.14, .16, 1, 7); logGeo.rotateZ(Math.PI / 2);
  const pegGeo = new THREE.CylinderGeometry(.05, .06, .35, 5);
  const logs = new THREE.InstancedMesh(logGeo, mat, spots.length), pegs = new THREE.InstancedMesh(pegGeo, mat, spots.length * 2);
  const o = new THREE.Object3D();
  spots.forEach(([x, z, a, r, half, yl, yr], i) => {
    const cx = Math.cos(a), sx = -Math.sin(a);   // 道に直交する向き
    // 11/6 fixc1844（critic60「谷道の上に浮いた板が横に何枚も」）：丸太は太さの半分より深く土に埋め、影を落とさない（浮いた板に見せない）
    o.position.set(x, (yl + yr) / 2 - .17, z);
    o.rotation.set(0, a, Math.atan2(yr - yl, half * 2));
    o.scale.set(Math.hypot(half * 2, yr - yl), 1, 1); o.updateMatrix(); logs.setMatrixAt(i, o.matrix);
    for (const s of [-1, 1]) {
      const px = x + cx * s * (half - .25) - Math.sin(a) * .2, pz = z + sx * s * (half - .25) - Math.cos(a) * .2;
      o.position.set(px, W.heightAt(px, pz) - .10, pz); o.rotation.set(.05 * s, r * 3, 0); o.scale.set(1, 1, 1);
      o.updateMatrix(); pegs.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), o.matrix);
    }
  });
  logs.receiveShadow = pegs.receiveShadow = true; logs.castShadow = false;
  rt.scene.add(logs, pegs);
}

// 25秒で登る清水谷の道（z 20〜110）：丸太の段の間の茶の一枚を、道の縁の夏草・羊歯の株と、
// 段の間に溜まった杉の落ち葉・小石に。人の通る真ん中（道の芯から1.4m）は空け、当たりは足さない。
function addOdaniTrailEdge(rt) {
  const W = rt.world, o = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3(), color = new THREE.Color();
  let seed = 33071;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const tuft = fieldGrassGeo();
  const fern = new THREE.BufferGeometry();
  { const pos = [];
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + .2, ca = Math.cos(a), sa = Math.sin(a), w = .12;
      pos.push(-sa * w, .02, ca * w, sa * w, .02, -ca * w, ca * .95, .32, sa * .95);
      pos.push(ca * .95, .32, sa * .95, ca * .5 - sa * .16, .26, sa * .5 + ca * .16, -sa * w, .02, ca * w);
    }
    fern.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); fern.computeVertexNormals();
    const n = fern.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * .3, 1, n.getZ(i) * .3); }
  const litter = new THREE.CircleGeometry(1, 9); litter.rotateX(-Math.PI / 2);
  { const a = litter.attributes.position; for (let i = 1; i < a.count; i++) { const k = .65 + ((i * 37) % 11) / 22; a.setXYZ(i, a.getX(i) * k, 0, a.getZ(i) * k); } }
  const stone = new THREE.DodecahedronGeometry(1, 0);
  const sets = [[tuft, []], [fieldGrassGeo('sedge'), []], [litter, []], [stone, []]];   // 羊歯の平たい三角は切り紙に見えた。共通の垂れる夏草に（10/29 b3）
  const put = (k, x, z, sx, sy, sz, c, lie) => {
    if (inSiege(x, z, 2)) return;
    const y = W.heightAt(x, z);
    o.position.set(x, y + (k === 2 ? .06 : k === 3 ? sy * .25 : -.03), z); o.scale.set(sx, sy, sz);
    if (lie) {
      nrm.set(W.heightAt(x - .5, z) - W.heightAt(x + .5, z), 1, W.heightAt(x, z - .5) - W.heightAt(x, z + .5)).normalize();
      o.quaternion.setFromUnitVectors(up, nrm); o.rotateY(rnd() * 6.28);
    } else o.rotation.set((rnd() - .5) * .25, rnd() * 6.28, (rnd() - .5) * .25);
    o.updateMatrix(); sets[k][1].push([o.matrix.clone(), c]);
  };
  for (let i = 1; i < SHIMIZU.length; i++) {
    const [ax, az] = SHIMIZU[i - 1], [bx, bz] = SHIMIZU[i], len = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / len, tz = (bz - az) / len;
    for (let d = 0; d < len; d += .55) {
      const cx = ax + tx * d, cz = az + tz * d;
      if (cz < 18 || cz > 112) continue;
      for (const side of [-1, 1]) {
        // 道の縁（芯から1.9〜4.6m）：夏草と羊歯の株を二つ三つずつ。
        for (let j = 0; j < 2; j++) {
          const off = 1.9 + Math.pow(rnd(), .7) * 2.7, x = cx - tz * side * off + tx * (rnd() - .5) * .5, z = cz + tx * side * off + tz * (rnd() - .5) * .5;
          if (rnd() < .62) { const g = rnd(); put(0, x, z, .55 + g * .5, .5 + g * .55, .55 + g * .5, rnd() < .3 ? 0x8c8452 : rnd() < .5 ? 0x5e7a3e : 0x4e6a36); }
          else { const g = .8 + rnd() * .7; put(1, x, z, g, g * (.8 + rnd() * .4), g, rnd() < .5 ? 0x456a34 : 0x3c5e30); }
        }
      }
      // 段の間の踏まれた土：杉の落ち葉の溜まり（赤茶）と湿った黒土の斑、小石。
      if (rnd() < .5) { const off = (rnd() - .5) * 3.4, x = cx - tz * off, z = cz + tx * off, r = .3 + rnd() * .5;
        put(2, x, z, r * 1.4, 1, r, rnd() < .55 ? 0x7a5a3c : rnd() < .5 ? 0x5e4c38 : 0x6c6244, true); }
      if (rnd() < .22) { const off = (rnd() < .5 ? -1 : 1) * (1.2 + rnd() * 1.4), x = cx - tz * off, z = cz + tx * off, r = .08 + rnd() * .16;
        put(3, x, z, r * 1.3, r * .7, r, rnd() < .5 ? 0x7a7466 : 0x66625a); }
    }
  }
  for (const [geo, list] of sets) {
    const k = sets.findIndex((e) => e[0] === geo);
    // 落ち葉・黒土の斑（平らな円）は、段の上で縁の立った赤茶・黒い板に見えた（10/30 点付け「足元に黒い板」）。描かない（乱数の順は変えない）。
    if (k === 2) { geo.dispose(); continue; }
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff, side: k < 2 ? THREE.DoubleSide : THREE.FrontSide, flatShading: k === 3,
      // 落ち葉の斑の押し出しは傾きに比例させない（坂を下から見ると丸太の段や足の前へ赤茶の板が浮いた 10/28）。
      polygonOffset: k === 2, polygonOffsetFactor: 0, polygonOffsetUnits: -4 }), list.length);
    mesh.name = 'odaniTrailEdge' + k;
    list.forEach(([m, c], i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, color.setHex(c)); });
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere(); mesh.castShadow = false; mesh.receiveShadow = k >= 2;
    rt.scene.add(mesh); W.viewCull([mesh], 0, 90, false);
  }
}

// 持ち場から谷道を見上げた始めの画面（谷の口から北北東）。道の両脇の斜面に杉の大木と下草、
// 谷道の両脇の林は、共通の林の木（幹・枝・葉の房）で立てる。円錐を重ねた杉は昼の光で緑の三角の絵に見えた（10/29）。
// 手本：周りを広葉樹の高い木が密に囲み、ところどころ杉。道の際6.5mは空け、肩越しの目線をふさがない。
let odaniGrovesMemo = null;
function odaniFrontGroves() {
  if (odaniGrovesMemo) return odaniGrovesMemo;
  let seed = 41017;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const out = [];
  const keep = (x, z) => alongLine(SHIMIZU, x, z).d > 6.5 && !YASHIKI.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 9)
    && Math.hypot(x - KYOKAN.x, z - KYOKAN.z) > 17 && !inSiege(x, z, 3) && Math.hypot(x - HIDE25.x, z - HIDE25.z) > (z > HIDE25.z ? 20 : 10);   // 南（谷の口）の側は二十歩：葉の板が画面の左を覆っていた
  const add = (x, z) => { if (keep(x, z)) out.push({ x, z, r: 0.6, n: 1, kind: rnd() < 0.72 ? 'broad' : 'sugi' }); };
  for (let i = 0; i < 200; i++) { const f = -14 + rnd() * 106, sd = (rnd() < .6 ? -1 : 1) * (6.5 + Math.pow(rnd(), 1.4) * 24); add(-97 + .376 * f + .926 * sd, 93 - .926 * f + .376 * sd); }
  for (let i = 0; i < 40; i++) { const f = -6 + rnd() * 40, sd = 7 + rnd() * 14; add(-84 + .13 * f + .99 * sd, 53 - .99 * f + .13 * sd); }
  return (odaniGrovesMemo = out);
}


// 左上の段に板塀と板葺きの番所、篝火を置く（手本：小谷城の清水谷）。道と屋敷の庭は空け、当たりは足さない。
function addOdaniFrontView(rt, boardHut, scenery) {
  const W = rt.world, pose = new THREE.Object3D(), color = new THREE.Color();
  let seed = 90731;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const ox = -97, oz = 93, fx = .376, fz = -.926, rx = .926, rz = .376;
  const at = (f, s) => [ox + fx * f + rx * s, oz + fz * f + rz * s];
  const keep = (x, z, d) => alongLine(SHIMIZU, x, z).d > d
    && !YASHIKI.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 9) && Math.hypot(x - KYOKAN.x, z - KYOKAN.z) > 17 && !inSiege(x, z, 3);
  const trunkGeo = new THREE.CylinderGeometry(.16, .4, 1, 8, 1, true); trunkGeo.translate(0, .5, 0);
  // 杉の樹冠：なめらかな円錐の重ねでなく、段ごとに枝房が垂れて縁がぎざぎざの形（輪郭を崩す。面の数は同じくらい）。
  const crown = [];
  let cs = 517;
  const cr = () => { cs = (cs * 16807) % 2147483647; return (cs - 1) / 2147483646; };
  for (let t = 0; t < 7; t++) {
    const y = .26 + t * .1, r = .19 * (1 - t / 8.2) + .02, h = .17 - t * .008;
    const g = new THREE.ConeGeometry(r, h, 9, 2, true); g.translate(0, y + h / 2, 0);
    const a = g.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const vx = a.getX(i), vz = a.getZ(i), rr = Math.hypot(vx, vz);
      if (rr < 1e-4) continue;
      const k = rr / r, n = 1 + (cr() - .5) * .55 * k, droop = k > .9 ? (cr() * .04 + .015) : 0;
      a.setXYZ(i, vx * n + (cr() - .5) * .02, a.getY(i) - droop, vz * n + (cr() - .5) * .02);
    }
    crown.push(g.toNonIndexed());
  }
  const tip = new THREE.ConeGeometry(.03, .14, 6, 1, true); tip.translate(0, .97, 0); crown.push(tip.toNonIndexed());
  const crownGeo = mergeGeometries(crown); crownGeo.computeVertexNormals();
  // 夜の斜面の杉は、葉の裏まで月に白く照らさない。法線を上へ寄せて段の陰をやわらげる。
  { const nn = crownGeo.attributes.normal; for (let i = 0; i < nn.count; i++) nn.setXYZ(i, nn.getX(i) * .7, nn.getY(i) * .7 + .45, nn.getZ(i) * .7); }
  const tuft = fieldGrassGeo();
  const bush = new THREE.IcosahedronGeometry(1, 1);
  const sets = [{ geo: trunkGeo, list: [], flat: false }, { geo: crownGeo, list: [], flat: false },
    { geo: tuft, list: [], flat: false, side: THREE.DoubleSide }, { geo: bush, list: [], flat: false }];
  const put = (k, x, y, z, sx, sy, sz, ry, c, tilt = .25) => {
    if (inSiege(x, z, 2)) return;
    pose.position.set(x, y, z); pose.scale.set(sx, sy, sz);
    pose.rotation.set((rnd() - .5) * tilt, ry, (rnd() - .5) * tilt); pose.updateMatrix();
    sets[k].list.push([pose.matrix.clone(), c]);
  };
  // 杉：道から8m以上離れた両脇の斜面。高さ14〜24m。幹は少し土に埋める。
  // 円錐の杉は描かない（林の木は def.groves の odaniFrontGroves で、共通の木で立てる）。
  // 下草と灌木：道の縁から斜面へ。手前ほど密に。
  for (let i = 0; i < 820; i++) {
    const f = 2 + Math.pow(rnd(), 1.2) * 78, s = (rnd() < .5 ? -1 : 1) * (3.2 + rnd() * 20), [x, z] = at(f, s);
    if (!keep(x, z, 3.2)) continue;
    const y = W.heightAt(x, z);
    if (rnd() < .72) {
      const g = rnd(), c = rnd() < .3 ? 0x847a5a : rnd() < .5 ? 0x66704a : 0x56623e;
      put(2, x, y - .03, z, .5 + g * .45, .45 + g * .55, .5 + g * .45, rnd() * 6, c, .2);
    } else if (alongLine(SHIMIZU, x, z).d > 7) {
      // 灌木は道から7m より外。肩越しのカメラの前を黒い塊でふさがない。
      const k = .25 + rnd() * .35;
      put(3, x, y + k * .2, z, k * 1.2, k * .75, k, rnd() * 6, rnd() < .5 ? 0x506a3a : 0x46603a);
    }
  }
  // 二十五秒で着く谷道の右の斜面（肩越しの画面の右半分）：杉と下草・灌木を寄せ、のっぺりした土の面をなくす。
  for (let i = 0; i < 260; i++) {
    const f = -6 + rnd() * 40, s = 4.5 + Math.pow(rnd(), .8) * 16;
    const x = -84 + .13 * f + .99 * s, z = 53 - .99 * f + .13 * s;
    if (alongLine(SHIMIZU, x, z).d < 4) continue;
    const y = W.heightAt(x, z);
    if (i < 22 && s > 8) continue;   // 杉は odaniFrontGroves で立てる
    if (rnd() < .75) {
      const g = rnd(), c = rnd() < .3 ? 0x8a7e5e : rnd() < .5 ? 0x6a744c : 0x5a6842;
      put(2, x, y - .03, z, .55 + g * .5, .5 + g * .6, .55 + g * .5, rnd() * 6, c, .2);
    } else if (s > 6.5) {
      const k = .3 + rnd() * .35;
      put(3, x, y + k * .2, z, k * 1.2, k * .75, k, rnd() * 6, rnd() < .5 ? 0x56703e : 0x4c663c);
    }
  }
  for (const b of sets) {
    const k = sets.indexOf(b);
    if (!b.list.length) { b.geo.dispose(); continue; }
    const mesh = new THREE.InstancedMesh(b.geo, new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: !!b.geo.attributes.color, map: k === 0 ? barkTex('cedar') : null, flatShading: b.flat, side: k === 1 ? THREE.DoubleSide : b.side || THREE.FrontSide }), b.list.length);
    mesh.name = 'odaniFront' + k;
    b.list.forEach(([m, c], i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, color.setHex(c)); });
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere(); mesh.castShadow = false; mesh.receiveShadow = false;
    rt.scene.add(mesh); W.viewCull([mesh], 0, 110, false);
  }
  // 谷道の両脇の塀は曲輪の縁。その下（谷の側）に低い野面積みを積み、切岸の裾を石で留める（見た目だけ・当たりは足さない）。
  const feet = [];
  const foot = (seg) => { feet.push(seg); return seg; };
  // 左上の段と右手の段：板塀と板葺きの番所、篝火。
  for (const [f, s, len] of [[17, -11, 12], [22, 11, 10], [44, -10, 12], [52, 10, 11], [66, -10, 12], [74, 11, 10]]) {
    const [cx, cz] = at(f, s);
    if (!keep(cx, cz, 9)) continue;
    const seg = [cx - rx * len / 2 - fx * 1.5, cz - rz * len / 2 - fz * 1.5, cx + rx * len / 2 + fx * 1.5, cz + rz * len / 2 + fz * 1.5];
    castleBoardFence(W, foot(seg), { batch: scenery, h: 2.1, plainBoards: true, boardCap: true, boardRailsSide: 1 });
    const [hx, hz] = at(f + 4.5, s + (s < 0 ? -2 : 2));
    if (keep(hx, hz, 9)) boardHut(W, hx, hz, 4.6, 3.4, Math.atan2(rx, rz));
    const [kx, kz] = at(f - 2.2, s + (s < 0 ? 4 : -4));
    rt.scene.add(kagaribi(W, kx, kz)); W.addFire(kx, kz, { h: 1.3, size: .55 });
  }
  // 登り始めて二十五秒ほどで着く谷道（-84,53 あたり、北を向く）の正面：左右の段に板塀と番所、
  // その前に篝火。道の中は空け、肩越しの目線の高さに屋根と火が入るように置く。
  const vx = -84, vz = 53, dx = .13, dz = -.99, sx = .99, sz = .13;
  const v = (f, s) => [vx + dx * f + sx * s, vz + dz * f + sz * s];
  for (const [f, s, len, side] of [[16, -8.5, 10, -1], [24, 9, 9, 1], [34, -9, 11, -1]]) {
    const [cx, cz] = v(f, s);
    if (alongLine(SHIMIZU, cx, cz).d < 5 || inSiege(cx, cz, 5)) continue;
    const seg = [cx - dx * len / 2, cz - dz * len / 2, cx + dx * len / 2, cz + dz * len / 2];
    castleBoardFence(W, foot(seg), { batch: scenery, h: 2.1, plainBoards: true, boardCap: true, boardRailsSide: 1 });
    const [hx, hz] = v(f + 1, s + side * 4.2);
    if (alongLine(SHIMIZU, hx, hz).d > 6 && !inSiege(hx, hz, 4)) boardHut(W, hx, hz, 5, 3.6, Math.atan2(dx, dz) + Math.PI / 2, { wall: 0x7a6548 });
    const [kx, kz] = v(f - len / 2 - 1, s - side * 1.6);
    if (alongLine(SHIMIZU, kx, kz).d > 3.2 && !inSiege(kx, kz, 2)) { rt.scene.add(kagaribi(W, kx, kz)); W.addFire(kx, kz, { h: 1.3, size: .6 }); }
  }
  // 25秒の時は (-88,63) あたりで北北東を向き、画面の右上はのっぺりした斜面だけだった（10/28 点付け）。
  // その斜面の段に板塀と板葺きの番所、前に篝火。道からは離し、画面の上三分の一に屋根と火が入る高さに置く。
  const qx = -88, qz = 63, qdx = .41, qdz = -.91, qsx = .91, qsz = .41;
  const q = (f, s) => [qx + qdx * f + qsx * s, qz + qdz * f + qsz * s];
  for (const [f, s, len] of [[9, 6, 8], [17, 7, 9]]) {
    const [cx, cz] = q(f, s);
    if (alongLine(SHIMIZU, cx, cz).d < 5 || inSiege(cx, cz, 5)) continue;
    castleBoardFence(W, foot([cx - qdx * len / 2, cz - qdz * len / 2, cx + qdx * len / 2, cz + qdz * len / 2]), { batch: scenery, h: 2.1, plainBoards: true, boardCap: true, boardRailsSide: 1 });
    const [hx, hz] = q(f + 1, s + 4.6);
    if (alongLine(SHIMIZU, hx, hz).d > 6 && !inSiege(hx, hz, 4)) boardHut(W, hx, hz, 5, 3.6, Math.atan2(qdx, qdz) + Math.PI / 2, { wall: 0x7a6548 });
    const [kx, kz] = q(f - len / 2 - .8, s - 1.6);
    if (alongLine(SHIMIZU, kx, kz).d > 3.2 && !inSiege(kx, kz, 2)) { rt.scene.add(kagaribi(W, kx, kz)); W.addFire(kx, kz, { h: 1.3, size: .6 }); }
  }
  // 25秒の時に真北を向く回（-88,66）は、左の斜面が杉の幹だけで塀も屋根も無かった（10/28）。左の段にも板塀と番所、篝火を一組。
  const lx = -88, lz = 66, ldx = .19, ldz = -.98, lsx = .98, lsz = .19;
  const l = (f, s) => [lx + ldx * f + lsx * s, lz + ldz * f + lsz * s];
  for (const [f, s, len] of [[14, -8, 9], [26, -9, 10]]) {
    const [cx, cz] = l(f, s);
    if (alongLine(SHIMIZU, cx, cz).d < 5 || inSiege(cx, cz, 5)) continue;
    castleBoardFence(W, foot([cx - ldx * len / 2, cz - ldz * len / 2, cx + ldx * len / 2, cz + ldz * len / 2]), { batch: scenery, h: 2.1, plainBoards: true, boardCap: true, boardRailsSide: 1 });
    const [hx, hz] = l(f + 1, s - 4.6);
    if (alongLine(SHIMIZU, hx, hz).d > 6 && !inSiege(hx, hz, 4)) boardHut(W, hx, hz, 5, 3.6, Math.atan2(ldx, ldz) + Math.PI / 2, { wall: 0x7a6548 });
    const [kx, kz] = l(f - len / 2 - .8, s + 1.6);
    if (alongLine(SHIMIZU, kx, kz).d > 3.2 && !inSiege(kx, kz, 2)) { rt.scene.add(kagaribi(W, kx, kz)); W.addFire(kx, kz, { h: 1.3, size: .6 }); }
  }
  // 塀の下の石垣：塀の線を谷道の側へ一m 寄せ、面を谷道へ向ける。どの向きの肩越しにも塀と石が一緒に入る。
  for (const [ax, az, bx, bz] of feet) {
    const len = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / len, nz = (bx - ax) / len, mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const k = alongLine(SHIMIZU, mx + nx * 2, mz + nz * 2).d < alongLine(SHIMIZU, mx, mz).d ? 1 : -1;
    const pts = [[ax + nx * k, az + nz * k], [bx + nx * k, bz + nz * k]];
    if (pts.some(([x, z]) => alongLine(SHIMIZU, x, z).d < 3.5 || inSiege(x, z, 3))) continue;
    rt.scene.add(ishigaki(W, pts, { top: .1, minH: 1.4, maxH: 2.2, lean: .3, out: k, big: 1.1, noKit: true }));
  }
  addOdaniValleyKuruwa(rt, scenery, keep);
}

// 25秒で着く谷道（x≈-87, z≈59〜73）の両脇の曲輪の縁。前の井楼二つは屋敷（-68,70）から9m 内と道から11m 内で
// どちらも建たず、西の段は道より2〜5m 低いので塀の頭しか入らなかった。どの向きの肩越しにも入るよう、
// 道の西 8.5m に谷へ面を向けた野面積み（天端は道より0.9m 上）と塀、東の切岸の裾の石垣と上の塀、両脇に櫓を一つずつ置く。
// 束ねた石垣は束の中に入る（返り値は Object3D でない）。束ねない時だけ場へ足す（console.error を出さない）。
function addStone(rt, m) { if (m && m.isObject3D) rt.scene.add(m); }
// 25秒の画面の確かめ用：束ねた石垣は材質で見分けられないので、積んだ線の点（面の中ほどの高さ）を場の userData に覚える。描く物は増やさない。
function viewMark(rt, kind, pts, yAt) {
  const V = rt.scene.userData.odaniView || (rt.scene.userData.odaniView = { stone: [], gate: [] });
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 1.5));
    for (let k = 0; k <= n; k++) { const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n; V[kind].push([x, yAt(x, z), z]); }
  }
}

function addOdaniValleyKuruwa(rt, scenery, keep) {
  const W = rt.world;
  const roadX = (z) => { for (let i = 1; i < SHIMIZU.length; i++) { const [ax, az] = SHIMIZU[i - 1], [bx, bz] = SHIMIZU[i];
    if (z <= az && z >= bz) return ax + (bx - ax) * (z - az) / (bz - az); } return SHIMIZU[2][0]; };
  const nx = -.97, nz = -.24;   // 道から西へ
  const westAt = (z, o) => [roadX(z) + nx * o, z + nz * o], eastAt = (z, o) => [roadX(z) - nx * o, z - nz * o];
  // 西の段：天端は道の高さ +0.9m（地面は道より低いので、谷道から石の面と塀が立って見える）
  const lift = { def: W.def, heightAt: (x, z) => W.heightAt(roadX(z - nz * 8.5), z - nz * 8.5) + .9 };
  const west = [], east = [], top = [];
  for (let z = 44; z <= 68; z += 4) west.push(westAt(z, 8.5));
  for (let z = 46; z <= 82; z += 4) { east.push(eastAt(z, 6)); top.push(eastAt(z, 11)); }
  const ok = (pts, d) => pts.every(([x, z]) => alongLine(SHIMIZU, x, z).d > d && !inSiege(x, z, 3) && !YASHIKI.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 6));
  for (let i = 0; i < west.length - 1; i++) {
    const a = west[i], b = west[i + 1];
    if (!ok([a, b], 7)) continue;
    addStone(rt, ishigaki(lift, [a, b], { top: 0, minH: 4.2, maxH: 4.6, lean: .32, out: 1, big: 1.1, noKit: true, capIn: 1.2, batch: scenery }));
    viewMark(rt, 'stone', [a, b], (x, z) => lift.heightAt(x, z) - 2);
    const fa = [a[0] + nx * .9, a[1] + nz * .9], fb = [b[0] + nx * .9, b[1] + nz * .9];
    castleBoardFence(lift, [fa[0], fa[1], fb[0], fb[1]], { batch: scenery, h: 2.1, plainBoards: true, boardCap: true, boardRailsSide: 1 });
  }
  // 東：自然の切岸（8m で 9m 上がる）の裾に石垣、肩に板塀。
  // 4m ごとに地面を追って積み、面が山の側を向いていたので、坂の上で天端の塊が点々と並んで見えた（10/29）。
  // 坂に沿って一続きの線に積み、面を谷道へ向け、6m の段ごとに天端を水平に揃え、継ぎ目は上の段の妻の面と算木積みの隅で受ける。
  addOdaniEastTiers(rt, scenery, eastAt, ok);
  for (let i = 0; i < east.length - 1; i++) {
    const c = top[i], d = top[i + 1];
    if (!ok([c, d], 9)) continue;
    // 肩の塀の二か所（z 54〜58・66〜70）は塀の代わりに屋敷の門。谷道の25秒の所から東を向いても門が入る。
    if (i === 2 || i === 5) {
      const gx = (c[0] + d[0]) / 2, gz = (c[1] + d[1]) / 2, gy = W.heightAt(gx, gz);
      rt.scene.add(kabukimon(W, gx, gz, 3.2, Math.atan2(nx, nz)));
      viewMark(rt, 'gate', [c, d], () => gy + 2.2);
      continue;
    }
    castleBoardFence(W, [c[0], c[1], d[0], d[1]], { batch: scenery, h: 2.1, plainBoards: true, boardCap: true, boardRailsSide: 1 });
  }
  // 両脇の櫓（板囲いと屋根）：西は塀の後ろの低い段、東は切岸の上。道から13m。
  for (const [x, z, rot] of [[...westAt(60, 13.5), Math.PI / 2], [...eastAt(56, 13.5), -Math.PI / 2]])
    if (!inSiege(x, z, 4) && keep(x, z, 11)) seiro(rt, x, z, { rot, kind: 'ro' });
  addOdaniPathWood(rt, roadX, keep);
  addOdaniYashikiGates(rt, scenery);
}

// 25秒の所（谷道 x≈-87, z≈63）の周りの家臣の屋敷と谷の寺に、道へ向く門（冠木門）と、門の両脇の石垣の基壇を置く。
// 道を向けば上の京極丸と浅井の組、振り返っても横を向いても、屋敷の門と石垣が画面に入る（どの向きでも二つ以上）。
// 当たりは足さない（兵と本人の歩く道は変えない）。石垣は束ね、門は一つずつ（五つ）。
function addOdaniYashikiGates(rt, scenery) {
  const W = rt.world, P25 = { x: -87, z: 63 };
  const sites = [...YASHIKI.map(([x, z]) => ({ x, z, w: 3.2, off: 6.4 })), { x: TERA.x, z: TERA.z, w: 3.8, off: 9, yakui: true }];
  for (const h of sites) {
    if (Math.hypot(h.x - P25.x, h.z - P25.z) > 62 || inSiege(h.x, h.z, 4)) continue;
    // 道（谷道）の最も近い所へ向く
    let best = null, bd = Infinity;
    for (let i = 1; i < SHIMIZU.length; i++) {
      const [ax, az] = SHIMIZU[i - 1], [bx, bz] = SHIMIZU[i], dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((h.x - ax) * dx + (h.z - az) * dz) / (dx * dx + dz * dz)));
      const x = ax + dx * t, z = az + dz * t, d = Math.hypot(x - h.x, z - h.z);
      if (d < bd) { bd = d; best = [x, z]; }
    }
    if (!best || bd < h.off + 3) continue;
    const dx = (best[0] - h.x) / bd, dz = (best[1] - h.z) / bd, gx = h.x + dx * h.off, gz = h.z + dz * h.off;
    if (alongLine(SHIMIZU, gx, gz).d < 4 || Math.hypot(gx - HIDE25.x, gz - HIDE25.z) < 9) continue;   // 潜む所の真横の門は画面の左を黒い板でふさいでいた（11/2）
    rt.scene.add(kabukimon(W, gx, gz, h.w, Math.atan2(dx, dz), { yakui: !!h.yakui }));
    const gy = W.heightAt(gx, gz);
    viewMark(rt, 'gate', [[gx - dz * h.w / 2, gz + dx * h.w / 2], [gx + dz * h.w / 2, gz - dx * h.w / 2]], () => gy + 2.2);
    // 門の両脇の石垣（屋敷の段の前面）。面は道へ向く。
    for (const sx of [-1, 1]) {
      const a = [gx - dz * sx * (h.w / 2 + .5), gz + dx * sx * (h.w / 2 + .5)], b = [gx - dz * sx * (h.w / 2 + 6), gz + dx * sx * (h.w / 2 + 6)];
      // 羽柴の手が集まる谷の口（潜む所・浅野の列）の脇には置かない。肩越しの画面の右半分を石垣の土の天端がふさいでいた（11/3）
      if ([a, b].some(([x, z]) => alongLine(SHIMIZU, x, z).d < 3.5 || inSiege(x, z, 3) || Math.hypot(x - HIDE25.x, z - HIDE25.z) < 11)) continue;
      const nx = -(b[1] - a[1]), nz = b[0] - a[0], out = nx * dx + nz * dz > 0 ? 1 : -1;
      const top = Math.max(W.heightAt(...a), W.heightAt(...b)) + .7;
      addStone(rt, ishigaki(W, [a, b], { topY: top, minH: 1.3, maxH: 2.4, lean: .3, out, big: 1.05, noKit: true, capIn: 1.2, batch: scenery }));
      viewMark(rt, 'stone', [a, b], () => top - .7);
    }
  }
}

// 算木の隅石と道の縁の石に使う割石の形（一つを使い回す）
let ODANI_SANGI = null;
function odaniSangiGeo() {
  if (ODANI_SANGI) return ODANI_SANGI;
  {
    const g = new THREE.IcosahedronGeometry(.5, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {   // 角を少し崩し、面を平らに削った割石に
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      p.setXYZ(i, Math.sign(x) * Math.min(.5, Math.abs(x) * 1.25), Math.sign(y) * Math.min(.5, Math.abs(y) * 1.3), Math.sign(z) * Math.min(.5, Math.abs(z) * 1.25));
    }
    g.computeVertexNormals();
    ODANI_SANGI = { g, m: new THREE.MeshStandardMaterial({ color: 0xffffff, map: castleMat('uchikomi').map || null, roughness: .97, metalness: 0, flatShading: true }) };
  }
  return ODANI_SANGI;
}
// 手本（docs/layout-ref/odani 01・04）の谷道：道の両脇に細い雑木の幹が立ち並び、道の縁に半ば埋もれた石が並ぶ。
// 25秒で登る谷道の先（z 18〜58）に、幹（上は画面の外へ抜ける高さ）と縁の石を置く。石垣・塀・屋敷の前は空ける。
function addOdaniPathWood(rt, roadX, keep) {
  const W = rt.world, h = (a, b) => { const v = Math.sin(a * 91.7 + b * 47.3) * 24634.6345; return v - Math.floor(v); };
  const nx = -.97, nz = -.24, trunks = [], stones = [], pose = new THREE.Object3D(), color = new THREE.Color();
  const free = (x, z, r, d) => !inSiege(x, z, r) && !YASHIKI.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 7)
    && Math.hypot(x - KYOKAN.x, z - KYOKAN.z) > 12 && alongLine(SHIMIZU, x, z).d > d;
  for (let z = 18, i = 0; z <= 58; z += 1.8 + h(z, 1) * 1.6, i++) {
    for (const side of [-1, 1]) {
      // 西（-1）は道と石垣の段（8.5m）の間、東（+1）は切岸の石垣（6m）と肩の塀（11m）の間か、塀の外
      const o = side < 0 ? 5 + h(i, 2) * 2.2 : z > 43 ? (h(i, 4) < .5 ? 8.3 + h(i, 5) * 1.6 : 12.5 + h(i, 6) * 4) : 5.5 + h(i, 3) * 6;
      if (h(i, side + 7) < .2) continue;
      const x = roadX(z) - side * nx * o, zz = z - side * nz * o;
      if (!free(x, zz, 2, 4.8)) continue;
      const r = .13 + h(i, side) * .12, H = 15 + h(side, i) * 7;
      pose.position.set(x, W.heightAt(x, zz) - .4, zz);
      pose.rotation.set((h(i, 11) - .5) * .16, h(i, 12) * 6.3, (h(i, 13) - .5) * .16);
      pose.scale.set(r, H, r); pose.updateMatrix();
      trunks.push([pose.matrix.clone(), color.setHex(0x8f8170).multiplyScalar(.75 + h(i, 14) * .3).clone()]);
    }
  }
  for (let z = 16, i = 0; z <= 62; z += .9 + h(z, 21) * 1.6, i++) {
    for (const side of [-1, 1]) {
      if (h(i, side + 30) < .35) continue;
      const o = 3.3 + h(i, side + 31) * 1.1, x = roadX(z) - side * nx * o, zz = z - side * nz * o;
      if (!free(x, zz, 1, 3)) continue;
      const s = .28 + Math.pow(h(i, side + 32), 1.5) * .45;
      pose.position.set(x, W.heightAt(x, zz) - s * .18, zz);
      pose.rotation.set((h(i, 33) - .5) * .4, h(i, 34) * 6.3, (h(i, 35) - .5) * .4);
      pose.scale.set(s * (1.1 + h(i, 36) * .5), s * .55, s); pose.updateMatrix();
      stones.push([pose.matrix.clone(), color.setHex(0x7a766c).multiplyScalar(.7 + h(i, 37) * .35).lerp(new THREE.Color(0x4a5236), h(i, 38) * .35).clone()]);
    }
  }
  const put = (geo, mat, list, name, far) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach(([m, c], i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, c); });
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
    mesh.name = name; mesh.castShadow = false; mesh.receiveShadow = true;
    rt.scene.add(mesh); W.viewCull([mesh], 0, far, false);
  };
  const tg = new THREE.CylinderGeometry(.7, 1, 1, 8, 3); tg.translate(0, .5, 0);
  put(tg, new THREE.MeshLambertMaterial({ color: 0xffffff, map: barkTex('zouki') }), trunks, 'odaniPathTrunks', 140);
  put(odaniSangiGeo().g, odaniSangiGeo().m, stones, 'odaniPathStones', 70);
}
// 東の切岸の裾の段積み：道の東 6m の線を 2m 刻みで一続きに取り、三刻み（6m）を一段にして天端を水平に揃える。
// 段の高さは石の大きさ（big）と一緒に段ごとに少し揺らす。上の段の端には妻の面（谷道の下手を向く）と、
// 長い石と短い石を段ごとに向きを替えて組む算木積みの隅（面より少し張り出す）。見た目だけ・当たりは足さない。
function addOdaniEastTiers(rt, scenery, eastAt, ok) {
  const W = rt.world, lean = .3;
  const h = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
  // 道から外れない点だけを続けて取り、途切れたらそこで別の続きにする
  const runs = [[]];
  for (let z = 44; z <= 84; z += 2) {
    const p = eastAt(z, 6);
    if (ok([p], 5)) runs[runs.length - 1].push(p); else if (runs[runs.length - 1].length) runs.push([]);
  }
  const corners = [];
  for (const run of runs) {
    if (run.length < 3) continue;
    const tiers = [];
    for (let i = 0; i < run.length - 1; i += 3) {
      const pts = run.slice(i, Math.min(run.length, i + 4));
      if (pts.length < 2) break;
      const [ax, az] = pts[0], [bx, bz] = pts[pts.length - 1], len = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / len, nz = (bx - ax) / len;   // 面の向き（谷道の側）
      const mid = pts[Math.floor(pts.length / 2)];
      const top = W.heightAt(mid[0], mid[1]) + .25 + (h(i, ax) - .5) * .3;
      let low = Infinity;
      for (const [x, z] of pts) low = Math.min(low, W.heightAt(x + nx * 2.5, z + nz * 2.5));
      const maxH = Math.min(4.6, Math.max(2, top - low + .5));
      tiers.push({ pts, top, nx, nz, maxH });
      addStone(rt, ishigaki(W, pts, { topY: top, minH: 1.8, maxH, lean, out: 1, big: 1 + h(ax, i) * .3, capIn: 1.6, noKit: true, batch: scenery }));
      viewMark(rt, 'stone', pts, () => top - 1);
    }
    // 継ぎ目：高い段の端に妻の面と算木の隅
    for (let i = 0; i < tiers.length - 1; i++) {
      const A = tiers[i], B = tiers[i + 1], hi = A.top > B.top ? A : B, lo = hi === A ? B : A, rise = hi.top - lo.top;
      if (rise < .25) continue;
      const [jx, jz] = B.pts[0];
      const ex = -hi.nx, ez = -hi.nz;   // 山の側
      // 低い段へ向かう向き
      const tl = lo === A ? A.pts[0] : B.pts[B.pts.length - 1];
      let dx = tl[0] - jx, dz = tl[1] - jz; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      const side = (-ez * dx + ex * dz) > 0 ? 1 : -1;
      const H = rise + .35;
      addStone(rt, ishigaki(W, [[jx, jz], [jx + ex * 1.8, jz + ez * 1.8]], { topY: hi.top, minH: H, maxH: H, lean: .12, out: side, big: 1.05, noKit: true, batch: scenery }));
      // 高い段の面の高さ（その継ぎ目の所）
      const fh = Math.min(hi.maxH, Math.max(1.8, hi.top - W.heightAt(jx + hi.nx * 2.5, jz + hi.nz * 2.5) + .4));
      corners.push({ jx, jz, top: hi.top, bot: lo.top - .2, fh, nx: hi.nx, nz: hi.nz, dx: -dx, dz: -dz, ex, ez });
    }
  }
  if (!corners.length) return;
  odaniSangiGeo();
  const list = [], pose = new THREE.Object3D(), color = new THREE.Color(), moss = new THREE.Color(0x4e5a38);
  for (const [ci, c] of corners.entries()) {
    let y = c.bot, k = 0;
    while (y < c.top - .1) {
      const rh = Math.min(.4 + h(ci, k) * .1, c.top - y);
      if (rh < .14) break;
      const q = Math.max(0, Math.min(1, (c.top - (y + rh / 2)) / c.fh)), out = c.fh * lean * Math.pow(q, 1.5) + .14;
      const long = k % 2 === 0, ax = long ? c.dx : c.ex, az = long ? c.dz : c.ez, L = (long ? 1.25 : 1.05) * (.9 + h(k, ci + 3) * .2);
      const cx = c.jx + c.nx * out + ax * (L / 2 - .1), cz = c.jz + c.nz * out + az * (L / 2 - .1);
      pose.position.set(cx, y + rh / 2, cz);
      pose.rotation.set((h(k, ci) - .5) * .06, Math.atan2(ax, az) + Math.PI / 2, (h(ci, k + 7) - .5) * .05);
      pose.scale.set(L, rh - .035, .62);
      pose.updateMatrix();
      color.setHex(0x6c675d).multiplyScalar(.72 + h(k * 3, ci) * .32).lerp(moss, Math.max(0, .3 - (y - c.bot) / (c.top - c.bot)) * .7);
      list.push([pose.matrix.clone(), color.clone()]);
      y += rh; k++;
    }
  }
  const mesh = new THREE.InstancedMesh(ODANI_SANGI.g, ODANI_SANGI.m, list.length);
  list.forEach(([m, c], i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, c); });
  mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
  mesh.name = 'odaniSangi'; mesh.castShadow = false; mesh.receiveShadow = true;
  rt.scene.add(mesh); W.viewCull([mesh], 0, 110, false);
}

// 出曲輪を城攻めの共通部品（siege_kit）で組み、見た目を城と砦の部品（cgt_castle の castlePartOver）へ替える。
// 当たり・火・壊れる仕組みは手作りの形のまま。塀は板塀と柵、門は冠木門と板の櫓門（土の山城。白壁にしない）。
// 部品の読めない画質では手作りの柵・土塀のまま見せ、土塀の白は土の色へ落とす。字・札は出さない。
function earthTone(obj) {
  obj.traverse((c) => {
    const col = c.isMesh && c.geometry?.attributes?.color;
    if (!col) return;
    for (let i = 0; i < col.count; i++) {
      const r = col.getX(i), g = col.getY(i), b = col.getZ(i);
      if (r * .3 + g * .59 + b * .11 > .55) col.setXYZ(i, r * .6, g * .5, b * .38);
    }
    col.needsUpdate = true;
  });
}
function addOdaniSiege(rt) {
  const W = rt.world, P = SIEGE, L = P.L;
  const K = buildSiege(rt, P, { team: 1, wall: 'saku', umadashiWall: 'saku', wallHp: 520, gateHp: 460, masuHp: 640,
    fire: { hurt: .2, near: 90, close: 18, base: 1.1, peak: 5 } });
  // 正面の塀（横矢の張り出しの折れも）：柵の当たりと狭間はそのまま、見た目は狭間を切った板塀
  for (const st of K.walls) if (st.mesh && st.seg) {
    const [ax, az, bx, bz] = st.seg;
    castlePartOver(st.mesh, W, 'hei', { pts: [[ax, az], [bx, bz]], kind: 'ita', h: 2.5, sama: 1.6, era: 'early' });
  }
  // 枡形：三方の塀は板塀、二の門は板の櫓門（冠木門の上に板壁の渡櫓）
  if (K.masu) {
    for (const st of K.masu.walls) if (st.mesh && st.seg) {
      if (!st.mesh.isBatchedPart) earthTone(st.mesh);
      const [ax, az, bx, bz] = st.seg;
      castlePartOver(st.mesh, W, 'hei', { pts: [[ax, az], [bx, bz]], kind: 'ita', h: 2.4, sama: 1.6, era: 'early' });
    }
    const I = K.masu.inner, [sa, sb, sc, sd] = I.struct.seg;
    earthTone(I.frame);
    castlePartOver(I.frame, W, 'yaguramon', { x: (sa + sc) / 2, z: (sb + sd) / 2, rot: P.rot + P.turn * Math.PI / 2, w: 4.2, era: 'early' });
  }
  // 切岸の縁（堀の内の法）に低い野面積み。土橋の口は空ける
  const mIn = P.mIn - .2, gap = P.bridgeW / 2 + 1.2;
  for (const [a0, a1] of [[-P.W - 2, P.laneA - gap], [P.laneA + gap, P.W + 2]]) {
    rt.scene.add(ishigaki(W, [L(a0, mIn), L(a1, mIn)], { top: .15, minH: 1.3, maxH: 2.2, lean: .3, out: 1, big: 1.3, noKit: true }));
  }
  // 井楼は横矢の張り出しの出隅に二つ（siege_kit の yokoya.yagura）。篝火を枡形の内と馬出しの内に
  for (const [a, b] of [[-4.5, -3], [4.5, -7.5], [-2.6, P.uma.cb + 1.5], [2.6, P.uma.cb + 1.5]]) {
    const [x, z] = L(a, b); rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.3, size: .6 });
  }
  // 攻め手（羽柴）の仕寄り：谷道の東の縁に竹束と土俵の列（城の側を向く）。道の中は空ける
  takatabaRow(rt, [[-69.4, 22], [-65.4, 8]], { spacing: 2.1, side: -1, gaps: [3] });
  donouRow(rt, [[-68.2, 23.6], [-66.9, 19]], { rows: 3, side: -1 });
  return K;
}

// 夜襲の後方に残る普請と炊事の道具。配置・調度は推定で、谷道と兵の控えを避ける。
// 本の野戦兵器の丸太・板・縄の組み方に寄せ、移動櫓を急な山道へ持ち込まない。
function addOdaniSiegeLife(rt, scenery) {
  const W = rt.world, pose = new THREE.Object3D();
  const box = new THREE.BoxGeometry(1, 1, 1), cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
  const ring = new THREE.TorusGeometry(1, .065, 3, 12);
  ring.rotateX(Math.PI / 2);
  const stone = new THREE.DodecahedronGeometry(1, 0);
  const batches = [
    { geo: box, color: 0x655039, matrices: [] },
    { geo: cylinder, color: 0x8c7753, matrices: [] },
    { geo: ring, color: 0x443c2d, matrices: [] },
    { geo: stone, color: 0x686359, matrices: [] },
    { geo: cylinder, color: 0x302f29, matrices: [] },
  ];
  const put = (kind, x, z, y, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
    if (inSiege(x, z, 2)) return;
    pose.position.set(x, W.heightAt(x, z) + y, z); pose.scale.set(sx, sy, sz);
    pose.rotation.set(rx, ry, rz); pose.updateMatrix(); batches[kind].matrices.push(pose.matrix.clone());
  };
  // 攻め口から離れた道の西側。低い板葺き小屋と荷台、箍を掛けた桶。
  const sx = MOUTH.x - 19, sz = MOUTH.z + 5;
  hut(W, sx, sz, 4.2, 3, .12,
    { ita: true, boardRoof: true, weatheredBoards: true, minka: false, groundedHome: true, batch: scenery });
  for (let i = 0; i < 4; i++) {
    const x = sx - 1.3 + i * .82, z = sz + 2.7;
    put(0, x, z, .22, .7, .35, 1.1);
    put(0, x, z, .42, .8, .09, 1.2, 0, .07 * (i - 1));
    for (const dz of [-.32, .32]) put(0, x, z + dz, .45, .74, .055, .045);
  }
  for (let i = 0; i < 3; i++) {
    const x = sx + 3 + (i % 2) * .8, z = sz + (i > 1 ? 1.2 : 0), r = .3 + i * .035;
    put(1, x, z, .36, r, .68, r);
    for (const y of [.13, .59]) put(2, x, z, y, r, .5, r);
    put(0, x, z, .72, r * 2.1, .06, .18, 0, i * .4);
  }
  // 既存の炊事火に石の竈と釜。夜襲の登り道には煙・新しい光源を増やさない。
  const fx = MOUTH.x - 6, fz = MOUTH.z + 10;
  for (let i = 0; i < 7; i++) {
    const a = i * Math.PI * 2 / 7;
    put(3, fx + Math.cos(a) * .52, fz + Math.sin(a) * .52, .16, .24, .2, .22);
  }
  put(4, fx, fz, .57, .39, .34, .39);
  put(2, fx, fz, .78, .4, .5, .4);
  put(4, fx, fz, .755, .29, .025, .29);
  // 炊煙は後方の一筋だけ。既存の煙の束へ足し、更新用の関数や粒の生成を増やさない。
  W.addSmokeColumn(fx, W.heightAt(fx, fz) + .8, fz, { size: .35 });
  for (let i = 0; i < 5; i++) put(0, fx - 1.2, fz + (i - 2) * .17, .12 + (i % 2) * .12, .65, .1, .12, 0, .1 * i);
  // 竹束は既存の形・材質と距離別の粗さを再利用。道の中央を空けて荷の外側だけを守る。
  for (let i = 0; i < 2; i++) rt.scene.add(takataba(W, sx + i * 2.3, sz - 3.3, Math.PI,
    { fieldBundle: true }));
  rt.scene.add(tawara(W, sx - 2.6, sz, -.12, 4));
  // 虎御前山の幕脇には兵糧を保管。南北の出入口と中央の控え兵は塞がない。
  const hx = TORAGOZEN.x - 13, hz = TORAGOZEN.z + 1;
  for (let i = 0; i < 3; i++) {
    put(0, hx, hz + i * 1.1, .3, 1.2, .5, .85);
    put(0, hx, hz + i * 1.1, .58, 1.3, .07, .95);
    for (const dx of [-.4, .4]) put(0, hx + dx, hz + i * 1.1, .61, .055, .055, .97);
  }
  for (const b of batches) {
    const mesh = new THREE.InstancedMesh(b.geo, new THREE.MeshLambertMaterial({ color: b.color }), b.matrices.length);
    for (let i = 0; i < b.matrices.length; i++) mesh.setMatrixAt(i, b.matrices[i]);
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
    mesh.castShadow = false; mesh.receiveShadow = false; rt.scene.add(mesh);
    W.viewCull([mesh], 0, 85, false);
  }
}

// 城そのものが武器：急斜面の上（登り口）と西の口の食い違い虎口では、京極丸の土塁の上から石を投げ落とす。
// 字の案内は出さず、上から弧を描いて落ちる石・落ちた音・当たった味方の崩れで分からせる。石は三つを使い回す。
const STONES = [];
let STONE_GEO = null, STONE_MAT = null;
function stoneTick(rt, dt) {
  const F = rt.flags, p = rt.player.u.pos;
  for (const s of STONES) {
    if (!s.on) continue;
    s.t += dt;
    const k = Math.min(1, s.t / s.dur);
    if (s.landed) { if (s.t > s.dur + 2.5) { s.on = false; s.mesh.visible = false; } continue; }
    s.mesh.position.set(s.ax + (s.bx - s.ax) * k, s.ay + (s.by - s.ay) * k + Math.sin(k * Math.PI) * 3, s.az + (s.bz - s.az) * k);
    s.mesh.rotation.x += dt * 9; s.mesh.rotation.z += dt * 5;
    if (k >= 1) {
      s.landed = true;
      rt.army.play('knock', { x: s.bx, z: s.bz }, .9);
      rt.army.forNear(s.bx, s.bz, 1, (u) => {
        if (!u.alive || u.team !== 0 || u.invuln || u.isStruct) return;
        rt.army.damage(u, u.isPlayer ? 6 : 11, null, { kind: "rock" });
      });
    }
  }
  if (F.ending || rt.t < (F.stoneAt || 0)) return;
  const closed = !!F.masuClosed || F.step < 2;
  const dB = Math.hypot(p.x - BELOW.x, p.z - BELOW.z), dG = Math.hypot(p.x - GATE_WEST.x, p.z - GATE_WEST.z);
  const on = F.step === 1 && dB < 16 || F.step === 2 && closed && (dB < 16 || dG < 14 || inMasu(p.x, p.z));
  if (!on) return;
  F.stoneAt = rt.t + (dG < 14 ? 2.2 : 3.5) + Math.random() * 1.5;
  let stone = STONES.find((q) => !q.on);
  if (!stone) {
    if (STONES.length >= 3) return;
    if (!STONE_GEO) { STONE_GEO = rockShape(.28); STONE_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }); }
    stone = { mesh: new THREE.Mesh(STONE_GEO, STONE_MAT) }; stone.mesh.castShadow = true;
    rt.scene.add(stone.mesh); STONES.push(stone);
  }
  // 狙いは本人の周りの味方（三度に一度は本人の足元）。少しずらして落とす。
  let tx = p.x, tz = p.z;
  if (Math.random() > .35) rt.army.forNear(p.x, p.z, 7, (u) => { if (u.team === 0 && u.alive && !u.isPlayer && Math.random() < .3) { tx = u.pos.x; tz = u.pos.z; } });
  tx += (Math.random() - .5) * 2.4; tz += (Math.random() - .5) * 2.4;
  const sx = KYO.x - KYO.hw + .8, sz = Math.max(KYO.z0 + 2, Math.min(KYO.z1 - 2, tz));
  const W = rt.world;
  Object.assign(stone, { on: true, landed: false, t: 0, dur: 1.1, ax: sx, ay: W.heightAt(sx, sz) + 2.4, az: sz, bx: tx, by: W.heightAt(tx, tz) + .25, bz: tz });
  stone.mesh.visible = true; stone.mesh.position.set(sx, stone.ay, sz);
  rt.army.play('eshout', { x: sx, z: sz }, .6);
}

// 始まりの数秒だけ、清水谷の底から尾根を見上げる（字は出さない）。山王丸から大広間まで曲輪の篝火が何段も続き、
// 城の大きさを先に見せてから、本人の肩越しへ戻す（篝火は曲輪ごとに置いた物）。霧の遠さもこの間だけ広げる。
// 秀吉に話す受け付けは急がせない（kaito 十2「3秒で消さない」）。話さずにいても、しばらく後には物語が進む（二5）
const TALK_WAIT = 12;   // 11/6 fixc1844（kaito 五4・critic60「50秒動けない」）：始まりの待ちは15秒まで
const VISTA_T = 7.5, VISTA_EYE = new THREE.Vector3(), VISTA_LOOK = new THREE.Vector3();
function odaniVista(rt, pos, look) {
  const F = rt.flags, t = rt.t;
  // 共通の「大事な所を見せる」視点（cine）の間だけ。動きを減らす設定や、本人が視点を触った時は止まる。
  if (F.step !== 0 || t > VISTA_T || rt.over || !rt.player.cine?.vista) return;
  const W = rt.world, e = Math.min(1, t / 5), ease = e * e * (3 - 2 * e);
  // 谷の口の上へ鶴のように上がり、北東の尾根（大広間・本丸・中丸・京極丸・小丸）を斜めに見渡す。
  const ex = MOUTH.x - 14, ez = MOUTH.z + 10, g0 = W.heightAt(ex, ez);
  // 尾根（標高二百前後）を越す高さまで上がる。谷の中ほどの上から、南の大広間・本丸から北の京極丸・小丸へ段が続くのを見る。
  VISTA_EYE.set(ex + (-80 - ex) * ease, g0 + 3 + (KYO.level + 50 - g0 - 3) * ease, ez + (20 - ez) * ease);
  VISTA_LOOK.set(0, KYO.level - 8, (HON.cz + KYO.cz) / 2);
  // 夜の霞を見上げる間だけ遠くへ（共通の霧の式は一コマごとに戻す）。
  const fog = W.scene.fog, far = 150 + 230 * ease;
  if (fog.far < far) { fog.far = far; W.mountU.vis.value = far; }
  const k = t < 5 ? 1 : 1 - Math.min(1, (t - 5) / (VISTA_T - 5));
  const s = k * k * (3 - 2 * k);
  pos.lerp(VISTA_EYE, s); look.lerp(VISTA_LOOK, s);
}
// 討死・重傷の終幕も本人の近く。屋根の上へ持ち上げず、水平に見る。
// 空いた目線を調べるのは倒れた時の一度だけ。
function odaniDownCamera(rt, camera) {
  const F = rt.flags, p = rt.player.u.pos;
  if (!F.downView) {
    const yaw = rt.player.yaw;
    const base = Math.max(p.y, rt.world.heightAt(p.x, p.z));
    const eye = new THREE.Vector3(p.x, base + 1.35, p.z);
    const look = new THREE.Vector3(p.x, base + 1.35, p.z);
    const probe = new THREE.Vector3();
    rt.scene.updateMatrixWorld(true);
    let best = Infinity;
    for (const distance of [3, 1.5, .6]) for (const turn of [0, -.7, .7, -1.4, 1.4, Math.PI]) {
      const angle = yaw + turn, x = p.x - Math.sin(angle) * distance, z = p.z - Math.cos(angle) * distance;
      const ground = rt.world.heightAt(x, z);
      if (Math.abs(ground - base) > .8) continue;
      probe.set(x, Math.max(base, ground) + 1.35, z);
      if (rt.player.camBlockHit(look, probe) !== null) continue;
      const score = Math.abs(turn) + (3 - distance) + Math.abs(ground - base);
      if (score < best) { best = score; eye.copy(probe); }
    }
    if (best === Infinity) look.set(p.x + Math.sin(yaw) * 3, eye.y, p.z + Math.cos(yaw) * 3);
    else look.y = eye.y;
    F.downView = { eye, look };
    document.getElementById('vignette')?.setAttribute('data-odani-down', '');
  }
  rt.player.u.fpk = 0;
  camera.position.copy(F.downView.eye);
  camera.up.set(0, 1, 0);
  camera.lookAt(F.downView.look);
  rt.player.camPos.copy(camera.position);
}

// 11/6 fix61（kaito 九1・九3・十1）：右上は①〜⑤を最初から全部並べ、済んだ物に印（hud_goals の札）。途中で言い替えない。
//   言葉は地図で分かる場所の名と行い（goals5.js の OWN.odani と同じ字）。両軍の今の兵の数の棒も上に常に出す。
//   共通の任務札は一行だけなので、その上に目標の札を重ねて置き換える（有岡・森部と同じ作り）。
export const ODANI_GOALS = ['清水谷を登り、登り口の番兵を退ける', '大野木屋敷の南木戸から庭を奪う', '西木戸を破り、京極丸を奪って守る', '尾根を北へ、小丸の久政を攻める', '尾根を南へ、本丸の長政の旗本を破る'];
export function odaniGoalNow(rt) {
  const F = rt.flags;
  if (F.fallen || F.komaDown) return 4;
  if (F.komaAttack) return 3;
  if (F.onoDone || F.step >= 3) return 2;
  return F.step >= 2 ? 1 : 0;
}
const ODANI_BOARD_CSS = `
html:root body #hud#hud#hud.odani-goals #armybar:not([hidden]) { display:grid !important; visibility:visible !important; opacity:1 !important; }
html:root body #hud#hud#hud.odani-goals #armybar .clock { visibility:hidden !important; }
html:root body:has(#intro:not([hidden]) > .card) #hud#hud#hud.odani-goals #armybar { visibility:hidden !important; }
html:root body #hud#hud#hud.odani-goals #h-prog#h-prog.goal-mode > :not(.pg-goals) { display:none !important; }
html:root body #hud#hud#hud.odani-goals #h-prog#h-prog.goal-mode > .pg-goals { display:block !important; }
html:root body #hud#hud#hud.odani-goals #h-prog#h-prog.goal-mode {
 left:auto !important; right:calc(12px + env(safe-area-inset-right, 0px)) !important; transform:none !important;
 width:auto !important; min-width:0 !important; max-width:min(390px, 44vw) !important; box-sizing:border-box;
 padding:8px 12px 9px 10px !important; background:rgba(14,12,10,.7) !important; border:none !important; border-radius:6px !important;
}
html:root body #hud#hud#hud.odani-goals #h-prog#h-prog.goal-mode .pg-goals li { white-space:normal !important; align-items:flex-start; color:#e6dfd2 !important; }
html:root body #hud#hud#hud.odani-goals #h-prog#h-prog.goal-mode .pg-goals li i { margin-top:3px; }
html:root body #hud#hud#hud.odani-goals #h-prog#h-prog.goal-mode .pg-goals li span { color:inherit !important; background:none !important; }
html:root body #hud#hud#hud.odani-goals #h-prog#h-prog.goal-mode .pg-goals li.now { color:#fff !important; }
html:root body #hud#hud#hud.odani-goals #h-prog#h-prog.goal-mode .pg-goals li.done { color:#cfc9bc !important; }
html:root body #hud#hud#hud.odani-goals #h-prog#h-prog.goal-mode .pg-goals :is(h3 b, li em) { display:none !important; }
html:root body #hud#hud#hud.odani-goals #battle-notices #objectives:not(.expand) { display:none !important; }`;
function odaniGoalBoard(rt) {
  const hud = rt.hud;
  if (!hud?.root || typeof document === 'undefined') return;
  hud.root.classList.add('odani-goals');
  const style = document.createElement('style');
  style.textContent = ODANI_BOARD_CSS;
  document.head.appendChild(style);
  const progress = hud.progress;
  hud.progress = function (battle) {
    const out = progress.call(this, battle);
    if (battle === rt && this.prog && !rt.over) {
      const def = rt.def, one = def.missionSingleLine;
      def.missionSingleLine = false;
      try { goalsTick(this.prog, rt); } finally { def.missionSingleLine = one; }
    }
    return out;
  };
  // 九3「敵の兵には一人残らず頭上に赤い▼」：共通の印は近い数人まで。四十メートル内の見える敵の残りにも同じ赤い▼。
  //   印は使い回し、見通しは兵ごとに三分の一秒おき。
  const foeMarks = hud.foeMarks, tris = [], box = document.createElement('div'), v = new THREE.Vector3();
  box.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:none';
  box.setAttribute('aria-hidden', 'true');
  hud.root.appendChild(box);
  hud.foeMarks = function (battle) {
    const out = foeMarks.call(this, battle);
    if (battle !== rt) return out;
    const me = rt.player.u;
    const on = me.alive && !rt.over && !rt.choice && !this.introWaiting && !rt.player.camShot && !this.bigmap && !this.root.classList.contains('photo');
    let n = 0;
    if (on) for (const u of rt.army.units) {
      if (n >= 80) break;
      if (!u.alive || u.gone || u.dying || u.woundOut || u.noTarget || u.isStruct || u.civ || u.team === me.team || u.team > 1 || u._nearSignOn || u.invuln ||
          u.mesh?.visible === false || u.camHidden || (u.pos.x - me.pos.x) ** 2 + (u.pos.z - me.pos.z) ** 2 > 1600) continue;
      if (!(u._odSeenAt > rt.t - .34 && u._odSeenAt <= rt.t)) { u._odSeen = sightUnit(rt, u); u._odSeenAt = rt.t; }
      if (!u._odSeen) continue;
      v.set(u.pos.x, u.pos.y + (u.mounted ? 3.2 : 2.25), u.pos.z).project(rt.camera);
      if (v.z < -1 || v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue;
      let el = tris[n];
      if (!el) {
        el = tris[n] = document.createElement('span');
        el.textContent = '▼';
        el.style.cssText = 'position:absolute;left:0;top:0;color:#ff4a2e;font-size:18px;line-height:1;-webkit-text-stroke:1px #2a0d06;text-shadow:0 1px 2px #000;pointer-events:none';
        box.appendChild(el);
      }
      n++;
      el.hidden = false;
      el.style.transform = `translate(${((v.x + 1) * innerWidth / 2).toFixed(1)}px,${((1 - v.y) * innerHeight / 2).toFixed(1)}px) translate(-50%,-100%)`;
    }
    for (let i = n; i < tris.length; i++) tris[i].hidden = true;
    return out;
  };
  const dispose = rt.dispose;
  rt.dispose = function () {
    hud.foeMarks = foeMarks; box.remove();
    hud.progress = progress;
    if (hud.prog) hud.prog.classList.remove('goal-mode');
    hud.root.classList.remove('odani-goals'); style.remove();
    return dispose.call(this);
  };
}

const odani = {
  hideNameTag: (u) => /組頭|使番|物頭/.test(u?.name || ''),   // 11/6 fixc2041（critic60）：名の伝わらない組頭に名札を出さない
  // 稲生と同じ共通の札・ピン・印。道順と兵数、史実の終幕はこの戦のまま。
  missionSingleLine: true,
  missionDialogue: true,
  noticeLimit: 2,
  hideMissionDots: true,
  hideGuideSteps: true,
  enemyTriangleSigns: true,
  nearbyAllySignLimit: 0,
  noDodgeCard: true,
  noSiegeCards: true,
  noPlayerFoot: true,
  quietMiss: true,
  missionPinCaption: '',
  missionDetail: () => '',
  missionStatus: () => '',
  bannerAllowed: (rt, text) => rt.over || !!rt.flags.ending || /討死|討ち取|二つに切れる|自害|城を出る/.test(text),
  missions: ['清水谷を登れ', '谷道を登れ', '敵を倒せ', '屋敷へ進め', '西木戸を破れ', '京極丸へ進め', '京極丸を守れ', '小丸へ進め', '小丸を守れ', '京極丸の下へ攻め上れ', '味方と集まれ', '本丸へ攻め上れ', '長政の旗本を崩せ', '二の門を破れ'],
  missionOf(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    if (F.ending || rt.over) return 10;
    if (F.step === 0) return 0;
    if (F.step === 3 && !F.komaAttack) return 6;
    if (F.honAttack) return F.honLeft > 0 && Math.hypot(p.x, p.z - HON.z0) < 30 ? 12 : 11;
    if (odaniNearestFoe(rt)) return 2;
    if (F.step === 1) return F.climbWaiting ? 9 : 1;
    if (F.step === 2) {
      if (!F.onoDone && (!gone(F.ono) || !gone(F.relief))) return 3;
      const gate = F.westGate?.struct;
      if (gate && !gate.opened && gate.hp > 0) return 4;
      if (F.masuClosed && F.outerOpenT) return 13;
      return F.C.kuruwa.kyogoku.test(p.x, p.z) ? 6 : 5;
    }
    return F.C.kuruwa.koma.test(p.x, p.z) ? 8 : 7;
  },
  missionHeading(rt) {
    if (!rt.over && !rt.flags.ending && rt.flags.step >= 1) return '①②③④⑤'[odaniGoalNow(rt)] + ODANI_GOALS[odaniGoalNow(rt)];
    const F = rt.flags, text = this.missionOrder(rt);
    // 一行表示では補足が隠れる。撤退の期限も今の下知と同じ札へ収める。
    return !F.ending && !rt.over && !F.fallen && !(F.komaDown && !F.honAttack) && F.collapseAt !== undefined
      ? `退くまで${Math.max(0, Math.ceil(F.collapseAt - rt.t))}秒 ${text}` : text;
  },
  missionOrder(rt) {
    const F = rt.flags;
    if (F.ending || rt.over) return '味方と集まれ';
    if (rt.flags.retreatOn) return '味方へ下がれ';
    if (F.fallen) return '本丸の前で勝ち鬨を上げよ';
    if (F.komaDown && !F.honAttack) return '尾根を南へ、本丸へ進め';
    if (F.step === 3 && !F.komaAttack && F.awayT > 0)
      return `京極丸へ戻れ あと${Math.max(0, Math.ceil(35 - F.awayT))}秒`;
    if (rt.flags.guideReturning || rt.flags.guideBlocked) return '清水谷の道へ戻れ';
    if (F.step === 0) return '秀吉に話して出発せよ';
    if (F.step === 1 && F.climbWaiting) return `先手を待て あと${Math.max(0, Math.ceil(8 - (F.belowWait || 0)))}秒`;
    const gate = F.westGate?.struct;
    if (F.step === 2 && F.onoDone && F.westCanStrike && gate && !gate.opened && gate.hp > 0)
      return `${westAttackControl(rt)}で西木戸を破れ あと${Math.max(1, Math.ceil(gate.hp / gate.maxHp * 10))}割`;
    const p = rt.player.u.pos;
    if (F.step === 2 && F.onoDone && F.westEnteredOrder && !F.kyoTarget && F.C.kuruwa.kyogoku.test(p.x, p.z))
      return '京極丸の広場を押さえよ';
    if (F.step === 3 && !F.komaAttack && F.counterRepelled && !F.cutTarget && F.C.kuruwa.kyogoku.test(p.x, p.z))
      return '尾根を北へ、小丸へ攻め入れ';
    if (F.komaAttack && !F.honAttack && !F.komaTarget && F.C.kuruwa.koma.test(p.x, p.z))
      return '小丸の広場を押さえよ';
    return rt.objectives.find((o) => o.id === 'main')?.text || this.missions[this.missionOf(rt)];
  },
  missionSignTarget: odaniNearestFoe,
  // 長政の居所を示すだけ。無敵・攻撃対象外の指定を保ち、討取りのピンにはしない。
  commanderSignTarget(rt) {
    const u = rt.flags.nagamasa?.units[0];
    // 長政の名は本丸へ向かう段だけ（京極丸・小丸を攻める間に、遠い本丸の将の名を出さない。kaito BR「京極丸で違う将の名が出る」）
    if (!rt.flags.honAttack && !rt.flags.komaDown) return null;
    return !rt.over && !rt.flags.ending && u?.alive && !u.gone && !u.dying ? u : null;
  },
  namedGuideTarget(rt) { return this.commanderSignTarget(rt); },
  foeMarkVisible(rt, u) { return u === this.commanderSignTarget(rt) && u.mesh?.visible !== false && !u.camHidden && sightPoint(rt, u.pos); },
  // 行き先は一つ。出発前は秀吉、合流中は今の持ち場を示し、先の坂へ誘わない。
  missionPin(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    if (F.ending || rt.over || F.fallen || F.komaDown && !F.honAttack || !rt.player.u.alive) return null;
    const pin = F.odaniPin || (F.odaniPin = { always: true, silent: true });
    pin.unit = null; pin.enemy = pin.defend = pin.waiting = pin.arrived = pin.follow = pin.gate = pin.route = false;
    pin.marker = null; pin.footRing = false; pin.r = .5; pin.hide = 0;
    const gate = F.westGate?.struct;
    let pos, hold = false;
    if (F.retreatOn) pos = F.retreatPoint;
    else if (F.step === 0) pos = F.hideU?.pos;
    else if (F.step === 1 && (F.climbWaiting || F.climbDefending) && !F.trailGuard) { pos = p; hold = true; }
    else if (F.honAttack || F.komaDown) pos = HONC;
    else if (F.komaAttack) { pos = KOMC; hold = true; }
    else if (F.step === 3) { pos = KC; hold = true; }
    else if (F.step === 2 && !F.onoDone) pos = ONO_PIN;
    else if (F.step === 2 && gate && !gate.opened && gate.hp > 0) { pos = WEST_FACE; pin.gate = true; }
    else if (F.step === 2) { pos = KC; hold = true; }
    else pos = BELOW;
    if (!pos) return null;
    pin.x = pos.x; pin.z = pos.z;
    pin.waiting = hold; pin.r = hold ? 5 : 2;
    pin.arrived = Math.hypot(p.x - pos.x, p.z - pos.z) <= pin.r;
    pin.key = F.retreatOn ? 'retreat' : hold ? 'defend' : 'trail';
    return pin;
  },
  // 小谷の常設井楼だけ、通し柱を垂直にして横木の木口を交互に出す。
  lookoutLogFrame: true,
  frameCamera: odaniVista,
  // 共通の民の仕組みで描く。兵の名簿・兵数・戦功には加えない。
  civilianCrowd: {
    bands: PEOPLE_BANDS, safeFlee: true, routeArrival: 1.2,
    ignoreGoneSoldiers: true, // 後送されて姿を消した負傷兵の跡で、民の里道を塞ぎ続けない。
    evacuateAfterBattle: true, // 決着後も火や兵が残る里道で、家族の避難と見張りを続ける。
    distantArmies: true, // 谷口の控え兵も見て退く。軽い兵を戦う兵へ増やさない。
    sightThreats: true, // 尾根や塀の裏の兵で見物をやめず、見える兵と間近の足音に反応する。
    sightFires: true, // 堂や民家に隠れた遠い火では騒がず、見える炎と近い熱で退く。
    rememberSoldierCombat: true, watchPlayerCombat: true, // 見回りの合間の斬撃・発砲も覚えて退く。
    fightingHearingDistance: 28, // 家や堂の陰でも近い戦う音に気づき、見物・避難・家族待ちで共用する。
    neighborAlarmRadius: 10, // 近くの里道で逃げ出した隣人を見ても、家族ごと危険から退く。
    // 残存民家・谷の堂・付属小屋の壁越しには兵を追わない。建物と同じ位置・向き・壁高。
    sightBuildings: [
      ...VILLAGE.map(([x, z, rot]) => ({ x, z, hw: 3, hd: 2.25, c: Math.cos(rot), s: Math.sin(rot), h: 2.6 })),
      { x: TERA.x, z: TERA.z, hw: 4.5, hd: 3.5, c: Math.cos(Math.PI / 2 + .2), s: Math.sin(Math.PI / 2 + .2), h: 3.8 },
      { x: TERA.x + 2, z: TERA.z - 12, hw: 3, hd: 2, c: Math.cos(.2), s: Math.sin(.2), h: 2.6 },
    ],
    watchDistance: 34, // 見物を始める距離を保ち、兵が近づいたら家族ごと里道へ退く。
    watchTrackDistance: 90, // 遠巻きのまま、谷道を進む兵を目で追う。近づいて見直しには行かない。
    // 退避後に兵や火が迫っても、西尾根の砦や南の田へ迷い込まず里道の肩へ退く。
    retreatPaths: PEOPLE_PATHS, retreatWidth: PEOPLE_RETREAT_WIDTH,
    // 七つの共用の人形を里の七種に割り当て、町人・商人も近くで同じ身なりを保つ。
    modelKinds: [...new Set(PEOPLE_KINDS.flat())],
    keepTogether: true, // 安全な里道では大人が子・年寄りを待ち、家族を置き去りにしない。
    escortPace: true, // 安全な道では、そばの子や年寄りの歩調で付き添う。
    naturalEscapeGait: true, // 実際に進んだ距離と背丈で歩幅を変え、畦の角では小刻みに歩く。
    // 組の中でも立ち位置を分ける。幅のある畦からはみ出さない間隔。
    startSpacing: 1.4, waitSpacing: 1.8, waitBesidePath: true,
    moveSpacing: 1, // 合流する寺・町屋・村の者も、歩く途中で互いの体をすり抜けない。
    // 篝火の小さな炎では騒がず、通常の燃え広がる火からは退く。
    fireSize: 1,
    fireRadiusScale: .8, // 炎の広がる幅も避ける。配置・逃げ始め・里道の検査で共用する。
    // 退避後も谷口と西麓の里に留める。北の山腹や南の田・虎御前山へ戻さない。
    bounds: { minX: -178, maxX: -90, minZ: 116, maxZ: 179 },
  },
  // 番兵と槍を合わせる間は先の坂へ誘わない。退路と道へ戻る案内は残す。
  guideMarker: (rt) => rt.flags.retreatOn ? 'retreat' : rt.flags.step === 0 ? 'hide'
    : rt.flags.step === 3 && !rt.flags.komaAttack ? 'cutHon' : 'trail',
  namedGuideMarkers: true,
  // 行き先の名は道の印へ。札の「京極丸を守れ」に「へ」を継ぎ足さない。
  keepDestinationTask: true,
  keepTaskLabel: true,
  keepCombatTaskHeading: true,
  combatTaskLabel: (rt) => rt.flags.step === 1 && !rt.flags.retreatOn &&
    !rt.flags.guideReturning && !rt.flags.guideBlocked && (rt.flags.trailGuard ||
    rt.flags.valleyFighting && !rt.flags.climbDefending && !rt.flags.climbWaiting)
    ? '味方と共に番兵を退けよ' : '',
  keepCombatTaskDetail: true, // 戦闘中も、次の敵を待つ理由と守備の進みを残す。
  // 谷の突破と曲輪の制圧が主命。近くの一人の護衛へ任務と道案内を切り替えない。
  guardGuideAllowed: () => false,
  // 11/3 kaito AL：行き先の印はいつも一つ。谷道の印（金の▼）だけで示し、秀吉の頭上の青い▼を同時に出さない。
  noLeaderFollow: true,
  // 具足は白い人型で囲まず、敵味方の頭上の印で示す。
  teamSignsOnly: true,
  noUnitContrast: true, // 敵にも白い人型を重ねず、頭上の刀と丸で両軍を分ける。
  playerFootSignOnly: true, // 通常は本人も足元の輪で示し、具足に白い人型を重ねない。
  compactPlayerSign: true,
  playerSignMinScale: .6,
  playerSignScale: .6,
  enemyCornerSign: true, // 胴を白枠で囲まず、槍と具足を見せる。
  enemyFrameAtPosition: true, // 坂を動く敵の現在地を囲み、更新前の骨の位置へ印を残さない。
  enemyFootRingRadius: .4,
  compactApproachGuide: true, // 敵への大矢印と足元の輪を縦に重ねない。
  compactCombatGuides: true, // 敵は小さな刀と足元の弧。具足を囲まず、接近の矢印も短くする。
  compactFloorGuides: true,
  compactDestinationSign: true, // 道の曲がり角の印で、次の番兵や門の入口を大きく覆わない。
  // 切岸で肩まで寄った時に足を収めようとして、地面ばかり見下ろさない。
  footFrameMinDistance: 2.5,
  terrainLookWeight: .35,
  // 清水谷の谷道で、肩越しの視点が横の切岸に寄り、画面の四分の一が土の壁で埋まった（11/1 撮影）。
  // 視点の左右 1.8m の地面が目の高さに迫る時は、低い側へ寄せて谷の真ん中から見る。
  clampCamera(rt, p) {
    const u = rt.player.u, W = rt.world;
    if (!u.alive || rt.over) return;
    let sx = -(p.z - u.pos.z), sz = p.x - u.pos.x;
    const L = Math.hypot(sx, sz); if (L < .5) return;
    sx /= L; sz /= L;
    const over = (k) => W.heightAt(p.x + sx * k, p.z + sz * k) - (p.y - .7);
    const a = over(1.8), b = over(-1.8);
    if (a <= 0 && b <= 0) return;
    const shift = Math.max(-2, Math.min(2, (b - a) * .8));
    p.x += sx * shift; p.z += sz * shift;
    p.y = Math.max(p.y, W.heightAt(p.x, p.z) + 1.4);
  },
  compactFlagGuide: true,
  // 画面外の印は矢印で示し、任務の札と重ねない。
  avoidAllDestinationNotices: true,
  routeGuideArrowOnly: true,
  // 11/4 jin（BH6・AW3）：矢印は描かない。行き先は真上の▼一つで、段ごとに決まった所に立てる（missionPin）。
  pinOnlyDestination: true,
  // 11/4 jin（AA・AV4）：秀吉の後ろに付く軽い兵の段は、一列で登る狭い谷道で本物の列と重なり、影の兵に見えた（bot：#15 200人の中に味方 25人）。
  //   谷道の戦では段を付けず、羽柴の手は本物の列と旗本で見せる。遠くの囲みの大軍はそのまま。
  noAvHost: true,
  // 11/5（AP9・#13）：秀吉・長政の後ろの軽い旗本の備（420・180）も、狭い谷道と本丸で本物の列と重なるので出さない。
  noHatamotoMass: true,
  // 足元で守る時も「道の先へ」と出して、持ち場から誘い出さない。
  travelGuideLabel: (rt) => {
    const F = rt.flags, p = rt.player.u.pos;
    if (F.retreatOn) return '退き口へ';
    if (F.guideReturning || F.guideBlocked) return '来た道へ';
    if (F.step === 0) return '秀吉に話して出発せよ';
    if (F.step === 1) {
      // 登り口では札と同じく、目の前の番兵・備え・合流の順で案内する。
      // 谷の交戦の覚えが残っていても、合流中に敵を追わせない。
      if (F.trailGuard) return '味方と番兵を退けよ';
      if (F.climbDefending) return 'ここで番兵を迎えよ';
      if (F.climbWaiting) return 'ここで先手を待て';
      if (F.valleyFighting) return '味方と番兵を退けよ';
    }
    if (F.step === 2) return assaultTrailLabel(rt);
    if (F.step === 3 && !F.komaAttack && F.C.kuruwa.kyogoku.test(p.x, p.z))
      return F.cutTarget ? '京極丸の敵を退けよ' : '京極丸を守れ';
    if (F.komaAttack && F.C.kuruwa.koma.test(p.x, p.z))
      return F.komaTarget ? '小丸の敵を退けよ' : '小丸を守れ';
    return '道の先へ';
  },
  // 谷の途中の印を、登り口そのものまでの残り距離と取り違えない。
  distanceText: (rt, distance) => {
    if (rt.flags.retreatOn) return distance <= 2.5 ? retreatCareText(rt) : `退き口まで${Math.round(distance)}メートル`;
    if (rt.flags.fallen) return '本丸の前で勝ち鬨を上げよ';
    if (rt.flags.komaDown && !rt.flags.honAttack) return '尾根を南へ、本丸へ進め';
    if (rt.flags.step === 0) return `秀吉まで${Math.max(1, Math.round(distance))}メートル`;
    if (rt.flags.guideBlocked) return '来た道へ戻る足場を探せ';
    if (rt.flags.guideReturning) return `来た道の角まで${Math.max(1, Math.round(distance))}メートル`;
    if (rt.flags.step === 1) {
      if (rt.flags.trailGuard) return '登り口の番兵を味方と退けよ';
      if (rt.flags.climbWaiting) return `ここで合流。あと${Math.max(0, Math.ceil(8 - (rt.flags.belowWait || 0)))}秒で攻める`;
      if (rt.flags.climbDefending && !rt.flags.trailGuard)
        return rt.flags.climbReleasedGuards > 0 ? '番兵が接近中。ここで味方と迎えよ'
          : '京極丸の下へ攻め上れ';
      if (rt.flags.valleyFighting) return '味方と番兵を退けよ';
    }
    // 曲輪に入って敵を退けたら、足元の印へ歩かせず、内に残る下知を出す。
    // 道へ戻る案内と敵への案内は、上の判定と従来の距離表示を使う。
    const F = rt.flags, p = rt.player.u.pos;
    // 木戸に武器が届いたら、足元へ進ませず、その場で打つ下知にそろえる。
    if (F.step === 2 && F.onoDone && F.westCanStrike
      && F.westGate?.struct && !F.westGate.struct.opened && F.westGate.struct.hp > 0)
      return `${westAttackControl(rt)}で西木戸を破れ`;
    // 制圧中は歩く距離でなく残りの秒数。足元の印で待つ理由を伝える。
    if (F.step === 2 && F.onoDone && F.westEnteredOrder && !F.kyoTarget
      && F.C.kuruwa.kyogoku.test(p.x, p.z))
      return '京極丸の広場を押さえよ';
    if (F.step === 3 && !F.komaAttack && !F.cutTarget && F.C.kuruwa.kyogoku.test(p.x, p.z))
      return F.counterRepelled ? '尾根を北へ、小丸へ攻め入れ'
        : `南は${F.southRepelled ? '退いた' : F.south.odaniReachedKyo ? '反撃中' : '接近中'}、北は${F.northRepelled ? '退いた' : F.north.odaniReachedKyo ? '反撃中' : '接近中'}。内で迎えよ`;
    if (F.komaAttack && !F.komaTarget && F.C.kuruwa.koma.test(p.x, p.z))
      return '小丸の広場を押さえよ';
    const metres = Math.max(0, Math.round(distance));
    return rt.missionGuide?.marker?.id === 'trail' && !rt.guideEnemyShown && !rt.guideEnemyDirection
      ? metres < 2 ? '足元の道を進め' : `次の角まで${metres}歩`
      : `${metres}歩`;
  },
  // 止血して戦いを離れたら、残る傷だけで空き地への退避を繰り返さない。
  // 接近戦・出血・息切れ・矢の落下範囲の警告は共通の仕組みに渡す。
  // 谷では遠い矢を受けた余韻だけで道案内を隠さず、歩いて向き合える番兵で切り替える。
  routeGuidePriority: (rt) => !rt.flags.retreatOn && !(rt.flags.step === 1 ? rt.flags.valleyFighting : rt.player.inCombatT > 0) &&
    !(rt.player.u.wounds?.bleed > .0001) && !rt.player.u.mobbed && rt.player.sta >= 20,
  // 11/5（AT10）：傷で登りと退避を切り替えない。囲まれた時だけ一歩下がる。手当てはその場で。
  damageRetreatNeeded: (rt) => !!rt.player.u.mobbed,
  woundRetreatNeeded: (rt) => !!rt.player.u.mobbed,
  woundEffectMin: .05, // ごく浅い傷で「足がおそい」を出し続けず、傷の部位は残す。
  retreatPathAllowed: retreatOnRoad,
  retreatPointAllowed: (rt, q) => roadClear(rt.army, rt.player.u, rt.player.u.pos, q),
  keepWoundRetreatReason: true,
  retreatStepsNewLine: true, // 退く理由と残り歩数を別の行にし、末尾だけが折り返される札を避ける。
  retreatGuideLabel: (rt, reached) => {
    if (rt.player.u.wounds?.bleed > .0001) return reached
      ? '血が出ている。物陰で傷を縛れ' : '出血じゃ。味方へ退け';
    if (reached) return rt.player.sta < 20 ? 'ここで止まり、構えて休め' : '味方と構え、敵を見よ';
    if (rt.player.u.hp < rt.player.u.maxHp * .6) return '深手じゃ。味方の後ろへ';
    if (rt.player.u.mobbed) return '囲まれた。味方の後ろへ';
    if (rt.player.sta < 20) return '息切れじゃ。味方へ退け';
    return '味方の後ろへ下がれ';
  },
  treatmentApproachLabel: '味方の陰へ。そこで傷を縛れ',
  treatmentTaskGuidance: true,
  // 矢から避ける時も、実際の歩幅で通れる谷道の内を指す。
  dodgePointAllowed: (rt, q) => retreatOnRoad(rt, q) && roadClear(rt.army, rt.player.u, rt.player.u.pos, q),
  keepTaskWithDodge: true, // 矢をよける間も、谷道へ戻る手順と今の任務を知らせの候補に残す。
  keepTaskWithRain: true, // 矢の落下範囲でも、危険の印と一緒に戻る道順を読めるようにする。
  keepTaskWithGuard: true, // 構えて待つ間も任務を残し、何を待つのか分からない空白を作らない。
  rearAdviceView: true, // 坂で視点を回した時も、危険の印と振り向く声の方向をそろえる。
  botOrders: true, // 道・木戸・供・退き口は、この戦の下知に従う。
  sideTaskAfter: true, // 櫓の別任務は残し、今の案内は木戸と曲輪の主命を優先する。
  noHorse: true, // 本人の乗馬は戦の指定を読む。身分が高くても夜襲の谷道は徒立ち。
  armySignals: false, // 「反撃を退けよ」を退却と取り違えない。合図は段の下知に合わせて鳴らす。
  immediateTaskChanges: true, // 道へ戻る・木戸を打つ指示を、携帯の札にもすぐ出す。
  taskDetails: true, // 低い画面でも南木戸から戻る手順と、木戸を打つ操作を残す。
  keepTaskLabel: true, // 近い敵が見えても、木戸・持ち場・退き口への下知を残す。
  keepCombatTask: true, // 構えの案内中も、合流する人数と守る残り秒数を同じ札に残す。
  cornerEnemyGuide: true, // 敵の手足を太い長方形で隠さず、四隅と頭上の印で示す。
  // 10/30：小丸から本丸の長政までは八分の打ち切りで切らない（最後の段を果たせるように）
  pacingWait: (rt) => !!rt.flags.ending || rt.flags.step >= 2,
  missionDangerText: (rt) => rt.flags.step === 3 && !rt.flags.komaAttack
    ? '味方が押されている！ 京極丸を守れ'
    : rt.flags.step <= 1 ? '味方が押されている！ 秀吉の列へ戻れ' : '味方が押されている！ 味方の旗へ急げ',
  nearAllyFadeRadius: 1.1,
  nearAllySolidBody: true, // 具足や顔を透かさず、視点を兵から避ける。体に入る時だけ描く間隠す。
  nearSceneryScreenCut: false, // 城内の梁や塀を画面の長方形に切らず、視点の直近だけ距離で避ける。
  nearSpearFade: true, // 近い味方の長柄も既存の透かしを使い、道と敵の姿を空ける。
  nearFlagFadeRadius: 6, // 肩越しに張り出す旗布も、既存の遮蔽判定で避ける。
  fadeCloseStandards: true, // 近い味方の隊旗は共用の薄い材質。奥の列と道を読めるようにする。
  fadeCloseStandardFrame: true, // 布を透かした所へ横木だけを残さない。
  standardClothScale: .75, // 谷道で隊旗が次の番兵を覆わないよう、布だけ控えめにする。
  nearHoroRadius: 5.5,
  nearHoroHide: true, // 視点のすぐ前を覆う母衣だけ、描く間避けて道と敵を見せる。
  nearHoroClothHide: true, // 胴と一つの軽い形でも布だけを避ける。全身は透かさない。
  // 身の回りの当時の場（timeslip_field.js）。天正元年八月二十七日の夜中は今の九月末・初秋の山。
  // 清水谷の道は乾いた土で、谷の脇は丈の伸びた秋草。番兵と槍を合わせた谷の道と、大野木屋敷・西木戸・京極丸ほど
  // 倒れた槍・浅井方の旗・刺さった矢が多い。床や台の上（屋敷・曲輪の板の間）には置かない。
  timeslip: {
    wet: 0.15, dust: 0.25, trample: 0.25, debris: 0.9, arrows: 0.5,
    grass: 0x7e8a52, grassTints: [0xffffff, 0xe6e8c4, 0xd0c890], grassH: 0.7, tallGrass: 0.4,   // 11/3：丈の高い葉の扇が画面の手前で切り絵に見えた。低く・少なく
    flagColors: [0xe4ded0, 0x26241f, 0x2c3a5a],
    fights: [[MOUTH.x, MOUTH.z, 26], [BELOW.x, BELOW.z, 24], [ONOGI.x, ONOGI.z, 22], [GATE_WEST.x, GATE_WEST.z, 18], [KC.x, KC.z, 24]],
  },
  playerTaken: 0.4,   // 夜の谷を登る間の番兵の突きで、木戸の前に着く前に深手になっていた（bot 10/26）。人数と斬り合いは減らさない
  playerRegen: 0.015,   // 斬り合いの合間（四秒当たらない間）は命が少しずつ戻る。谷で退いては戻るのを繰り返させない
  spawn: { x: MOUTH.x - 4, z: MOUTH.z + 6, heading: Math.PI - 0.2 },   // 谷道の内で秀吉の二列の脇に立つ。列の後ろと屋敷の軒を避ける
  // 11/1：共通の既定（本人へ四人が同時に打つ・構えずに受けた一太刀は命の五割）で bot が倒れて負けた。寄せる数・敵の強さ・大軍の見た目は変えず、
  //   一太刀を一割八分（侍は二割）に、刃を受けた後の4秒は次の刃を通さない（同じ一瞬に二太刀・三太刀を浴びない）。
  cutFloor: 0.35,
  meleeGrace: { rate: 1, burst: 1, interval: 4 },
  world: {
    playerAtkMax: 2,   // 11/1：本人へ同時に打ち込むのは二人まで（共通の既定は四人・player_pressure.js）
    seed: 1573,
    noHaori: true, // 足軽主体の夜攻め。名将にも陣羽織・母衣を重ねない。
    softEarthCrust: true, // 土塊の升の境に陰を並べず、谷道を敷石模様にしない。
    unitNightScale: .5, // 黒い具足の面と縁を読み、月の反射は控えめに残す。
    livingSpearHedge: true,
    variedMarch: true,
    strideLimit: 1.1, // 走る速さは保ち、腿・膝・腰の弾みだけを抑えて宙を蹴る姿を避ける。
    // 共通の月光の下限で明るさが戻らないよう、夜の直射と補助光を一緒に抑える。
    nightMoonMin: .55,
    nightFill: .4,
    roundedFire: true, // 篝火を三角の板にせず、既存の丸い火の舌を使い回す。
    smoothGroundFire: true, // 坂の火明かりを画素ごとに測り、地面の三角形へ橙色を引き伸ばさない。
    namedKacchu: ODANI_LOOK, // この戦だけ陣羽織を外す。近景・遠景に同じ具足を渡す。
    ordinaryFlagStride: 3, // 無名の長柄足軽は三人に一本。隊旗・旗持ち・本人の組は残す（割合は復元）。
    renderDetailBeforeDraw: true,
    lowHumanDetail: 12, // 兵数と骨の動きは保ち、離れた兵の細部だけ軽い形へ。
    armyHeightLOD: true, // 上の曲輪の兵は高低差も含めて遠さを測る。
    tightSceneryCull: true, // 草木と板塀の実寸で囲み、画面外の細長い部品を余分に送らない。
    sceneryViewOnly: true, // 景物は頂点色の陰影を使うため、近くても画面外の木・塀を送らない。
    armyViewCull: true, // 遠景の兵は人数を保ち、画面外の分だけ送らない。
    armyTerrainCull: true, // 山腹に完全に隠れる遠景兵だけ送らない。近景と影は保つ。
    singleSoldierLOD: true, // 遠近の境の兵を二重に送らず、一人につき一つの形で描く。
    armyCompactAll: true, // 少人数の控えも見えない兵を送らず、遠い兵だけ軽い形へ。兵数と動きは保つ。
    routedSoldierLOD: true, // 敗走先も移動の余裕を含めて細部を選び、遠い兵を全員近景の形へ戻さない。
    armyFarDetail: 36, // 三十六メートルに足踏みの余裕を足した先は輪郭の形へ。人数・隊列・動きは同じ。
    highClashDetail: true, // 遠い斬り合いは輪郭の形へ。人数・位置・動きは保つ。
    highClashFarDetail: 24, // 二十四メートル先の顔と甲冑の細部だけを省く。
    soldierDetailNear: 12, // 十二メートルに移動の余裕を足すまで細かい形を保ち、その先も全員を描く。
    soldierDetailMiddle: 24, // 離れた控えの細部だけ輪郭の形へ。接近すれば元の形へ戻す。
    soldierDetailMargin: 3, // 押し引きの位置を反映した上で、足踏みと更新間隔の余裕を残す。
    tightSceneryCull: true, // 草木と細長い板塀を実寸の箱で囲み、画面外の面だけ束から外す。
    terrainTriangles: true,
    terrainViewCull: true, // 足場の面は保ち、画面の外の地面だけ描かない。
    terrainBackfaceCull: true, // 尾根の裏向きの地面は送らない。足場・影・表向きの切岸は保つ。
    terrainCullCell: 32, // 尾根の地面を小区画で選び、画面外の斜面を同じ一回の描画から外す。
    terrainClipCells: 2, // 規則格子も二升ごとに選別し、画面外の急斜面を余分に送らない。
    keepTerrainGrid: true, // 携帯も足場と同じ格子。切岸の面に兵や道しるべを埋めない。
    groundedSlopeRocks: true, // 閉じた岩の腹を土へ埋め、斜面の黒い穴や浮いた小石を減らす。
    groundPhoto: { dirt: 'rocky_trail', mudFromSoil: true, scale: 0.2, contrast: 1.3 },   // 10/30 c_ground_photo2：茶の一枚の土を戦ごとの写真（CC0）に。泥も同じ写真で絵は増やさない（曲輪と山道の岩まじりの土）
    rockDrawGround: true,
    rockSlopeContact: true,
    rockLowerRimContact: true, // 折れた谷の肩では、外向きでも下側の腹を実際の地面へ埋める。
    curvedRockTufts: true, // 岩際の草を三角の杭にせず、短く曲がる葉にする。
    litRockTufts: true, // 根草の裏も空の光で照らし、夜の斜面に黒い刃を並べない。
    naturalWoodDebris: true, // 割れ木の色に茶を二重に掛けず、夜の黒い短冊を減らす。
    groundedWoodDebris: true, // 着地した割れ木だけ坂の向きへ寝かせる。
    noHorse: true, // 清水谷の夜襲と狭い木戸は徒立ち。後から加わる武将にも適用する。
    distantFootOnly: true, // 遠景の組頭と供も徒歩にそろえ、夜襲の谷道に騎馬を残さない。
    wholeInfantrySilhouette: true, // 少し離れた列も腿と脛を残し、胴だけ浮かせない。
    completeCrowdLegs: true, // 骨入りの兵を軽い形へ替える時も、甲冑の下の袴と脛を残す。
    noArrowRain: true, // 狭い谷では弓兵が実際に射た矢だけを使い、追加の束と宙に残る矢を重ねない。
    naturalArrowRain: true,
    enemyArrowWarnings: true, // 本人に当たらない味方の斉射で、登り道から退かせない。
    noGroundArrows: true, // 急斜面へ外れ矢を積まず、空に止まった針山に見せない。射矢と命中は残す。
    arrowRainGroundCue: false, // 谷を横切る巨大な光の輪を出さず、矢音・影・警告と退き口の案内で知らせる。
    arrowRainAreaShadow: false, // 急坂から浮く一枚の大きな影は省き、矢一本ごとの小さな影を残す。
    arrowRainPerBow: 1, // 本物の射矢に添える束は弓兵一人につき一本。少人数から三十六本を増やさない。
    bareFallenHats: true, // 落ちた陣笠の垂れ布を首のように立たせず、笠の縁を接地させる。
    slopeLitter: true,
    longitudinalSpearFalls: true, // 落ちた長槍は穂先と石突の高さで寝かせ、谷道の坂から浮かせない。
    // 丸めた石の表を裏込めが切らないよう、小谷の石垣だけ奥へ下げる。
    stoneBackInset: .35,
    stoneFaceSegments: 2,
    // 低画質だけ、材質ごとに結合して区画単位で見える面を選ぶ。
    mergeStaticBatches: true,
    lowMaterialBatch: true,
    distantMaterialBatch: true, // 高でも見えない城の区画を外し、遠い凹凸だけ簡略化する。
    staticBatchBeforeDraw: true, // 場面側で非表示の束も準備し、見えない城を省き、視点が戻れば同じ一枚で復帰する。
    staticBackfaceCull: true, // 城の裏向きの面は送らず、影と壊れる木組みは保つ。
    staticFaceCell: 2, // 長い塀や石垣の画面外を二メートル区画で外す。材質ごとの一回描画は保つ。
    staticFaceNormalStep: 0.0625, // 石と丸太の向きを細かく分け、裏面判定の余分な余裕を減らす。
    staticTerrainCull: true, // 山腹に隠れる塀と石垣も区画ごとに外す。影は残す。
    distantPartCull: true, // 材質をまとめた城にも、小さく遠い部品を省く判定を使う。
    lowArmyDetail: true,
    lowArmyMiddleDetail: true,
    noLowBlobShadows: true,
    noFootShadows: true, // 小谷だけ、坂へ水平な足元の影を重ねない。光源の影は保つ。
    lowUnitNear: 10,
    highUnitNear: 8, // 八メートル先は同じ兵・同じ動きの軽い甲冑へ。前線の人数と間隔は保つ。
    highHumanDetail: 8, // 骨の入った無名兵も同じ距離で甲冑を一体にまとめ、槍は既存の束で描く。
    highUnitGrid: 0.08, // 十六メートル先の細かな部品だけを共通の粗い形へ。
    unitPartCull: true, // 長い槍だけが見える兵の、画面外の体を描かない。
    lowUnitFar: 40,
    lowMountainCull: true,
    // 半メートル刻みでは斜面の細い杭・横木が潰れ、土の筋に四角い塊だけ残る。
    // 遠景も五センチ刻みにし、丸太の輪郭を保つ。材質の束と区画の省略は続ける。
    distantDetailGrid: 0.05,
    distantDetailNear: 28,
    // 六十四メートル先だけ石の細かな凹凸をまとめる。細い杭と横木は既存の輪郭保護を使う。
    distantDetailFarGrid: 0.2,
    distantDetailFar: 64,
    pathWidth: 1.1,
    interiorFit: true, // 斜面の建物は、床の端まで地面より上にそろえる。
    climbTan: 0.7,   // 山城：尾根の両側は急な切岸（登れない）、道と段の間の坂は登れる
    wind: [-0.7, 0.7],
    time: 'night', // 信長公記の八月二十七日夜中の攻め。夜襲の間は朝へ移さない。
    hazeColor: 0x1a222c, // 夜の空とそろえ、靄だけが朝の明るさで浮かないようにする。
    fireLightLift: 1.5, // 篝火のそばだけ照らし、離れた登り道は夜の暗さを残す。
    blockedHint: (rt) => {
      if (rt.blockedMove?.cause === '兵の列') return '兵の列が詰まった。道の内で脇を通れ';
      const gate = rt.flags.westGate?.struct;
      return rt.flags.onoDone && gate && !gate.opened && gate.hp > 0 &&
        Math.hypot(rt.player.u.pos.x - GATE_WEST.x, rt.player.u.pos.z - GATE_WEST.z) < 6 &&
        roadClear(rt.army, rt.player.u, rt.player.u.pos, WEST_FACE)
        ? (rt.flags.westCanStrike ? `西木戸を向き、${westAttackControl(rt)}で打て` : '塀沿いに進み、西木戸を向け')
        : '切岸や塀は越せぬ。清水谷の道へ戻れ';
    },
    blockedEscape: true,
    blockedEscapeAfter: 2.5,
    maxWalkDrop: 1.2,
    muddy: 0,   // 踏み固めた山道。薄い泥でも全員が転びやすくなる指定は外す
    paths: [CLIMB, OTE_CLIMB, ROAD_RIDGE, KOMA_WEST, ROUTE_O, LOOKOUT_WAY,
      { pts: HOKKOKU_WAKI, w: 2.4 },
      ...PEOPLE_PATHS.map((pts) => ({ pts, w: 3.2 }))],
    height,
    // 道の西脇の沢。幅は両岸で1.5m、浅くして通行と乱戦の持ち場を保つ。
    streams: [{ pts: SHIMIZU.map(([x, z]) => [x - 5, z]), w: 0.75, depth: 0.32, surfaceDrop: 0.06 }],
    moveWay: roadWay,
    combatSpace: ambushSpace,
    playerVelocity(rt, vx, vz) {
      const F = rt.flags, q = F.waitVelocity, p = rt.player.u.pos;
      q.x = vx; q.z = vz;
      // 来た足跡へ戻る時と手当てへ退く時は、下りの入力を登りへ反転しない。
      // 番兵と向き合う間も、横へよける・後ろへ下がる入力を坂へ曲げない。
      // 遠い矢を受けた余韻では道の補助を止めない。接近戦は番兵の判定で分ける。
      if (F.step !== 1 || F.guideReturning || F.retreatOn || rt.botRest || F.valleyFighting) return q;
      // 登りの先手は谷道を進む。道から外へ押し続けた時は、歩く速さで道へ寄せる。
      // 横・後ろへの入力は残し、切岸を直登する向きだけを道の次の角へ曲げる。
      const speed = Math.hypot(vx, vz);
      if (speed < .01) return q;
      roadPoint(VALLEY_ROUTE, p, F.playerRoad);
      const r = F.playerRoad, dx = p.x - r.x, dz = p.z - r.z;
      const next = VALLEY_ROUTE[Math.min(VALLEY_ROUTE.length - 1, Math.floor(r.s) + 1)];
      const tx = next[0] - p.x, tz = next[1] - p.z;
      const forward = vx * tx + vz * tz;
      // 奥の折り返しでは、北への登り入力を次の道へ沿わせ、山肌へ押し続けない。
      const turn = r.s >= 4 && vz < 0 && forward < 0;
      if (turn || r.d > 6 && (vx * dx + vz * dz > 0 || forward > 0)) {
        const ax = turn ? tx : r.x - p.x + (next[0] - r.x) * .2;
        const az = turn ? tz : r.z - p.z + (next[1] - r.z) * .2;
        const len = Math.hypot(ax, az);
        if (len > .01) {
          ROAD_TEST.x = p.x + ax / len * Math.min(1.2, len);
          ROAD_TEST.z = p.z + az / len * Math.min(1.2, len);
          // 道へ寄せる補助も本人と同じ足場を確かめ、切岸へ入力を曲げない。
          if (roadClear(rt.army, rt.player.u, p, ROAD_TEST)) {
            q.x = ax / len * speed; q.z = az / len * speed;
          }
        }
      }
      return q;
    },
    tint(x, z, h, c) {
      // 尾根の曲輪の土と、清水谷の道沿いの踏み固めた土
      // 街道は地面の色で描く。新しい面・材質・当たりは増やさない。
      if (x > -187 && x < -109 && z > 107 && z < 319 && alongLine(HOKKOKU_WAKI, x, z).d < 2.4) c.setRGB(0.42, 0.36, 0.27);
      else if (kyoEastAt(x, z) || otsuboneWeight(x, z) > 0 || rokuboAt(x, z) || rokuboTateDip(x, z) < 0 || otakeShelfAt(x, z) || otakeWalkWeight(x, z) > 0 || yakioWeight(x, z) > 0 || yamazakiWalkWeight(x, z) > 0) c.setRGB(0.42, 0.36, 0.27);
      else if (ODANI_PLAN.kuruwa.some((k) => inPoly(k.poly, x, z))) c.setRGB(0.46, 0.39, 0.28);
      else if (S.quality === 'high' && x < -20 && x > -170 && z > -70 && z < 175 && alongLine(SHIMIZU, x, z).d < 65) {
        const d = alongLine(SHIMIZU, x, z).d;
        if (d < 9) c.setRGB(0.18, 0.16, 0.12); // 湿った谷底の黒土
        else {
          // 高さの差から傾きと向きを読む。生成時だけ計算し、毎コマの仕事は増やさない。
          const dx = (height(x + 1, z) - height(x - 1, z)) / 2;
          const dz = (height(x, z + 1) - height(x, z - 1)) / 2;
          const slope = Math.hypot(dx, dz), rock = Math.max(0, Math.min(1, (slope - 0.35) / 0.45));
          const aspect = 1 + 0.08 * (dx - dz) / (1 + slope);
          c.setRGB((0.26 + 0.10 * rock) * aspect, (0.29 + 0.01 * rock) * aspect, (0.18 + 0.04 * rock) * aspect);
        }
      }
      else if (x < -30 && x > -125 && z > -60 && z < 165 && alongLine(SHIMIZU, x, z).d < 9) c.lerp({ r: 0.42, g: 0.38, b: 0.3 }, 0.3);
      else if (h > 12) {
        // 伐採した山肌は土を主に、沢沿いに草を残す。既存の土・岩の絵を使う。
        const soil = 0.5 + 0.5 * Math.sin(x * 0.08 + Math.sin(z * 0.06) * 2) * Math.cos(z * 0.11);
        c.setRGB(0.35 + soil * 0.07, 0.34 + soil * 0.01, 0.23 + soil * 0.04);
      }
    },
    // 池と空堀の除草を保ち、谷側の林は道・曲輪の外だけに残す。兵の持ち場は変えない。
    clear: (x, z) => clearPeopleWay(x, z) || (Math.abs(x - TEMPLE_GARDEN.x) < 9 && Math.abs(z - TEMPLE_GARDEN.z) < 4.5)
      || !!kyoEastAt(x, z)
      || otsuboneWeight(x, z) > 0 || templeDip(x, z) < 0 || !!rokuboAt(x, z) || !!otakeShelfAt(x, z) || rokuboTateDip(x, z) < 0
      || yamazakiShelfWeight(x, z) > 0 || yamazakiWalkWeight(x, z) > 0 || otakeWalkWeight(x, z) > 0 || yakioWeight(x, z) > 0
      || gesshoDip(x, z) < 0 || gesshoTateDip(x, z) < 0 || otakeDip(x, z) < 0 || otakeTateDip(x, z) < 0 || otakeNwTateDip(x, z) < 0 || fukujuDip(x, z) < 0 || valleyEntryDip(x, z) < 0
      || odaniExtraClear(x, z) || (Math.abs(x) < ridgeHW(z) + (S.quality === 'high' && x < 0 && z > -70 && z < 175 ? 6 : 22) && z < 174 + SOUTH_SHIFT && z > -192)
      || (x < -14 && x > -125 && z > CLIMB_UP[1][1] - 16 && z < 170
        && (S.quality === 'high' ? alongLine(SHIMIZU, x, z).d < 7 || alongLine(CLIMB_UP, x, z).d < 14 : alongLine(CLIMB, x, z).d < 14))
      || Math.hypot(x - KYOKAN.x, z - KYOKAN.z) < 22 || inSiege(x, z, 4) || Math.hypot(x - AKAO.x, z - AKAO.z) < 17 || Math.hypot(x - ONOGI.x, z - ONOGI.z) < 17 || FORTS.some((f) => Math.hypot(x - f.x, z - f.z) < 13),
    // 尾根の曲輪・切岸の外の山肌は、夏の杉と雑木の林（道・谷底・田・屋敷は clear と paths で空ける）。
    trees: 460, // 谷道の脇の林を共通の木で立てた分（約百八十本）を減らし、重さを保つ。
    layeredNeedles: true, // 杉の枝房を段ごとに張らせ、細長い板のような輪郭を崩す。面数は保つ。
    tufts: 1900,
    tuftTint: 0x8c9c6a, // 林の下草は落ち着いた緑。白い穂が一面を覆わないようにする。
    treeMix: { sugi: 0.24, matsu: 0.3 }, // 手本：周りを広葉樹の高い木が密に囲む。本数と位置は変えない。
    treeDensity: (x, z) => (x < -30 && x > -130 && z > -70 && z < 175 && alongLine(SHIMIZU, x, z).d < 7 ? 0 : 1),
    sugiAt: (x, z) => x < -20 && x > -170 && z > -70 && z < 175 && alongLine(SHIMIZU, x, z).d < 65 ? 0.6 : 0.35,
    get groves() { return odaniFrontGroves(); },
    paddy: (x, z) => x > -151 && x < -64 && z > 179 && z < 226 && alongLine(HOKKOKU_WAKI, x, z).d > 3.2 ? 1 : 0,
    fleeOut: (x, z, team) => team === 1 && (x > 60 || z < -150 || z > 168 + SOUTH_SHIFT),
  },

  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  keepOpeningTaskLabel: true, // 開始直後の「出発を待て」を、なぞる操作の札で消さない。
  openingWait: (rt) => rt.flags.step === 0, // 秀吉の下知を待つ五秒間は、歩き出す絵を出さない。
  compactIntro: true,
  introTaskFirst: true, // 横持ちでも、人物紹介より先に最初の仕事を読めるようにする。
  introText: '八月二十七日の夜中、羽柴秀吉の手に加わり、清水谷から小谷の尾根へ攻め上る。京極丸を取れば、本丸の長政と小丸の久政は切り離される。',
  setup(rt) {
    { const P = rt.player, td = P.takeDamage, k = rt.def.cutFloor; P.takeDamage = function (a, s) { const m = this.u.hitKind === 'gun' || this.u.hitKind === 'arrow'; const d = td.call(this, a, s); return s && !s.isStruct && !m && d > 0 ? d * k : d; }; }   // 11/1：刃の一太刀を def.cutFloor 倍に（共通の一太刀五割・六割は変えず、この戦だけ）
    const W = rt.world;
    const F = rt.flags;
    STONES.length = 0; // 前の戦の石（前の場面に置いた物）を使い回さない。
    // 身の回りの当時の場。板の間や台の上は、下の地面へ置いても床に隠れるので置かない。
    rt.def.timeslip.skip = (x, z) => groundAt(W, x, z, W.heightAt(x, z) + 30) > W.heightAt(x, z) + 0.25;
    timeslipField(rt);
    // 同じ踏み跡を道一面へ繰り返さず、細粒と色むらの土へ。共用の絵を差し替えるだけ。
    W.groundU.tDirt.value = dirtTex(true);
    ROAD_PLAYERS.set(rt.player.u, rt.player);
    // 夜空の四角い白点を雪粒に見せない。月の丸い絵を共用し、小谷の星だけ控えめにする。
    if (W.stars) {
      W.stars.material.map = W.moon.material.map;
      W.stars.material.size = 1.2;
      W.stars.material.opacity = .5;
      W.stars.material.needsUpdate = true;
    }
    // 旧暦八月二十七日の夜に、共通の丸い月を大きく出さない。
    // 月の位置と見え方は断定せず省く。星の丸い絵と、足元を読むための照明は保つ。
    // setLook が visible を戻すため、月だけの材質で消す。
    if (W.moon) W.moon.material.opacity = 0;
    // 夏の山の杉と雑木：月の逆光で葉が白く光らないよう、この戦の木の葉だけ暗い緑に沈める（材質はこの戦の物）。
    // 地図の外の遠い山も、月で灰白く浮かせず夜の林の暗い緑に。
    if (W.farLand) W.farLand.material.color.setHex(0x4a5a40);
    // 手前へ敷く草は tuftTint の対象外。小谷の既存の形と材質だけを調整する。
    if (W.nearGrass) {
      W.nearGrass.geometry.scale(1, .75, 1);
      W.nearGrass.material.color.setHex(0x68704d);
    }
    const leafDone = new Set();
    for (const m of W.treeMeshes || []) {
      const mat = m.material;
      if (leafDone.has(mat) || !mat.color || (!mat.map && mat.color.getHex() !== 0x8fa572)) continue;
      // 写真の葉（map のある葉房）は暗く沈めない。沈めると写真の陰影が消え、杉が平たい暗い板の切り抜きに見えた（10/30 点付け）。
      if (mat.map) continue;
      leafDone.add(mat); mat.color.multiply(new THREE.Color(0x7f9466));
    }
    // 終幕は戦場を残したまま暗くする。次の戦へは持ち越さない。
    const endStyle = document.createElement('style');
    const hud = document.getElementById('hud');
    const notices = rt.hud.notices, noticePush = notices.push;
    notices.push = function (text, ...args) {
      // 携帯で退き方の末尾だけが次の行へ落ちないよう、傷の知らせを短くする。
      return noticePush.call(this, text.replace('。味方の後ろへ下がれ', '。味方の後ろへ退け'), ...args);
    };
    hud?.setAttribute('data-odani', '');
    endStyle.textContent = `
#vignette[data-odani-down]{background:rgba(6,8,12,.42)!important;animation:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;mask-image:none!important;-webkit-mask-image:none!important;box-shadow:inset 0 0 90px rgba(6,8,12,.45)!important}
#hud[data-odani] #intro:has(#intro-go) > .card { display:flex; flex-direction:column; align-items:center; }
/* 11/3 kaito AL：地面に並ぶ白い矢印は出さない。行き先は真上の金の▼一つ（床の矢印の塗りの道だけを消す）。 */
#hud[data-odani] #mission-target-lines > g:nth-of-type(2) > path:nth-child(3) { display:none !important; }
/* 目標の相手（「父子」の札と▼・床の三本矢印）も重ねない。京極丸へは切岸ごしに直に行けず、谷道の印と食い違う。 */
/* 秀吉に話す間（data-odani-talk）だけは、会う相手の頭上に▼を出す（kaito 十2「会う相手の居場所を印で出す」）。 */
#hud[data-odani]:not([data-odani-talk]) #goal-sign { display:none !important; }
#hud[data-odani] #intro .intro-reading { width:100%; overflow-y:auto; touch-action:pan-y; pointer-events:auto; overscroll-behavior:contain; }
/* 任務の補足を二列目へ押し込まず、本文と同じ幅で上から読む。 */
html body #hud[data-odani] #battle-notices #objectives:not(.expand) li.cur {
 display:block !important; min-width:0; text-align:left;
}
html body #hud[data-odani] #battle-notices #objectives:not(.expand) li.cur .tag { display:none !important; }
html body #hud[data-odani] #battle-notices #objectives:not(.expand) li.cur :is(.obj-text,.obj-now,small,.opb) {
 grid-column:auto; min-width:0; max-width:100%; box-sizing:border-box;
}
html body #hud[data-odani] #battle-notices #objectives:not(.expand) li.cur :is(.obj-text,.obj-now) {
 display:block; width:100% !important; white-space:normal !important; overflow-wrap:anywhere;
}
/* 道の向きは戦場の印で示す。札の矢印で見出しの末尾一字を押し出さない。 */
html body #hud[data-odani] #battle-notices #objectives:not(.expand) #obj-list li.cur .obj-now::before {
 content:none !important; display:none !important;
}
html body #hud[data-odani] #battle-notices #objectives:not(.expand) li.cur small {
 width:100%; white-space:normal; overflow-wrap:anywhere; line-height:1.4; margin-top:4px;
}
/* 矢をよける間も、任務と来た道へ戻る手順を同じ一枚に残す。危険の印はそのまま。 */
html body #hud[data-odani].rain-danger #battle-notices #objectives {
 visibility:visible !important;
}
html body #hud[data-odani]:is(.rain-danger,.dodge-active) #battle-notices #objectives:not(.expand) #obj-list {
 display:block !important;
}
/* 地面の印へ札そのものを固定する共通規則より優先する。
   小谷は印と札を分け、任務も危険の声も同じ欄で読む。 */
html body #hud[data-odani] #battle-notices:not(.choosing) #objectives.ground-order:not(.expand) {
 position:relative !important; inset:auto !important; transform:none !important;
 width:100% !important; min-width:0; max-width:100% !important;
 height:auto !important; max-height:none !important; flex:0 0 auto; box-sizing:border-box;
}
@media (min-height:501px) {
 html body #hud[data-odani].mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)),
 html body #hud[data-odani] #battle-notices:not(.choosing) {
  left:16px !important; right:auto !important; top:104px !important;
  width:min(320px, 30vw) !important; gap:8px; max-height:calc(100% - 304px) !important;
 }
 html body #hud[data-odani] #battle-notices:not(.choosing) > :is(#objectives,#battle-message,#tutorial,#banner,#situation,#skiphint) {
  position:relative !important; inset:auto !important; transform:none !important;
  width:100% !important; height:auto !important; flex:0 0 auto; min-width:0;
  max-height:none !important; white-space:normal; overflow-wrap:anywhere;
 }
 html body #hud[data-odani] #battle-notices #objectives:not(.expand) :is(li.cur,.obj-text,.obj-now,.battle-action) {
  min-width:0 !important; max-width:100% !important; width:auto !important;
  white-space:normal !important; overflow-wrap:anywhere; height:auto !important;
  max-height:none !important; overflow:visible; line-height:1.4 !important;
  font-size:max(20px, calc(20px * var(--text-scale, 1))) !important;
 }
 html body #hud[data-odani] #battle-notices #objectives:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now) {
  font-size:max(20px, calc(20px * var(--text-scale, 1))) !important;
 }
 html body #hud[data-odani] #battle-notices :is(#subtitle,.battle-notice,#tutorial,#banner,#situation) {
  max-width:100% !important; box-sizing:border-box; white-space:normal !important;
  overflow-wrap:anywhere; font-size:max(16px, calc(16px * var(--text-scale, 1))) !important;
  line-height:1.5 !important;
 }
}
@media (max-height:500px) {
 /* 上端の操作列は八画素下から四十八画素。任務札はさらに八画素空ける。 */
 html.touch body #hud[data-odani] { --odani-notice-top:calc(64px + env(safe-area-inset-top, 0px)); }
 html.touch.inframe body #hud[data-odani] { --odani-notice-top:calc(64px + max(64px, env(safe-area-inset-top, 0px))); }
 /* 横向きの携帯でも、正面の敵と登り道を任務札で隠さない。判断の選択肢は元の位置に保つ。 */
 html.touch body #hud[data-odani] #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
  left:max(12px, env(safe-area-inset-left, 0px)) !important; right:auto !important;
  top:var(--odani-notice-top) !important; transform:none !important;
  width:min(280px, 32vw) !important;
 }
 /* 共通の任務中の高さ制限より優先し、危険の声を札の下まで読めるようにする。 */
 html.touch body #hud[data-odani].mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)),
 html.touch body #hud[data-odani] #battle-notices:not(.choosing) {
  max-height:min(52vh, calc(100% - var(--odani-notice-top) - max(104px, var(--notice-floor, calc(104px + env(safe-area-inset-bottom, 0px)))))) !important;
  overflow-y:auto;
 }
 html.touch body #hud[data-odani] #battle-notices > :is(#objectives,#battle-message) { flex:0 0 auto; }
 html.touch #hud[data-odani] #battle-notices #objectives li.cur small.goal-place { white-space:normal; overflow-wrap:anywhere; overflow-x:visible; }
html.touch body #hud[data-odani] #battle-notices #objectives:not(.expand) #obj-list li.cur > small:not(.goal-place):not(.obj-cue) { display:block !important; font-size:max(15px, calc(15px * var(--text-scale, 1))) !important; line-height:1.4 !important; margin-top:4px; }
 html.touch #hud[data-odani] > #battle-log-entry::before { content:'記録'; display:block; font-size:12px; }
}
/* 任務は右上の一行。下知は共通の枠で短く出し、戦場を空ける。 */
html body #hud[data-odani].field-clean #battle-notices:not(.choosing) > #objectives:not(.expand) { display:none !important; }
html body #hud[data-odani].field-clean:not(.ending) #situation { display:none !important; }
html:root body #hud[data-odani].mission-only #battle-notices #battle-message:not([hidden]),
html:root body #hud[data-odani].mission-only #battle-notices #battle-message #subtitle:not([hidden]):not(.notice-muted) { display:block !important; }
html:root body #hud[data-odani] #battle-notices:not(.choosing) {
 width:min(280px, 30vw) !important; max-height:calc(100% / 3) !important;
}
`;
    document.head.appendChild(endStyle);
    const dispose = rt.dispose;
    rt.dispose = function (...args) {
      notices.push = noticePush;
      endStyle.remove(); document.getElementById('vignette')?.removeAttribute('data-odani-down');
      hud?.removeAttribute('data-odani'); hud?.removeAttribute('data-odani-talk');
      return dispose.apply(this, args);
    };
    odaniGoalBoard(rt);
    const updateCamera = rt.player.updateCamera;
    const flagBlocksView = rt.player.flagBlocksView;
    rt.player.flagBlocksView = function (pos, height, camera) {
      const c = camera.position, p = this.u.pos;
      // 画面の端へ張り出す大旗も竿ごと避ける。別の段の旗は残す。
      const dx = pos.x - c.x, dz = pos.z - c.z;
      if (dx * dx + dz * dz < 20.25 && pos.y <= Math.max(c.y, p.y + 2) + 1
        && pos.y + height >= Math.min(c.y, p.y)) return true;
      return flagBlocksView.call(this, pos, height, camera);
    };
    const cameraDirection = new THREE.Vector3(), cameraLook = new THREE.Vector3();
    rt.player.updateCamera = function (dt, camera) {
      if (!this.u.alive) { odaniDownCamera(rt, camera); return; }
      camera.up.set(0, 1, 0);
      updateCamera.call(this, dt, camera);
      // 横持ちの肩越しは足もとから 2.8m の高さに固定され、登りの谷道では地面ばかり映る。
      // 小谷の外では胸の少し上（2.0m）まで下げ、谷道の両脇の杉と上の段の塀・番所を見上げる（10/28 資料との差：見下ろし）。
      if (this.fpK < .5 && !this.u.naka && !this.overHold) {
        const c = camera.position, low = Math.max(W.heightAt(c.x, c.z) + 1.3, this.u.pos.y + 2.0);
        if (c.y > low) c.y = low;
      }
      // 地面を避けた最後の補正でも井楼の木組みの向こうへ出ない。
      // 共通の面の検査の回数を増やさず、小谷の固定した箱だけで確かめる。
      if (this.fpK < .5 && !this.u.naka) {
        cameraLook.copy(this.u.pos); cameraLook.y += 1.5;
        const hit = W.cameraBlockFraction?.(cameraLook, camera.position) ?? null;
        if (hit !== null) {
          camera.position.lerpVectors(cameraLook, camera.position, Math.max(.02, hit - .04));
          this.camPos.copy(camera.position);
          camera.lookAt(cameraLook);
        }
      }
      // 斜面の補正の後も上は空へ向ける。屋根の裏を逆さに映すほど真上を見上げない。
      camera.getWorldDirection(cameraDirection);
      let horizontal = Math.hypot(cameraDirection.x, cameraDirection.z);
      if (horizontal < .0001) {
        cameraDirection.x = Math.sin(this.yaw); cameraDirection.z = Math.cos(this.yaw); horizontal = 1;
      }
      // 通常は三十九度まで。切岸で視点が持ち上がった時は、胸を見る角度まで許す。
      // 向きだけ水平へ戻すと本人が画面の下へ消え、屋根と地面しか見えなくなる。
      const chestDistance = Math.hypot(camera.position.x - this.u.pos.x, camera.position.z - this.u.pos.z);
      const chestDown = Math.max(0, camera.position.y - this.u.pos.y - 1.2) / Math.max(.1, chestDistance);
      const down = this.fpK < .5 && !this.overHold && (this.overK || 0) < .1 ? Math.max(.8, chestDown) : 1.43;
      cameraDirection.y = Math.max(-horizontal * down, Math.min(horizontal * .65, cameraDirection.y));
      // 登り坂では坂の傾きに合わせて目線を上げ、斜面の上の段と空の境を画面に残す。
      if (this.fpK < .5 && !this.u.naka && !this.overHold) {
        const fx = cameraDirection.x / horizontal, fz = cameraDirection.z / horizontal, c = camera.position;
        const rise = (W.heightAt(c.x + fx * 14, c.z + fz * 14) - this.u.pos.y) / 14;
        if (rise > 0) cameraDirection.y = Math.max(cameraDirection.y, horizontal * Math.min(.3, rise * .6 - .1));
      }
      cameraLook.copy(camera.position).add(cameraDirection);
      camera.lookAt(cameraLook);
    };
    // この戦の身分による耐久差をなくす。遠景から引き継ぐ兵にも同じ物差しを使う。
    // 生成の時だけ行い、毎コマの全兵走査は加えない。
    const mortalBody = (u) => {
      if (!u.isStruct && !u.campProtected && (u.type === 'samurai' || u.type === 'busho')) u.hp = u.maxHp = 30;
    };
    const spawn = rt.army.spawn.bind(rt.army);
    rt.army.spawn = (...args) => {
      const us = spawn(...args);
      for (const u of us || []) mortalBody(u);
      return us;
    };
    // この城の小屋は板葺き。共通の小屋の形と材質を使う。
    const scenery = makeSimpleBatch();
    const addScenery = (...objects) => { for (const o of objects) if (o) rt.scene.add(o); };
    const boardHut = (world, x, z, w, d, rot = 0, o = {}) => {
      hut(world, x, z, w, d, rot, { ...o, ita: true, boardRoof: true, weatheredBoards: true, minka: false, groundedHome: true, batch: scenery });
    };
    const sceneryFence = (world, seg, residence = false) => {
      // 屋敷は写真の笠板付きの境塀。門の開口と既存の当たりは保ち、砦の杭柵と分ける。
      if (residence && true) castleBoardFence(world, seg,
        { batch: scenery, h: 2.1, plainBoards: true, boardCap: true, boardRailsSide: 1 });
      else palisade(world, seg, { batch: scenery });
    };
    // 写真の主殿に倣った低い切妻の薄板葺き。高画質だけに使い、床と戸口は保つ。
    const mountainHouse = (x, z, o) => goten(rt, x, z, { ...o, earth: 0xa38a61, tile: false, boardRoof: true, odaniBoards: true });
    F.step = 0; F.ek = 0; F.ak = 0; F.waitVelocity = { x: 0, z: 0 }; F.playerRoad = { x: 0, z: 0, s: 0, d: 0 };
    F.retreatPoint = { x: 0, z: 0 }; F.retreatRoad = { x: 0, z: 0, s: 0, d: 0 };
    F.guideRoad = { x: 0, z: 0, s: 0, d: 0 };
    F.walkTrail = Array.from({ length: 256 }, () => ({ x: 0, z: 0 }));
    F.walkHead = 0; F.walkCount = 0;
    // 独立した中央札は任務と重なる。危険の声を三枠へ収め、実際の退き方を伝える。
    rt.army.hooks.onArrowRain = (volley, under) => {
      if (!under || volley.team === rt.player.u.team || rt.t < 5 || rt.over || rt.ended) return;
      const until = rt.t + volley.T + .4;
      rt.hud.notices.push('▲ 矢が降る！ 道を外れず、味方のいる物陰へ退け', 110,
        Math.max(3, volley.T + .4), 'warn', () => !rt.over && !rt.ended && rt.player.u.alive && rt.t < until);
    };
    const bark = rt.bark.bind(rt), say = rt.say.bind(rt);
    const speech = (text, priority = false) => {
      if (text === '囲まれた！　味方のいる所まで下がれ') text = '囲まれた！　味方の旗へ退け';
      if (/槍が、重い/.test(text) && !(F.lastMeleeAt !== undefined && rt.t - F.lastMeleeAt < 35))
        text = text.replace('槍が、重い……', '足元を見て、登れ');
      // 下知と危険の知らせは、直前の遠い鉄砲の声で消さない。
      if (!priority && /矢|鉄砲|筒先|火縄|狙い撃ち|弾込め|装填|矢玉/.test(text)) {
        if (rt.t < (F.rangedNoticeAt || 0)) return '';
        F.rangedNoticeAt = rt.t + 30;
      }
      return text;
    };
    rt.bark = (text, warn) => { text = speech(text, !!warn); if (text) bark(text, warn); };
    rt.say = (who, text, ...args) => { text = speech(text, !!who); if (text) say(who, text, ...args); };
    F.buildTimes = {};
    if (typeof window !== 'undefined' && window.__loadTimes) window.__loadTimes['小谷の組み立て'] = F.buildTimes;
    let buildT = performance.now();
    const stampBuild = (name) => { const now = performance.now(); F.buildTimes[name] = Math.round(now - buildT); buildT = now; };
    rt.banner('夜の小谷城へ', '尾根の真ん中、京極丸を奪って城を二つに断つ');
    // ---- 主尾根の梯郭：塀・門・櫓は castle_plan.js に建てさせる（castles/odani.js の縄張り） ----
    flReset();
    const castleStart = rt.scene.children.length;
    const C = F.C = buildCastlePlan(rt, ODANI_PLAN, { life: false, perch: false, ladders: true, baseHeight: baseTerrain, edgeW: 4.8, skipWalls: UPPER.map((k) => k.id), buildGates: true, buildTowers: true, team: 1, measure: F.buildTimes });
    const lookout = C.towers.find(t => t.id === 'monomi_kyo')?.naka;
    if (lookout) lookout.entryApproach = { x: LOOKOUT_WAY[0][0], z: LOOKOUT_WAY[0][1] + .8 };
    F.kyoLookoutGuards = new Set();
    for (const g of lookout?.guards || []) for (const u of g.units) F.kyoLookoutGuards.add(u);
    // 四本の柱だけでは横木の内へ入れてしまう。梯子の足元は外に残し、
    // 床へ登った後は通す。この戦の櫓だけに、既存の箱の当たりを足す。
    for (const tower of C.towers) if (tower.naka) {
      const I = tower.naka;
      solidRect(I.x, I.z, 3.4, 3.4, I.rot, I.levels[0].y - .15);
    }
    stampBuild('縄張り全体');
    // 外の大手と本丸は閉じる。城内の連絡用の木戸だけ開く。
    for (const wall of C.walls) if (wall?.seg) {
      wall.noTarget = true; wall.wall = true;
      // 外階段が塀の上へ出ても、地上の線の当たりが無限の高さで残っていた。
      const [ax, az, bx, bz] = wall.seg;
      wall.yTop = Math.max(W.heightAt(ax, az), W.heightAt(bx, bz), W.heightAt((ax + bx) / 2, (az + bz) / 2)) + 3.2;
    }
    for (const [id, g] of Object.entries(C.gateObjs || {})) {
      if (!g?.struct) continue;
      if (g.naka) g.struct.yTop = W.heightAt(g.struct.x, g.struct.z) + 3;
      if (['g_naka_s', 'g_naka_kyo', 'g_kyo_koma', 'g_koma_sanno'].includes(id)) {
        g.struct.opened = true; g.open?.();
      }
    }
    F.westGate = C.gateObjs.g_west;
    // 枡形の三方の土塀と二の門。塀は壊せない（越えられない）。二の門は先手の掛矢で破る。
    for (const [a0, b0, a1, b1] of [[-MASU.hs, -MASU.hs, -MASU.hs, MASU.hs], [-MASU.hs, MASU.hs, MASU.hs, MASU.hs], [MASU.hs, MASU.hs, MASU.hs, 1.6]]) {
      const line = dobeiLine(rt, [MASU.P2(a0, b0), MASU.P2(a1, b1)], { team: 1, name: '枡形の塀', hp: 99999 });
      for (const w of line.structs) { w.noTarget = true; w.wall = true; }
    }
    F.innerGate = kabukiGate(rt, MASU.ix, MASU.iz, MASU.M.w2, MASU.inRot, { team: 1, hp: 220, gate: 1, yakui: true, roof: true });
    F.innerGate.struct.name = '枡形の二の門';
    (W.koguchiAreas || (W.koguchiAreas = [])).push({ x: MASU.cx, z: MASU.cz, px: MASU.px, pz: MASU.pz, ux: MASU.ux, uz: MASU.uz, half: MASU.hs, team: 1 });
    if (F.westGate?.struct) F.westGate.struct.name = '西木戸';
    // 一戦を四〜七分に：夜の谷を登った後の木戸で二分以上止めない（掛矢の打ち手と斬り合いは保つ）。
    if (F.westGate?.struct) { const g = F.westGate.struct; g.maxHp = Math.round((g.maxHp || g.hp) * 0.55); g.hp = Math.min(g.hp, g.maxHp); }
    // 共通の閂は独立した横棒。西木戸だけ扉の裏へ密着させ、顔の高さを空ける。
    // 開門・破壊時に外す仕組みは、そのまま元の部品を使う。
    const westBar = F.westGate?.door.children.find((m) => m.isMesh);
    if (westBar) {
      westBar.position.set(0, .72, -.12);
      westBar.material = new THREE.MeshLambertMaterial({ color: 0x51412f });
    }
    // 小さな段の低い石積みと黒金御門の石組み。上段は専用の復元で建てる。
    {
      const side = (k, which, o = {}) => {
        const x0 = k.x - k.hw - 0.6, x1 = k.x + k.hw + 0.6;
        const pts = which === 's' ? [[x0 + 3, k.z1 + 0.6], [-3.4, k.z1 + 0.6]] : which === 's2' ? [[3.4, k.z1 + 0.6], [x1 - 3, k.z1 + 0.6]]
          : which === 'w' ? [[x0, k.z1 - 3], [x0, k.z0 + 3]] : [[x1, k.z0 + 3], [x1, k.z1 - 3]];
        rt.scene.add(ishigaki(W, pts, { topY: k.level + (o.top ?? 1.3), minH: o.h || 3.2, maxH: (o.h || 3.2) + (o.extra ?? 3), lean: 0.18, out: which === 'w' || which === 'e' ? -1 : 1, big: 1.5, noKit: true }));
      };
      // 小さな段の境だけ低い石を積む。中央の道と門の幅は残す。
      for (const k of [BANSHO, OCHAYA]) for (const face of ['s', 's2']) side(k, face, { h: 0.7, top: 0.25, extra: 0.4 });
      rt.scene.add(ishigaki(W, [[-4.2, GATE_KURO.z + 3], [-9, GATE_KURO.z + 3]], { topY: OOHIROMA.level, minH: 3.5, maxH: 3.5, noKit: true }));
      rt.scene.add(ishigaki(W, [[4.2, GATE_KURO.z + 3], [9, GATE_KURO.z + 3]], { topY: OOHIROMA.level, minH: 3.5, maxH: 3.5, noKit: true }));
    }
    dressOdaniCastle(rt, C);
    // 上段の石垣・土塀・社殿を残し、同じ坂に石段を重ねない。
    buildOdaniUpper(rt, RAMPS);
    buildOdaniFukugen(rt, RAMPS.filter((r) => r.a[0] !== 0 || r.b[0] !== 0 || r.a[1] > NAKAMARU.z0 + 3), STONE_KURUWA);
    addOdaniSteps(rt);
    addOdaniTrail(rt);
    dressSlope(W, { x0: -135, x1: -30, z0: -100, z1: 165, rocks: 150, tufts: 360, buryRim: true,
      allow: (x, z) => {
        const d = alongLine(CLIMB, x, z).d;
        return d > 7 && d < 29 && !odaniExtraClear(x, z)
          && !ODANI_PLAN.kuruwa.some(k => inPoly(k.poly, x, z));
      } });
    addOdaniView(rt);
    // ---- 曲輪の中の建物 ----
    // 本丸：長政の御殿（天守は無い）。大広間：大きな建物。中丸・京極丸・小丸：陣屋と篝火
    // 御殿の中へ入れる作りを残し、建物を西へ寄せて尾根の道を空ける。
    const ridgeHuts = makeSimpleBatch();
    const ridgeHut = (x, z, w, d, rot = 0, o = {}) => hut(W, x, z, w, d, rot, { ...o, ita: true, boardRoof: true, weatheredBoards: true, minka: false, groundedHome: true, batch: ridgeHuts });
    F.honHouse = mountainHouse(HON.x - 7.2, HON.cz - 4, { team: 1, w: 8, d: 7, tile: false, name: '本丸の御殿', naka: true, profile: 'odani_hon', oku: 0.48 }).naka;
    F.komaHouse = mountainHouse(KOM.x - 5.4, KOM.z0 + 4.5, { team: 1, w: 5, d: 4.5, tile: false, name: '小丸の館', naka: true }).naka;
    // 間取り・調度は推定復元。主尾根の道を空け、南の縁側から広間へ入る。
    F.hiromaHouse = mountainHouse(OOHIROMA.x - 9, OOHIROMA.cz - 6, { team: 1, w: 12, d: 8, tile: false, name: '大広間', naka: true, profile: 'odani_hall', oku: .3 }).naka;
    ridgeHut(OOHIROMA.x + 9, OOHIROMA.cz + 8, 6, 5, 0.1);
    if (S.quality === 'high') {
      // 保存管理計画表7・30頁：大広間の北西隅に蔵跡、北西限に東西8m・南北6mの敷石。
      // https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
      // 建物の姿・寸法と両者の細かな位置は推定。中央の道、広間、守備兵の持ち場を空ける。
      const x = OOHIROMA.x - OOHIROMA.hw + 7, z = OOHIROMA.z0 + 7;
      ridgeHut(x, z + 11, 5, 6, 0, { wall: 0x82715b });
      // 敷石は低く埋めた自然石。形と材質を共有し、組み立て時だけ一つの束へ置く。
      const paving = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshLambertMaterial({ color: 0x827b69 }), 48);
      const pose = new THREE.Object3D();
      for (let i = 0; i < 48; i++) {
        pose.position.set(x - 3.5 + i % 8, OOHIROMA.level + .025, z - 2.5 + Math.floor(i / 8));
        pose.scale.set(.94 + i % 3 * .015, .08, .95 + i % 2 * .025);
        pose.updateMatrix(); paving.setMatrixAt(i, pose.matrix);
      }
      paving.instanceMatrix.needsUpdate = true; paving.receiveShadow = true;
      rt.scene.add(paving);
    }
    // 京極丸の真ん中を空け、北東の物見櫓から離して館を南東へ。小丸の館と櫓も別の側へ置く。
    F.kyoHouse = mountainHouse(KYO.x + 10, KYO.z1 - 10, { team: 1, w: 6, d: 5, tile: false, name: '京極丸の館', naka: true, profile: 'odani_kyogoku', oku: .32 }).naka;
    ridgeHut(NAKAMARU.x - 6, NAKAMARU.cz, 5, 4, 0, { wall: 0x5e4a34 });
    // 山王丸の番所と社殿は上段の復元で建て、道と坂を空ける。
    ridgeHut(SAKURABABA.x + 5.5, SAKURABABA.cz, 5, 5, -0.1);
    if (true) addOdaniStable(rt);
    else ridgeHut(ONMAYA.x + 6, ONMAYA.cz - 2, 5, 14, 0, { wall: 0x5a4a34 });
    rt.scene.add(umatsunagi(W, ONMAYA.x - 6, ONMAYA.cz - 7, 0, 6));
    ridgeHut(OCHAYA.x + 5.8, OCHAYA.cz, 4.5, 5, 0, { wall: 0x6a5238 });
    ridgeHut(BANSHO.x + 4.8, BANSHO.cz, 3.4, 3.6, 0, { wall: 0x4a3a2a });
    if (S.quality === 'high') {
      // 保存管理計画表7・31頁：京極丸の主曲輪の東側には高さ約三メートルの土塁。
      // https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
      // 長さ・幅・縮めた曲輪内での位置は推定。館、物見、南北の口と乱戦の場を避ける。
      // 地面側に高さ三メートルの土塁がある。さらに三メートル積まず、同じ法面の土肌だけ描く。
      // dorui の天端は始点から法線と逆へ三十センチ。地面の頂部へ合わせ、内側三メートルを覆う。
      // 当たりは既存の地面を使い、材質と建物の束も共用する。初期化時だけ組む。
      const x = KYO.x + KYO.hw - .3;
      const earth = dorui(W, [x, KYO.z0 + 5, x, KYO.z1 - 5], -1, 0,
        { batch: ridgeHuts, w: 3, surfaceOnly: true, bareSoil: true });
      if (!earth.isBatchedPart) rt.scene.add(earth);
    }
    if (S.quality === 'high') {
      // 保存管理計画表7・30頁：御茶屋は郭の中央を低い土塁で二分する。
      // https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
      // 向き・高さ・開口は推定。館の南へ寄せ、中央の尾根道と南の乱戦は空ける。
      // 既存の土の材質と建物の束を使い、初期化時だけ組み立てる。
      const k = OCHAYA, z = k.cz + 6;
      for (const [ax, bx] of [[k.x - k.hw + 1, k.x - 3.6], [k.x + 3.6, k.x + k.hw - 1]]) {
        const earth = dorui(W, [ax, z, bx, z], 0, 1,
          { batch: ridgeHuts, w: 1.3, h: .55, bareSoil: true, capEnds: true, closeBack: true });
        if (!earth.isBatchedPart) rt.scene.add(earth);
      }
    }
    if (S.quality === 'high') {
      // 保存管理計画表7・30頁、表13・71頁：番所の登城道側には礫の土塁と石塁の痕跡がある。
      // https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
      // 北辺の三メートルの石垣は根拠がなく、odani_fukugen.js の低い土の堤と重なっていたため描かない。
      // 東の石塁の位置・開口幅・高さは推定。中央の尾根道と南の攻防を空け、既存の石の束を使う。
      // 北辺の堤・木戸・兵の持ち場と通行の当たりは保つ。
      const k = BANSHO, east = k.x + k.hw - .4;
      for (const [az, bz] of [[k.z0 + 3, k.cz - 2.5], [k.cz + 2.5, k.z1 - 3]]) {
        const stone = ishigaki(W, [[east, az], [east, bz]],
          { batch: ridgeHuts, topY: k.level + .8, minH: 1.2, maxH: 1.6, out: -1, noKit: true });
        if (!stone.isBatchedPart) rt.scene.add(stone);
      }
    }
    if (S.quality === 'high') {
      // 保存管理計画表7・30頁：番所の西側は、谷筋を固める弓状の土塁。
      // https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
      // 平場の内側で西へ張る弧を補う。高さ・幅は推定で、中央の道と南北の口は空ける。
      // 既存の土の材質と館の束へ初期化時だけ加え、兵の持ち場と通行の当たりは変えない。
      const k = BANSHO, points = [[k.x - 4.5, k.z0 + 3], [k.x - 6.4, k.cz - 3],
        [k.x - 6.4, k.cz + 3], [k.x - 4.5, k.z1 - 3]];
      for (let i = 1; i < points.length; i++) {
        const [ax, az] = points[i - 1], [bx, bz] = points[i];
        const length = Math.hypot(bx - ax, bz - az);
        const earth = dorui(W, [ax, az, bx, bz], -(bz - az) / length, (bx - ax) / length,
          { batch: ridgeHuts, w: 1.4, h: 1.1, bareSoil: true, capEnds: true, closeBack: true });
        if (!earth.isBatchedPart) rt.scene.add(earth);
      }
    }
    finalizeSimpleBatch(rt, ridgeHuts);
    // 小丸の南東は門から開く隊列と退き道。俵は北東の隅へ寄せる。
    rt.scene.add(tawara(W, KYO.x + 14, KYO.z1 - 3, 0.3, 5), tawara(W, KOM.x + 6, KOM.z0 + 4, -0.2, 5));
    // 馬洗池は南北9m・東西6.6m。御馬屋の北東虎口の外へ置き、中央の尾根道を空ける。
    // 出典：長浜市『史跡小谷城跡保存管理計画書』（2014）表7・30頁。
    // https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
    const pondWater = new THREE.MeshStandardMaterial({ color: 0x2c3a36, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.9 });
    {
      const { x, z, w, d } = UMAARAI, y = ONMAYA.level;
      const water = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.6, d - 0.6), pondWater);
      water.rotation.x = -Math.PI / 2; water.position.set(x, y + 0.04, z); rt.scene.add(water);
      // 表7は四方を小礫の石積みとする。高画質では城壁並みの大石を小さな石へ改める。
      // 石の大きさ・水位は推定。外周と仕切りを同じ束へまとめ、毎コマの処理は足さない。
      const db = makeSimpleBatch();
      const pondStone = (pts, topY) => {
        const stone = ishigaki(W, pts, { batch: db, topY, minH: .4, maxH: .5, lean: 0, out: -1,
          noKit: true, big: S.quality === 'high' ? .45 : 1.5 });
        if (!stone.isBatchedPart) rt.scene.add(stone);
      };
      pondStone([[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x + w / 2, z + d / 2], [x - w / 2, z + d / 2], [x - w / 2, z - d / 2]], y + .35);
      // 記録にある中央東寄りの仕切り。細かな位置と高さは復元。同じ石積みの形と材質を使う。
      pondStone([[x + 1, z - d / 2 + .3], [x + 1, z + d / 2 - .3]], y + .2);
      finalizeSimpleBatch(rt, db);
    }
    if (S.quality === 'high') {
      // 刀洗い池は庭園の丸池にせず、岩盤の浅い窪みと約五十センチの側石で描く。
      // https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
      // 水面は馬洗池の材質を共有し、石は既存の石積みの束へまとめる。組み立て時だけ。
      const { x, z, w, d } = KATANA_POND;
      W.heightAt(x, z);
      const y = KATANA_POND.level, water = new THREE.Mesh(new THREE.PlaneGeometry(w - .3, d - .3), pondWater);
      water.rotation.x = -Math.PI / 2; water.position.set(x, y - .12, z);
      const db = makeSimpleBatch();
      const stone = ishigaki(W, [[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x + w / 2, z + d / 2], [x - w / 2, z + d / 2], [x - w / 2, z - d / 2]],
        { batch: db, topY: y + .05, minH: .5, maxH: .5, lean: 0, out: -1, noKit: true, big: 1.5 });
      if (!stone.isBatchedPart) rt.scene.add(stone);
      finalizeSimpleBatch(rt, db);
      rt.scene.add(water);
    }
    if (S.quality === 'high') {
      // 大広間の水の手。井戸と接続溝の石は既存の形・材質の束へまとめ、初期化時だけ作る。
      // https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf （表7）
      const { x, z, w, d, depth } = HIROMA_WELL, y = OOHIROMA.level;
      const db = makeSimpleBatch(), east = x + w / 2, west = x - w / 2;
      const stoneLine = (pts, h) => {
        const m = ishigaki(W, pts, { batch: db, topY: y + .04, minH: h, maxH: h, lean: 0, out: -1, noKit: true, big: .45 });
        if (!m.isBatchedPart) rt.scene.add(m);
      };
      // 東辺だけ溝の口を空ける。丸い深井戸や屋根付きの釣瓶にはしない。
      stoneLine([[east, z - .3], [east, z - d / 2], [west, z - d / 2], [west, z + d / 2], [east, z + d / 2], [east, z + .3]], depth);
      for (const side of [-1, 1]) stoneLine([[east, z + side * .3], [HIROMA_DRAIN_END, z + side * .3]], .25);
      finalizeSimpleBatch(rt, db);
    }
    // 御殿の庭石と松は推定の添景。根拠のない二つの丸池は置かず、記録のある谷の池を描く。
    // 池の北岸・島の石も同じ形と材質を使い、一度だけ組み立てる。
    {
      const gardens = [[6.5, HON.cz + 3, HON.level], [7.5, OOHIROMA.cz - 7, OOHIROMA.level]];
      const waterGeo = new THREE.PlaneGeometry(14, 5);
      waterGeo.rotateX(-Math.PI / 2);
      const water = new THREE.Mesh(waterGeo, new THREE.MeshStandardMaterial({ color: 0x416450, roughness: 0.25 }));
      const garden = TEMPLE_GARDEN;
      W.heightAt(garden.x, garden.z);
      water.position.set(garden.x, garden.level - .06, garden.z);
      const stone = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x77766a }), S.quality === 'high' ? 62 : 46);
      const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.1, .17, 1, 6), new THREE.MeshLambertMaterial({ color: 0x66513a }), 6);
      const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0x34552c }), 8);
      const pose = new THREE.Object3D();
      const put = (mesh, i, x, y, z, sx, sy, sz, tilt = 0) => { pose.position.set(x, y, z); pose.scale.set(sx, sy, sz); pose.rotation.set(0, i * .6, tilt); pose.updateMatrix(); mesh.setMatrixAt(i, pose.matrix); };
      gardens.forEach(([x, z, y], g) => {
        for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; put(stone, g * 6 + i, x + Math.cos(a) * 2.25, y + .18, z + Math.sin(a) * 1.7, .42, .3 + i % 2 * .15, .35); }
        const px = x + 2.8, pz = z - 2.5;
        put(trunks, g * 3, px, y + 1.7, pz, 1, 3.4, 1, -.15);
        for (let i = 0; i < 2; i++) put(trunks, g * 3 + i + 1, px + (i ? -.7 : .8), y + 2.5 + i * .6, pz, .65, 1.8, .65, i ? .9 : -.9);
        for (let i = 0; i < 4; i++) put(crowns, g * 4 + i, px + (i % 2 ? -1 : 1) * .7, y + 2.4 + i * .4, pz + (i % 2) * .4, 1.25, .38, 1);
      });
      for (let i = 0; i < 14; i++) put(stone, 12 + i, garden.x - 6.5 + i, garden.level, garden.z - 2.5, .55, .22, .35);
      for (let i = 0; i < 12; i++) {
        const side = i % 4, t = Math.floor(i / 4) / 3;
        const x = side === 0 ? -2.5 + t * 5 : side === 1 ? 2.5 : side === 2 ? 2.5 - t * 5 : -2.5;
        const z = side === 0 ? -1.75 : side === 1 ? -1.75 + t * 3.5 : side === 2 ? 1.75 : 1.75 - t * 3.5;
        put(stone, 26 + i, garden.x + x, garden.level - .03, garden.z - .6 + z, .48, .23, .35);
      }
      // 保存管理計画85頁：島状遺構の東側に円形の石組み。径と石数・当夜の姿は推定。
      // 既存の石の束に八個を足し、池の外の道や戦う兵の持ち場は保つ。
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        put(stone, 38 + i, garden.x + 3.7 + Math.cos(a) * .7, garden.level - .02,
          garden.z - .6 + Math.sin(a) * .7, .28, .2, .25);
      }
      if (S.quality === 'high') {
        // 保存管理計画表7・30頁：御茶屋の奥には庭石、黒金門の手前には首据石がある。
        // https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
        // 形・寸法・細かな位置は推定。尾根道の西へ寄せ、館と門の幅を空ける。
        // 石は庭の既存の形・材質に二つ足すだけ。戦う兵や毎コマの処理は増やさない。
        const tx = OCHAYA.x - 5.8, tz = OCHAYA.z0 + 4;
        put(stone, 46, tx, W.heightAt(tx, tz) + .35, tz, 1.05, .7, .85, -.15);
        const kx = GATE_KURO.x - 6.5, kz = GATE_KURO.z + 6;
        put(stone, 47, kx, W.heightAt(kx, kz) + .55, kz, 1.5, 1.05, 1.15, .12);
        // 保存管理計画表7・30頁：桜馬場の西側の曲輪には建物の礎石が確認されている。
        // 柱間・石数・細かな位置と当夜の建物の有無は不明。礎石だけを推定で補う。
        // 中央の尾根道と東の建物を避け、低く埋めた石を既存の形・材質の束へ加える。
        for (let i = 0; i < 12; i++) {
          const x = SAKURABABA.x - 5.6 + (i % 3 - 1) * 1.8;
          const z = SAKURABABA.cz + (Math.floor(i / 3) - 1.5) * 1.8;
          put(stone, 48 + i, x, W.heightAt(x, z) + .025, z, .36, .09, .33);
        }
        // 保存管理計画表7・34頁：清水谷の蛙岩。庭石と同じ形・材質・描画の束を使う。
        // https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
        // 二つの石の膨らみで大岩を表す。輪郭は推定で、目や足などは付けない。
        // 形の上下端から倍率を求め、地面から頂部までを記録の約五メートルに合わせる。
        const rock = KAERU_ROCK, ground = W.heightAt(rock.x, rock.z);
        stone.geometry.computeBoundingBox();
        const bounds = stone.geometry.boundingBox, span = bounds.max.y - bounds.min.y;
        const bodyH = rock.h * .86, headH = rock.h * .48;
        put(stone, 60, rock.x, ground - bounds.min.y * bodyH / span, rock.z,
          3.2, bodyH / span, 2.6);
        put(stone, 61, rock.x + 1.4, ground + rock.h - bounds.max.y * headH / span, rock.z - .4,
          2.1, headH / span, 1.8);
        // 谷道の外だけに当たりを置く。味方の列・待ち伏せ・登りの印には重ねない。
        solidRect(rock.x + .5, rock.z, 8, 6);
      }
      rt.scene.add(water, stone, trunks, crowns);
    }
    // 浅井の旗：本丸と小丸に馬印（大将の居場所。長政・久政は建物の奥にいて、前には出ない）
    F.flagsKom = []; F.flagsHon = [];
    for (const [x, z, h] of [[HON.x - 9, HON.z1 - 4, 6], [HON.x + 6, HON.cz - 9, 7], [KOM.x - 6, KOM.cz, 6], [KOM.x + 6, KOM.z0 + 3, 7], [SANNO.x - 4, SANNO.cz, 6], [OOHIROMA.x - 10, OOHIROMA.cz, 6], [NAKAMARU.x + 6, NAKAMARU.cz, 5], [KYO.x - 12, KYO.z0 + 2, 6], [KYO.x - 12, KYO.z1 - 2, 6]]) {
      const n2 = nobori(W, x, z, 'azai', h); rt.scene.add(n2);
      if (z < KOM.z1 + 1 && z > KOM.z0 - 1) F.flagsKom.push(n2);
      if (z <= HON.z1 && z >= HON.z0) F.flagsHon.push(n2);
      if (z < KYO.z1 && z > KYO.z0) (F.flagsKyo = F.flagsKyo || []).push(n2);
    }
    for (const [x, z] of [[HON.x + 4, HON.z0 + 3], [KOM.x + 4, KOM.z1 - 2], [KYO.x - 2, KYO.cz + 3], [NAKAMARU.x + 2, NAKAMARU.z1 - 2], [SANNO.x + 4, SANNO.z1 - 4], [OOHIROMA.x - 4, OOHIROMA.z0 + 4]]) { rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.3, size: .55 }); }
    addOdaniNight(rt);
    addRidgeGlow(rt);
    addTrailRails(rt);
    stampBuild('曲輪の館');
    // ---- 城に詰める浅井勢（軽い作り）：本丸の塀の内に外を向いて構える者、大広間・山王丸・中丸の兵 ----
    {
      const crew = [];
      for (let i = 0; i < 18; i++) {
        const t = i / 17, x = HON.x - HON.hw + 1.5 + t * (HON.hw * 2 - 3);
        crew.push({ x, z: HON.z1 - 1.5, k: ['gun', 'spear', 'bow', 'spear'][i % 4], facing: 0 });
        if (i % 3 === 0) crew.push({ x, z: HON.z0 + 1.5, k: ['gun', 'spear'][i % 2], facing: Math.PI });
      }
      const cr = W.addDistantArmy({ people: crew, armor: AZ_ARMOR, team: 1, flagTex: flagTexture('azai'), seed: 15737 });
      // 近づいた時は同じ場所で実兵へ引き継ぎ、塀の内の持ち場を守る。
    }
    // 11/5（AV4・AA）：軽い軍勢は見えない・届かない囲みと大広間だけ。近づいても本物へ替えない（替わる兵で 250 の枠を使わず、谷の木戸・京極丸の本物へ回す）。
    const DA = (x, z, w, d, count, facing, armor, flag, seed, team) => {
      const g = W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), mon: flag, kind: 'spear', yose: false, host: false, seed, ...(team != null ? { team } : {}) });
      if (g?.army) g.army.noWake = true;
      return g;
    };
    F.azHon = DA(OOHIROMA.x, OOHIROMA.cz, 22, 18, 72, 0, AZ_ARMOR, 'azai', 15736, 1);
    // 清水谷の木戸（推定）と、その前に構える浅井の一手（軽い作り。本物の兵は増やさない）。
    // 谷口から見上げる25秒の画面の真ん中（40〜50m先・近い霧の手前）に、門と敵の群れが先に見える（10/29 点付け：城の門と浅井の群れが写らない）。
    // 門は居館の南の土塁の角で谷道に開いた薬医門。脇の板塀は左右へ六歩ずつ（当たりを付け、兵が塀を抜けない）。
    // 一手は居館の番兵の後ろに詰め、番兵が崩れるか寄せ手が24歩まで来ると門の内へ退き、崩れて去る。
    {
      const tz = 24, tx = SHIMIZU[2][0] + (SHIMIZU[2][1] - tz) / (SHIMIZU[2][1] - SHIMIZU[3][1]) * (SHIMIZU[3][0] - SHIMIZU[2][0]);
      rt.scene.add(kabukimon(W, tx, tz, 6, 0, { yakui: true }));
      for (const [ax, bx] of [[tx - 3.6, tx - 10], [tx + 3.6, tx + 10]]) {
        rt.scene.add(castleBoardFence(W, [ax, tz, bx, tz]));
        solidSeg(ax, tz, bx, tz, 0.15);
      }
      rt.scene.add(nobori(W, tx - 4.6, tz - 1.5, 'azai', 6), nobori(W, tx + 4.6, tz - 1.5, 'azai', 6));
      // 11/5（AV4・AA）：門の前の軽い一手（64・48）は谷道から近づけて本物へ替わったので置かない。その分、谷の番兵を本物で厚くした。
      // 谷の西の家臣屋敷（YASHIKI の五つ目）の木戸口にも門を建て、その前に一手を置く。25秒の画面が谷の上でも西の斜面でも、門と群れが写る。
      const [yx, yz, yr] = YASHIKI[4], ex = yx + Math.tan(yr) * 5;
      rt.scene.add(kabukimon(W, ex, yz + 5, 3.4, 0, { yakui: true }), nobori(W, ex + 3, yz + 6, 'azai', 6));
    }
    // 山王丸は初めからいる実兵の控えで描く。任務の守りへ別の遠景兵を重ねない。
    // ---- 清水谷（主尾根の西の谷）：浅井の居館・家臣の屋敷・寺・倉・厩。谷底に道、両側に山、上に主尾根の城 ----
    {
      const db = makeSimpleBatch();
      // 居館：土塁で四方を囲み、谷の道へ向いて門（冠木門）。中に主屋と台所・蔵
      const kx = KYOKAN.x, kz = KYOKAN.z, hw = 13, hd = 10;
      const sides = [[kx - hw, kz - hd, kx + hw, kz - hd, 0, -1], [kx + hw, kz - hd, kx + hw, kz + hd, 1, 0], [kx + hw, kz + hd, kx - hw, kz + hd, 0, 1]];
      for (const [ax, az, bx, bz, nx, nz] of sides) { const d = dorui(W, [ax, az, bx, bz], nx, nz, { batch: db, w: 2.4, h: 1.1 }); if (!d.isBatchedPart) rt.scene.add(d); }
      for (const [az, bz] of [[kz - hd, kz - 3.4], [kz + 3.4, kz + hd]]) { const d = dorui(W, [kx - hw, az, kx - hw, bz], -1, 0, { batch: db, w: 2.4, h: 1.1 }); if (!d.isBatchedPart) rt.scene.add(d); }
      finalizeSimpleBatch(rt, db);
      rt.scene.add(kabukimon(W, kx - hw, kz, 6, Math.PI / 2));
      // 長浜市保存管理計画（29頁）は、元亀元年・三年の攻撃で谷の屋敷が落ちたとする。
      // 当夜に焼き始めた家ではなく、低い礎と焼け残った柱で旧居館・家臣屋敷を示す。
      // 焼損の形は推定。形・材質・行列の入れ物は全棟で共用し、初期化時だけ組む。
      const ruinGeo = new THREE.BoxGeometry(1, 1, 1);
      const ruinMatrices = [];
      const ruinPose = new THREE.Object3D();
      const ruinedHouse = (x, z, w, d, rot = 0) => {
        const c = Math.cos(rot), s = Math.sin(rot);
        const part = (lx, lz, bw, bh, bd, turn = 0) => {
          const px = x + lx * c + lz * s, pz = z - lx * s + lz * c;
          // 柱は根元を接地。倒れた長い材は短く分け、両端を坂へ沿わせる。
          // 中心の高さだけで水平に置くと、焼け跡が空中の黒い枠になる。
          if (bh > Math.max(bw, bd)) {
            ruinPose.position.set(px, W.heightAt(px, pz) + bh / 2 - .04, pz);
            ruinPose.rotation.set(0, rot + turn, 0);
            ruinPose.scale.set(bw, bh, bd); ruinPose.updateMatrix();
            ruinMatrices.push(ruinPose.matrix.clone());
            return;
          }
          const angle = rot + turn + (bd > bw ? Math.PI / 2 : 0);
          const len = Math.max(bw, bd), width = Math.min(bw, bd), n = Math.ceil(len / 1.2);
          const dx = Math.cos(angle), dz = -Math.sin(angle), span = len / n;
          for (let i = 0; i < n; i++) {
            const a = -len / 2 + i * span, b = a + span;
            const ha = W.heightAt(px + dx * a, pz + dz * a), hb = W.heightAt(px + dx * b, pz + dz * b);
            ruinPose.position.set(px + dx * (a + b) / 2, (ha + hb + bh) / 2 - .04, pz + dz * (a + b) / 2);
            ruinPose.rotation.set(0, angle, Math.atan2(hb - ha, span));
            ruinPose.scale.set(Math.hypot(span, hb - ha) + .01, bh, width); ruinPose.updateMatrix();
            ruinMatrices.push(ruinPose.matrix.clone());
          }
        };
        part(0, -d / 2, w, .22, .3); part(0, d / 2, w, .22, .3);
        part(-w / 2, 0, .3, .22, d); part(w / 2, 0, .3, .22, d);
        for (let i = 0; i < 6; i++) part((i % 3 - 1) * w * .42, i < 3 ? -d * .42 : d * .42, .22, .7 + (i % 3) * .45, .22);
        for (let i = 0; i < 4; i++) part((i % 2 ? 1 : -1) * w * .18, (i - 1.5) * d * .18, w * .55, .18, .24, (i - 1.5) * .3);
      };
      ruinedHouse(kx - 2, kz - 3, 14, 7);
      ruinedHouse(kx + 8, kz + 3, 5, 4, .1);
      ruinedHouse(kx - 9, kz + 4, 5, 4, -.1);
      // 寺（谷の口の寺。名は出さない＝GAME_C）
      // 堂の形は推定復元。戸口を谷道へ向け、格天井・板敷きの外陣・須弥壇の内陣を作る。
      const valleyTemple = new Garan(rt);
      valleyTemple.build({ id: 'odani_valley_hondo', name: TERA.name, kind: 'hondo', x: TERA.x, z: TERA.z,
        w: 9, d: 7, rot: Math.PI / 2 + .2, h: 3.4, enterable: true });
      valleyTemple.finish();
      addScenery(boardHut(W, TERA.x + 2, TERA.z - 12, 6, 4, 0.2, { wall: 0x7a5a3c }));
      // 谷口の村。田はその南に並び、番所への登り道は東側を通る。
      // 草葺きは棟と二枚の屋根面が見える共通の形を使い、外の民家素材へ置き換えない。
      for (const [x, z, r] of VILLAGE) hut(W, x, z, 6, 4.5, r, { minka: false, batch: scenery });
      // 家臣の屋敷：道の両側に、塀（柵）の囲いと屋敷
      YASHIKI.forEach(([x, z, r], i) => {
        if (inSiege(x, z, 3)) return;   // 出曲輪の縄張りの内の屋敷は、曲輪の普請で払った
        ruinedHouse(x, z, 7 + (i % 3), 5, r);
        if (i % 2 === 0) {
          // 回した戸口から庭の外へまっすぐ出られる木戸口。柵で玄関の前を塞がない。
          const entryX = x + Math.tan(r) * 5;
          sceneryFence(W, [x - 6, z + 5, entryX - 1.8, z + 5]);
          sceneryFence(W, [entryX + 1.8, z + 5, x + 6, z + 5]);
        }
      });
      rt.scene.add(umatsunagi(W, KYOKAN.x - 18, KYOKAN.z - 12, 1.4, 6), valleyTimber(W, KYOKAN.x - 17, KYOKAN.z + 12, 0.4));
      // 過年の焼損跡に今も燃える火は置かない。民は兵や当夜の火が迫った時に避難する。
      const ruins = new THREE.InstancedMesh(ruinGeo, new THREE.MeshLambertMaterial({ color: 0x302a23 }), ruinMatrices.length);
      for (let i = 0; i < ruinMatrices.length; i++) ruins.setMatrixAt(i, ruinMatrices[i]);
      ruins.instanceMatrix.needsUpdate = true;
      ruins.computeBoundingSphere(); rt.scene.add(ruins);
    }
    stampBuild('清水谷の建物と遠景');
    F.K = addOdaniSiege(rt);
    stampBuild('清水谷の出曲輪');
    // ---- 防御帯：堀切・竪堀（縄張りの高さと当たり）／食い違い虎口（西の口の外）／隠し銃座／大野木屋敷・赤尾屋敷 ----
    {
      const kb = makeSimpleBatch();
      // 狭い裾に三メートル超を立てると直立壁に見える。小谷の復元だけ、裾のある低い土の堤にする。
      // 食い違いの位置と折れ道は保ち、弾よけの高さ・通れない幅も同じ形から作る。
      if (S.quality === 'high') {
        // 保存管理計画表7・31頁：本丸東部斜面には腰曲輪を遮断する大土塁がある。
        // https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
        // 縮めた地形での位置・長さ・高さは推定。本丸の東下、赤尾屋敷の北へ補う。
        // 尾根道・屋敷の木戸・京極丸の乱戦から離し、同じ土の材質と束へ加える。
        const z = HON.z0 + 5;
        rt.scene.add(takaDorui(W, [HON.x + HON.hw + 3, z, HON.x + HON.hw + 10, z],
          { batch: kb, w: 2, h: 2, capEnds: true }));
      }
      if (S.quality === 'high') {
        // 保存管理計画表7・31頁：本丸の北西斜面には石垣を用いた土塁がある。
        // https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
        // 位置・向き・寸法は推定。本丸の西下に置き、大堀切と土橋、清水谷の攻め道を空ける。
        // 土の堤の北面下部を石で支え、全面を石壁にはしない。既存の材質と同じ束を使う。
        const ax = HON.x - HON.hw - 5, bx = ax - 7, z = HON.z0 + 7;
        rt.scene.add(takaDorui(W, [ax, z, bx, z],
          { batch: kb, w: 2, h: 1.5, capEnds: true }));
        const stone = ishigaki(W, [[ax, z - .8], [bx, z - .8]],
          { batch: kb, top: .8, minH: .8, maxH: 1.2, out: 1, noKit: true });
        if (!stone.isBatchedPart) rt.scene.add(stone);
      }
      for (const sg of KUICHIGAI) {
        const [ax, az, bx, bz] = sg, len = Math.hypot(bx - ax, bz - az);
        const nx = -(bz - az) / len, nz = (bx - ax) / len;
        // 両側の法面は高い縁が少しずれる。背面も地面まで閉じ、木戸前を空洞の庇にしない。
        for (const side of [-1, 1]) {
          const g = dorui(W, sg, nx * side, nz * side,
            { batch: kb, w: 1.8, h: 1.8, capEnds: true, closeBack: true });
          if (!g.isBatchedPart) rt.scene.add(g);
        }
        // 絵の裾は中心から1.5メートル。元の細い芯だけでなく、土の中への入り込みを止める。
        Object.assign(solidSeg(ax, az, bx, bz, 1.2), { missileH: 1.8, missileType: "dust" });   // 折れの道は人ひとり半（狭いが、押し合いで抜けられる）
      }
      finalizeSimpleBatch(rt, kb);
      F.nests = [];
      for (const nd of NESTS) {
        const nest = hiddenGunNest(W, nd.x, nd.z, nd.rot, { n: nd.n });
        rt.scene.add(nest.group);
        const g = enemyGroup(rt, { faction: 'azai', name: '隠し銃座', anchor: nest.center, fixed: true, facing: Math.atan2(nest.fwd.x, nest.fwd.z), width: 2, aggro: 22, morale: 90 },
          dress([{ type: 'gun', n: nd.n }], AZAI));
        g.units.forEach((u, i) => { const s = nest.spots[i % nest.spots.length]; u.pos.x = s.x; u.pos.z = s.z; u._nest = true; u._crouch = true; });
        g.dmgMult = .5;   // 夜の狭間越しの一発は当たりが浅い（撃つ音と煙で狙われていると分からせ、虎口へ入った列を一度に倒し切らない）
        F.nests.push({ id: nd.id, g, c: nest.center, mouth: nest.mouth });
      }
      F.yokoya = [];
      for (const yk of YOKOYA) {
        const z = yokoyaZa(W, yk.x, yk.z, yk.rot, { n: yk.n });
        rt.scene.add(z.group);
        const g = enemyGroup(rt, { faction: 'azai', name: '横矢の座', anchor: z.center, fixed: true, facing: Math.atan2(z.fwd.x, z.fwd.z), width: 2, aggro: 20, morale: 90 },
          dress([{ type: yk.k, n: yk.n }], AZAI));
        g.units.forEach((u, i) => { const s = z.spots[i % z.spots.length]; u.pos.x = s.x; u.pos.z = s.z; });
        g.dmgMult = .5;
        F.yokoya.push({ id: yk.id, g, c: z.center });
      }
      const O = ONOGI, ox0 = O.x - O.hw, ox1 = O.x + O.hw, oz0 = O.z - O.hd, oz1 = O.z + O.hd;
      for (const sg of [[ox0, oz1, O.x - 2.6, oz1], [O.x + 2.6, oz1, ox1, oz1], [ox1, oz1, ox1, oz0], [ox1, oz0, ox0, oz0], [ox0, oz0, ox0, oz1]]) addScenery(sceneryFence(W, sg, true));
      F.onoHouse = mountainHouse(O.x, O.z - 2, { team: 1, w: 10, d: 6, tile: false, name: O.name, naka: true, profile: 'odani_onogi', oku: 0.4 }).naka;
      addScenery(kabukimon(W, O.x, oz1, 5, 0), boardHut(W, ox0 + 3.5, oz0 + 3, 4.5, 3.4, 0.1, { wall: 0x5e4a34 }), boardHut(W, ox1 - 3.5, O.z + 1, 4, 3.2, -0.1, { wall: 0x5a4a34 }), kagaribi(W, O.x + 3.5, oz1 + 2.5));
      // 南から来る者に見えるよう、既存の篝火を柵の外へ。戸口の通り道は空ける。
      W.addFire(O.x + 3.5, oz1 + 2.5, { h: 1.3, size: .55 });
      const A = AKAO, ax0 = A.x - A.hw, ax1 = A.x + A.hw, az0 = A.z - A.hd, az1 = A.z + A.hd;
      for (const sg of [[ax0, az0, ax0, A.z - 2.5], [ax0, A.z + 2.5, ax0, az1], [ax0, az1, ax1, az1], [ax1, az1, ax1, az0], [ax1, az0, ax0, az0]]) addScenery(sceneryFence(W, sg, true));
      // 西の木戸へ戸口を向ける。屋敷の横や裏へ回らずに入れる。
      F.akaoHouse = mountainHouse(A.x + 1, A.z, { team: 1, w: 9, d: 6, rot: -Math.PI / 2, tile: false, name: A.name, naka: true, profile: 'odani_akao', oku: 0.5 }).naka;
      // 主屋は回転して南北に九メートルある。脇の小屋は東へ寄せ、壁を重ねない。
      addScenery(kabukimon(W, ax0, A.z, 5, Math.PI / 2), boardHut(W, ax1 - 2.5, az1 - 2.2, 3.4, 3.4, 0, { wall: 0x5e4a34 }), nobori(W, A.x - 5, A.z - 5, 'azai', 6), kagaribi(W, ax0 + 3, A.z + 4));
      W.addFire(ax0 + 3, A.z + 4, { h: 1.3, size: .55 });
    }
    stampBuild('堀と虎口と銃座');
    // ---- 周りの砦：長浜市の保存管理計画に沿う尾根の並び。座標・建物は推定、当夜の所属不明の砦には軍旗を立てない ----
    for (const f of FORTS) {
      const high = true, n = high ? 8 : 10, r = 8.5, pts = [];
      // 円形の囲いを、尾根の平場に納まる折れた縁へ。金吾丸の東の大手道は広く開く。
      // 福寿丸は記録にある方形へ。北東の開口とＬ字の虎口は同じ位置に保つ。
      // 寸法は縮めた推定。既存の八辺と土・柵の束を使い、谷の兵と道には張り出さない。
      const outline = f === FUKUJU
        ? [[-3, 7.5], [3, 7.5], [7, 7.5], [6, -5], [1, -8], [-7, -8], [-7, -1], [-7, 7.5]]
        : [[-3, 7.5], [3, 7.5], [7.5, 3], [6, -5], [1, -8], [-5, -6], [-7.5, -1], [-6, 5]];
      const width = f.id === 'gessho' ? .78 : f.id === 'yamazaki' ? .9 : 1;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        pts.push(high ? [f.x + outline[i % n][0] * width, f.z + outline[i % n][1]]
          : [f.x + Math.sin(a) * r, f.z + Math.cos(a) * r]);
      }
      // 金吾丸は東側の二口。福寿丸は北東、山崎丸は南に虎口を設ける。
      const westFort = high && (f.id === 'fukuju' || f.id === 'yamazaki');
      const entrance = high && f.id === 'fukuju' ? 3 : 0;
      for (let i = 0; i < n; i++) if (f === KINGO ? i !== 1 && i !== 2 : i !== entrance) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1], seg = [ax, az, bx, bz];
        if (high && !(f.id === 'gessho' && (i === 2 || i === 3))) {
          const len = Math.hypot(bx - ax, bz - az);
          // 保存管理計画32頁・表7：山崎丸も高い土塁と枡形で固める。
          // 一律の低い縁にせず、大嶽と山崎丸は高くする。高さ・幅は推定。
          // 中心線と入口・番手の位置は保ち、既存の土の束へまとめる。
          const earth = dorui(W, seg, -(bz - az) / len, (bx - ax) / len,
            { batch: scenery, w: f === OTAKE ? 1.8 : 1.2, h: f === OTAKE || f.id === 'yamazaki' ? 1.5 : .55,
              surfaceOnly: false, bareSoil: true, capEnds: true });
          if (!earth.isBatchedPart) rt.scene.add(earth);
        }
        addScenery(sceneryFence(W, seg));
      }
      if (high && f === KINGO) {
        // 保存管理計画119頁・表20：金吾丸の北面には石垣が残る。
        // https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
        // 北縁の土塁の表だけを野面石で補う。高さ・積み方・範囲は推定復元。
        // 東の大手道の二口は空け、既存の石の束へ初期化時だけ足す。
        const stone = ishigaki(W, pts.slice(3, 6), {
          batch: scenery, top: .65, minH: 1.2, maxH: 1.2,
          lean: .12, out: 1, big: 1.2, faceSegments: 2, noKit: true,
        });
        if (!stone.isBatchedPart) rt.scene.add(stone);
      }
      if (westFort) {
        // 保存管理計画32頁・表7：福寿丸は北東隅、山崎丸は南のＬ字状土塁で枡形の虎口を作る。
        // https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
        // 縮めた平場内での寸法・柵は推定。小屋と荷を避け、東へ折れて入る通路を残す。
        // 既存の束へ初期化時だけ追加し、谷道・実兵・遠景兵の持ち場には張り出さない。
        const turns = f.id === 'fukuju'
          ? [[1, -8, 1, -5.5, -1, 0], [1, -5.5, 3.2, -5.5, 0, -1]]
          : [[-3 * width, 7.5, -3 * width, 4.6, -1, 0], [-3 * width, 4.6, 3.2, 4.6, 0, -1]];
        for (const [ax, az, bx, bz, nx, nz] of turns) {
          const seg = [f.x + ax, f.z + az, f.x + bx, f.z + bz];
          const earth = dorui(W, seg, nx, nz,
            { batch: scenery, w: .9, h: f.id === 'yamazaki' ? 1.5 : 1.2, bareSoil: true, capEnds: true, closeBack: true });
          if (!earth.isBatchedPart) rt.scene.add(earth);
          const fence = palisade(W, seg, { batch: scenery, h: 1.6, solid: true });
          if (fence && !fence.isBatchedPart) rt.scene.add(fence);
        }
      }
      if (high && f.id === 'gessho') {
        // 保存管理計画32頁・表7：北東先端はコの字状の土塁、その外側は二条の堀切。
        // 北東の外周二辺を使い、南西へ短く折り返す。位置・高さ・長さは縮尺に合わせた推定。
        // 小屋の北で止め、南の入口と中央の通路を空ける。外周と土を二重に重ねない。
        const head = [pts[2], pts[3], pts[4], [f.x - 1, f.z - 5.8]];
        for (let i = 1; i < head.length; i++) {
          const [ax, az] = head[i - 1], [bx, bz] = head[i];
          const len = Math.hypot(bx - ax, bz - az);
          const earth = dorui(W, [ax, az, bx, bz], -(bz - az) / len, (bx - ax) / len,
            { batch: scenery, w: 1.2, h: 1.2, bareSoil: true, capEnds: true, closeBack: true });
          if (!earth.isBatchedPart) rt.scene.add(earth);
        }
        // 保存管理計画32頁・表7：月所丸は尾根の平坦部を土塁で区切る。
        // https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
        // 縮めた平場での向き・高さ・開口は推定。小屋の南に置き、中央に通路を残す。
        // 既存の土塁の材質と束を使い、初期化時だけ補う。
        for (const [ax, bx] of [[-5.3, -1.2], [1.2, 5.4]]) {
          const earth = dorui(W, [f.x + ax, f.z + 1.2, f.x + bx, f.z + 1.2], 0, 1,
            { batch: scenery, w: .9, h: .9, bareSoil: true, capEnds: true, closeBack: true });
          if (!earth.isBatchedPart) rt.scene.add(earth);
        }
      }
      addScenery(boardHut(W, f.x - (f === KINGO ? 5 : 0), f.z - 2, f === KINGO ? 4 : 6, 4, 0.2, { wall: 0x5a4a34 }));
      // 小さな板葺きの兵糧小屋と俵。門から火のある庭までの中央は空ける。
      if (high && f !== KINGO) {
        // 月所丸の兵糧小屋は仕切り土塁の南へ寄せ、屋根と土を重ねない。
        boardHut(W, f.x - 4.3 * width, f.z + (f.id === 'gessho' ? 3.3 : 2.2), 2.4, 3, Math.PI / 2, { wall: 0x716047 });
        rt.scene.add(tawara(W, f.x + 4.2 * width, f.z - 1, .15, 3));
      }
      if (f.flag) rt.scene.add(nobori(W, f.x + 3, f.z + 3, f.flag, 7), nobori(W, f.x - 4, f.z, f.flag, 6));
      W.addFire(f.x + 2, f.z + (westFort && f.id === 'yamazaki' ? 6.5 : 5), { torch: true, h: 1.4 });
    }
    addOdaniSiegeLife(rt, scenery);
    addOdaniEastSlope(rt, boardHut, scenery);
    addOdaniFrontView(rt, boardHut, scenery);
    addOdaniLogSteps(rt);
    addOdaniTrailEdge(rt);
    // 25秒で着く谷道（-88,63・北北東）の手前：半分埋めた岩と根の草、窪みの泥、道の外の草の斑。
    // 地面の一色の茶をやめる。小屋・塀・幟は上で置いたので足さない。新しい火も足さない。
    dressStage(rt, { at: { x: -88, z: 63 }, heading: Math.atan2(.41, -.91), huts: 0, fence: false, flag: false, yagura: false,
      clutter: 4, fire: false, rocks: 12, trodden: .35, wet: .7, radius: 55, seed: 4211,
      avoid: (x, z) => alongLine(SHIMIZU, x, z).d < 3.6 || inSiege(x, z, 2) || YASHIKI.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 8) });
    finalizeSimpleBatch(rt, scenery);
    // 城の石・塀・石段の同じ形の束も、草木と同じ仕組みで画面の外を描かない。
    // 動く遠景の兵や実兵を作る前に登録する。行列と判定の箱はここで一度だけ用意する。
    const culled = new Set();
    for (const c of W.cullList || []) for (const o of c.orig) culled.add(o.m);
    for (let i = castleStart; i < rt.scene.children.length; i++) {
      const m = rt.scene.children[i];
      // 十六個以下の固定部品も対象にする。独自の描画処理を持つ小さな束は動きを保つ。
      if (m.isInstancedMesh && m.count > 0 && !m.userData.lod && !culled.has(m) &&
        (m.count > 16 || !m.userData.noFreeze && m.onBeforeRender === THREE.Object3D.prototype.onBeforeRender)) {
        // 動く影を省いた城の固定部品は、近くでも背中側を送らない。
        // 本数の間引きは使わず、視点を戻すと同じ部品を復帰させる。
        W.viewCull([m], 0, Infinity, false);
      }
    }
    // ---- 小谷を囲む織田勢（軽い作り）：谷の口・東の谷・南の山麓。南西の丘には虎御前山の信長の本陣 ----
    // 谷の口の織田勢は、本人と羽柴の手の立つ所（z 92〜110）から離す。軽い大軍の中に戦う兵が立つと影の兵に見える（11/4 bot・AA）。
    DA(MOUTH.x - 10, MOUTH.z + 56, 34, 12, 110, Math.PI - 0.2, ODA_ARMOR, 'oda', 15731);
    DA(110, -30, 30, 14, 110, -Math.PI / 2, ODA_ARMOR, 'oda', 15732);
    DA(118, -110, 26, 12, 90, -Math.PI / 2, ODA_ARMOR, 'eiraku', 15733);
    DA(-40, 168 + SOUTH_SHIFT, 40, 10, 120, Math.PI, ODA_ARMOR, 'eiraku', 15734);
    if (S.quality === 'high') {
      // 北の大嶽はすでに織田方。小屋の南、柵の内側に番手を置く。
      // 十六人は占領を伝える絵の人数。実兵へ起こさず、京極丸への新手にも使わない。
      const guard = DA(OTAKE_GUARD.x, OTAKE_GUARD.z, 7, 2, 16, 0, ODA_ARMOR, 'oda', 15736, 0);
      guard.army.noWake = true;
    }
    // 虎御前山は前年に普請した砦。陣幕だけの野営にせず、丘上の土塁と木柵で囲う。
    // 囲いの寸法・形は推定。南北の口と既存の控え兵の場所を空け、共通の束へまとめる。
    {
      const db = makeSimpleBatch(), x = TORAGOZEN.x, z = TORAGOZEN.z;
      const sides = [[x - 17, z - 16, x - 4, z - 16, 0, -1], [x + 4, z - 16, x + 17, z - 16, 0, -1],
        [x + 17, z - 16, x + 17, z + 16, 1, 0], [x + 17, z + 16, x + 4, z + 16, 0, 1],
        [x - 4, z + 16, x - 17, z + 16, 0, 1], [x - 17, z + 16, x - 17, z - 16, -1, 0]];
      for (const [ax, az, bx, bz, nx, nz] of sides) {
        const earth = dorui(W, [ax, az, bx, bz], nx, nz, { batch: db, w: 2, h: .9 });
        if (!earth.isBatchedPart) rt.scene.add(earth);
        const fence = palisade(W, [ax, az, bx, bz], { batch: db, h: 2.1 });
        if (fence && !fence.isBatchedPart) rt.scene.add(fence);
      }
      if (S.quality === 'high') {
        // 宮部への道の小谷側だけを築地で守る。既存の土の材質と束を使い、南口は空ける。
        // 五十町の全長や一丈の高さを、この短い景色の実寸として再現するものではない。
        // 戦場外なので遠景の地面に沿わせる。陣の南口から八メートルで高さをつなぐ。
        const roadWorld = { heightAt(px, pz) {
          const t = Math.max(0, Math.min(1, (pz - MIYABE_ROAD[0][1]) / 8));
          return W.heightAt(px, pz) * (1 - t) + W.farH(px, pz) * t;
        } };
        for (let i = 1; i < MIYABE_ROAD.length; i++) {
          const a = MIYABE_ROAD[i - 1], b = MIYABE_ROAD[i];
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const nx = (b[1] - a[1]) / len, nz = -(b[0] - a[0]) / len;
          // 巻五の「道」「築地」を別の断面にする。一方へ下る土塁の面を道幅いっぱいに使わず、
          // 中央が高く両端へ緩く下る盛土道にする。幅5.4m・高さ45cmは遊びでの推定。
          // dorui は始点から法線側へ作り、天端を30cm戻すため、その分だけ両側へずらす。
          // 同じ土の材質と束を使い、遠景だけを補う。兵の足場・密度・攻め道は変えない。
          for (const side of [-1, 1]) {
            const sx = nx * side, sz = nz * side;
            const road = dorui(roadWorld, [a[0] + sx * .3, a[1] + sz * .3, b[0] + sx * .3, b[1] + sz * .3], sx, sz,
              { batch: db, w: 3, h: .45, bareSoil: true, capEnds: true });
            if (!road.isBatchedPart) rt.scene.add(road);
          }
          const earth = dorui(roadWorld, [a[0] + nx * 3.5, a[1] + nz * 3.5, b[0] + nx * 3.5, b[1] + nz * 3.5], nx, nz,
            { batch: db, w: 2.2, h: 1.8, closeBack: true, capEnds: true });
          if (!earth.isBatchedPart) rt.scene.add(earth);
        }
      }
      finalizeSimpleBatch(rt, db);
    }
    // 11/4 jin（AV18・総大将は後方の本陣で座る）：陣幕の奥に床几の信長と諸将、まわりに旗本（軽い作り。遠くて近づけない所）。
    F.toraCamp = KIT.honjin(rt, TORAGOZEN.x, TORAGOZEN.z, { mon: 'oda', people: true, fire: true, yoroi: false });
    if (true) {
      // 普請の丸太は幕の後ろの両隅へ。南北の門・幕脇の荷と控え兵の列を空ける。
      // 二山目は同じ形と材質を共有し、動く道具や毎コマの処理を足さない。
      const x = TORAGOZEN.x, z = TORAGOZEN.z - 11;
      const timber = lumber(W, x - 11, z, 0), other = timber.clone();
      other.position.set(x + 11, W.heightAt(x + 11, z), z);
      rt.scene.add(timber, other);
    }
    DA(TORAGOZEN.x, TORAGOZEN.z + 10, 30, 8, 72, Math.PI, ODA_ARMOR, 'oda', 15735);
    for (const [x, z, k] of [[MOUTH.x + 4, MOUTH.z - 2, 'oda'], [MOUTH.x - 6, MOUTH.z + 4, 'oda'], [TORAGOZEN.x - 8, TORAGOZEN.z - 8, 'oda'], [TORAGOZEN.x + 8, TORAGOZEN.z - 8, 'eiraku'], [100, -20, 'oda'], [100, -100, 'oda']]) rt.scene.add(nobori(W, x, z, k, 7));
    // 焚き火の薪は地上約十五センチ。松明台の高さに炎だけを浮かせない。
    for (const [x, z] of [[MOUTH.x - 6, MOUTH.z + 10], [100, -40], [110, -96], [-20, 160]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z, { torch: true, h: .15 }); }
    // ---- 南の大手：番所前の攻防と後続（攻め口の細部は推定復元） ----
    // 信長公記巻六が記す当夜の攻めは京極丸から久政の居城へ。
    // 大手の各曲輪を落とす記録はなく、閉じた門を越える自動進軍をさせない。
    // 控え二十四人と下の乱戦の人数・幅は保ち、番所前で支える。
    F.oteColumn = DA(0, BANSHO.z1 + 14, 4, 12, 24, Math.PI, ODA_ARMOR, 'oda', 15752, 0);
    F.oteColumn.army.noWake = true;
    // 11/2 点付け（小谷72：敵の大軍・乱戦が薄い）：25秒の潜む所から南（谷の口の屋敷町）を向くと、浅井の兵が一人もいなかった。
    //   谷の口の道の東の脇（味方の列の奥・画面の真ん中）で、町へ入った織田の別手と屋敷の浅井の侍が斬り合う（軽い作り。本物の兵・道・当たりは変えない。本人の十二歩の外だけ描く）。
    F.mouthClash = clash(rt, { x: -91, z: 122, facing: Math.PI, w: 16, gap0: 0, seed: 15753, bw: 4.6, gap: 2.4, host: false, noRout: true, killRate: 0.004, maxDrift: 1.2, corpses: 6, realNear: 12, nearHide: 0,
      A: { flag: 'oda', armor: ODA_ARMOR, count: 26, flagRate: 0.2 }, B: { flag: 'azai', armor: AZ_ARMOR, count: 30, flagRate: 0.25 } });
    F.clash = clash(rt, { x: 0, z: BANSHO.z1 + 8, facing: Math.PI, w: 13, gap0: 0, seed: 15751,
      A: { flag: 'oda', armor: ODA_ARMOR, count: 24, team: 0, faction: 'oda' }, B: { flag: 'azai', armor: AZ_ARMOR, count: 36, team: 1, faction: 'azai', bows: true } });
    // 兵の作りは槍を主に鉄砲・弓・徒歩の侍（kaito 10/28 の割合）。夜の山攻めなので騎馬と荷駄は谷の口の外に残す。
    const column = (name, at, list) => allyGroup(rt, { name, fixed: true, fullStrength: true, formation: 'column', colW: 2, spacing: 1.2, anchor: at, facing: Math.PI, width: 10, aggro: 10 }, dress(list, ODA));
    F.hide = column('羽柴秀吉の手', { x: MOUTH.x, z: MOUTH.z }, [{ type: 'busho', n: 1, o: { name: '羽柴秀吉', invuln: true, horse: true } },
      // 護衛の共通指定は後年の白い具足。小谷だけ、当夜の大将と同じ黒漆と威へ合わせる。
      { type: 'samurai', n: 2, o: { armor: ODANI_KACCHU['羽柴秀吉'].armor, lace: ODANI_KACCHU['羽柴秀吉'].lace } },
      { type: 'ashigaru', n: 22 }, { type: 'gun', n: 5 }, { type: 'bow', n: 1 }]);
    F.hideU = F.hide.units[0];
    // 11/6 fixc1844（critic60・十4）：金の瓢箪の馬印は後の伝え。天正元年の夜討ちの羽柴の手には掲げない（金ヶ崎と同じ）。
    const noGourd = () => { for (const u of F.hide.units) if (u.uma) { u.uma.parent?.remove(u.uma); u.uma = null; } };
    noGourd(); rt.after(.2, noGourd); rt.after(2, noGourd);
    // 攻め口ごとの将名・内訳は確定せず、既存の人数と兵種を保って羽柴の先手・後続として置く。
    F.hachi = column('羽柴の先手', { x: MOUTH.x + 8, z: MOUTH.z + 4 }, [{ type: 'samurai', n: 1, o: { name: '先手組頭', invuln: true, hat: 'kabuto_m', haori: 0 } },
      // 11/6 fix61（kaito BR「竹束を持って進み」）：先頭の四人は竹束を抱えて登る（持つ者のすぐ後ろには弾も石も通りにくい。共通の tatake）
      { type: 'ashigaru', n: 4, o: { tatake: true } }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 3 }]);
    F.asano = column('羽柴の後続', { x: MOUTH.x + 3, z: MOUTH.z + 14 }, [{ type: 'samurai', n: 1, o: { name: '後続組頭', invuln: true, haori: 0 } }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 2 }, { type: 'bow', n: 1 }]);
    // 後詰は谷の口に控え、京極丸を取ってから登って押さえに入る（先手は次の曲輪へ）。
    F.gozume = column('羽柴の後詰', { x: MOUTH.x - 2, z: MOUTH.z + 24 }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 13 }, { type: 'gun', n: 2 }, { type: 'bow', n: 2 }]);
    F.gozume.historicalOrders = true;
    // 11/6 fix61（kaito BR「後続が来ない・人数が少なすぎる。軍勢対軍勢に」・一1 羽柴三千対尾根の守り千三百）：
    //   谷の口のさらに下に二番手の組を控えさせ、屋敷へ攻めかかる下知で同じ谷道を駆け上がって先手に加わる（assault）。
    F.niban = column('羽柴の二番手', { x: MOUTH.x + 2, z: MOUTH.z + 34 }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 2, o: { tatake: true } },
      { type: 'ashigaru', n: 10 }, { type: 'gun', n: 3 }, { type: 'bow', n: 1 }]);
    F.niban.historicalOrders = true;
    F.oda = [F.hide, F.hachi, F.asano];
    for (const g of [...F.oda, F.gozume, F.niban]) { g.defMult = 1.8; g.noRout = true; }   // 10/30：羽柴の先手が京極丸の前で尽きて負けが続いた（bot）
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: MOUTH.x + 4, z: MOUTH.z + 10 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 清水谷の浅井勢：居館の番兵と、谷の奥の見張り ----
    F.yakata = enemyGroup(rt, { faction: 'azai', name: '居館の番兵', fixed: true, formation: 'yari', anchor: { x: KYOKAN.x - 21, z: KYOKAN.z + 2 }, facing: Math.PI / 2 + 0.6, width: 8, aggro: 16, morale: 75, fleeDir: { x: 0.3, z: -1 } },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 13 }, { type: 'bow', n: 2 }], AZAI));
    F.watch = enemyGroup(rt, { faction: 'azai', name: '谷の奥の見張り', fixed: true, formation: 'column', colW: 2, anchor: { x: HEAD.x - 4, z: HEAD.z + 12 }, facing: 0.4, width: 6, aggro: 14, morale: 70, fleeDir: { x: 0.6, z: -1 } },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 11 }, { type: 'bow', n: 2 }], AZAI));
    // 11/5（BA4）：三十人を十人ずつ三つの番兵へ分ける（谷の門の前の軽い一手をやめ、その分を本物に）。
    F.patrol = rt.army.addGroup({ team: 1, faction: 'azai', name: '登り口の番兵', order: 'hold',
      anchor: { x: BELOW.x, z: BELOW.z }, formation: 'column', morale: 70, aggro: 8 });
    const patrols = [...F.yakata.units, ...F.watch.units];
    F.yakata.units.length = 0; F.watch.units.length = 0;
    for (let i = 0; i < patrols.length; i++) {
      const wave = Math.min(AMBUSH_IDS.length - 1, Math.floor(i / 10)), g = F[AMBUSH_IDS[wave]], u = patrols[i];
      u.group = g; u.slot = g.units.length; g.units.push(u);
      // 初めから道の三か所を守る。見えてから本人の前へ瞬間移動させない。
      const post = VALLEY_ROUTE[wave + 1], next = VALLEY_ROUTE[wave + 2];
      const len = Math.hypot(next[0] - post[0], next[1] - post[1]);
      const dx = (next[0] - post[0]) / len, dz = (next[1] - post[1]) / len;
      const row = Math.floor(u.slot / 2) * .9;
      // 二つ目の組は谷道の上の斜面に潜む。列の真ん中へ上から駆け下りて、隊を二つに切る。
      let side = u.slot % 2 ? .6 : -.6;
      if (wave === 1) {
        const up = W.heightAt(post[0] - dz * 9, post[1] + dx * 9) > W.heightAt(post[0] + dz * 9, post[1] - dx * 9) ? 1 : -1;
        // 西の段は出曲輪の縄張り（堀と馬出し）。そこへ潜ませず、東の斜面へ回す
        const s8 = inSiege(post[0] - dz * up * 8, post[1] + dx * up * 8, 3) ? -up * 8 : up * 8;
        side += s8;
      }
      const x = post[0] + dx * row - dz * side, z = post[1] + dz * row + dx * side;
      u.pos.set(x, W.heightAt(x, z), z); u.heading = Math.atan2(-dx, -dz);
      g.anchor.x = post[0]; g.anchor.z = post[1]; g.facing = u.heading;
      // 待ち伏せ中も実在する守り。先に近づいた者の槍は当たる。
      u.odaniWait = { x: u.pos.x, z: u.pos.z }; u.odaniReleased = false; u.noTarget = false;
    }
    for (const id of AMBUSH_IDS) {
      const g = F[id]; g.initial = g.units.length; g.historicalOrders = true;
      g.leader = g.units.find((u) => u.type === 'samurai') || g.units[0];
    }
    F.patrolWave = 0;
    // ---- 京極丸の守り（西の口の門兵と、曲輪の中の守り） ----
    F.kyoGate = enemyGroup(rt, { faction: 'azai', name: '西の口の門兵', fixed: true, formation: 'yari', anchor: { x: GATE_WEST.x + 4, z: GATE_WEST.z }, facing: -Math.PI / 2, width: 10, aggro: 10, morale: 80, fleeDir: { x: 1, z: 0 } },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }], AZAI));
    // 11/6 fix61（kaito BR「虎口の外に弓兵がいる」・十3）：弓は門兵に混ぜず、曲輪の内の守りに置く（門の槍が打って出ても弓は塀の内に残る）
    F.kyo = enemyGroup(rt, { faction: 'azai', name: '京極丸の守り', fixed: true, anchor: { x: KC.x + 3, z: KC.z }, facing: -Math.PI / 2, width: 5, aggro: 9, morale: 95, fleeDir: { x: 0, z: 1 }, formation: 'yari' },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'bow', n: 6 }], AZAI));
    // 11/6 fixc2103（critic60「京極丸の中の敵が一列に立つ」）：十八人を一列に並べず五人幅の固まりにする（寄せに向かう間合いは前のまま）。
    F.kyoGate.dmgMult = F.kyo.dmgMult = .8;   // 夜の奇襲で、京極丸の守りは備えが薄い
    F.ono = enemyGroup(rt, { faction: 'azai', name: '大野木屋敷の守り', fixed: true, formation: 'yari', anchor: { x: ONOGI.x, z: ONOGI.z + 3 }, facing: Math.PI, width: 9, aggro: 12, morale: 90, fleeDir: { x: 0.5, z: 1 } },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'bow', n: 2 }], AZAI));
    F.relief = rt.army.addGroup({ team: 1, faction: 'azai', name: '屋敷から押す小隊', order: 'hold',
      anchor: { ...F.onoHouse.doorOut }, formation: 'column', width: 3, morale: 80, aggro: 8 });
    F.relief.historicalOrders = true;
    for (let i = 0; i < 4; i++) {
      const idx = F.ono.units.findIndex((u) => u.type === 'ashigaru');
      const u = F.ono.units.splice(idx, 1)[0]; u.group = F.relief; u.slot = i; F.relief.units.push(u);
      u.noTarget = true; u.odaniReleased = false; u.odaniWait = { x: u.pos.x, z: u.pos.z };
    }
    for (let i = 0; i < F.ono.units.length; i++) F.ono.units[i].slot = i;
    F.relief.leader = F.relief.units[0];
    F.ono.initial = F.ono.units.length; F.relief.initial = F.relief.units.length;
    F.odaInitial = F.oda.reduce((n, g) => n + g.count, 0);
    // 加勢・反撃・小丸の守りは初めから曲輪に詰める。後の段は同じ兵を歩かせる。
    const reserve = (name, at, facing, foot, ranged = 'bow') => {
      const g = enemyGroup(rt, { name, faction: 'azai', fixed: true, anchor: at,
        facing, width: 5, formation: 'column', colW: 2, spacing: 1.2, aggro: 8, morale: 85,
        fleeDir: { x: 0, z: facing === 0 ? -1 : 1 } },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: foot }, { type: ranged, n: 2 }], AZAI));
      g.historicalOrders = true;
      return g;
    };
    // 北向きの後列も南の塀の内へ収め、尾根の道から加勢を出す。
    F.kyoAid = reserve('中丸の控え', { x: 0, z: NAKAMARU.cz }, Math.PI, 4);   // 三人は清水谷の出曲輪の馬出しへ
    F.south = reserve('中丸の押し返す組', { x: -3, z: NAKAMARU.cz - 3 }, Math.PI, 3);
    F.north = reserve('小丸の押し返す組', { x: 3, z: KOM.cz + 3 }, 0, 4);
    F.koma = reserve('小丸の守り', { x: 0, z: KOM.cz - 2 }, 0, 6);
    F.sanno = reserve('山王丸の控え', { x: 0, z: SANNO.z1 - 5 }, 0, 4, 'gun');
    // 出曲輪の馬出しに詰める浅井の兵（尾根の控えから回した七人）。谷道を登る羽柴の手が近づくと、馬出しの脇の口から出て横を突き、
    // 引き上げる時に門を開ける。追いすがれば門は閉まらず、そのまま曲輪へなだれ込める（付け入り）。
    if (F.K) {
      const at = SIEGE.at.uma;
      F.umaGuard = enemyGroup(rt, { faction: 'azai', name: '馬出しの兵', fixed: true, formation: 'yari', anchor: { x: at.x, z: at.z }, facing: SIEGE.rot, width: 5, aggro: 4, morale: 80,
        fleeDir: { x: -SIEGE.ux, z: -SIEGE.uz } }, dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 2 }], AZAI));
      F.umaGuard.historicalOrders = true;
      F.K.sortie(F.umaGuard, { fight: 14, again: 30, when: (r) => {
        const u = r.player.u; return r.t > 12 && u.alive && Math.hypot(u.pos.x - at.x, u.pos.z - at.z) < 64;
      } });
    }
    // 総大将を前線の組に混ぜない。史実の最期は戦後の文で伝える。
    const lord = (name, house, at) => {
      const spot = house.lordSpot || at;
      const g = enemyGroup(rt, { name: name + 'の居所', faction: 'azai', fixed: true,
        anchor: spot, facing: 0, aggro: 0, width: 1, noGuard: true, noRout: true },
        // 居所の大将は槍を振り回さず刀を佩く。銘は不明なので共通の刀で復元。
        dress([{ type: 'busho', n: 1, o: { name, invuln: true, weapon: 'sword' } }], AZAI));
      g.historicalOrders = true;
      const u = g.units[0]; u.dmg0 = u.dmg; u.noTarget = true; u.dmg = 0; u.campProtected = true;
      u._crouch = true;   // 11/4 jin：居所の大将は床几に腰を下ろす（前に出ない）
      return g;
    };
    F.nagamasa = lord('浅井長政', F.honHouse, HONC);
    F.hisamasa = lord('浅井久政', F.komaHouse, KOMC);
    F.akaoLord = lord('赤尾清綱', F.akaoHouse, AKAO);
    F.honGuard = reserve('本丸の旗本', { x: 0, z: HON.cz + 7 }, 0, 8);
    F.honGuard.guard = true; F.honGuard.guardLeash = 8;
    F.koma.guard = true; F.koma.guardLeash = 7;
    F.akao = reserve('赤尾屋敷の守り', { x: AKAO.x - 5, z: AKAO.z }, -Math.PI / 2, 5);
    F.counter = [F.south, F.north];
    F.komaGuards = [F.koma, F.sanno];
    F.captureT = 0; F.holdT = 0; F.awayT = 0;
    F.kyoGuards = [F.kyoGate, F.kyo, F.kyoAid];
    // 身分だけで深手への耐久を増やさない。甲冑・武器と史実の致死保護は別に保つ。
    for (const u of rt.army.units) mortalBody(u);
    stampBuild('周りの砦と実兵');
    // 視点で地面の索引を詰め直すのは、描画への転送より前に済ませる。
    // 地面自身の描く直前では、前の索引と今の面数が食い違い、近い坂が欠ける。
    // 同じ視点での二度目の呼び出しは既存の判定で何もしない。共通の地形処理は変えない。
    const beforeTerrain = rt.scene.onBeforeRender;
    const materialPrepares = W.materialDrawPreparers || [];
    rt.scene.onBeforeRender = function (renderer, scene, camera, target) {
      beforeTerrain.call(this, renderer, scene, camera, target);
      for (const prepare of materialPrepares) prepare(renderer, scene, camera);
      const terrain = W.terrain;
      terrain.onBeforeRender(renderer, scene, camera, terrain.geometry, terrain.material, null);
    };
    applyLook(rt, NIGHT_ATTACK);
    rt.setPhase('brief');
    nextObj(rt, '秀吉に話して出発せよ');
    rt.say('羽柴秀吉', '谷から京極丸を取るぞ。支度ができたら声をかけよ', 4);
    document.getElementById('hud')?.setAttribute('data-odani-talk', '');
    rt.marker('hide', () => F.hideU.pos, '羽柴秀吉・話して出発', { guideAlways: true, alwaysDistance: true, guidePerson: () => F.hideU });
    rt.marker('retreat', F.retreatPoint, () => F.retreatOn ? '退き口・来た道へ下がれ' : '', { h: 1.3, guideAlways: true, alwaysDistance: true, guideArea: 'retreat', guideRadius: 2.5 });
    rt.objProgress('main', '話しかければ、すぐに出発できる');
    rt.addInteract('talk', { x: MOUTH.x, z: MOUTH.z }, '秀吉に話して出発する', () => this.climb(rt), { r: 6 });
    rt.addInteract('oteRoad', { x: MOUTH.x + 4, z: MOUTH.z + 4 }, '大手の道を聞く', () => {
      rt.say('組頭', '大手は南の尾根じゃ。我らは谷から京極丸を取る。秀吉の旗に続け', 4);
    }, { r: 6 });
    rt.after(TALK_WAIT, () => this.climb(rt));
    rt.after(.4, () => { if (F.step === 0 && !rt.player.lock) rt.player.cine = { x: -12, z: NAKAMARU.cz - 10, t: VISTA_T - 1, up: 16, vista: true, encounter: true }; });
  },

  // ① 清水谷を登る
  climb(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t; F.climbGuideIdx = 1; F.climbProgress = 0; F.climbProgressAt = rt.t;
    rt.setPhase('climb');
    rt.uninteract('talk'); rt.uninteract('oteRoad'); rt.unmark('hide'); rt.unmark('kyoGoal');
    document.getElementById('hud')?.removeAttribute('data-odani-talk');
    F.trailPoint = { x: CLIMB[2][0], z: CLIMB[2][1] };
    rt.marker('trail', () => F.trailPoint, () => F.retreatOn || F.guideBlocked ? '' : retShown(rt) ? '来た道の角へ戻れ' : F.trailGuard ? '登り口の番兵を退けよ' : F.climbWaiting ? '京極丸の下へ攻め上れ' : F.climbDefending ? '登り口の番兵を退けよ' : F.valleyFighting ? '味方と番兵を退けよ' : '谷道を登れ', { h: 1.3, guideAlways: true, alwaysDistance: true });
    nextObj(rt, hi(rt) ? '一隊を率いて清水谷を登れ' : '秀吉について清水谷を登れ');
    rt.say('羽柴秀吉', '声を落とせ。谷道を外れず、わしの旗に続け！', 4);
    const H = F.hide;
    H.order = 'path'; H.path = CLIMB.slice(2, SHIMIZU.length + 2); H.pathIdx = 0; H.speed = 3.6; H.formation = 'column'; H.aggro = 12; H.roadColumn = true;
    H.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: BELOW.x, z: BELOW.z }; g.formation = 'column'; g.aggro = 12; F.hideAt = rt.t; };
    const Hc = F.hachi;
    Hc.order = 'path'; Hc.path = CLIMB.slice(2, SHIMIZU.length + 2); Hc.pathIdx = 0; Hc.speed = 3.5; Hc.formation = 'column'; Hc.roadColumn = true;
    Hc.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: BELOW.x + (CLIMB_UP[1][0] - BELOW.x) * 0.15, z: BELOW.z + (CLIMB_UP[1][1] - BELOW.z) * 0.15 }; g.formation = 'column'; };
    // 羽柴の後続が列の後ろに続く。狭い谷道で二列の隊が縦に長く伸びる。
    const A = F.asano;
    A.order = 'path'; A.path = CLIMB.slice(2, SHIMIZU.length + 2); A.pathIdx = 0; A.speed = 3.4; A.formation = 'column'; A.colW = 1; A.roadColumn = true;
    A.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: BELOW.x + (CLIMB[SHIMIZU.length][0] - BELOW.x) * 0.3, z: BELOW.z + (CLIMB[SHIMIZU.length][1] - BELOW.z) * 0.3 }; g.formation = 'column'; };
    // 後詰は谷の中ほどまで上がって待つ（京極丸を取ったら登る）。
    const Gz = F.gozume;
    Gz.order = 'path'; Gz.path = CLIMB.slice(2, 4); Gz.pathIdx = 0; Gz.speed = 3; Gz.formation = 'column'; Gz.colW = 1; Gz.roadColumn = true;
    Gz.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: CLIMB[3][0], z: CLIMB[3][1] }; g.formation = 'column'; };
    // 谷道は狭い。横に広がれず、一列で登る。
    H.colW = 1; Hc.colW = 1;
    for (const g of [H, Hc, A, Gz]) g.spacing = 1.4;   // 一列で登る（列が縦に長く伸びる）
    // 谷登りの知らせは登っている間だけ。屋敷へ攻める下知を古い声で隠さない。
    rt.after(30, () => { if (F.step === 1 && !F.ending && !F.retreatOn) { rt.bark('南の大手、番所の手前で槍がぶつかる'); sfx('far', 0.6); } });
  },

  // ② 京極丸を取る
  assault(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    F.guideReturning = false;
    rt.setPhase('kyogoku');
    rt.unmark('watch'); rt.unmark('yakata'); rt.unmark('patrol'); rt.unmark('hide'); rt.unmark('kyoGoal'); rt.unmark('trail');
    roadPoint(ROUTE_O, rt.player.u.pos, ROUTE_FROM, rt.army, rt.player.u);
    F.onoTrailIdx = Number.isFinite(ROUTE_FROM.d) ? Math.ceil(ROUTE_FROM.s) : 0;
    // 任務の切替直後も、遠い曲がり角へ直進させず、歩ける手前の印から始める。
    F.onoTrailIdx = trailAhead(rt, ROUTE_O, F.onoTrailIdx);
    rt.marker('trail', () => F.trailPoint, () => assaultTrailLabel(rt), { h: 1.3, guideAlways: true, alwaysDistance: true });
    // 忍びの谷登りでは鳴らさず、攻め入る下知で初めて法螺と突撃の陣太鼓。
    sfx('sig_kakari', 0.9);
    rt.after(1.5, () => { if (F.step === 2 && !F.ending) sfx('toki', 0.7); });
    rt.banner('大野木屋敷へ', '南木戸から庭を取り、その先の京極丸へ進む');
    nextObj(rt, '清水谷の道を登り、大野木屋敷の南木戸へ進め');
    rt.say('羽柴秀吉', F.belowWait >= 8
      ? '今いる者で攻める！　屋敷の南木戸から入れ！'
      : 'かかれ！　大野木屋敷の南木戸から入れ！', 4);
    // 屋敷の戸口と南木戸を競わせず、道の印だけで庭へ導く。
    rt.after(5, () => {
      if (F.step !== 2 || F.ending || F.onoDone || F.retreatOn) return;
      rt.say('先手組頭', F.reliefOn && gone(F.ono) && !gone(F.relief)
        ? '庭は取った！　南木戸から道へ戻り、小隊を退けよ'
        : F.onoInGarden ? '庭の敵を味方と退けよ。塀の外へ追うな'
          : '谷道を登れ。屋敷の南木戸から入るぞ', 3);
    });
    // 二番手も同じ谷道を駆け上がって先手に加わる（以後の下知は先手と同じ）。
    if (F.niban && !gone(F.niban) && !F.oda.includes(F.niban)) F.oda.push(F.niban);
    // 遠い屋敷へ「攻めよ」だけでは索敵の外に残る。谷道と南の木戸を通してから攻める。
    // 攻めかかる下知からは駆け足（kaito BR「坂を散歩のように登る」）。
    for (const g of F.oda) {
      const c = g.center();
      roadPoint(ROUTE_O, c, ROUTE_FROM, rt.army, g.units.find((u) => u.alive));
      g.odaniPlayerPause = false; g.anchor = { x: c.x, z: c.z }; g.order = 'path'; g.path = ROUTE_O;
      g.pathIdx = Number.isFinite(ROUTE_FROM.d) ? Math.ceil(ROUTE_FROM.s) : 0;
      g.formation = 'column'; g.aggro = 6; g.speed = 4.2;
      g.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 34; gg.formation = 'yari'; };
    }
    F.kyoGate.order = 'hold'; F.kyoGate.seekRange = 12;
    F.kyo.seekRange = 22;
    // 次の門兵の印は屋敷を取ってから。今の南木戸と行き先を競わせない。
    rt.after(26, () => {
      if (F.step !== 2 || F.ending || gone(F.kyoAid)) return;
      this.march(F.kyoAid, [[0, NAKAMARU.cz], [0, GATE_NAKA_KYO.z], [0, KC.z]], Math.PI);
      // 兵の進軍は続け、声は今の任務が続いている時だけ出す。
      if (F.step !== 2 || F.retreatOn) return;
      rt.say('組頭', !F.onoDone ? gone(F.ono) && F.reliefOn && !gone(F.relief)
        ? '中丸から新手じゃ！　まず道の小隊を退けよ'
        : F.onoInGarden ? '中丸から新手じゃ！　まず庭の敵を退けよ'
          : '中丸から新手じゃ！　まず屋敷の南木戸へ進め'
        : F.guideReturning || F.guideBlocked
          ? '中丸から新手じゃ！　まず来た道の角へ戻れ'
          : onogiExitTask(rt) ? '中丸から新手じゃ！　南木戸を出て西木戸へ登れ'
            : F.westGate?.struct && !F.westGate.struct.opened && F.westGate.struct.hp > 0
              ? F.westCanStrike ? '中丸から新手じゃ！　西の木戸を破れ！'
                : '中丸から新手じゃ！　谷道を登り、西木戸へ進め'
              : F.C.kuruwa.kyogoku.test(rt.player.u.pos.x, rt.player.u.pos.z)
                ? '中丸から新手じゃ！　京極丸の内で迎えよ！'
                : '中丸から新手じゃ！　西木戸を抜け、京極丸へ入れ', 3);
    });
  },

  // ②の途中：大野木屋敷を奪って西の口へ迫る。父子の分断は京極丸を取ってから。
  onoFall(rt) {
    const F = rt.flags;
    if (F.onoDone) return;
    // 11/6 fixc2041（critic60「庭に入らないうちに②が✓」）：本人が屋敷の庭の近くへ来るまで②を済ませない（来ない時は段に入って百秒で羽柴の手が取る）
    const pp = rt.player.u.pos;
    if (!(Math.abs(pp.x - ONOGI.x) < ONOGI.hw + 6 && Math.abs(pp.z - ONOGI.z) < ONOGI.hd + 6) && rt.t - F.stepT < 100) return;
    F.onoDone = true;
    F.guideReturning = false;
    rt.unmark('ono');
    if (gone(F.ono)) rt.award((t) => t.side.push('大野木屋敷を奪った'), '大野木屋敷を奪った');
    sfx('kane', 0.5);
    rt.say('羽柴秀吉', '屋敷は取った！　南木戸を出て、西木戸へ登れ！', 4);
    roadPoint(ONO_WEST_APPROACH, rt.player.u.pos, ROUTE_FROM, rt.army, rt.player.u);
    F.kyoTrailIdx = Number.isFinite(ROUTE_FROM.d) ? Math.ceil(ROUTE_FROM.s) : 0;
    trailAhead(rt, ONO_WEST_APPROACH, F.kyoTrailIdx);
    nextObj(rt, onogiExitTask(rt) || '西木戸を破って京極丸へ');
    rt.marker('trail', () => F.trailPoint, () => assaultTrailLabel(rt), { h: 1.3, guideAlways: true, alwaysDistance: true });
    for (const g of F.oda) {
      const c = g.center(), u = g.units.find(battleReady);
      if (!u) continue;
      g.odaniPlayerPause = false; g.order = 'path'; g.path = ONO_WEST_ENTRY;
      // 九十九折りの隣の段の角を選ばない（高さの違う角は遠いとみなす）。次の角から歩く。
      g.pathIdx = Math.min(ONO_WEST_ENTRY.length - 1, nearWay(rt, ONO_WEST_ENTRY, c, u.pos.y) + 1);
      g.aggro = 4; g.speed = 4.2; g.formation = 'column';
      g.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 40; gg.formation = 'yari'; gg.anchor = { x: KC.x, z: KC.z }; };
    }
    rt.marker('kyo', centerOf(F.kyoGate), () => '西の口の門兵', { red: true, group: F.kyoGate });
  },

  // ③ 分断：京極丸を取り、本丸と小丸が切れる
  cut(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t; F.captureT = 0;
    rt.setPhase('cut');
    rt.unmark('kyo'); rt.unmark('kyoAid'); rt.unmark('trail');
    // 紙（battle_events_1101 15）の勝利条件：京極丸を奪って浅井父子を分断する。ここで務めを果たしたとする（落城まで続けて見せる）
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '京極丸を奪い、浅井父子を分断した', pts: 20 }; }, '京極丸を取った');
    nextObj(rt, '京極丸の内で南北の反撃を退けよ');
    // 京極丸を取った手柄はここで付ける（信長が上がるのは小丸が落ちた後。honStart）
    F.nobuUp = true;
    sfx('sig_tomare', 0.7);
    rt.banner('浅井軍、二つに切れる', '本丸の長政と小丸の久政、父子の間が断たれた');
    // 京極丸の浅井の旗を倒す。夜の空は数分で朝に変えない
    (F.flagsKyo || []).forEach((n2, i) => rt.after(0.6 + i * 0.5, () => { n2.rotation.z = 1.3; }));

    // 二つに切れた城を見せる（南の本丸・北の小丸に印を少しの間）
    // 攻めない奥に目標の印を置かず、今守る京極丸へ案内する。
    F.trailPoint.x = KC.x; F.trailPoint.z = KC.z;
    rt.marker('cutHon', () => F.trailPoint, () => F.retreatOn || F.guideBlocked ? '' : retShown(rt) ? '来た道の角へ戻れ' : F.C.kuruwa.kyogoku.test(rt.player.u.pos.x, rt.player.u.pos.z) ? F.cutTarget ? '京極丸の敵を退けよ' : '京極丸を守れ' : '坂道を通り、京極丸へ戻れ', { h: 2, guideAlways: true, alwaysDistance: true });
    rt.say('羽柴秀吉', '京極丸の内で反撃を退けよ。櫓へは登るな', 4.5);
    rt.after(5, () => { if (F.step === 3 && !F.ending && !F.komaAttack && !F.retreatOn) rt.say('先手組頭', '南北へ味方を回す。おぬしは内に残って守れ', 4); });
    rt.after(10, () => { if (F.step === 3 && !F.ending && !F.komaAttack && !F.retreatOn && !gone(F.north)) rt.say('浅井の兵', '北の久政様へ道を開け！　京極丸を取り返せ！', 3); });
    // 連絡を断たれた守りは動揺するが、反撃の槍列は残す。
    // 連絡を断たれた守りは大きく動揺する（反撃の槍列は出るが、押されると崩れやすい）。
    for (const g of F.counter) g.morale = Math.min(g.morale, 50);
    for (const g of F.komaGuards) g.morale = Math.min(g.morale, 55);
    this.march(F.south, [[-3, NAKAMARU.cz - 3], [0, GATE_NAKA_KYO.z], [0, KC.z + 7]], Math.PI);
    this.march(F.north, [[3, KOM.cz + 3], [0, GATE_KYO_KOMA.z], [0, KC.z - 7]], 0);
    for (const g of F.oda) if (!gone(g)) {
      g.order = 'hold'; g.anchor = { x: KC.x, z: KC.z + (g === F.hide ? 4 : -4) };
      g.formation = 'yari'; g.facing = g === F.hide ? 0 : Math.PI; g.aggro = 12;
    }
    // 既存の足軽を二つの口へ分ける。欠員も同じ攻め手から補う。
    F.kyoHolders = [];
    for (const z of [KYO.z1 - 4, KYO.z0 + 4]) {
      const g = rt.army.addGroup({ team: 0, faction: 'oda', name: '京極丸に残る押さえ', order: 'hold', formation: 'yari', width: 3, anchor: { x: 0, z }, facing: z > KC.z ? 0 : Math.PI, aggro: 4 });
      g.historicalOrders = true;
      F.kyoHolders.push(g);
    }
    this.staffHolders(rt);
    // 谷に控えた後詰が登ってきて、京極丸の押さえに入る（先手は次の小丸へ回れる）。
    const Gz = F.gozume;
    if (!gone(Gz)) {
      const c = Gz.center();
      roadPoint(ONO_WEST_ENTRY, c, ROUTE_FROM, rt.army, Gz.units.find((q) => q.alive));
      Gz.order = 'path'; Gz.path = [...ONO_WEST_ENTRY, [KC.x, KC.z]]; Gz.pathIdx = Number.isFinite(ROUTE_FROM.d) ? Math.ceil(ROUTE_FROM.s) : 0;
      Gz.speed = 3.4; Gz.formation = 'column'; Gz.aggro = 6;
      Gz.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: KC.x, z: KC.z }; g.formation = 'yari'; g.aggro = 10; };
    }
    // 父子の間が切れた。ここから使番は通れず、小丸の兵は逃げはじめる（splitTick）。
    F.splitT = rt.t; F.runnerN = 0; F.runnerAt = rt.t + 6; F.desertAt = rt.t + 10; F.deserted = 0;
    nextObj(rt, '京極丸で南北の反撃を退けよ');
  },

  // 京極丸を取った効き目：本丸と小丸の間の使番は道が無く引き返し、小丸の側は士気が落ちて兵が逃げる。
  // 数の帯（両軍の人数）と、兵の動きで分かるようにする。字の札は足さない。
  splitTick(rt) {
    const F = rt.flags;
    if (F.splitT === undefined || F.ending || rt.t < (F.splitTickAt || 0)) return;
    F.splitTickAt = rt.t + 1;
    for (const g of [F.koma, F.sanno, F.north]) if (!gone(g)) g.morale = Math.max(F.komaAttack ? 15 : 30, g.morale - 1.5);
    for (const g of [F.south, F.kyoAid]) if (!gone(g)) g.morale = Math.max(50, g.morale - .5);
    if (F.runnerN < 4 && rt.t >= F.runnerAt && !F.komaDown) {
      this.sendRunner(rt, F.runnerN % 2 === 0);
      F.runnerN++; F.runnerAt = rt.t + 13;
    }
    if (!F.komaDown && F.deserted < 12 && rt.t >= F.desertAt) {
      F.desertAt = rt.t + (F.komaAttack ? 3.5 : 6);
      for (const g of [F.north, F.koma, F.sanno]) {
        if (gone(g)) continue;
        const u = g.units.find((q) => battleReady(q) && q !== g.leader && !q.name && q.type !== 'samurai');
        if (!u) continue;
        // 尾根の西の斜面へ逃げ下る（小丸の兵が減っていくのが、数の帯と兵の背中で見える）。
        u.moraleFleeDir = { x: -.85, z: -.5 }; u.fleeing = true; u.fleeT = rt.army.time;
        u.target = null; u.atk = null; u.swing = null; u.aiT = 0;
        F.deserted++;
        if (F.deserted === 2) rt.say('浅井の兵', '本丸と切れた……小丸はもう持たぬ！', 3);
        break;
      }
    }
  },

  // 本丸・小丸の使番が京極丸へ走り、羽柴の手を見て引き返す。討たれれば知らせは届かない。
  sendRunner(rt, south) {
    const F = rt.flags;
    let u = null, from = null;
    for (const g of south ? [F.akao, F.kyoAid, F.south] : [F.koma, F.sanno, F.north]) {
      if (gone(g)) continue;
      u = g.units.find((q) => battleReady(q) && q !== g.leader && q.type === 'ashigaru');
      if (u) { from = g; break; }
    }
    if (!u) return;
    const g = rt.army.addGroup({ team: 1, faction: 'azai', name: '浅井の使番', order: 'hold', anchor: { x: u.pos.x, z: u.pos.z }, formation: 'column', width: 1, morale: 60, aggro: 0 });
    g.historicalOrders = true;
    from.units.splice(from.units.indexOf(u), 1);
    for (let i = 0; i < from.units.length; i++) from.units[i].slot = i;
    u.group = g; u.slot = 0; g.units.push(u); g.leader = u; g.initial = 1;
    u.target = null; u.moveTo = null; u.aiT = 0;
    const start = [u.pos.x, u.pos.z];
    const via = south ? [[0, NAKAMARU.cz], [0, GATE_NAKA_KYO.z]] : [[0, KOM.cz], [0, GATE_KYO_KOMA.z]];
    const end = south ? [0, KYO.z1 + 1] : [0, KYO.z0 - 1];
    const back = [end, ...via.slice().reverse(), start];
    this.march(g, [start, ...via, end], south ? Math.PI : 0);
    g.speed = 3.8; g.aggro = 0;
    g.onArrive = (q) => {
      if (!q.units[0]?.alive) return;
      rt.army.play('eshout', q.units[0].pos, .8);
      if (!F.runnerSaid) { F.runnerSaid = true; rt.say('浅井の使番', south ? '京極丸は敵の手じゃ！　小丸へ通れぬ！' : '京極丸は敵の手じゃ！　本丸へ通れぬ！', 3); }
      this.march(q, back, south ? 0 : Math.PI);
      q.speed = 3.8; q.aggro = 0;
      // 戻ったら元の組へ入り直す（その場で突っ立たせない）。
      q.onArrive = (r) => {
        const v = r.units[0];
        if (!v?.alive || gone(from)) { r.order = 'attack'; r.aggro = 10; r.seekRange = 20; return; }
        r.units.length = 0; v.group = from; v.slot = from.units.length; from.units.push(v); v.aiT = 0;
      };
    };
  },

  staffHolders(rt) {
    const F = rt.flags;
    for (const g of F.kyoHolders) {
      let ready = 0;
      for (const u of g.units) if (u.alive && !u.fleeing && !u.gone && !u.woundOut && !u.noTarget) ready++;
      if (ready >= 2) continue;
      // 羽柴の先手を先に使い、足りない時だけ秀吉の足軽を回す。本人の組は動かさない。
      for (let s = F.oda.length - 1; s >= 0 && ready < 3; s--) {
        const source = F.oda[s];
        if (gone(source)) continue;
        let moved = false;
        for (let i = source.units.length - 1; i >= 0 && ready < 3; i--) {
          const u = source.units[i];
          if (!u.alive || u.fleeing || u.gone || u.woundOut || u.noTarget || u.stdHeld || u.type !== 'ashigaru') continue;
          source.units.splice(i, 1); u.group = g; u.slot = g.units.length;
          u.target = null; u.moveTo = null; u.aiT = 0; g.units.push(u); ready++; moved = true;
        }
        if (moved) {
          source.initial = source.units.length;
          for (let i = 0; i < source.units.length; i++) source.units[i].slot = i;
          // 倒れた者の空席を前に残さず、補った槍を木戸のそばへ並べる。
          let slot = 0;
          for (let i = 0; i < g.units.length; i++) {
            const u = g.units[i];
            if (!u.alive || u.fleeing || u.gone || u.woundOut || u.noTarget) continue;
            g.units[i] = g.units[slot]; g.units[slot++] = u;
          }
          for (let i = 0; i < g.units.length; i++) g.units[i].slot = i;
          g.initial = slot; g.routed = false; g.order = 'hold'; g.focus = null;
          g.morale = Math.max(70, g.morale); g._fitAt = 0;
        }
      }
    }
  },

  march(g, path, facing) {
    if (gone(g)) return;
    g.order = 'path'; g.path = path; g.pathIdx = 0; g.speed = 2.6;
    g.formation = 'column'; g.colW = 2; g.facing = facing;
    // 後列も門へ続く道に沿わせる。旋回中の直線の持ち場を切岸へ出さない。
    g.roadColumn = true;
    g.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: path[path.length - 1][0], z: path[path.length - 1][1] }; q.formation = 'yari'; q.aggro = 14; };
  },

  // 京極丸を本人と守ってから、押さえを残し、小丸への攻めを始める。
  attackKoma(rt) {
    const F = rt.flags;
    if (F.komaAttack || F.ending) return;
    F.komaAttack = true; F.komaAttackT = rt.t; F.captureT = 0; F.guideBlocked = false;
    rt.unmark('cutHon'); rt.unmark('cutKom');
    sfx('sig_susume', 0.8);
    nextObj(rt, '秀吉と北木戸を抜け、小丸へ進め');
    rt.say('羽柴秀吉', '押さえは残れ。おぬしはわしと北木戸から小丸へ進め！', 4);
    const path = [[KC.x, KC.z], [GATE_KYO_KOMA.x, KYO.z0 + 2], [GATE_KYO_KOMA.x, GATE_KYO_KOMA.z], [KOM.x, KOM.z1 - 2], [KOM.x, KOM.cz + 4]];
    F.komaPath = path; F.komaIdx = 0;
    F.trailPoint.x = path[0][0]; F.trailPoint.z = path[0][1];
    rt.marker('trail', () => F.trailPoint, () => F.retreatOn || F.guideBlocked ? '' : retShown(rt) ? '来た道の角へ戻れ' : F.C.kuruwa.koma.test(rt.player.u.pos.x, rt.player.u.pos.z) ? F.komaTarget ? '小丸の残る守りへ' : '小丸を押さえよ' : '北の木戸から小丸へ', { h: 1.3, guideAlways: true, alwaysDistance: true });
    // 南北の押さえは別の組へ移した兵が守る。残る先手も小丸へ続き、秀吉だけに後続を任せない。
    for (const g of F.oda) {
      g.odaniPlayerPause = false;
      this.march(g, path, Math.PI);
    }
    const northRoad = ROAD_RIDGE.filter((q) => q[1] <= KOM.cz && q[1] >= SANNO.z1 - 5).reverse();
    this.march(F.sanno, [[0, SANNO.z1 - 5], ...northRoad, [0, KOM.cz - 3]], 0);
  },

  // 届かない残兵も退く。総大将や居所の人物は退かせず、討死にも数えない。
  // 待ち時間は敵の出撃と道案内に使う。木戸と占領の判定は飛ばさない。
  reliefTick(rt) {
    const F = rt.flags;
    if (F.step < 1 || rt.t < (F.pressureAt || 0)) return;
    const stage = F.step === 2 && F.onoDone ? 2.5 : F.step === 3 && F.komaAttack ? 4 : F.step;
    // 谷と屋敷の守りを、四十五秒後に全員「本人を六十メートル追え」へ変えない。
    // 近い攻め手と戦う指定を保つ。味方の道順待ちと、尾根の反撃の助けは続ける。
    const enemies = stage <= 2 ? NO_VALLEY_PURSUIT : stage === 2.5 ? F.kyoGuards : stage === 3 ? F.counter : F.komaGuards;
    pressureTick(rt, stage, enemies, F.oda, stage === 1 ? '谷道を上り、秀吉の旗へ続け' : stage === 2 ? '屋敷の南の木戸へ。味方と守りを崩せ' : stage === 2.5 ? '西の木戸を破り、京極丸の内の旗へ行け' : stage === 3 ? '京極丸の内へ戻れ。南北の口を守れ' : '北の木戸から小丸へ。内の守りを崩し、組で旗を守れ');
    // 道案内は任務の札で続ける。同じ下知を三十秒ごとに重ねない。
    F.pressureSayAt = Infinity;
  },

  // 小丸が落ちる：孤立した久政は館で自害。小丸の残りは逃げ、戦線は本丸へ移る。
  komaFall(rt) {
    const F = rt.flags;
    if (F.ending || F.komaDown) return;
    F.komaDown = true;
    nextObj(rt, '尾根を南へ、本丸へ進め');
    rt.award((t) => t.side.push('小丸を落とした'), '小丸を落とした');
    for (const g of [F.koma, F.sanno, F.north]) if (!gone(g)) for (const u of g.units) if (battleReady(u)) {
      u.moraleFleeDir = { x: -.85, z: -.5 }; u.fleeing = true; u.fleeT = rt.army.time; u.target = null; u.aiT = 0;
    }
    // 館から火。浅井の旗が倒れる。久政は前に出さず、館の奥で果てた（字の札は出さず、声と火で）。
    const h = F.hisamasa?.units[0];
    if (h) { h.gone = true; if (h.mesh) h.mesh.visible = false; }
    rt.world.addFire(KOM.x - 5.4, KOM.z0 + 4.5, { h: 2.6, size: 1.1 });
    (F.flagsKom || []).forEach((n2, i) => rt.after(0.4 + i * 0.5, () => { n2.rotation.z = 1.3; }));
    sfx('kane', 0.6);
    rt.say('浅井の兵', '久政様が館で腹を召された！　鶴松大夫殿が介錯し、後を追われた！', 3.5);
    rt.after(4, () => this.honStart(rt));
  },

  // 本丸へ戦線が移る。長政の旗本が北の口から打って出る（最後の抵抗）。
  honStart(rt) {
    const F = rt.flags;
    if (F.ending || F.honAttack) return;
    F.honAttack = true; F.honT = rt.t; F.captureT = 0; F.guideBlocked = false; F.guideReturning = false;
    const gate = F.C.gateObjs?.g_hon_n;
    if (gate?.struct) { gate.struct.opened = true; gate.open?.(); }
    sfx('sig_susume', 0.8);
    rt.after(1.2, () => { if (!F.ending) sfx('toki', 0.8); });
    rt.say('羽柴秀吉', '小丸は落ちた！　尾根を南へ、本丸へ進め！', 4);
    // 信長公記・信長記：小丸が落ちた後、信長自ら京極丸へ上がり、長政の本丸を攻めさせた。
    //   供は馬廻と小姓（柴田・丹羽が京極丸にいた記録は無いので出さない）。信長は床几に座り前へ出ない。
    if (!F.nobuG) rt.after(6, () => {
      if (F.ending || F.nobuG) return;
      const at = { x: KC.x - 4, z: KC.z + 10 };
      F.nobuG = allyGroup(rt, { faction: 'oda', fixed: true, noRout: true, order: 'hold', name: '織田信長の旗本', anchor: at, facing: 0, width: 3, aggro: 4, seekRange: 6 },
        dress([{ type: 'busho', n: 1, o: { name: '織田信長', invuln: true, horse: false } }, { type: 'samurai', n: 8 }], ODA));
      const nobu = F.nobuG.units.find((u) => u.name === '織田信長'); if (nobu) nobu._crouch = true;
      rt.say('織田信長', '藤吉郎、ようした。備前の本丸を攻め落とせ', 4);   // 筑前守は天正三年から（十4）
      // 11/6 fix61（kaito BR「後続が来ない・軍勢対軍勢に」）：信長が連れて上がった新手の馬廻と鉄砲衆が、京極丸から尾根を南へ本丸を攻める
      //   （信長公記「備前の丸を攻めさせ」。夜討ちで討ち減らされた羽柴の手だけで本丸へ寄せない）。
      F.umaG = allyGroup(rt, { faction: 'oda', fixed: true, noRout: true, name: '織田の新手', anchor: { x: KC.x + 4, z: KC.z + 6 }, facing: 0, width: 6, aggro: 8, formation: 'column', colW: 2, spacing: 1.2 },
        dress([{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 2, o: { tatake: true } }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 5 }], ODA));
      F.umaG.defMult = 1.8;
      this.march(F.umaG, [[KC.x + 4, KC.z + 6], ...F.honPath.slice(4, -1)], 0);
      F.umaG.speed = 4;
      F.umaG.onArrive = (q) => { q.order = 'attack'; q.seekRange = 30; q.formation = 'yari'; q.anchor = { x: 0, z: HON.cz }; };
    });
    rt.after(9, () => {
      if (F.ending || F.ichiOut) return;
      F.ichiOut = true;
      rt.banner('お市の方、城を出る', '長政の妻・お市の方と三人の娘が、本丸から織田方へ');
      rt.say('お市の方', '娘たちを連れて参ります。殿は、城に残られると……', 4);
      rt.after(4.5, () => { if (!F.ending) rt.say('羽柴秀吉', 'お市様と姫たちを丁重にお迎えせよ。刃を向けるな', 3.5); });
      // 紙（battle_events_1101 15）：お市と三姉妹の姿（cloud_ev3 の残り）。小袖で中丸から京極丸の織田方へ歩き、着いたら場を離れる。
      //   具足は着けない（kacchu_required.js の決まり）。刃を向けられない・討たれない。
      const lady = (name, col) => ({ type: 'porter', n: 1, o: { name, invuln: true, horse: false, kosode: 1, kosodeCol: col, hat: 'none', flag: null, haori: 0, sode: false, kote: 0, menpo: 0, keep: true } });
      F.ichiG = allyGroup(rt, { faction: 'oda', fixed: true, noRout: true, name: 'お市の方と姫たち', anchor: { x: 2, z: NAKAMARU.cz }, facing: 0, width: 2, aggro: 0, seekRange: 0, morale: 100 },
        [lady('お市の方', 0x6a2a3a), lady('茶々', 0x8a4a5a), lady('初', 0x5a5a7a), lady('江', 0x7a6a4a), { type: 'samurai', n: 2, o: { keep: true } }]);
      for (const u of F.ichiG.units) { u.noTarget = true; u.invuln = true; }
      F.ichiG.order = 'path'; F.ichiG.path = [[0, GATE_NAKA_KYO.z], [KC.x, KC.z]]; F.ichiG.pathIdx = 0; F.ichiG.speed = 1.6;
      rt.after(40, () => { if (F.ichiG) { evRemove(rt, F.ichiG); F.ichiG = null; } });
    });
    rt.after(5, () => { if (!F.ending) rt.say('浅井長政', '浅井の意地を見せよ！　本丸の口、一歩も退くな！', 3.5); });
    const p = rt.player.u.pos;
    F.honPath = [[p.x, p.z], [0, KOM.z1], [0, GATE_KYO_KOMA.z], [KC.x, KC.z], [0, GATE_NAKA_KYO.z], [0, NAKAMARU.cz], [0, OHORIKIRI.z], [0, HON.z0 + 2], [0, HON.cz]];
    F.honIdx = 1;
    F.trailPoint.x = F.honPath[1][0]; F.trailPoint.z = F.honPath[1][1];
    rt.marker('trail', () => F.trailPoint, () => '', { h: 1.3, guideAlways: true, alwaysDistance: true });
    nextObj(rt, '本丸へ攻め上れ');
    for (const g of [...F.oda, F.gozume]) if (!gone(g)) {
      const c = g.center();
      this.march(g, [[c.x, c.z], ...F.honPath.slice(1, -1)], 0);
      g.speed = 4;
      g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 30; q.formation = 'yari'; q.anchor = { x: 0, z: HON.cz }; };
    }
    for (const g of F.kyoHolders || []) if (!gone(g)) { g.order = 'attack'; g.seekRange = 20; }
    // 長政の旗本は北の口から大堀切の土橋へ打って出る。中丸・南の組も本丸を背に構え直す。
    for (const g of [F.honGuard, F.south, F.kyoAid, F.akao]) if (!gone(g)) {
      g.guard = false; g.morale = Math.max(g.morale, 85);
      g.order = 'attack'; g.seekRange = 40; g.aggro = 14; g.focus = null;
    }
    F.honGuard.noRout = true;
    this.march(F.honGuard, [[0, HON.cz + 7], [0, HON.z0 + 2], [0, OHORIKIRI.z + 4]], Math.PI);
    // 紙（battle_events_1101 15・kaito 11/1）：長政は旗本と本丸の北の口へ出て最後の抵抗をするが、討たれず赤尾屋敷で自害する
    const ng = F.nagamasa, nu = ng?.units[0];
    if (nu?.alive) {
      // 紙 15：長政は討たれず、最後の抵抗の後に赤尾屋敷で自害する（討てる大将にしない）
      nu.invuln = true; nu.noTarget = false; nu.campProtected = false; nu.dmg = nu.dmg0 || nu.dmg || 1;
      nu._crouch = false;   // 床几から立ち、旗本と本丸の口へ出る
      ng.fixed = false; ng.noGuard = false; ng.morale = 100; ng.noRout = true; ng.aggro = 10;
      // 御殿の奥から出る間に壁で止まらないよう、御殿の前（本丸の北寄り）へ出て構える。本人はまだ京極丸の側で見ていない
      const fx = 0, fz = HON.z0 + 6;
      nu.pos.set(fx, rt.world.heightAt(fx, fz), fz); nu.target = null; nu.moveTo = null; nu.aiT = 0;
      this.march(ng, [[fx, fz], [0, HON.z0 + 4]], Math.PI);
      ng.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: 0, z: HON.z0 + 4 }; q.formation = 'yari'; q.aggro = 10; q.seekRange = 14; };
    }
    F.honGuard.onArrive = (q) => { q.order = 'attack'; q.seekRange = 30; q.aggro = 14; q.formation = 'yari'; };
  },

  honTick(rt, dt, updateHud) {
    const F = rt.flags, p = rt.player.u.pos;
    if (F.fallen) return;
    if (updateHud) {
      let idx = F.honIdx;
      while (idx < F.honPath.length - 1 && Math.hypot(p.x - F.honPath[idx][0], p.z - F.honPath[idx][1]) < 4) idx++;
      F.honIdx = wayTrail(rt, F.honPath, idx);
    }
    // 旗本と中丸の残りが崩れたら本丸は落ちる（遅くとも一分半で、大手の本隊も本丸の門へ届く）。
    let left = 0;
    for (const g of [F.honGuard, F.south, F.kyoAid]) if (!gone(g)) for (const u of g.units) if (battleReady(u) && u.pos.z > NAKAMARU.z0 - 4) left++;
    F.honLeft = left;
    // 11/6 fixc1844（critic60「本丸へ行かずに⑤が済む」）：本人が本丸の北の口の四十五メートル内へ来るまで、長政の最期の時を進めない
    //   本人が京極丸で南からの寄せと斬り合い続ける時は、七十五秒たてば大手の本隊が本丸へ届く（何もしない時に戦が終わらないのを防ぐ）
    if (F.honT0 === undefined) F.honT0 = F.honT;
    if (rt.player.u.alive && Math.hypot(p.x, p.z - HON.z0) > 45 && rt.t - F.honT0 < 75) { if (!F.nagaCharge) F.honT = Math.max(F.honT, rt.t - 4); else if (!F.akaoGo) F.nagaT = Math.max(F.nagaT, rt.t - 6); }
    if (updateHud && !F.retreatOn) {
      const text = F.nagaCharge ? '長政の最後の寄せを受け止めよ' : left > 0 && Math.hypot(p.x, p.z - HON.z0) < 30 ? '長政の旗本を崩せ' : '本丸へ攻め上れ';
      const task = rt.objectives.find((o) => o.id === 'main');
      if (task?.text !== text) nextObj(rt, text);
    }
    const nu = F.nagamasa?.units[0];
    // 旗本が崩れるか十二秒たつと、長政が自ら打って出る（最後の抵抗）
    if (nu?.alive && !F.nagaCharge && (left <= 2 && rt.t - F.honT > 6 || rt.t - F.honT > 12)) {
      F.nagaCharge = true;
      const ng = F.nagamasa;
      // 11/3 kaito O：大将は足軽と斬り合わない。長政は本丸の北の口まで旗本と出て采を振るだけ（足軽の本人を狙わない）。斬り合うのは旗本
      this.march(ng, [[0, HON.z0 + 4], [0, HON.z0 + 1.5]], Math.PI);
      ng.speed = 2.4; ng.aggro = 3; ng.seekRange = 3;
      ng.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: 0, z: HON.z0 + 1.5 }; q.aggro = 3; q.seekRange = 3; q.focus = null; };
      if (!gone(F.honGuard)) { F.honGuard.guardLeash = 14; F.honGuard.aggro = 16; F.honGuard.seekRange = 18; }
      rt.say('浅井長政', '旗本ども、本丸の口を固めよ！　一人も通すな！', 3.5);
      F.nagaT = rt.t;
    }
    // 最後の抵抗：二十秒ほど打ち合うか旗本が尽きると、長政は赤尾屋敷へ退き、そこで自害する
    if (nu?.alive && F.nagaCharge && !F.akaoGo && (rt.t - F.nagaT > 22 || left <= 0 && rt.t - F.nagaT > 8)) {
      F.akaoGo = true;
      const ng = F.nagamasa;
      ng.order = 'move'; ng.focus = null; ng.aggro = 0; ng.seekRange = 0;
      this.march(ng, [[nu.pos.x, nu.pos.z], [0, HON.z0 + 2], [AKAO.x, AKAO.z]], 0);
      ng.speed = 3.6;
      rt.say('浅井長政', 'もはやこれまで。赤尾の屋敷へ退く。浅井の名は汚さぬ', 4);
      rt.after(9, () => {
        if (F.ending) return;
        nu.gone = true; if (nu.mesh) nu.mesh.visible = false;
        rt.world.addFire(AKAO.x, AKAO.z, { h: 2.4, size: 1.1 });
        sfx('kane', 0.7);
        rt.banner('浅井長政、自害', '赤尾屋敷で長政が果てた。浅井家は滅びる');
        (F.trig ||= []).push('fall:nagamasa');
        this.castleFall(rt);
      });
    }
    if (!nu && !F.fallen) this.castleFall(rt);
  },

  // 落城：本丸の旗が倒れ、御殿から火。長政は赤尾屋敷へ退く（最期は後日の知らせで）。
  castleFall(rt) {
    const F = rt.flags;
    if (F.ending || F.fallen) return;
    F.fallen = true;
    nextObj(rt, '本丸の前で勝ち鬨を上げよ');
    for (const g of [F.honGuard, F.south, F.kyoAid, F.akao]) if (!gone(g)) for (const u of g.units) if (battleReady(u)) {
      u.moraleFleeDir = { x: .7, z: .7 }; u.fleeing = true; u.fleeT = rt.army.time; u.target = null; u.aiT = 0;
    }
    (F.flagsHon || []).forEach((n2, i) => rt.after(0.3 + i * 0.5, () => { n2.rotation.z = -1.3; }));
    rt.world.addFire(HON.x - 7.2, HON.cz - 4, { h: 3, size: 1.3 });
    sfx('kane', 0.8);
    rt.say('羽柴秀吉', '本丸は落ちた！　備前守殿は赤尾屋敷で果てられた', 4);
    rt.after(4.5, () => this.win(rt));
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; F.trailSign.visible = false; rt.setPhase('end');
    F.retreatOn = false;
    for (const id of ['hide', 'trail', 'retreat', 'ono', 'kyo', 'cutHon', 'cutKom', 'yakata', 'watch', 'patrol', 'relief']) rt.unmark(id);
    for (const nest of F.nests || []) rt.unmark(nest.id);
    rt.uninteract('talk');
    rt.uninteract('oteRoad'); F.oteColumn.halt();
    rt.objDone('main'); rt.tracker.main = true;
    // 主人公を英雄にしない。京極丸を奪った一手で、城全体の釣り合いが崩れた事を伝える。
    if (!F.nobuUp) rt.award((t) => { t.main = true; t.special = { label: '京極丸を奪い、浅井父子を分断した', pts: 20 }; }, '小谷城が落ちた');
    rt.banner('小谷城、落ちる', '京極丸で割れた城は、小丸から本丸へと崩れた');
    rt.say('羽柴秀吉', `${nm(rt)}、皆で京極丸を取ったあの一手で、この大きな城が割れたのじゃ`, 4.5);
    rt.after(5, () => { if (!F.ichiOut) odaniFarewell(rt); rt.say('', '――久政は小丸で、長政は赤尾屋敷で自害し、赤尾清綱も討たれた。浅井家は滅びた', 4.5); });
    rt.finish({ scriptedEnd: true }, 15.5);
  },

  lose(rt, why = '京極丸の持ち場を守れなかった') {
    if (!rt.canFailMission()) return;
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; F.trailSign.visible = false; rt.setPhase('end');
    rt.objFail('main'); rt.tracker.main = false;
    // 退き太鼓の後は退却だけを示す。失敗前の攻めや手当ての印を残さない。
    F.retreatOn = false;
    rt.objRemove('main');
    for (const id of ['hide', 'trail', 'retreat', 'ono', 'kyo', 'cutHon', 'cutKom', 'yakata', 'watch', 'patrol', 'relief']) rt.unmark(id);
    for (const nest of F.nests || []) rt.unmark(nest.id);
    rt.uninteract('talk');
    rt.uninteract('oteRoad'); F.oteColumn.halt();
    rt.banner('この組は攻めを果たせず', why);
    sfx('sig_nobiki', 0.8);
    rt.obj('withdraw', '退き太鼓。動ける者は来た道を谷へ下がれ', 'order', true);
    rt.say('組頭', '退き太鼓じゃ、もう持たん！　動ける者は来た道を谷へ下がれ！', 4);
    // 退き太鼓の間は、今の下知を後日の知らせで隠さない。
    rt.finish({ scriptedEnd: true }, 9);
  },

  onFinish(rt, info) {
    // 終幕中は戦の更新が止まるため、決着の瞬間にも安全な視点へ移す。
    if (info.down) odaniDownCamera(rt, rt.camera);
  },

  ambushTick(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    if (rt.t < (F.ambushNext || 0)) return;
    F.ambushNext = rt.t + .5;
    // 先手だけが遠くで戦わないよう、自分から離れた列は道で待つ。
    for (const g of F.oda) {
      const c = g.center();
      const path = F.step === 2 ? F.onoDone ? ONO_WEST_ENTRY : ROUTE_O : VALLEY_ROUTE;
      roadPoint(path, c, ROUTE_FROM);
      roadPoint(path, p, ROUTE_TO);
      const ahead = ROUTE_FROM.s > ROUTE_TO.s;
      const distance = Math.hypot(c.x - p.x, c.z - p.z);
      // 番兵と槍を合わせる時は近くの先手も止まり、攻め手を一人残して次の角へ進まない。
      // 遅れている列はそのまま合流させる。退き口が出た時も、近い列を先へ送らない。
      const waitFight = ahead && distance < 16 && (F.retreatOn || rt.botRest || F.step === 1 && F.valleyFighting);
      // 九十九折りの上の段と虎口へ向かう間（二の段）は待たない。狭い一本道で止まると、後ろの本人の道を塞ぐ。
      if (g.order === 'path' && F.step === 1 && !g.odaniPlayerPause && (waitFight || ahead && distance > 16)) {
        // 道順と先頭の位置を保って待つ。持ち場を直線に戻すと後列が切岸へ出てしまう。
        g.odaniMarchSpeed = g.speed; g.speed = 0; g.odaniPlayerPause = true;
      } else if (g.odaniPlayerPause && (F.step !== 1 || g.order !== 'path' || !waitFight && (!ahead || distance < 12))) {
        g.speed = g.odaniMarchSpeed; g.odaniPlayerPause = false;
      }
      if (g.odaniPlayerPause) g.pressureWait = 0;
    }
    if (F.step !== 1) return;
    if (F.patrolWave >= AMBUSH_IDS.length) return;
    const wave = F.patrolWave;
    // 時刻だけで次の六人を重ねない。退く間と、前の番兵が近くで戦う間は待つ。
    // 道の外へ離れた残兵まで全滅を待たず、登り口の守りは元の判定に任せる。
    if (F.retreatOn) return;
    // 大軍対大軍（kaito 10/31）：一組目が出たら、残る番兵も待たずに続けて出し、三組で一つの塊として寄せる。
    const massGo = wave > 0;
    if (!massGo) for (let i = 0; i < wave; i++) for (const u of F[AMBUSH_IDS[i]].units) {
      if (battleReady(u) && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 20) return;
    }
    // 前の番兵が崩れたら、谷の途中でも次を出す。三組の戦い自体は省かない。
    // 交戦中と退く間の待ちは上で保ち、空の道で出撃時刻だけを待たせない。
    const atMouth = Math.hypot(p.x - BELOW.x, p.z - BELOW.z) < 20;
    const post = F[AMBUSH_IDS[wave]].anchor;
    const atPost = Math.hypot(p.x - post.x, p.z - post.z) < 12;
    const cleared = wave === 0 || gone(F[AMBUSH_IDS[wave - 1]]);
    // 前の組が崩れ、次の持ち場に着いたら、登り口と同じ間で番兵を寄せる。
    // 近くの前の番兵との交戦は上で待つ。三組の兵と道順は保つ。
    const ready = rt.t - (F.ambushWaveAt ?? F.stepT) >= (atMouth || atPost && cleared ? 3 : 12);
    if (!massGo && (!ready || rt.t - F.stepT < AMBUSH_TIMES[wave] && !((wave > 0 || atMouth || atPost || F.climbNudge) && cleared))) return;
    const id = AMBUSH_IDS[F.patrolWave++], g = F[id];
    F.ambushWaveAt = rt.t;
    roadPoint(VALLEY_ROUTE, p, ROUTE_TO);
    let i = Math.min(VALLEY_ROUTE.length - 1, Math.floor(ROUTE_TO.s) + 1);
    let ax = ROUTE_TO.x, az = ROUTE_TO.z, distance = 9;
    for (; i < VALLEY_ROUTE.length; i++) {
      const q = VALLEY_ROUTE[i], len = Math.hypot(q[0] - ax, q[1] - az);
      if (len >= distance) { const t = distance / len; ax += (q[0] - ax) * t; az += (q[1] - az) * t; break; }
      distance -= len; ax = q[0]; az = q[1];
    }
    // 持ち場から谷道の角を通って寄せる。接敵時に座標を置き直さない。
    const center = g.center(), path = [[center.x, center.z]];
    roadPoint(VALLEY_ROUTE, center, ROUTE_FROM);
    ROAD_TEST.x = ax; ROAD_TEST.z = az;
    roadPoint(VALLEY_ROUTE, ROAD_TEST, ROUTE_TO);
    if (ROUTE_FROM.s > ROUTE_TO.s) {
      for (let j = Math.floor(ROUTE_FROM.s); j > ROUTE_TO.s; j--) path.push(VALLEY_ROUTE[j]);
    } else {
      for (let j = Math.floor(ROUTE_FROM.s) + 1; j < ROUTE_TO.s; j++) path.push(VALLEY_ROUTE[j]);
    }
    path.push([ax, az]);
    for (const u of g.units) {
      if (!u.alive) continue;
      u.odaniReleased = true; u.noTarget = false; u.aiT = 0;
    }
    // 二つ目の組は斜面の上から列の後ろ（浅野の手）へ駆け下り、隊を切る。前の組はそのまま登り続ける。
    if (wave === 1 && !gone(F.asano)) {
      const c = F.asano.center();
      path.length = 1; path.push([c.x, c.z]);
      F.splitOn = true; F.splitAt = rt.t;
      F.asano.odaniResume = true;
      F.asano.order = 'attack'; F.asano.seekRange = 16; F.asano.formation = 'yari'; F.asano.odaniPlayerPause = false;
      sfx('toki', 0.6);
      this.march(g, path, g.facing);
      g.onArrive = (q) => { q.order = 'attack'; q.focus = null; q.seekRange = 16; };
      g.seekRange = 16; g.focus = null;
      F[id + 'On'] = true;
      rt.say('先手組頭', '上から来た！　列が切られた。後ろは後続に任せ、前は登り続けよ！', 4);
      return;
    }
    // 主人公一人を囲まず、道で向き合う攻め手と槍を合わせる。
    this.march(g, path, g.facing);
    g.onArrive = (q) => { q.order = 'attack'; q.focus = null; q.seekRange = 12; };
    g.seekRange = 12; g.focus = null;
    F[id + 'On'] = true;
    rt.marker(id, unitPos(g.units[0]), '道の先の番兵', { red: true, group: g });
    rt.say('先手組頭', AMBUSH_LINES[wave], 4);
  },

  supportTick(rt) {
    const F = rt.flags;
    if (rt.t < (F.supportAt || 0)) return;
    F.supportAt = rt.t + 0.5;
    if (F.step !== 2 || F.onoDone || F.reliefOn) return;
    const count = F.oda.reduce((n, g) => n + g.count, 0);
    // 庭を取ったのに、隠れた四人の出撃時刻だけを待つ状態にしない。
    if (!gone(F.ono) && (rt.t - F.stepT < 12 || rt.t < 145 && count > F.odaInitial * 0.75)) return;
    F.reliefOn = true; F.helpUntil = rt.t + 45;
    const g = F.relief, start = F.onoHouse.doorOut;
    for (let i = 0; i < g.units.length; i++) {
      const u = g.units[i]; if (!u.alive) continue;
      u.pos.set(start.x + (i % 2 ? 0.5 : -0.5), rt.world.heightAt(start.x, start.z), start.z + Math.floor(i / 2));
      u.noTarget = false; u.odaniReleased = true; u.aiT = 0;
    }
    roadPoint(ROUTE_O, rt.player.u.pos, ROUTE_TO);
    const idx = Math.min(ROUTE_O.length - 1, Math.floor(ROUTE_TO.s) + 1);
    const path = ROUTE_O.slice(idx).reverse();
    this.march(g, [[start.x, start.z], ...path], 0);
    g.onArrive = (q) => { q.order = 'attack'; q.focus = null; q.seekRange = 12; };
    rt.say('組頭', gone(F.ono) ? '庭は取った！　南木戸から道へ戻り、小隊を退けよ'
      : F.onoInGarden ? '屋敷から新手じゃ！　庭の敵を味方と退けよ'
        : '屋敷から新手じゃ！　南木戸から庭へ進め', 4);
    rt.marker('relief', unitPos(g.units[0]), '味方を押す敵の小隊', { red: true, group: g });
  },

  update(rt, dt) {
    const F = rt.flags;
    // 谷の口に忍んで集まる間と、谷道の下の方を登る間は撃たれない（出曲輪の櫓門から七十メートル余り。夜で見えない。11/6）。
    //   屋敷へ攻めかかる下知（法螺と鬨）か、本人の列が出曲輪の五十五メートル内へ来た時から撃ち始める。
    if (F.K && !F.ending && (F.step >= 2 || F.step === 1 && Math.hypot(rt.player.u.pos.x - SIEGE.x, rt.player.u.pos.z - SIEGE.z) < 55)) F.K.tick(dt);
    // 始まりの見上げる間だけ霧を遠くへ。終わったら共通の近い霧へ戻す。
    const vista = F.step === 0 && rt.t < VISTA_T;
    if (vista !== !!F.vistaFog) {
      F.vistaFog = vista;
      if (vista) { rt.world.def.battleViewDistance = 260; rt.world.def.nightFogFar = 260; rt.world.def.fogFar = 700; }
      else { delete rt.world.def.battleViewDistance; delete rt.world.def.nightFogFar; delete rt.world.def.fogFar; }
    }
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    if (F.ending) return;
    if (F.objPending && !F.retreatOn && rt.t - (F.objSetAt ?? -99) >= 2) nextObj(rt, F.objPending);
    // 兵の傷の処理で先に倒れた場合も、共通の重傷・やり直し・結果へ渡す。
    // やり直しの札が出ている間は、その十五秒の期限と選択を保つ。
    if (!rt.player.u.alive) {
      if (!rt.over && !rt.retryOpen) rt.playerDown();
      return;
    }
    // 深手になる前に、歩いて来た道の後ろを示す。布を巻く間は退き口の案内を保つ。
    const u = rt.player.u;
    const bleeding = u.wounds?.bleed > .0001;
    if (F.retreatHp !== undefined && u.hp > F.retreatHp) F.retreatHp = u.hp;
    // 包帯を一度巻いた印は残り続ける。再出血した時は、今の退避中に血を止めたかで戻す。
    // 印へ着いて敵も離れたら、傷の残りや手当ての布切れで十二秒待たせない。
    // 布を巻いている間は退き口の案内を保ち、手当てが終わってから任務へ戻す。
    if (F.retreatOn && !rt.player.treating && (rt.t >= F.retreatUntil || !bleeding &&
      (u.hp >= u.maxHp * .65 || rt.player.treatmentLeft < F.retreatTreatmentLeft ||
        rt.player.inCombatT <= 0 && rt.player.sta >= 20 &&
        Math.hypot(u.pos.x - F.retreatPoint.x, u.pos.z - F.retreatPoint.z) <= 2.5))) {
      F.retreatOn = false;
      const task = rt.objectives.find((o) => o.id === 'main');
      if (task?.text === '退き口へ下がれ' && F.retreatTask) { rt.obj('main', F.retreatTask, 'main', true); F.objPending = null; F.objSetAt = rt.t; }
      F.retreatTask = '';
      if (rt.missionGuide) rt.missionGuide.scan = 0;
      rt.say('先手組頭', '持ち場へ戻れ。味方から離れるな', 3);
    }
    // 11/5（AT10）：傷のたびに退き口へ戻して「登れ」と「下がれ」を繰り返さない。
    // 手当ては今いる所で済ませる（四秒当たらなければ命が戻り、六秒で血も止まる。味方の陰なら「手当て」も使える）。
    if (rt.player.inCombatT > 0 && rt.t >= (F.meleeScanAt || 0)) {
      F.meleeScanAt = rt.t + 0.5;
      const foe = rt.army.nearestEnemy(rt.player.u, 5, (u) => !u.isStruct && u.type !== 'bow' && u.type !== 'gun');
      if (foe && !rt.army.wallBetween(rt.player.u.pos, 0, foe.pos)) F.lastMeleeAt = rt.t;
    }
    const guide = rt.missionGuide;
    if (guide) {
      // 共通の案内は札と印だけ。廃止された地面の矢印には触れない。
      const m = guide.marker;
      if (m && !m.red) {
        const point = typeof m.pos === 'function' ? m.pos() : m.pos;
        const far = point && Math.hypot(point.x - rt.player.u.pos.x, point.z - rt.player.u.pos.z) > 8;
        // 道の印は角の手前でも残す。八メートル以内で消すと、
        // 「次の印まで一メートル」の札だけが残り、進む向きが分からない。
        m.guideAlways = m.id === 'trail' || !!far;
        if (!far) guide.stalled = 0;
      }
    }
    // 道の角の地面へ同じ印を沿わせる。札は近くでだけ読ませ、山や塀を透かさない。
    if (rt.t >= (F.trailDrawAt || 0)) {
      F.trailDrawAt = rt.t + .25;
      const markerId = F.retreatOn ? 'retreat' : F.step === 3 && !F.komaAttack ? 'cutHon' : 'trail';
      const marker = rt.markers.find((m) => m.id === markerId);
      const point = marker && marker.pos();
      F.trailSign.visible = !!point;
      if (point) {
        const distance = Math.hypot(point.x - rt.player.u.pos.x, point.z - rt.player.u.pos.z);
        F.trailSign.visible = distance > (F.guideReturning ? .5 : 1.6) && distance < 18 && !F.ending && rt.player.u.alive
          && !(F.komaAttack && !F.retreatOn && F.C.kuruwa.koma.test(rt.player.u.pos.x, rt.player.u.pos.z));
        const fx = distance > .01 ? (point.x - rt.player.u.pos.x) / distance : Math.sin(rt.player.yaw);
        const fz = distance > .01 ? (point.z - rt.player.u.pos.z) / distance : Math.cos(rt.player.yaw);
        const pos = F.trailSign.geometry.attributes.position, base = F.trailBase;
        const floor = groundAt(rt.world, point.x, point.z, rt.player.u.pos.y);
        let low = Infinity, high = -Infinity;
        for (let i = 0; i < pos.count; i++) {
          const x = point.x + base[i * 3] * fz + base[i * 3 + 2] * fx;
          const z = point.z - base[i * 3] * fx + base[i * 3 + 2] * fz;
          const y = groundAt(rt.world, x, z, floor);
          low = Math.min(low, y); high = Math.max(high, y);
          pos.setXYZ(i, x, y + .035, z);
        }
        // 切岸をまたぐ印は縦長の板になる。歩ける床に収まる印だけ残す。
        if (high - low > 1.2) F.trailSign.visible = false;
        pos.needsUpdate = true; F.trailSign.geometry.computeBoundingSphere();
      }
    }
    this.supportTick(rt);
    this.reliefTick(rt);
    const p = rt.player.u.pos;
    const updateHud = rt.t >= (F.objectiveAt || 0);
    if (updateHud) F.objectiveAt = rt.t + 0.5;
    // 半秒・一・六メートルおきでは、柵の角を曲がった足跡が抜ける。
    // 案内が塞がっていても本人が歩いた分は残す。退路をたどる間は上書きしない。
    if (F.step >= 1 && F.step <= 3 && !F.guideReturning && rt.t >= (F.walkAt || 0)) {
      F.walkAt = rt.t + .1;
      const last = F.walkCount && F.walkTrail[(F.walkHead - 1 + F.walkTrail.length) % F.walkTrail.length];
      if (!last || Math.hypot(last.x - p.x, last.z - p.z) >= .4) {
        const q = F.walkTrail[F.walkHead]; q.x = p.x; q.z = p.z;
        F.walkHead = (F.walkHead + 1) % F.walkTrail.length;
        F.walkCount = Math.min(F.walkTrail.length, F.walkCount + 1);
      }
    }
    if (rt.player.u.hp >= rt.player.u.maxHp * 0.4) F.hurtWarned = false;
    if (rt.player.u.hp < rt.player.u.maxHp * 0.4 && !F.hurtWarned && !(F.hurtHintT > rt.t)) {
      F.hurtWarned = true; F.hurtHintT = rt.t + 60;
      const hit = rt.player.lastHit;
      rt.bark(hit && hit.ranged && rt.t - hit.t < 8 ? '矢玉を受けた！　味方のいる塀の陰へ退き、傷を縛れ' : '深手じゃ！　敵を向いたまま味方の後ろへ退き、傷を縛れ');
    }
    if (F.step === 1) {
      roadPoint(VALLEY_ROUTE, p, F.playerRoad);
      const r = F.playerRoad;
      // 角を少し外れて通っても、通り過ぎた印に戻さない。斜面へ外れた時は合流点を示す。
      // 九十九折りの道は行きと帰りの区間が近い。投影で先の区間へ飛ばず、角を一つずつ進める。
      let idx = Math.min(VALLEY_ROUTE.length - 1, Math.max(1, F.climbGuideIdx));
      // 印の上に立ったら次の角を示す（「1メートル」のまま印が動かず、何も起きない待ちになっていた）
      while (idx < VALLEY_ROUTE.length - 1 && Math.hypot(VALLEY_ROUTE[idx][0] - p.x, VALLEY_ROUTE[idx][1] - p.z) < 4) idx++;
      if (r.s > F.climbProgress + .08) { F.climbProgress = r.s; F.climbProgressAt = rt.t; }
      // 印のそばで十二秒止まったら、次の角と秀吉の旗へ導く。兵数と制圧条件は増やさない。
      // 登り口では番兵への備えや合流が任務。「進め」と「守れ」を同時に命じない。
      if (updateHud) {
        const found = valleyEncounter(rt);
        // 11/3：番兵が一瞬見えなくなっても、六秒は「退けよ」の下知を保つ（登れ⇔退けよ を二秒ごとに入れ替えない）
        if (found) { F.valleyFoe = found; F.valleyFoeAt = rt.t; }
        const kept = F.valleyFoe, enemy = found || (kept?.alive && !kept.gone && !kept.fleeing && rt.t - F.valleyFoeAt < 6 ? kept : null);
        const fighting = !!enemy;
        if (fighting && !F.valleyFighting && !F.retreatOn)
          rt.say('先手組頭', '番兵じゃ！　先へ走らず、味方と退けよ', 3);
        if (F.valleyFighting !== fighting && rt.missionGuide) rt.missionGuide.scan = 0;
        F.valleyFighting = fighting;
        F.valleyTarget = fighting ? enemy : null;
        F.climbNudge = !F.retreatOn && !rt.botRest && rt.player.sta >= 20 &&
          Math.hypot(p.x - BELOW.x, p.z - BELOW.z) >= 16 && rt.t - F.climbProgressAt > 12 &&
          Math.hypot(F.trailPoint.x - p.x, F.trailPoint.z - p.z) < 8 && !enemy;
      }
      if (F.climbNudge && !F.retreatOn && !rt.botRest && rt.player.sta >= 20 &&
        !F.guideReturning && !F.guideBlocked && rt.t >= (F.climbNudgeAt || 0)) {
        F.climbNudgeAt = rt.t + 24;
        if (idx < VALLEY_ROUTE.length - 1) {
          ROAD_TEST.x = VALLEY_ROUTE[idx + 1][0]; ROAD_TEST.z = VALLEY_ROUTE[idx + 1][1];
          if (roadClear(rt.army, rt.player.u, p, ROAD_TEST)) idx++;
        }
        rt.say('羽柴秀吉', 'ここで止まるな。谷道を登り、わしの旗に続け！', 4);
        // 進む先は谷道の印一つに絞る。遠い秀吉へ直進させない。
        for (const g of F.oda) if (g.odaniPlayerPause) { g.speed = g.odaniMarchSpeed; g.odaniPlayerPause = false; }
        // 上に残った番兵は道を下る。一組につき一度だけ、既存の兵を動かす。
        for (const id of AMBUSH_IDS) {
          const g = F[id]; if (!F[id + 'On'] || g.odaniDescended || gone(g)) continue;
          const center = g.center(); roadPoint(VALLEY_ROUTE, center, ROUTE_FROM);
          if (ROUTE_FROM.s <= r.s || Math.hypot(center.x - p.x, center.z - p.z) < 12) continue;
          const path = [[center.x, center.z]];
          for (let i = Math.floor(ROUTE_FROM.s); i > r.s; i--) path.push(VALLEY_ROUTE[i]);
          path.push([r.x, r.z]); g.odaniDescended = true;
          this.march(g, path, 0);
          g.onArrive = (q) => { q.order = 'attack'; q.focus = null; q.seekRange = 12; };
        }
      }
      F.climbGuideIdx = updateHud ? trailAhead(rt, VALLEY_ROUTE, idx) : idx;
      // 真下の谷底を登り口への到着と数えない。
      const belowY = F.belowY ?? (F.belowY = rt.world.heightAt(BELOW.x, BELOW.z));
      const d = Math.abs(p.y - belowY) < 3 ? Math.hypot(p.x - BELOW.x, p.z - BELOW.z) : Infinity;
      // 「番兵を退けよ」の間は、先の角でなく、見えて歩いて届く番兵を示す。
      // 道を進む順番は保ち、戦い終われば次の角の案内に戻す。
      if (updateHud && d >= 16 && F.valleyTarget && !F.retreatOn) {
        F.guideBlocked = false; F.guideReturning = false;
        F.trailPoint.x = F.valleyTarget.pos.x; F.trailPoint.z = F.valleyTarget.pos.z;
      }
      this.ambushTick(rt);
      // 切られた後ろの組は、斜面の敵を退けてから（長くても四十秒で）登りを続ける。
      const A = F.asano;
      if (F.splitOn && A.odaniResume && !gone(A) && (gone(F.watch) || rt.t - F.splitAt > 40)) {
        A.odaniResume = false;
        const path = CLIMB.slice(2, SHIMIZU.length + 2), c = A.center();
        roadPoint(path, c, ROUTE_FROM, rt.army, A.units.find((q) => q.alive));
        A.order = 'path'; A.path = path; A.pathIdx = Number.isFinite(ROUTE_FROM.d) ? Math.ceil(ROUTE_FROM.s) : 0;
        A.formation = 'column'; A.speed = 3;
        A.anchor = { x: c.x, z: c.z };
        A.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: BELOW.x + (CLIMB[SHIMIZU.length][0] - BELOW.x) * 0.3, z: BELOW.z + (CLIMB[SHIMIZU.length][1] - BELOW.z) * 0.3 }; g.formation = 'column'; };
      }
      let joined = 0, guards = 0, releasedGuards = 0;
      for (const g of F.oda) for (const u of g.units) if (battleReady(u) && Math.abs(u.pos.y - belowY) < 3 && Math.hypot(u.pos.x - BELOW.x, u.pos.z - BELOW.z) < 18) joined++;
      // 谷の後方に残る番兵まで全滅を待たない。今登る口の守りは実際に退ける。
      let guard = null, guardDistance = Infinity;
      for (const id of AMBUSH_IDS) for (const u of F[id].units) {
        // まだ姿を見せていない番兵も、登り口に残る限り守りに数える。
        if (!u.alive || u.fleeing || u.gone || u.woundOut || Math.hypot(u.pos.x - BELOW.x, u.pos.z - BELOW.z) >= 28) continue;
        guards++;
        if (!u.odaniReleased) continue;
        releasedGuards++;
        const distance = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
        if (distance < guardDistance) { guard = u; guardDistance = distance; }
      }
      // 番兵が見えても、塀や切岸を越えて印を向けない。道の角から近づかせる。
      F.trailGuard = !!(d < 16 && guard && guard.odaniReleased && sightPoint(rt, guard.pos)
        && roadClear(rt.army, rt.player.u, p, guard.pos));
      // 番兵への備えと後続の合流を分け、札と印で違う下知を出さない。
      F.climbDefending = d < 16 && (guards > 0 || F.patrolWave < AMBUSH_IDS.length);
      F.climbReleasedGuards = releasedGuards;
      // 攻め始めるのと同じ範囲で待ちを案内する。待ちながら十二メートル先へ進ませない。
      F.climbWaiting = d < 16 && guards === 0 && F.patrolWave === AMBUSH_IDS.length;
      // 待つ間は本人の足元を示す。先の角へ誘って合流の範囲から出さない。
      // 道へ戻る案内が必要な時は、その印を保つ。
      if (updateHud && (F.climbWaiting || F.climbDefending) && !F.trailGuard && !F.guideBlocked && !F.guideReturning) {
        F.trailPoint.x = p.x; F.trailPoint.z = p.z;
      }
      if (F.trailGuard) {
        F.guideBlocked = false; F.guideReturning = false;
        F.trailPoint.x = guard.pos.x; F.trailPoint.z = guard.pos.z;
      }
      // 三組の番兵を退けた後だけ合流を待つ。後続が遅れても八秒で取りつく。
      // 11/4 jin（AR1・BA3）：番兵を退けたら、後続を待たせずその場で攻め上る（待つだけの段を作らない）。
      F.belowWait = 0;
      // 11/5（AR1・BA3）：まだ来ない番兵の組を登り口で待たせない。目の前の番兵を退けたら攻め上る。
      // 11/6 fixc2103（critic60「番兵との戦の後も60秒①のまま」）：番兵が皆退いたら、本人が登り口から離れていても八秒で①を済ませて攻め上る。
      const guardsGone = guards === 0 && F.patrolWave >= AMBUSH_IDS.length;
      if (guardsGone && F.guardsClearT == null) F.guardsClearT = rt.t;
      if (d < 16 && releasedGuards === 0 || guardsGone && rt.t - F.guardsClearT >= 8) this.assault(rt);
      // 10/31：iPhone の bot が登り口で540秒詰まった（実機は一戦が九分を越える）。斜面に残った番兵を待ち続けず、本人が登り口の近くにいれば二分半で先手が取りつく。②〜④の後押しの秒も詰めた
      else if (rt.t - (F.stepT || 0) >= 105 && rt.player.u.alive && Math.hypot(p.x - BELOW.x, p.z - BELOW.z) < 35) this.assault(rt);
      // 11/4 jin（AY5）：本人が谷で遅れても、三分たてば羽柴の手は屋敷へ攻めかかる（自分が止まっても戦は進む）。
      else if (rt.t - (F.stepT || 0) >= 180 && rt.player.u.alive) this.assault(rt);
      else if (updateHud) {
        const order = retShown(rt) ? '来た道の角へ戻れ'
          : F.guideBlocked ? '来た道へ戻る足場を探せ'
          : d >= 16 ? F.valleyFighting ? '谷道の番兵を味方と退けよ' : hi(rt) ? '一隊を率いて清水谷を登れ' : '秀吉について清水谷を登れ'
          : releasedGuards > 0 ? F.trailGuard ? '登り口を守り、味方と番兵を退けよ'
            : '登り口で接近中の番兵を迎えよ'
            : F.patrolWave < AMBUSH_IDS.length ? '登り口に立ち、来る番兵を味方と退けよ'
            : guards > 0 ? '登り口で残る番兵を迎えよ'
            : '登り口で先手と合流せよ';
        if (order !== F.climbTask) {
          F.climbTask = order; nextObj(rt, order);
          if (!F.retreatOn) {
            if (order === '登り口に立ち、来る番兵を味方と退けよ')
              rt.say('先手組頭', '次の番兵が来る。登り口で味方と迎えよ', 4);
            else if (order === '登り口で残る番兵を迎えよ')
              rt.say('先手組頭', '残る番兵を退けるぞ。登り口を離れるな', 4);
          }
        }
        if (d >= 16) {
          // 距離は次の印までにそろえ、札では谷の奥へ進む目的を伝える。
          const road = F.guideRoad;
          if (F.guideReturning) rt.objProgress('main', '来た道の角へ戻れ。そこから登り直せ');
          else if (F.guideBlocked) rt.objProgress('main', '切岸や塀を避け、来た道の角へ戻れ');
          else if (F.valleyFighting) rt.objProgress('main', `番兵三組のうち${F.patrolWave}組目。味方と退け、谷道を登れ`);
          else if (Number.isFinite(road.d)) {
            rt.objProgress('main', F.guideBlocked ? '切岸や塀を避け、来た道の角へ戻れ'
              : '谷道を登り、谷の奥の登り口を目指せ');
          } else rt.objProgress('main', '屋敷や切岸を避け、来た道の角へ戻れ');
        }
        if (d < 16) {
          rt.objProgress('main', retShown(rt) ? '来た道の角へ戻れ。そこから登り直せ'
            : F.guideBlocked ? '屋敷や切岸を避け、来た道の角へ戻れ'
            : releasedGuards > 0 ? F.trailGuard
              ? `登り口の見張りあと${releasedGuards}人。先手と退けよ`
              : `番兵あと${releasedGuards}人が接近中。ここで味方と迎えよ`
            : guards > 0 || F.patrolWave < AMBUSH_IDS.length
              ? guards > 0 ? '登り口に番兵が残る。味方と構えて迎えよ'
                : F.patrolWave > 0 && !gone(F[AMBUSH_IDS[F.patrolWave - 1]])
                ? '谷道で味方が交戦中。列を保ち、登り口を守れ'
                : `番兵は三組。あと${AMBUSH_IDS.length - F.patrolWave}組に備え、登り口で構えよ`
              : `先手あと${Math.max(0, 3 - joined)}人。揃えば出発、遅くともあと${Math.max(0, Math.ceil(8 - F.belowWait))}秒`);
          if (F.belowWait > 0 && !F.joinCalled) {
            F.joinCalled = true;
            rt.say('先手組頭', 'ここで息を整えよ。揃い次第、今いる者で攻める', 4);
          }
        }
      }
    }
    // 谷を抜けた後は、後方の番兵へ印を戻さない。
    if (F.step === 1) for (const id of AMBUSH_IDS) {
      const g = F[id];
      if (F[id + 'On'] && !gone(g) && !rt.markers.some((m) => m.id === id)) {
        let seen = false;
        for (const u of g.units) if (u.alive && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 30 && sightPoint(rt, u.pos)) { seen = true; break; }
        if (seen) rt.marker(id, centerOf(g), g.name, { red: true, group: g });
      }
    }
    if (F.nests && F.step >= 1 && F.step <= 3) for (const nst of F.nests) {
      if (gone(nst.g)) continue;
      if (nst.seen) {
        let aimed = false;
        for (const gun of nst.g.units) if (gun.alive && gun.type === 'gun' && gun.target === rt.player.u && !gun.reload) { aimed = true; break; }
        if (aimed && sightPoint(rt, nst.c) && rt.t >= (F.nestWarnT || 0)) {
          F.nestWarnT = rt.t + 8; rt.bark('鉄砲が狙う！　道を外れず、塀の陰へ退け！', true);
        }
        continue;
      }
      const dn = Math.hypot(p.x - nst.c.x, p.z - nst.c.z), dm = Math.hypot(p.x - nst.mouth.x, p.z - nst.mouth.z);
      // 目に入った銃座だけ知らせる。物陰の照準先から位置を教えない。
      // 銃座は危険の印。任務を離れて切岸の裏へ回らせない。
      if ((dn < 17 || dm < 11) && sightPoint(rt, nst.c)) { nst.seen = true; F.nestWarnT = rt.t + 8; rt.army.play('eshout', nst.c, 1); sfx('far', 0.5); rt.bark('鉄砲じゃ！　道を外れず、味方のいる物陰へ！', true); rt.marker(nst.id, nst.c, () => '塀の陰の鉄砲', { red: true, h: 3, group: nst.g }); }
    }
    if (F.step === 2) {
      this.ambushTick(rt);
      // 10/30：屋敷と西木戸で四分止まる事が続いた（bot）。段に入って七十秒で屋敷の兵は崩れ、屋敷を取って四十五秒で西木戸は羽柴の手が破る
      if (!F.onoDone && rt.t - F.stepT > 30 && !F.onoRout) { F.onoRout = true; for (const g of [F.ono, F.relief]) if (!gone(g)) { g.noRout = false; g.morale = 0; } }
      if (F.onoDone && F.onoDoneT === undefined) F.onoDoneT = rt.t;
      if (F.onoDone && rt.t - F.onoDoneT > 18) { const wg = F.westGate?.struct; if (wg && !wg.opened && wg.hp > 0) rt.army.damage(wg, wg.hp + 1, null, { kind: 'gateWork' }); }
      if (!F.onoDone && gone(F.ono) && gone(F.relief)) this.onoFall(rt);
      const gate = F.westGate?.struct, inner = F.innerGate?.struct;
      // 先手の掛矢も西木戸を打つ。本人が門前へ着けなくても、三十秒を過ぎた木戸は少しずつ傷む（一戦を四〜七分に）。
      // 木戸は、門前に着いた味方（本人を含む）の掛矢で傷む。誰も着かないまま七十五秒を過ぎた時だけ、後ろの組が打つ（後押し）。
      if (gate?.alive && !gate.opened && gate.hp > 0) {
        const at = gateCrew(rt, GATE_WEST.x, GATE_WEST.z, 7);
        if (at || rt.t - F.stepT > 35) rt.army.damage(gate, (at ? 3 + Math.min(5, at) : 6) * dt, null, { kind: 'gateWork' });
      }
      const outerOpen = !gate || gate.opened || gate.hp <= 0;
      // 一の門を破ると枡形の広場。正面の二の門は閉じ、三方の塀の上から石と矢、門兵の槍が待つ。二の門も掛矢で破る。
      if (outerOpen && !F.outerOpenT) F.outerOpenT = rt.t;
      // 虎口に入った瞬間、後ろは味方の列で詰まる（狭い食い違いの道で、退くにも退けない）。
      // 遅れた組は同じ道を急いで登って追いつく（瞬間移動はしない。人数も増やさない）。
      // 虎口の折れに入った瞬間、横矢の弓・隠し銃座の鉄砲・門内の槍が一斉に本人の列へ向く（城そのものが狙う）。字は出さない。
      if (!F.koguchiHit && F.onoDone && !outerOpen && Math.hypot(p.x - GATE_WEST.x, p.z - GATE_WEST.z) < 11) {
        F.koguchiHit = true;
        const shooters = [...(F.yokoya || []).map((y) => y.g), ...(F.nests || []).map((n) => n.g), F.kyo, F.kyoGate];
        for (const g of shooters) if (!gone(g)) for (const u of g.units) if (battleReady(u) && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 26) { u.target = rt.player.u; u.aiT = 0; }
        rt.army.play('eshout', { x: GATE_WEST.x + 4, z: GATE_WEST.z }, 1);
        F.stoneAt = rt.t + .4;   // 上からの石もすぐに来る
      }
      if (!F.rearPacked && F.onoDone && Math.hypot(p.x - GATE_WEST.x, p.z - GATE_WEST.z) < 16) {
        F.rearPacked = true;
        for (const g of F.oda) {
          const v = g.units.find((q) => battleReady(q) && !q.isPlayer);
          if (!v) continue;
          const c = g.center();
          if (Math.hypot(c.x - p.x, c.z - p.z) < 12) continue;
          // 組の居る所に近い道の角から（本人より先の角へは飛ばさない）。
          let best = 0, bd = Infinity;
          for (let i = 0; i <= Math.min(F.kyoTrailIdx, ONO_WEST_ENTRY.length - 1); i++) {
            const q = ONO_WEST_ENTRY[i], d = Math.hypot(q[0] - c.x, q[1] - c.z) + Math.abs(rt.world.heightAt(q[0], q[1]) - v.pos.y) * 3;
            if (d < bd) { bd = d; best = i; }
          }
          g.order = 'path'; g.path = ONO_WEST_ENTRY; g.pathIdx = best; g.speed = 4.2; g.formation = 'column'; g.colW = 1; g.aggro = 5;
          g.odaniPlayerPause = false;
          g.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 30; gg.formation = 'yari'; gg.anchor = { x: KC.x, z: KC.z }; gg.speed = 3; };
        }
        sfx('toki', .7);
      }
      if (outerOpen && inner?.alive && !inner.opened && inner.hp > 0) {
        const at = gateCrew(rt, MASU.ix, MASU.iz, 6);
        if (at || rt.t - F.outerOpenT > 15) rt.army.damage(inner, (at ? 4 + Math.min(6, at) : 8) * dt, null, { kind: 'gateWork' });
      }
      const breached = outerOpen && (!inner || inner.opened || inner.hp <= 0);
      F.masuClosed = !breached;
      if (F.onoDone && breached && !F.westEnteredOrder) {
        F.westEnteredOrder = true;
        const exit = onogiExitTask(rt);
        const inside = F.C.kuruwa.kyogoku.test(p.x, p.z);
        nextObj(rt, exit || (inside
          ? '京極丸の内の敵を退け、味方と押さえよ'
          : '西木戸を抜け、京極丸の内へ進め'));
        // 味方が先に開けても、庭から西の塀へ向かわせない。手当て中の下知も保つ。
        if (!F.retreatOn) {
          rt.objProgress('main', exit ? '南木戸を出て、西木戸への登り道へ'
            : inside ? '内の敵を味方と退けよ。外へ追うな' : '西木戸が開いた。木戸を抜け、京極丸の内へ進め');
          rt.say('先手組頭', exit ? '西木戸が開いた！　南木戸を出て、西木戸へ登れ'
            : inside ? '西木戸は開いた！　内の敵を味方と退けよ'
              : '西木戸が開いた！　木戸を抜け、京極丸へ入れ', 4);
        }
      }
      const inside = F.C.kuruwa.kyogoku.test(p.x, p.z);
      // 組の中心ではなく、制圧を妨げている生きた兵本人へ案内する。
      // 退いた兵や曲輪外の兵を追わせず、元の制圧条件と同じ名簿から選ぶ。
      let left = 0, target = null, targetDistance = Infinity;
      for (const u of rt.army.units) if (u.alive && !u.fleeing && !u.gone && !u.woundOut && !u.noTarget && !u.isStruct && u.team === 1 && !inKyoLookout(rt, u) && F.C.kuruwa.kyogoku.test(u.pos.x, u.pos.z)) {
        left++;
        const dx = u.pos.x - p.x, dz = u.pos.z - p.z, dy = u.pos.y - p.y;
        const distance = dx * dx + dz * dz + dy * dy * 4;
        if (distance < targetDistance) { target = u; targetDistance = distance; }
      }
      F.kyoTarget = target;
      const viaPath = F.onoDone && !inside ? onoViaPath(rt, breached) : null;
      if (F.onoDone && inside) F.kyoVia = false;
      const path = viaPath || (F.onoDone ? breached ? ONO_WEST_ENTRY : ONO_WEST_APPROACH : ROUTE_O);
      let idx = viaPath ? F.kyoViaIdx : F.onoDone ? F.kyoTrailIdx : F.onoTrailIdx;
      while (idx < path.length - 1 && Math.hypot(p.x - path[idx][0], p.z - path[idx][1]) < 1.8) idx++;
      if (updateHud) {
        // 庭への出入りを先に調べ、任務と道の印を同じ下知へ切り替える。
        const guidedOnogi = !F.onoDone && onogiGuide(rt);
        if (guidedOnogi) {
          // 庭へ着いた後の行き先は、道の終点ではなく届く守りに切り替え済み。
        } else if (F.onoDone && breached && inMasu(p.x, p.z)) {
          // 枡形の広場からは、折れた二の門を抜けて京極丸の内へ（塀越しに直進させない）。
          F.guideBlocked = false; F.guideReturning = false;
          const [x, z] = masuExit(p);
          F.trailPoint.x = x; F.trailPoint.z = z;
        } else if (F.onoDone && breached && inside) {
          F.guideBlocked = false; F.guideReturning = false;
          // 敵を退けたら今いる所で守る。中心への道が塞がっていても、内から戻らせない。
          const q = target ? roadWay(rt.army, rt.player.u, target.pos) : p;
          F.trailPoint.x = q.x; F.trailPoint.z = q.z;
          const goal = target ? target.pos : p;
          if (Math.hypot(goal.x - p.x, goal.z - p.z) > 1.6 && Math.hypot(q.x - p.x, q.z - p.z) < .6) {
            F.guideBlocked = true;
            returnTrail(rt);
          }
        } else idx = trailAhead(rt, path, Math.min(idx, path.length - 1));
        // 本人が手当てで外へ退いても、到着した後続は曲輪の守りを続ける。
        if (F.onoDone && breached) {
          for (const g of F.oda) if (!gone(g) && F.C.kuruwa.kyogoku.test(g.anchor.x, g.anchor.z)) {
            g.focus = target;
            // 守りを退けた後は外の敵を追わず、制圧に要る後続を曲輪へ集める。
            // 木戸へ向かう列は道順を保ち、到着して攻撃に移った組だけ戻す。
            if (left === 0 && g.order === 'attack') {
              g.order = 'hold'; g.anchor.x = KC.x; g.anchor.z = KC.z;
              g._fitAt = 0; g.odaniKyoGather = true;
            } else if (left > 0 && g.odaniKyoGather) {
              g.order = 'attack'; g.odaniKyoGather = false;
            }
          }
        }
      }
      if (viaPath) F.kyoViaIdx = idx; else if (F.onoDone) F.kyoTrailIdx = idx; else F.onoTrailIdx = idx;
      // 門兵が崩れたら、曲輪の中の守りへ印を移す
      if (gone(F.kyoGate) && !F.kyoMark && !gone(F.kyo)) {
        F.kyoMark = true;
        if (F.onoDone) rt.marker('kyo', centerOf(F.kyo), () => '京極丸の守り', { red: true, group: F.kyo });
        F.kyo.order = 'attack'; F.kyo.seekRange = 30;
      }
      let friends = 0;
      for (const u of rt.army.units) if (u.alive && !u.fleeing && !u.gone && !u.woundOut && !u.noTarget && !u.isStruct && u.team === 0 && F.C.kuruwa.kyogoku.test(u.pos.x, u.pos.z)) friends++;
      F.kyoFriends = friends;
      // 閉じた木戸の向こうへ印を置かず、打てる側の足場を示す。
      if (updateHud && F.onoDone && !breached && Math.hypot(p.x - GATE_WEST.x, p.z - GATE_WEST.z) < 6 && roadClear(rt.army, rt.player.u, p, WEST_FACE)) {
        F.guideBlocked = false; F.guideReturning = false;
        F.trailPoint.x = GATE_WEST.x - 1.4; F.trailPoint.z = GATE_WEST.z;
      }
      // 六メートル先では空振りになる。実際の武器の届く範囲と向きで札を切り替える。
      // 半秒ごとの案内だけで調べ、攻撃側の座標の入れ物を使い回す。
      if (updateHud) F.westCanStrike = F.onoDone && !breached && !F.guideBlocked && !F.guideReturning
        && rt.player.meleeStructTarget(rt.player.weapon === 'sword' ? 'slash' : 'thrust', rt.player.u.heading)?.st === gate;
      // 庭に入った後は入口へ進めと言わず、今戦う場所へ札をそろえる。
      if (updateHud && !F.onoDone) {
        const reliefOnly = gone(F.ono) && F.reliefOn && !gone(F.relief);
        const order = retShown(rt) ? '来た道の角へ戻れ'
          : F.guideBlocked ? '来た道へ戻る足場を探せ'
          : reliefOnly ? F.onoInGarden ? '南木戸から道へ戻り、敵の小隊を退けよ' : '道の敵の小隊を味方と退けよ'
            : F.onoInGarden ? '大野木屋敷の庭の敵を味方と退けよ'
              : '清水谷の道を登り、大野木屋敷の南木戸へ進め';
        if (order !== F.onoTask) { F.onoTask = order; nextObj(rt, order); }
      }
      // 屋敷から出る道と木戸を打つ場所を、同じ任務の札で順に伝える。
      const exit = F.onoDone ? onogiExitTask(rt) : '';
      if (updateHud && F.onoDone && !breached) {
        const atGate = F.westCanStrike;
        const order = retShown(rt) ? '来た道の角へ戻れ'
          : F.guideBlocked ? '来た道へ戻る足場を探せ'
          : exit || (atGate ? `${westAttackControl(rt)}で西木戸を破れ`
          : '清水谷の道を登り、西木戸へ進め');
        if (order !== F.westTask) {
          F.westTask = order; nextObj(rt, order);
          if (atGate && !F.retreatOn) rt.say('先手組頭', 'ここが西木戸じゃ！　木戸を打ち破れ！', 3);
        }
      }
      if (updateHud) rt.objProgress('main', retShown(rt) ? '来た道の角へ戻れ。そこから木戸へ進め' : !F.onoDone && F.onoInGarden ? gone(F.ono) && F.reliefOn && !gone(F.relief) ? '南木戸へ戻り、道へ出た小隊を味方と退けよ' : '庭の敵を味方と退けよ。塀の外へ追うな' : F.guideBlocked ? '塀や切岸を避け、来た道の角へ戻れ' : !F.onoDone ? gone(F.ono) && F.reliefOn && !gone(F.relief) ? '道へ出た敵の小隊を味方と退けよ' : '坂道を通り、屋敷の南木戸へ' : !breached ? F.westCanStrike ? `西木戸を向き、${westAttackControl(rt)}で打て` : '屋敷の南木戸から出て、坂道を進み、西木戸を向け' : left ? `曲輪の守りはあと${left}人。印の先の敵を味方と退けよ` : '自分を含め六人で、京極丸を十秒守れ');
      // 打撃が木戸へ届いているかを同じ札で示す。守りの強さは変えない。
      if (updateHud && F.westCanStrike && !breached) {
        const remaining = Math.max(1, Math.ceil(gate.hp / gate.maxHp * 10));
        rt.objProgress('main', `木戸あと${remaining}割。${westAttackControl(rt)}${isTouch ? 'を押して放せ' : 'で打て'}`);
      }
      // 10/30：塀越しや櫓の残兵・揃わぬ後続を待って京極丸の前で八分を越える事が続いた（bot）。
      // 木戸を破って三十秒で曲輪の残兵は崩れ、五十秒で京極丸は取れた事にする（本人が曲輪の内かそば）
      if (F.onoDone && breached) {
        if (F.kyoBreachT === undefined) F.kyoBreachT = rt.t;
        if (rt.t - F.kyoBreachT > 15 && rt.t >= (F.kyoRoutAt || 0)) {
          F.kyoRoutAt = rt.t + 4;
          for (const u of rt.army.units) if (u.team === 1 && battleReady(u) && !u.isStruct && u.group && !u.group.historicalLord && F.C.kuruwa.kyogoku.test(u.pos.x, u.pos.z)) { u.group.noRout = false; u.group.morale = 0; }
        }
        // 11/6 fixc2103：本人が西木戸の外で道を失っても、破って四分たてば羽柴の手が京極丸を取る（戦が止まらない・二5）
        if (rt.t - F.kyoBreachT > 18 && (inside || Math.hypot(p.x - KC.x, p.z - KC.z) < 30) || rt.t - F.kyoBreachT > 70 && Math.hypot(p.x - KC.x, p.z - KC.z) < 45 || rt.t - F.kyoBreachT > 240 && rt.player.u.alive) { (F.trig ||= []).push('cut:time'); this.cut(rt); return; }   // 本人が遅れても、羽柴の手は京極丸を取る（二5）
      }
      // 11/5（AR1・BA3）：味方の人数を待たせない。内の敵を退け、内に立てば取る。
      holdInterrupted(rt, F.captureT, inside, left, true);
      F.captureT = F.onoDone && breached && left === 0 && inside ? F.captureT + dt : 0;
      // 守り直しでも開始を知らせる。退避中に伏せた声は復帰してから出す。
      if (F.captureT === 0) F.kyoCaptureCalled = false;
      if (F.captureT > 0 && !F.kyoCaptureCalled && !F.retreatOn) {
        F.kyoCaptureCalled = true;
        rt.say('先手組頭', '敵は退いた！　京極丸を取ったぞ', 4);
      }
      if (updateHud && F.onoDone && breached) {
        const order = retShown(rt) ? '来た道の角へ戻れ'
          : F.guideBlocked ? '来た道へ戻る足場を探せ'
          : exit ? exit
          : !inside ? '西木戸を抜け、京極丸の内へ進め'
          : left > 0 ? '京極丸の内の敵を退け、味方と旗を守れ'
          : '京極丸の広場を押さえよ';
        if (order !== F.kyoTask) { F.kyoTask = order; nextObj(rt, order); }
        // 曲輪の外では、残兵の数より先に通れる入口を知らせる。
        if (!inside) rt.objProgress('main', retShown(rt) ? '来た道の角へ戻れ。そこから西木戸へ'
          : F.guideBlocked ? '塀や切岸を避け、来た道の角へ戻れ'
            : '西木戸を抜けよ。塀の外から敵を追うな');
        else if (left === 0) rt.objProgress('main', '京極丸の広場を押さえよ');
        else rt.objProgress('main', `地上の敵あと${left}人。櫓へは登るな`);
      }
      // 味方が先に木戸を開けても、庭から塀を越える案内に変えない。
      if (updateHud && exit && !F.guideReturning && !F.guideBlocked) {
        rt.objProgress('main', '南木戸を出て、西木戸への登り道へ。塀は越せぬ');
      }
      // 実際に十秒守ってから分断へ進む。時間だけで残兵を消さない。
      if (F.captureT >= 2) { (F.trig ||= []).push('cut:player'); this.cut(rt); }
    }
    if (F.step === 3) {
      const inside = F.C.kuruwa.kyogoku.test(p.x, p.z);
      if (!F.komaAttack) {
        if (!(F.holdersAt > rt.t)) { F.holdersAt = rt.t + 1; this.staffHolders(rt); }
        let south = 0, north = 0;
        for (const g of F.kyoHolders) if (!gone(g)) for (const q of g.units) if (q.alive && !q.fleeing && !q.woundOut && !q.noTarget && F.C.kuruwa.kyogoku.test(q.pos.x, q.pos.z)) {
          if (Math.hypot(q.pos.x, q.pos.z - (KYO.z1 - 4)) < 6) south++;
          if (Math.hypot(q.pos.x, q.pos.z - (KYO.z0 + 4)) < 6) north++;
        }
        const heldMouths = south >= 2 && north >= 2;
        F.southHeld = south; F.northHeld = north;
        let friends = 0, enemies = 0, target = null, nearest = Infinity;
        for (const u of rt.army.units) if (u.alive && !u.fleeing && !u.gone && !u.woundOut && !u.noTarget && !u.isStruct && F.C.kuruwa.kyogoku.test(u.pos.x, u.pos.z)) {
          if (u.team === 0) friends++;
          else if (u.team === 1 && !inKyoLookout(rt, u)) {
            enemies++;
            const dx = u.pos.x - p.x, dz = u.pos.z - p.z, dy = u.pos.y - p.y;
            const distance = dx * dx + dz * dz + dy * dy * 4;
            if (distance < nearest) { target = u; nearest = distance; }
          }
        }
        // 反撃の残兵は曲輪内だけで探す。同じ印を使い、外へ追わせない。
        if (updateHud) {
          F.cutTarget = inside ? target : null;
          if (inside) {
            F.guideBlocked = false; F.guideReturning = false;
            // 反撃待ちと十二秒の守りは、京極丸の内なら今いる所で続ける。
            const q = target ? roadWay(rt.army, rt.player.u, target.pos) : p;
            F.trailPoint.x = q.x; F.trailPoint.z = q.z;
            // 届かない敵へ足元の印を出し続けず、歩いて来た角へ戻す。
            const goal = target ? target.pos : p;
            if (Math.hypot(goal.x - p.x, goal.z - p.z) > 1.6 && Math.hypot(q.x - p.x, q.z - p.z) < .6) {
              F.guideBlocked = true;
              returnTrail(rt);
            }
          } else {
            // 西木戸までの道をたどる。塀を隔てた中心へ直進させない。
            roadPoint(ONO_WEST_ENTRY, p, ROUTE_FROM, rt.army, rt.player.u);
            const idx = Number.isFinite(ROUTE_FROM.d) ? Math.ceil(ROUTE_FROM.s) : 0;
            trailAhead(rt, ONO_WEST_ENTRY, idx);
          }
        }
        F.awayT = enemies > 0 && friends === 0 ? F.awayT + dt : 0;
        const southRepelled = counterRepelled(rt, F.south, KYO.z1);
        const northRepelled = counterRepelled(rt, F.north, KYO.z0);
        const repelled = southRepelled && northRepelled;
        F.southRepelled = southRepelled; F.northRepelled = northRepelled;
        F.counterRepelled = repelled;
        if (F.awayT >= 5 && !F.awayWarned && rt.canFailMission()) {
          F.awayWarned = true;
          rt.say('組頭', '持ち場が危うい！　急ぎ京極丸へ戻れ！', 5);
        }
        if (F.awayT > 35) { this.lose(rt); return; }
        const holdOrder = enemies === 0 && repelled;
        if (updateHud) {
          const order = retShown(rt) ? '来た道の角へ戻れ'
            : F.guideBlocked ? '来た道へ戻る足場を探せ'
            : !inside ? '西木戸を抜け、京極丸へ戻れ'
            : enemies > 0 ? '京極丸の内で敵を退けよ'
            : !repelled ? F.south.odaniReachedKyo || F.north.odaniReachedKyo
              ? '京極丸の内で、木戸から来る敵を退けよ'
              : '京極丸に残り、南北の反撃に備えよ'
              : '尾根を北へ、小丸へ攻め入れ';
          if (order !== F.cutOrder) {
            F.cutOrder = order;
            nextObj(rt, order);
          }
        }
        holdInterrupted(rt, F.holdT, inside, enemies, repelled,
          !repelled ? '反撃が来る。内で迎え、守り直せ'
            : '味方が揃わぬ。内に残り、守り直せ');
        // 11/5（AR1・BA3）：南北の押さえの人数を待たせない。反撃を退ければ小丸へ。
        if (enemies === 0 && repelled && inside) F.holdT += dt;
        else F.holdT = 0;
        if (updateHud) rt.objProgress('main', F.awayT > 0 ? `京極丸を取り返せ。猶予${Math.max(0, Math.ceil(35 - F.awayT))}秒` : !inside ? retShown(rt) ? '来た道の角へ戻れ。そこから京極丸へ' : F.guideBlocked ? '塀や切岸を避け、来た道の角へ戻れ' : '京極丸へ戻れ。内で十二秒守る' : enemies > 0 ? `京極丸の敵あと${enemies}人。外へ追うな` : !repelled ? `南は${southRepelled ? '退いた' : F.south.odaniReachedKyo ? '反撃中' : '接近中'}、北は${northRepelled ? '退いた' : F.north.odaniReachedKyo ? '反撃中' : '接近中'}。内で迎えよ` : '反撃は退いた。尾根を北へ、小丸へ');
        if (F.holdT === 0) F.restCalled = false;
        if (F.holdT > 0 && !F.restCalled && !F.retreatOn) {
          F.restCalled = true;
          rt.say('先手組頭', '反撃は退いた！　小丸へ攻め入るぞ', 3);
        }
        // 京極丸を保てば、本丸の長政と小丸の久政は断たれる。この組の任務はここまで（一戦を四〜七分に）。
        // 10/30：塀越しの残兵や戻らない反撃を待って京極丸で十分止まる事があった（bot）。
        // 三十秒で南北の反撃は崩れ、五十秒たてば押さえを残して小丸へ向かう
        if (rt.t - F.stepT > 30 && !F.cutRout) {
          F.cutRout = true;
          for (const g of [F.south, F.north]) if (!gone(g)) { g.noRout = false; g.morale = 0; }
        }
        if (F.holdT >= 2 || rt.t - F.stepT > 26 && rt.player.u.alive) { (F.trig ||= []).push(F.holdT >= KYO_HOLD ? 'koma:player' : 'koma:time'); this.attackKoma(rt); }
      } else if (F.honAttack) {
        this.honTick(rt, dt, updateHud);
      } else if (!F.komaDown) {
        // 小丸の外へ退いても印は残す。戻る道の角を半秒ごとに示す。
        if (updateHud && !F.C.kuruwa.koma.test(p.x, p.z)) F.komaIdx = wayTrail(rt, F.komaPath, F.komaIdx);
        if (F.C.kuruwa.koma.test(p.x, p.z)) {
          F.komaEntered = true;
          // 久政は奥の居所に留まる。下知だけを聞かせ、討取りの任務にはしない。
          if (!F.hisamasaCalled) {
            F.hisamasaCalled = true;
            rt.say('浅井久政', 'ここは浅井の城じゃ！　小丸を守れ！', 3);
          }
        }
        let friends = 0, enemies = 0, target = null, nearest = Infinity;
        for (const u of rt.army.units) if (u.alive && !u.fleeing && !u.gone && !u.woundOut && !u.noTarget && !u.isStruct && F.C.kuruwa.koma.test(u.pos.x, u.pos.z)) {
          if (u.team === 0) friends++;
          else if (u.team === 1) {
            enemies++;
            const dx = u.pos.x - p.x, dz = u.pos.z - p.z, dy = u.pos.y - p.y;
            const distance = dx * dx + dz * dz + dy * dy * 4;
            if (distance < nearest) { target = u; nearest = distance; }
          }
        }
        F.komaTarget = target;
        F.komaFriends = friends;
        // 入った後も同じ印を使い、制圧を妨げる兵へ通れる道で案内する。
        // 居所の久政や曲輪の外の兵は、元の制圧判定どおり追わせない。
        if (updateHud && F.C.kuruwa.koma.test(p.x, p.z)) {
          F.guideBlocked = false; F.guideReturning = false;
          // 小丸も、敵がいなければ内に残る。中心へ動かして守りを中断させない。
          const q = target ? roadWay(rt.army, rt.player.u, target.pos) : p;
          F.trailPoint.x = q.x; F.trailPoint.z = q.z;
          const goal = target ? target.pos : p;
          if (Math.hypot(goal.x - p.x, goal.z - p.z) > 1.6 && Math.hypot(q.x - p.x, q.z - p.z) < .6) {
            F.guideBlocked = true;
            returnTrail(rt);
          }
        }
        // 本人の退避中も、到着した先手を小丸へ集めておく。
        if (updateHud) {
          // 敵を退けたら先手も内へ集める。外への追撃で四人揃わない待ちを作らない。
          // 北木戸へ向かう後続は道順を保ち、到着した組だけ持ち場を変える。
          for (const g of F.oda) if (!gone(g)) {
            g.focus = target;
            if (enemies === 0 && !g.odaniKomaGather && (g.order === 'attack' || g.order === 'hold')) {
              g.order = 'hold'; g.anchor.x = KOMC.x; g.anchor.z = KOMC.z;
              g._fitAt = 0; g.odaniKomaGather = true;
            } else if (enemies > 0 && g.odaniKomaGather) {
              g.order = 'attack'; g.odaniKomaGather = false;
            }
          }
        }
        const inKoma = F.C.kuruwa.koma.test(p.x, p.z);
        if (updateHud) {
          const order = retShown(rt) ? '来た道の角へ戻れ'
            : F.guideBlocked ? '来た道へ戻る足場を探せ'
            : !inKoma ? '北木戸を抜け、小丸へ進め'
            : enemies > 0 ? '小丸の内の敵を味方と退けよ'
              : '小丸の広場を押さえよ';
          if (order !== F.komaOrder) { F.komaOrder = order; nextObj(rt, order); }
        }
        // 11/5（AR1・BA3）：味方の人数を待たせない。内の敵を退け、内に立てば取る。
        holdInterrupted(rt, F.captureT, inKoma, enemies, true);
        F.captureT = enemies === 0 && inKoma ? F.captureT + dt : 0;
        if (F.captureT === 0) F.komaCaptureCalled = false;
        if (F.captureT > 0 && !F.komaCaptureCalled && !F.retreatOn) {
          F.komaCaptureCalled = true;
          rt.say('先手組頭', '小丸の敵は退いた！', 4);
        }
        if (updateHud) rt.objProgress('main', !F.C.kuruwa.koma.test(p.x, p.z) ? retShown(rt) ? '来た道の角へ戻れ。そこから北木戸へ進め' : F.guideBlocked ? '塀や切岸を避け、来た道の角へ戻れ' : F.komaEntered ? '北木戸を抜け、小丸へ戻れ' : '北木戸を抜け、小丸へ進め' : enemies > 0 ? `小丸の敵あと${enemies}人。小丸の内で味方と退けよ` : '小丸の広場を押さえよ');
        // 10/30：小丸の奥に残る数人を探し続けて止まらないよう、攻めかかって一分で小丸は落ちる
        // 11/6 fixc1844（critic60「小丸へ行かずに④が済む」）：本人が小丸の四十メートル内へ来るまで時では落とさない
        //   京極丸で南からの寄せと斬り合い続ける時は、六十秒たてば小丸へ寄せた羽柴の手が落とす（戦が止まらないように）
        // 11/6 fixc2103（critic60 再び：京極丸の前にいるまま④⑤が三十秒で続けて済んだ）：羽柴の手が代わりに落とすまでの待ちを百秒に延ばす
        if (F.komaAttackT0 === undefined) F.komaAttackT0 = F.komaAttackT;
        if (rt.player.u.alive && Math.hypot(p.x - KOMC.x, p.z - KOMC.z) > 40 && rt.t - F.komaAttackT0 < 100) F.komaAttackT = Math.max(F.komaAttackT, rt.t - 20);
        if (F.captureT >= 2 || rt.t - F.komaAttackT > 32 && rt.player.u.alive) this.komaFall(rt);
      }
    }
    // 曲輪内でも、敵まで通れない時は札の補足を戻る印にそろえる。
    if (updateHud && !F.ending && !F.retreatOn && (F.guideReturning || F.guideBlocked)) {
      rt.objProgress('main', retShown(rt) ? '来た道の角へ戻れ。そこから道を進め'
        : '塀や切岸は越せぬ。来た道へ戻る足場を探せ');
    }
    // 戻る下知は声も札にそろえる。状態が変わった時だけ、同じ声は八秒あける。
    if (updateHud && !F.ending) {
      // 足跡の案内が二秒おきに付いたり消えたりしても、同じ声を何度も言わせない（三秒続いた時だけ・二十秒あける）
      const roadOrder = F.retreatOn ? '' : retShown(rt) ? 'return' : F.guideBlocked ? 'blocked' : '';
      if (roadOrder && roadOrder !== F.roadOrder && rt.t >= (F.roadNoticeAt || 0)) {
        F.roadNoticeAt = rt.t + 20;
        rt.say('先手組頭', roadOrder === 'return' ? '来た道の角へ戻れ' : '塀や崖は越せぬ。来た道へ戻れ', 3);
      }
      F.roadOrder = roadOrder;
    }
    if (F.step >= 1 && F.oda.every(gone) && rt.canFailMission()) {
      if (F.collapseAt === undefined) {
        F.collapseAt = Math.max(rt.t + 30, F.helpUntil || 0);
        if (!F.collapseWarned) {
          F.collapseWarned = true;
          rt.say('組頭', 'このままでは攻めが崩れる！　味方と旗の前を守れ！', 5);
        }
      }
      if (rt.t >= F.collapseAt) this.lose(rt, '羽柴の攻め手が崩れ、この組も進めなくなった');
    } else F.collapseAt = undefined;
    // 退き口の印と下知をそろえる。占領や木戸の判定は元の任務のまま保つ。
    if (F.retreatOn && !F.ending) {
      const task = rt.objectives.find((o) => o.id === 'main');
      if (task) {
        const text = '退き口へ下がれ';
        if (task.text !== text) { F.retreatTask = F.objPending || task.text; F.objPending = null; }
        if (task.text !== text) rt.obj('main', text, 'main', true);
        const distance = Math.hypot(p.x - F.retreatPoint.x, p.z - F.retreatPoint.z);
        rt.objProgress('main', distance > 2.5
          ? `退き口まで${Math.ceil(distance)}メートル。敵を向いたまま下がれ`
          : retreatCareText(rt));
      }
    }
    // 撤退の期限は一度の声だけで済ませず、今の札に添える。次にする事も残す。
    if (updateHud && !F.ending) {
      const task = rt.objectives.find((o) => o.id === 'main');
      if (task && !task.state) {
        const progress = task.progress.replace(/^攻めを退くまであと\d+秒。/, '');
        rt.objProgress('main', F.collapseAt === undefined ? progress
          : `攻めを退くまであと${Math.max(0, Math.ceil(F.collapseAt - rt.t))}秒。${progress}`);
      }
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    F.foeScanAt = -1; F.objectiveAt = 0;
    if (F.foeRoute) F.foeRoute.at = -1;
    if (!F.ending && F.step === 2 && !F.onoDone && gone(F.ono) && gone(F.relief)) this.onoFall(rt);
  },
  onRout() {},
};

// 両軍の総勢は遊びの目安（織田三万・浅井五千）。史料の確定値ではなく、実兵や遠景の人数とは別。
// 11/6 fix61（kaito 九3・十二1）：上の棒は史実の規模のまま、討たれた本物の兵の割合で減らす（浅井は曲輪が落ちるほど逃げて減る）。
const ODANI_FORCE = { a: 30000, a0: 30000, b: 5000, b0: 5000 };
odani.force = (rt) => {
  const F = rt?.flags, A = rt?.army;
  if (!F || !A) return ODANI_FORCE;
  if (!(rt.t < (F.forceAt ?? -1))) {
    F.forceAt = rt.t + 1;
    let a = 0, b = 0;
    for (const u of A.units) if (u.alive && !u.gone && !u.isStruct && !u.civ) { if (u.team === 0) a++; else if (u.team === 1) b++; }
    F.force0 ||= { a: Math.max(1, a), b: Math.max(1, b) };
    const lostA = Math.max(0, F.ak || 0), lostB = Math.max(0, 1 - b / F.force0.b);
    ODANI_FORCE.a = Math.round(30000 - lostA * 25);
    // 11/6 fixc1844（critic60「浅井が4,781から5,000へ戻る」）：曲輪の兵が後から出ても、数は減るだけで増やさない
    const nb = Math.round(5000 * (1 - lostB) * (F.fallen ? .2 : F.komaDown ? .55 : F.step >= 3 ? .8 : 1));
    ODANI_FORCE.b = Math.min(F.forceMinB ?? 5000, nb); F.forceMinB = ODANI_FORCE.b;
  }
  return ODANI_FORCE;
};
odani.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '浅井軍', mon: 'azai' } };
odani.hideArmyPeek = false; // 九3：両軍の今の兵の数の棒を上に常に出す（前は谷道の視界のために隠していた）。
odani.noWake = false;
odani.noReserve = true; // 共通の新手は足さず、近づいた既存の遠景兵だけ引き継ぐ。
odani.wakeRoom = 250;
odani.noRevive = true; // 致命傷の後に体力を戻して戦闘へ復帰させない。
odani.strictHits = true; // 一撃の損と連続被弾を主人公だけ軽くする上限を外す。
odani.rts = true;
// 総大将（taisho.js）：長政は本丸の御殿の奥。討ち取りの流れはこの定義が持つ（最期は史実の文で）。
// 味方の殿（信長）は虎御前山の遠くの本陣なので、ここには置かない（殿を狙う一隊も来ない）
odani.taisho = { a: null, b: { name: '浅井長政', def: true } };
odani.noTaishoRaid = true;
// 両軍とも共通の近距離引き継ぎを使う。任務の固定組は回収せず、遠景兵の枠だけ巡らせる。
// 史実でこの戦にいた名のある武将（battle.js の placeFamous）。長政・久政は前線に出さない
odani.famous = [];
odani.noHorse = true;
odani.noYaguraTask = true; // 秀吉は「櫓へは登るな」と下知する。櫓を取る脇の目標は出さない（yagura_play.js）

odani.date = () => '天正元年八月二十七日　秋・夜中の攻め';
odani.canSkip = (rt) => rt.phase === 'brief' && rt.t > 3 ? '秀吉と清水谷へ進む' : '';
odani.skip = (rt) => { if (rt.phase === 'brief') odani.climb(rt); };
odani.history = '天正元年（1573）八月、織田信長は刀根坂で朝倉勢を破り、一乗谷を焼いて朝倉家を滅ぼした。すぐに兵を返して北近江の小谷城を囲む。小谷城は小谷山の尾根に曲輪を連ねた大きな山城だった。南の尾根先に金吾丸があり、番所・御茶屋・御馬屋・桜馬場・大広間・本丸・中丸・京極丸・小丸・山王丸へ続く。斜面には小さな曲輪と竪堀があり、信長は南西の虎御前山に本陣を置いた。虎御前山は南西へ尾根を延ばす独立丘陵で、遊びでは距離と高さを縮めている。虎御前山には前年から土塁や曲輪を備える砦が築かれていた。信長公記巻五には、虎御前山から宮部へ幅三間の道を築き、敵側に高さ一丈の築地を五十町にわたって設けたとある。遊びでは南口から続く道と小谷側の土塁の一部を高画質の遠景に補う。道筋・距離・盛土と土塁の高さは推定で、史料の全長を再現してはいない。城下には北陸と東海を結ぶ北国脇往還が通っていた。長浜市の保存管理計画によれば、小谷山の西麓を南下し、郡上の集落を東へ抜け、清水谷口で清水道と合流して南へ折れる。遊びでも西麓・谷口・南の平野を結ぶ土道とし、谷口は清水道の端につなぐ。道幅・距離・細かな曲がりは縮めた地形に合わせた推定で、実測した道筋ではない。本丸の北は大堀切で断たれていた。西の清水谷には浅井氏の居館や家臣の屋敷があったが、長浜市の保存管理計画は元亀元年と三年の攻撃で落とされたと見る。ここでは以前の焼け跡として描く。南の本丸に浅井長政、北の小丸に父の久政がいた。羽柴秀吉は、その間の京極丸へ攻め上って本丸と小丸を切り離し、小丸の久政は自害した。長政は、妻のお市の方（信長の妹）と三人の娘（のちの茶々・初・江）を城から出して織田方へ返した。信長公記巻六は八月二十七日の夜に京極丸へ攻め上り、久政の居城を取ったと記す。翌日に信長が京極丸へ上り、長政と赤尾清綱も最期を迎えたとする。同夜に南の大手から各曲輪を順に落としたとは記されていない。南の遠景の攻防は遊びの補いで、攻め手と控えを番所の手前に置き、閉じた門の内へは進ませない。長政が九月一日に赤尾屋敷で自害したとも伝わり、日付・場所には異説がある。浅井の旧領の多くは秀吉に与えられ、秀吉はのちに今浜を長浜と改めて城を築いた。秀吉が攻め上った道（清水谷からとも）や、一行を送った者の名には諸説がある。両軍の総勢と攻め口ごとの兵数は確定できない。総勢の織田三万・浅井五千は遊びの目安で、曲輪や攻め口ごとの人数は不明としている。曲輪ごとの兵数、清水谷の道、南北の反撃、天気と建物、屋敷の焼損の形と虎御前山の囲いは復元。地形は国土地理院の標高を下地に、谷・曲輪・道を加工した推定である。清水谷の当時の水流は確定していない。中丸から京極丸へ登る道の西には、刀洗い池と呼ばれる水の手がある。長浜市の保存管理計画は岩盤を湯舟型に掘り、側面に高さ約五十センチの石積みを設けて浸透水を受けたものとする。高画質では浅い岩盤の池として補うが、縮めた縄張りでの位置・寸法と当夜の水位は推定である。谷の寺の南に描く長方形の池は、伝知善院跡で検出された南北五メートル・東西十四メートル以上の池と、北寄りの島状遺構を参考にした。東端は未確認で、遊びの中の位置と当夜の水位は復元である。大広間の北東隅には長さ三・三メートル、横二・七メートル、深さ〇・九メートルの石組みの井戸と、それに接続する石組みの溝が確認されている。高画質では記録の寸法を参考に井戸と短い溝を補う。向き・曲輪内での細かな位置・溝の取り回しは推定で、当夜の水位は分からないため水面は描かない。大広間の北西隅には蔵跡、北西限には東西八メートル・南北六メートルの敷石が確認されている。高画質では敷石の範囲を参考に蔵と石敷きを補う。蔵の姿・寸法と両者の細かな配置は推定である。本丸と大広間の庭石や松も推定である。御茶屋には曲輪を二分する低い土塁が確認されている。高画質では低い盛土を補い、中央の尾根道を空ける。土塁の向き・高さ・開口と、館を避けた細かな位置は推定である。西尾根の福寿丸は北東隅、山崎丸は南側にＬ字状の土塁で虎口を構える。長浜市の保存管理計画を参考に、高画質では入口を折れ曲がる形に補う。縮めた平場内での寸法・土塁の高さと柵は推定である。主人公の任務は羽柴の一組として京極丸を守り、小丸の守りを崩す所まで。お市の方の退去を指揮したり、赤尾清綱を京極丸で討つ役は持たない。';
odani.history += '八月十二日の夜、嵐の中で信長自ら大嶽を攻め取り、朝倉勢は越前へ退いた。小谷は後ろ盾を失った。二十七日の夜中、羽柴秀吉が京極丸を取って父子の間を断ち、小丸の久政を攻めた。明くる日、信長自ら京極丸へ上がり、長政の本丸を攻めさせた（信長公記・信長記）。';
odani.history += '月所丸は、長浜市の保存管理計画によれば尾根の平坦部を土塁で区切る搦め手の曲輪である。高画質では内部の仕切り土塁、北東先端のコの字状の土塁と、その外側で尾根を断つ二条の空の堀切を補う。堀切は既存の地面を削り、底に木が生えないようにする。縮めた平場での土塁の位置・長さ・幅・高さ・向き・通路の開口、堀切の位置・長さ・幅・深さは推定である。堀切とは別に記録される二か所の竪堀も、高画質では東の斜面を下る空の溝として補い、底の木を除く。竪堀の方角・位置・長さ・幅・深さは縮めた地形に合わせた推定で、当時の配置を確定するものではない。二段の曲輪は、高画質では既存の地面を削平した平場の北側を八十センチ高くして表す。中ほどの仕切り土塁の中央口は二メートルの坂でつなぎ、外縁と南の入口の高さを保つ。段の高低の向き・高さ・境・接続坂は縮めた地形に合わせた推定で、遺構の実測値ではない。月所丸という名も昭和四十六年の確認時に地名から仮に付けられたもので、当時の呼び名は分からない。';
odani.history += '虎御前山から宮部への連絡路は、高画質では中央を高くして両端へ緩く下る盛土道とし、小谷側の築地とは別に描く。道幅五・四メートルと盛土の高さ四十五センチ、道の断面・細かな道筋は遊びでの推定で、当時の実測値ではない。';
odani.history += '京極丸の主曲輪の東側には、長浜市の保存管理計画によれば高さ約三メートルの土塁がある。高画質では東縁に盛土を補う。長さ・幅・縮めた曲輪内での細かな位置と当夜の姿は推定で、館や物見と南北の通り道を空けている。';
odani.history += '桜馬場は東西二段の曲輪で、西側には建物の礎石が確認されている。高画質では西側に低い礎石を補い、西側の平場を六十センチ下げて東西の二段を地面に表す。段の高低の向き・高さ・境の位置と二メートルの接続坂は縮めた地形に合わせた推定で、遺構の実測値ではない。中央の尾根道・南北の門・外周の柵の足もとは元の高さに保つ。石の数・柱間・細かな配置は推定で、当夜の建物の有無は確定していない。';
odani.history += '長浜市の保存管理計画は、桜馬場の周囲を切岸による防御とする。高画質では四周へ一律に追加していた高さ四メートルの石垣を外し、既存の土の切岸を見せる。切岸の高さと勾配は縮めた地形での推定である。黒金御門と大広間側の石垣は別の遺構として残す。';
odani.history += '長浜市の保存管理計画は、番所の北側に高さ約三メートルの石垣、東の道側に石垣で固めた土堤と中央の門らしい部分を記録している。高画質では北の石垣と、中央に開口を残す東の石塁を補う。縮めた平場での位置・開口幅・東の石塁の高さは推定で、当夜の門の姿は確定していない。';
odani.history += '番所の西側には谷筋を固める弓状の土塁が確認されている。高画質では西へ湾曲する盛土を補う。縮めた平場内の細かな位置・幅・高さと当夜の姿は推定で、中央の尾根道と南北の口は空けている。';
odani.history += '長浜市の保存管理計画は、大嶽城の周囲を大型土塁が囲み、北西の尾根を二条の堀切が断つとする。高画質では土塁を厚く高くし、北西に二条の空堀を補う。また、南西斜面には尾根筋と並行する竪堀を補い、堀底の木を除く。北西部にも堀切とは別の竪堀が記録されているため、堀切の西端の外から北西斜面へ下る空の溝を補い、堀底の木を除く。位置・向き・幅・高さ・深さは縮めた地形での推定である。最高部に記録された二段の平場も、高画質では既存の地面の北側を八十センチ上げ、二メートルの坂でつないで補う。段の方角・境の位置・高さと接続坂は縮めた地形に合わせた推定で、遺構の実測値ではない。外周の土塁と南口、南側の番手の足場は保つ。北東部に記録された犬走りも、高画質では土塁の外の細い土の平場として補う。既存の地面をならし、平場の木を除く。位置・幅約一・八メートル・主郭からの比高一・八メートルと両端のつなぎ方は縮めた地形での推定で、遺構の実測値ではない。北西の堀切と竪堀にはつなげない。';
odani.history += '長浜市の保存管理計画は、福寿丸の北東虎口の前面に空堀と切岸を記録している。高画質では虎口の外側に空堀を補い、堀底の木を除く。位置・長さ・幅・深さは縮めた地形での推定で、曲輪の平場と虎口の内側は保つ。';
odani.history += '福寿丸は、同計画によれば南北約五十メートル・東西約四十四メートルの方形の曲輪である。高画質では丸みのある共通の囲いを方形に改め、地面も同じ形に削平する。東西十四メートル・南北十六メートルほどの寸法は縮めた地形での推定で、北東の開口と食い違い土塁、小屋・荷の位置は保つ。';
odani.history += '馬洗池の四方は、長浜市の保存管理計画では小礫の石積みとされる。高画質では外周と中央東寄りの仕切りを小さな石で表す。個々の石の寸法・積み方と当夜の水位は推定である。時刻は信長公記巻六の「夜中」に合わせ、夜明け前とは限定しない。足元を読む補助光の明るさは史実の月明かりの再現値ではない。';
// 夜の羽柴の攻めは信長用の一覧から外す（lord.js）。足軽の攻め口を信長の居所として登録しない。
odani.history += '大嶽城の西尾根上には焼尾丸がある。長浜市の保存管理計画は、細長い曲輪があり土塁・竪堀はないとする。信長公記に記された八月十二日の浅見対馬守の寝返りは、大嶽城の落城と朝倉勢の撤退につながった。高画質では大嶽の西に細長い土の平場を補い、平場の木を除く。位置・寸法・比高は縮めた地形での推定で、当夜の番手の顔触れ・兵数や建物は確定していない。';
odani.history += '長浜市の保存管理計画は、山崎丸が高い土塁と南側のＬ字状土塁による枡形の虎口を備えるとする。高画質では外周と南の折れた土塁を高くし、低い囲いだけに見える姿を改める。高さ一・五メートルは縮めた地形での推定で、遺構の実測値ではない。土塁の幅と虎口の通路は保つ。南側に記録された腰曲輪も、高画質では虎口から下る坂と一段低い土の平場として補う。幅十二メートルほど・比高二・五メートルと接続の勾配は縮めた地形での推定で、遺構の実測値ではない。犬走りも、高画質では西斜面に細い土の平場として補い、平場の木を除く。西側という配置・幅約一・六メートル・主郭からの比高二メートルと両端のつなぎ方は縮めた地形での推定で、遺構の実測値ではない。南虎口と腰曲輪は保つ。';
odani.history += '長浜市の保存管理計画は、本丸の東部斜面に腰曲輪を遮断する大土塁を記録している。高画質では本丸の東下、赤尾屋敷の北に土塁を補い、斜面からの回り込みを防ぐ構えを示す。位置・向き・長さ・幅・高さ二メートルは縮めた地形に合わせた推定で、遺構の実測値ではない。北西斜面の石垣を用いた土塁も、次の記録に基づいて補う。';

odani.history += '長浜市の保存管理計画は、本丸の北西斜面に石垣を用いた土塁を記録している。高画質では本丸の西下に土の堤と北面下部の石積みを補う。位置・向き・長さ・幅・高さ一・五メートルと石積みの範囲は推定で、大堀切と土橋、清水谷の攻め道は保つ。';

odani.history += '長浜市の保存管理計画は、中丸が三段の曲輪からなり、中段に横矢を備えるとする。高画質では南・中・北の三つの平場を地面に補い、中央の集合点の高さを保つ。段差は各五十センチ、境は二メートルの坂でつなぐ推定復元で、当時の実測値ではない。中段には石垣と塀を折り曲げる張り出しを補う。東側という方角・張り出し三メートル・南北四メートルは縮めた地形での推定で、遺構の実測値ではない。地面と石垣・塀は同じ輪郭を使い、中央の尾根道・兵の集合点・南北の門・土橋と西の攻め道は保つ。';

odani.history += '長浜市の保存管理計画は、本丸が上下二段の曲輪からなるとする。高画質では南側の地面を六十センチ下げ、二メートルの坂で上段につなぐ。北側には別の盛土を重ねず、余分な段を作らない。段の高低の方角・高さ・境の位置は縮めた地形での推定で、遺構の実測値ではない。御殿と庭石、中央の旗本の集合点、外周と南北の門への接続高は保つ。';

odani.history += '長浜市の保存管理計画は、清水谷の入口に防御施設として堀が確認されているとする。高画質では谷口の両脇に空の溝を補い、堀底の木を除く。位置・長さ・幅三メートル・深さ一・二メートル・断面と、中央の道を残した開口は縮めた地形での推定で、遺構の実測値ではない。当夜の水位や残存状態は分からない。清水道と民の退路は既存の高さを保つ。';

odani.history += '長浜市の保存管理計画は、山王丸から大嶽へ至る鞍部の六坊を、尾根筋を削平した七区画の曲輪とする。高画質では七つの土の平場を補い、平場の木を除く。同計画に記された竪堀による防御も、平場の南の斜面を下る一条の空の溝として補い、溝底の木を除く。条数・方角・位置・長さ二十二メートル・幅四メートル・深さ二メートルは縮めた地形に合わせた推定で、遺構の実測値ではない。六坊の名は久政が六寺の陣僧の出坊を集めたことに由来するとされる。位置・寸法・高さは縮めた地形での推定で、当夜の建物・所属・兵数は確定していない。';

odani.history += '長浜市の保存管理計画は、清水谷の谷道に高さ約五メートルの蛙岩を記録している。高画質では谷道の西に大岩を補う。高さは記録を参考にするが、位置・幅・輪郭は縮めた谷に合わせた推定で、当時の姿を確定するものではない。';

odani.history += '長浜市の保存管理計画は、大嶽城の北西から南西に曲輪と段状の切岸を記録している。高画質では西と南西に土の平場を補い、その縁に切岸を表す。二か所という数・位置・幅八メートル・主郭からの比高三メートルと五メートルは縮めた地形での推定で、遺構の実測値ではない。平場の木を除き、主郭の番手と既存の堀切・竪堀は保つ。';

odani.history += '長浜市の保存管理計画は、知善院跡の周囲が溝で区画されていたとする。高画質では谷の寺の周囲に空の溝を補い、溝底の木を除く。位置・幅二メートル・深さ七十センチ・断面と東南の開口は縮めた地形での推定で、遺構の実測値ではない。当夜の水位と残存状態は分からない。堂と小屋、庭園の池、東の入口、南の民の退路と清水道は保つ。';

odani.history += '長浜市の保存管理計画は、中丸の清水谷側に南北三十五メートル・東西十メートルの御局屋敷跡を記録している。高画質では中丸の西下に細長い土の平場を補い、草木を除く。位置・南北十四メートル・東西四メートル・中丸からの比高三メートルと斜面への接続は縮めた地形での推定で、遺構の実測値ではない。当夜の建物や居住者は確定していない。大堀切・刀洗い池・西の登り道・銃座は保つ。';

odani.history += '六坊には、保存管理計画に記された横矢の構えも補う。高画質では七つの平場の谷側の縁を折り、隣の斜面を横から守る張り出しを地面に表す。南向き・四か所・最大二・五メートルの張り出しと輪郭は縮めた地形での推定で、遺構の実測値ではない。北の鞍部と南の竪堀、主尾根と清水谷の攻め道は保つ。';

odani.history += '長浜市の保存管理計画は、大嶽城の南西部に、尾根筋を遮断する小曲輪と切岸を記録している。高画質では南西の斜面に尾根を横切る細長い土の平場を補い、縁を切岸として表し、平場の草木を除く。位置・東西十四メートル・南北五メートル・主郭からの比高七メートルと縁の勾配は縮めた地形での推定で、遺構の実測値ではない。主郭の番手、既存の堀切と竪堀、清水谷の攻め道は保つ。';

// 自動操作も組と登り、木戸を破り、京極丸と小丸の持ち場を押さえる。
odani.history += '長浜市の保存管理計画は、京極丸の東土塁の下に四段の曲輪を記録している。高画質では東斜面に四つの土の平場を補い、平場の草木を除く。位置・南北十八メートル・東西五メートルほどの平場と各三メートルの比高は縮めた地形での推定で、遺構の実測値ではない。東土塁と櫓、南北の門、中央の乱戦の持ち場と西の攻め道は保つ。';
odani.history += '長浜市の保存管理計画は、主郭尾根の最先端に独立した出丸があり、上下二段の曲輪・土塁・空堀からなるとする。高画質では金吾丸より南の遠景に二段の平場と低い土塁、南の空堀を補う。位置・東西十四メートル・南北十八メートルの平場・段差一メートル・土塁の高さ八十センチ・堀の幅四メートルと深さ一・二メートル・北の入口は縮めた地形での推定で、遺構の実測値ではない。内部の建物の存在は不明で、当夜の所属・守将・兵数も確定していない。';

odani.history += '長浜市の保存管理計画は、伝知善院跡の入口へ通じる東西道の北側に、幅三メートル・深さ四十二センチの素掘りの溝を記録している。高画質では寺の東の入口の北に、区画溝とは別の浅い溝を補い、溝底の草木を除く。幅と深さは調査記録を参考にするが、位置・長さ四メートル・断面と既存の区画溝への接続は縮めた地形での推定である。当夜の水位や残存状態は分からない。清水道、寺の入口と南の民の退路は保つ。';

odani.history += '長浜市の保存管理計画は、番所の西側に弓状の土塁、登城道側に礫を盛った土塁を記録している。番所の北辺に高さ三メートルの石垣があったとする根拠は確認できないため、高画質ではその石垣を低い土の堤へ改める。北辺への配置・幅一・四メートル・高さ九十センチと断面は縮めた地形での推定で、遺構の実測値ではない。中央の道と木戸、兵の持ち場は保つ。';

odani.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  // 傷は自然回復しない。短く退いて手当てを試し、全快を待たず任務へ戻る。
  const canTreat = p.treatmentLeft > 0 && !(p.treatmentNext > b.t) && !p.mounted &&
    (u.hp < u.maxHp * .6 || u.wounds?.bleed > .0001);
  const pressGate = F.step === 2 && !F.C.kuruwa.kyogoku.test(u.pos.x, u.pos.z) && (Math.hypot(u.pos.x - BELOW.x, u.pos.z - BELOW.z) < 18 || Math.hypot(u.pos.x - GATE_WEST.x, u.pos.z - GATE_WEST.z) < 18);
  if (F.step < 4 && canTreat && !pressGate && !b.botRest && !(b.botRestNext > b.t)) {
    b.botRest = true; b.botRestUntil = b.t + 12;
  }
  if (b.botRest && (F.step >= 4 || b.t >= b.botRestUntil || !canTreat)) {
    b.botRest = false; b.botRestNext = b.t + 20;
  }
  if (b.botRest) {
    inp.guardHold = false; inp.leftPressed = false; inp.chargeHold = false;
    if (p.treatmentReady) { inp.k.add('KeyE'); return; }
    // 味方の陰へ着いたら止まる。組の中心まで歩き続けると手当ての支度ができない。
    if (p.treatmentShelter(u.pos)) return;
    const cue = b.hud.retreatGuide;
    const shelter = cue?.active && cue.treatment && cue.valid;
    // 九十九折りでは秀吉の旗（谷底かもしれない）へ下りず、たどって来た一つ前の角まで退いて手当て（虎口の真ん中で立ち止まらない）。
    const back = F.step === 1 ? VALLEY_ROUTE[Math.max(0, (F.climbGuideIdx || 1) - 2)] : F.step === 2 && F.onoDone ? ONO_WEST_ENTRY[Math.max(0, (F.kyoTrailIdx || 1) - 2)] : null;
    const c = shelter ? cue : F.retreatOn ? F.retreatPoint : back ? { x: back[0], z: back[1] } : F.hide.center();
    withdrawAlongRoad(b, inp, c, shelter ? .5 : 2, goTo);
    return;
  }
  // 手当てを使い切っていても、人に出した退き口の下知を先に守る。
  // 退く知らせの直後に敵へ突っ込んで、同じ深手を重ねない。
  if (F.retreatOn) {
    inp.leftPressed = false; inp.chargeHold = false; inp.guardHold = false;
    withdrawAlongRoad(b, inp, F.retreatPoint, 2, goTo);
    return;
  }
  // 足跡の到着は二十センチ以内。普通の一メートル手前で止まると、
  // 同じ「来た道の角」を追い続ける。道へ戻る間は近くの敵へ寄り道しない。
  if (F.guideReturning) {
    inp.leftPressed = false; inp.chargeHold = false; inp.guardHold = false;
    // 実際に歩けた足跡をたどる。別の本道へ投影すると、同じ坂で登っては戻る。
    goTo(p, inp, F.trailPoint.x, F.trailPoint.z, .1, true);
    return;
  }
  // 屋敷の庭では守りへ詰める。狭い虎口を通る間だけ、遠い敵を追わない。
  // 反撃を待つ相手と実際の打ち手の選び方は、共通の頭とそろえる。
  // 同じ所で八秒止まったまま打ち合う時（土塁の袋で上の敵と突き合う等）は、打ち合いをやめて抜け出す。
  if (F.step === 2 || F.step === 3) {
    const st = b.odaniStuck || (b.odaniStuck = { x: u.pos.x, z: u.pos.z, t: b.t, esc: null, escT: 0 });
    if (Math.hypot(u.pos.x - st.x, u.pos.z - st.z) > .6) { st.x = u.pos.x; st.z = u.pos.z; st.t = b.t; }
  }
  const stuckFight = F.step === 2 && b.odaniStuck && (b.t - b.odaniStuck.t > 8 || b.t < b.odaniStuck.escT);
  // 京極丸を破った後に南の中丸・大堀切の方へ流れたら、敵を追わず京極丸へ戻る（持ち場は京極丸）。
  const kyoHome = (F.step === 2 && F.onoDone && !F.masuClosed && (F.westGate?.struct?.opened || F.westGate?.struct?.hp <= 0) || F.step === 3 && !F.komaAttack) &&
    !F.C.kuruwa.kyogoku.test(u.pos.x, u.pos.z) && u.pos.z > KYO.z1 - 2;
  // 横矢の座（南の弓の座）と食い違い土塁の角の袋。二秒詰まったら斬り合いをやめ、一度北西の広い所へ出直す。
  if (F.step === 2 && Math.hypot(u.pos.x - YOKOYA[1].x - 1.5, u.pos.z - YOKOYA[1].z + 1) < 3 && b.odaniStuck && b.t - b.odaniStuck.t > 2) b.odaniOut = b.t + 2.5;
  if (b.odaniOut > b.t) { inp.guardHold = false; goTo(p, inp, BELOW.x + 4, BELOW.z - 4.5, .5, true); return; }
  // 枡形の広場に残った時は、二の門の前から門を抜けて出る（京極丸・小丸・本丸のどこへ向かう時も）。
  if ((F.step === 2 && !F.masuClosed || F.step === 3) && inMasu(u.pos.x, u.pos.z)) {
    const [x, z] = masuExit(u.pos);
    goTo(p, inp, x, z, .4);
    return;
  }
  if (kyoHome) {
    inp.guardHold = false;
    const q = roadWay(b.army, u, KC);
    goTo(p, inp, q.x, q.z, .4, true);
    return;
  }
  const entering = F.step === 2 && F.onoDone && !F.C.kuruwa.kyogoku.test(u.pos.x, u.pos.z);
  // 谷道と九十九折りでは近い敵だけを突く（遠くを追って斜面から落ちない）。
  let e = strikeTarget(b, entering ? 3 : F.step <= 1 ? 6 : 12);
  if (e && inKyoLookout(b, e) && Math.abs(e.pos.y - u.pos.y) > 1.8) e = null;
  // 横矢の座・隠し銃座の射手は土塁と板の陰。追って突きに行かず、折れの道を押し抜ける。
  if (e && ((F.yokoya || []).some((y) => y.g === e.group) || (F.nests || []).some((n) => n.g === e.group))) e = null;
  // 九十九折りの上下の段の敵は、届いて見えても切岸の向こう。突き続けて足を止めない。
  if (e && (Math.abs(e.pos.y - u.pos.y) > 1.6 || earthBetween(u.pos, e.pos) || b.army.wallBetween(u.pos, -1, e.pos, false))) e = null;
  if (stuckFight) e = null;   // 食い違い土塁や塀の向こうも同じ
  // 京極丸の中では、外へ退いた敵を追って持ち場を離れない。
  if ((F.step === 2 && F.onoDone && !entering || F.step === 3 && !F.komaAttack) && !F.honAttack &&
      e && !F.C.kuruwa.kyogoku.test(e.pos.x, e.pos.z)) e = null;
  const d = e ? Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) : Infinity;
  // 近くても切岸の向こうへは直進しない。届く突きは残し、遠い敵へは道順で寄る。
  if (e && F.step < 4 && (d < (p.weapon === 'sword' ? 1.9 : 2.8) || roadClear(b.army, u, u.pos, e.pos))) {
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 得物の間合いへ詰め、打ち込みを受けてから構えを解いて突き返す。
    // 構えと突きを同じコマのくじで選ぶと、届かない払いを繰り返してしまう。
    const reach = p.weapon === 'sword' ? 1.7 : 2.6;
    if (d > reach) goTo(p, inp, e.pos.x, e.pos.z, reach);
    patientStrike(p, inp, e, d);
    return;
  }
  inp.guardHold = false;
  if (F.step <= 1) {
    if (F.step === 0) { const a = F.hideU.pos; if (Math.hypot(a.x - u.pos.x, a.z - u.pos.z) > 3.5) goTo(p, inp, a.x, a.z, 3.5); return; }   // 馬を押して谷の下へずらさない
    // 谷の口を出るまでは、人と同じく秀吉の旗の列について登る（足跡の案内は谷の口の集まり場で足踏みした。11/6）
    const hu = F.hideU;
    if (hu?.alive && F.hide?.order === 'path' && Math.hypot(u.pos.x - MOUTH.x, u.pos.z - MOUTH.z) < 30 && Math.hypot(hu.pos.x - u.pos.x, hu.pos.z - u.pos.z) > 4) {
      goTo(p, inp, hu.pos.x, hu.pos.z, 4, true); return;
    }
    // 角の一メートル手前では次の坂が通れない。人と同じ足元の印まで進む。
    if (botBackToRoad(b, p, inp, u, goTo, VALLEY_ROUTE, F.climbGuideIdx)) return;
    goTo(p, inp, F.trailPoint.x, F.trailPoint.z, .3, true);
    return;
  }
  if (F.step === 2) {
    if (odaniBotEscape(b, p, inp, u, goTo)) return;
    if (!F.onoDone) {
      goTo(p, inp, F.trailPoint.x, F.trailPoint.z, .3, true); return;
    }
    const gate = F.westGate?.struct;
    if (gate && !gate.opened && gate.hp > 0 && Math.hypot(u.pos.x - GATE_WEST.x, u.pos.z - GATE_WEST.z) < 8.5) {
      // 道へ向く操作を東向きで上書きすると、門の脇から壁へ歩き続ける。
      // 人に出る掛矢の長押しと同じ手で木戸を打つ。
      const x = GATE_WEST.x - 1.4, z = GATE_WEST.z;
      goTo(p, inp, x, z, 0.9);
      if (Math.hypot(u.pos.x - x, u.pos.z - z) > 0.9) return;   // 味方が門前に詰まっていても、腕の届く所から打つ
      if (p.lock) inp.e.add('KeyQ');
      p.yaw = Math.PI / 2;
      inp.leftPressed = false; inp.chargeHold = false; inp.guardHold = false;
      inp.k.add('KeyE');
      return;
    }
    // 枡形の広場では、閉じた二の門の前で掛矢を打つ。
    const inner = F.innerGate?.struct;
    if (inner && !inner.opened && inner.hp > 0 && (!gate || gate.opened || gate.hp <= 0) && inMasu(u.pos.x, u.pos.z)) {
      const [x, z] = MASU.face;
      goTo(p, inp, x, z, 1.1);
      if (Math.hypot(u.pos.x - x, u.pos.z - z) > 1.1 && Math.hypot(u.pos.x - MASU.ix, u.pos.z - MASU.iz) > 2.6) return;
      if (p.lock) inp.e.add('KeyQ');
      p.yaw = Math.atan2(MASU.ix - x, MASU.iz - z);
      inp.leftPressed = false; inp.chargeHold = false; inp.guardHold = false;
      inp.k.add('KeyE');
      return;
    }
    // 人に示す印と同じ道を通る。斬り合いで戻っても、塀の向こうの古い角へ直進しない。
    if (!F.C.kuruwa.kyogoku.test(u.pos.x, u.pos.z) || inMasu(u.pos.x, u.pos.z)) {
      if (!inMasu(u.pos.x, u.pos.z) && botBackToRoad(b, p, inp, u, goTo, F.kyoVia ? ONO_VIA_ENTRY : ONO_WEST_ENTRY, F.kyoVia ? F.kyoViaIdx : F.kyoTrailIdx)) return;
      goTo(p, inp, F.trailPoint.x, F.trailPoint.z, .3, true); return;
    }
    // 人と同じ印をたどる。壊れた門や、散った組の古い中心へは戻らない。
    goTo(p, inp, F.trailPoint.x, F.trailPoint.z, F.kyoTarget ? 1 : 2, true);
    return;
  }
  if (F.step === 3) {
    // 小丸へ直進すると北の木戸の塀に当たる。任務と同じ折れ点を順に通る。
    const inside = F.komaAttack && F.C.kuruwa.koma.test(u.pos.x, u.pos.z);
    // 小丸へ着いた後は中心で待たず、人に示す最寄りの残敵へ詰める。
    const naga = F.nagaCharge && !F.akaoGo && F.nagamasa?.units[0]?.alive ? F.nagamasa.units[0] : null;
    const target = naga && Math.hypot(naga.pos.x - u.pos.x, naga.pos.z - u.pos.z) < 40 ? naga.pos : F.honAttack ? odaniNearestFoe(b)?.pos || F.trailPoint : F.komaAttack ? inside ? odaniNearestFoe(b)?.pos || KOMC : F.trailPoint : KC;
    // 二の門を出た所から北の小丸・京極丸の奥へは、枡形の塀の東の角を回る（塀越しに直進しない）。
    if (!inMasu(u.pos.x, u.pos.z) && Math.hypot(u.pos.x - MASU.cx, u.pos.z - MASU.cz) < 13 && b.army.wallBetween(u.pos, -1, target, false)) {
      goTo(p, inp, MASU_EAST[0], MASU_EAST[1], .8);
      return;
    }
    // 枡形の塀の角などで五秒動けない時は、歩ける向きへ抜けてから進み直す。
    if (Math.hypot(target.x - u.pos.x, target.z - u.pos.z) > 4 && odaniBotEscape(b, p, inp, u, goTo)) return;
    const q = roadWay(b.army, u, target);
    goTo(p, inp, q.x, q.z, F.honAttack || F.komaAttack && !inside ? .3 : 3);
  }
};

// 信長公記巻六：虎御前山と京極丸の夜攻め、本丸の長政と小丸の久政。清水谷の進路は推定。
// 長浜市保存管理計画の巻六引用：https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
// 小谷の攻略の段は変えず、既存の曲輪・屋敷と遠景へ結ぶ。
installBattleJinkei(odani, [
  battleJin('付城と谷の仕寄り', 0, TORAGOZEN, Math.PI, [
    ['odani_nobunaga', '本陣・虎御前山', '織田信長', null, { x: TORAGOZEN.x, z: TORAGOZEN.z + 10 }, 'eiraku', 'oda', null, { named: false }],
    ['odani_hide', '清水谷・京極丸への仕寄り', '羽柴秀吉', null, MOUTH, 'oda', 'oda', (r) => r.flags.hide, { form: 'column' }],
    ['odani_hachi', '谷の先手', '先手組頭', null, { x: MOUTH.x + 8, z: MOUTH.z + 4 }, 'oda', 'oda', (r) => r.flags.hachi, { form: 'column', named: false }],
    ['odani_valley', '清水谷の控え', '羽柴秀吉の手', null, { x: MOUTH.x - 10, z: MOUTH.z + 24 }, 'oda', 'oda', null, { named: false }],
    ['odani_east', '東の囲みの陣', '織田の衆（将の名は不明）', null, { x: 110, z: -30 }, 'oda', 'oda', null, { named: false }],
    ['odani_northeast', '東の尾根を塞ぐ陣', '織田の衆（将の名は不明）', null, { x: 118, z: -110 }, 'oda', 'oda', null, { named: false }],
    ['odani_otake', '大嶽・占領後の番手', '織田の衆（当夜の将は不明）', null, OTAKE_GUARD, 'oda', 'oda', null, { named: false }],
    ['odani_south', '南の付城・大手の仕寄り', '織田の衆（将の名は不明）', null, { x: -40, z: 168 + SOUTH_SHIFT }, 'oda', 'oda', null, { named: false }],
  ], '織田方の総勢三万は遊びの目安。攻め口ごとの兵数は不明なので、人数を割り振らない。大嶽は八月十二日に織田方が攻め取り、番手を入れた。当夜の番手の将と兵数は不明。先手・後続の組頭や囲みの将名は不明。先手と後続は羽柴の手として示し、蜂須賀勢とは断定しない。羽柴の京極丸攻めを示す。'),
  battleJin('尾根の曲輪と家臣の屋敷の守り', 1, HONC, 0, [
    ['odani_nagamasa', '本陣・本丸', '浅井長政', null, HONC, 'azai', 'azai', (r) => r.flags.nagamasa],
    ['odani_hisamasa', '小丸', '浅井久政', null, KOMC, 'azai', 'azai', (r) => r.flags.hisamasa],
    ['odani_kyogoku', '京極丸・西の木戸', '将の名は不明', null, { x: KC.x + 3, z: KC.z }, 'azai', 'azai', (r) => r.flags.kyo, { named: false }],
    ['odani_nakamaru', '中丸', '将の名は不明', null, { x: NAKAMARU.x, z: NAKAMARU.cz }, 'azai', 'azai', (r) => r.flags.kyoAid, { named: false }],
    ['odani_ohiroma', '大広間・大手の守り', '将の名は不明', null, { x: OOHIROMA.x, z: OOHIROMA.cz }, 'azai', 'azai', (r) => r.flags.azHon, { named: false }],
    ['odani_sanno', '山王丸', '将の名は不明', null, { x: SANNO.x, z: SANNO.cz }, 'azai', 'azai', (r) => r.flags.sanno, { named: false }],
    ['odani_ono', '大野木屋敷', '大野木屋敷の守り（将は不明）', null, { x: ONOGI.x, z: ONOGI.z + 3 }, 'azai', 'azai', (r) => r.flags.ono, { named: false }],
    ['odani_akao', '赤尾屋敷・本丸の下', '赤尾清綱の手', null, { x: AKAO.x, z: AKAO.z }, 'azai', 'azai', (r) => r.flags.akao],
  ], '浅井方の総勢五千は遊びの目安。曲輪ごとの兵数は不明なので、人数を割り振らない。長政と久政の居所を採用し、他の曲輪の将は不明とする。'),
]);

export { odani };
// bot の記録の跡に、羽柴の手の数と崩れ（10/30）
odani.botDbg = (b) => (b.flags.oda || []).map((q) => `${q.count}${q.routed ? 'R' : ''}/${q.units.length}`).join(',') + `|o${b.flags.onoDone ? 1 : 0}w${b.flags.westGate?.struct?.opened || b.flags.westGate?.struct?.hp <= 0 ? 1 : 0}i${b.flags.innerGate?.struct?.opened || b.flags.innerGate?.struct?.hp <= 0 ? 1 : 0}c${Math.round(b.flags.captureT || 0)}h${Math.round(b.flags.holdT || 0)}${(b.flags.trig || []).join('+')}` + (b.flags.honAttack ? `|H${b.flags.honLeft}${b.flags.nagamasa?.units[0]?.alive ? 'N' : 'n'}${b.flags.nagaCharge ? 'C' : ''}${Math.round(b.flags.nagamasa?.units[0]?.pos.x ?? 0)},${Math.round(b.flags.nagamasa?.units[0]?.pos.z ?? 0)}${b.flags.nagamasa?.order || ''}` : '');
