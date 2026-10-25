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
// そのあいだ南の大手では、織田の本隊が番所→御茶屋→御馬屋→桜馬場→黒金御門と
// 一段ずつ攻め上がっていく（遠景の合戦）。「本丸を取れば終わり」でなく、城の真ん中を割って崩す戦。
// 縄張りは castles/odani.js（梯郭の曲輪・大堀切・門・櫓・清水谷の道）。大将格（長政・久政）は前線に出さない。
// 向き：主尾根は南北（北 -z が高い）。清水谷は尾根の西（-x）。信長の本陣（虎御前山）は南西の別の丘。
// ======================================================================
import * as THREE from 'three';
import { S } from './settings.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { yokoyaZa, hiddenGunNest, nobori, hut, campfire, ishigaki, kagaribi, umatsunagi, lumber, kabukimon, dorui, palisade, castleBoardFence, tawara, solidRect, solidSeg, castleMat, makeKitBatch, finalizeKitBatch, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { buildOdaniUpper } from './odani_upper.js';
import { flagTexture } from './textures.js';
import { barkTex, dirtTex } from './nature.js';
import { ODANI_KACCHU } from './kacchu_data.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { sightPoint } from './battle_sight.js';
import { enemyGroup, allyGroup, nm, centerOf, unitPos } from './bhelp.js';
import { applyLook, dress, gone } from './b_inabayama.js';
import { clash } from './b_sekigahara.js';
import { buildCastlePlan, heightOf, inPoly } from './castle_plan.js';
import { goten, horiboriHeight } from './castle_parts.js';
import { Garan } from './temple1571.js';
import { reset as flReset, groundAt } from './floors.js';
import { KIT } from './b_nagashinojo.js';
import { odaniExtraHeight, odaniExtraClear, buildOdaniFukugen } from './odani_fukugen.js';
import {
  ODANI_PLAN as ODANI_BASE_PLAN, RIDGE, STONE_KURUWA, SOUTH_SHIFT, crestAt, BANSHO, OCHAYA, ONMAYA, SAKURABABA, OOHIROMA, HON, NAKAMARU, KYOGOKU as KYO, KOMARU as KOM, SANNOMARU as SANNO, SANNO2, KYOGOKU2, OKURIDGE, UPPER,
  UMAARAI, OHORIKIRI, GATE_KURO, GATE_NAKA_KYO, GATE_KYO_KOMA, GATE_WEST, SHIMIZU, SHIMIZU_FLOOR, CLIMB_UP, KOMA_WEST, demH, KUICHIGAI, NESTS, YOKOYA, ONOGI, AKAO, KYOKAN, TERA, YASHIKI, ROAD_RIDGE, OTE_CLIMB,
} from './castles/odani.js';

// 門の上の建物は形を確定できない。冠木門と木戸で補い、位置・開口・曲輪は保つ。
// 元の縄張りを書き換えず、この戦の組み立てにだけ渡す。
// 切岸は歩行と同じ地面で描く。粗い格子の上張りは斜面から浮き、巨大な緑の板になる。
const ODANI_PLAN = { ...ODANI_BASE_PLAN, terrainBanks: true, koguchi: ODANI_BASE_PLAN.koguchi.map((g) =>
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
const HEAD = { x: SHIMIZU[SHIMIZU.length - 1][0], z: SHIMIZU[SHIMIZU.length - 1][1] };   // 谷の奥
const BELOW = { x: CLIMB_UP[2][0], z: CLIMB_UP[2][1] };   // 京極丸の西の口の下
const CLIMB = [...SHIMIZU, ...CLIMB_UP.slice(1)];
// 閉じた木戸へは扉の手前まで。曲輪内の終点を追って塀の脇で止まらない。
const WEST_APPROACH = [...CLIMB_UP.slice(0, -2), [GATE_WEST.x - 1.4, GATE_WEST.z]];
const WEST_FACE = { x: GATE_WEST.x - 1.4, z: GATE_WEST.z };
const VALLEY_ROUTE = [[MOUTH.x, MOUTH.z], ...CLIMB.slice(2, SHIMIZU.length + 2)];
const AMBUSH_IDS = ['yakata', 'watch', 'patrol'];
const AMBUSH_TIMES = [15, 45, 75];
const NO_VALLEY_PURSUIT = [];
const AMBUSH_LINES = ['道の先に見張りじゃ！　味方と槍を合わせよ', '屋敷の陰から次の組じゃ！　列を離れるな', '登り口の番兵じゃ！　ここを抜けば尾根へ出るぞ'];
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
// 屋敷を取った後も、南の木戸から来た坂へ戻って西木戸へ折れる。
// 庭から登り道へ直接合流させると、屋敷の柵と切岸で印も先手も止まる。
// 枝道の途中から登り道へ斜めに渡らず、来た坂の分かれ目まで戻って折り返す。
// 両方の坂が近い斜面でも、歩く高さと肩の形は違う。
const ONO_WEST_APPROACH = [...ROUTE_O.slice(-4).reverse(), ...WEST_APPROACH.slice(2)];
const ONO_WEST_ENTRY = [...ONO_WEST_APPROACH, CLIMB_UP.at(-1)];
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
    const pad = 1.95, dx = b.x - a.x, dz = b.z - a.z;
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
function roadPoint(path, p, out, army, u) {
  out.d = Infinity;
  for (let i = 1; i < path.length; i++) {
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
  F.guideBlocked = false; F.guideReturning = true;
  // 印を選んだだけでは足跡を捨てない。角まで戻る前に次の印へ移すと、
  // 曲がり角の手前の足跡を失い、塀際で戻る先がなくなる。
  F.returnTrailSkip = skipped + 1;
  return true;
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

// 遠い角へ一直線に登らせず、通れる道の合流点と十二メートル先を示す。
// 合戦中は半秒ごとに呼び、座標の入れ物は使い回す。
function trailAhead(rt, path, index) {
  const F = rt.flags, p = rt.player.u.pos, r = F.guideRoad;
  if (F.guideReturning) {
    const d = Math.hypot(F.trailPoint.x - p.x, F.trailPoint.z - p.z);
    // 足跡は四十センチ刻み。半メートル手前で到着にすると、
    // 塀の角を曲がった足跡まで捨ててしまい、戻る道も塞がる。
    if (d > .2 && roadClear(rt.army, rt.player.u, p, F.trailPoint)) return index;
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
    if (!trailClear(rt, path, p, F.trailPoint)) {
      F.guideBlocked = true;
      F.trailPoint.x = p.x; F.trailPoint.z = p.z;
      returnTrail(rt);
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
  if (!F.onoInGarden) return false;
  let target = null, nearest = 24;
  for (let i = 0; i < 2; i++) for (const u of (i ? F.relief : F.ono).units) {
    if (!battleReady(u)) continue;
    const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
    if (d >= nearest || !sightPoint(rt, u.pos) || !roadClear(rt.army, rt.player.u, p, u.pos)) continue;
    target = u; nearest = d;
  }
  const goal = target ? target.pos : F.onoHouse.doorOut;
  F.guideReturning = false;
  F.guideBlocked = !roadClear(rt.army, rt.player.u, p, goal);
  F.trailPoint.x = F.guideBlocked ? p.x : goal.x;
  F.trailPoint.z = F.guideBlocked ? p.z : goal.z;
  if (F.guideBlocked) returnTrail(rt);
  return true;
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
    return '来た坂の印へ戻れ';
  return '';
}
function assaultTrailLabel(rt) {
  const F = rt.flags;
  if (F.guideBlocked) return '';
  if (F.guideReturning) return F.onoDone ? '南木戸から来た坂へ戻れ' : '南木戸へ向かう道に戻れ';
  if (!F.onoDone) return F.onoInGarden ? '庭の敵を退けよ' : '屋敷の南木戸へ';
  const exit = onogiExitTask(rt);
  if (exit) return exit;
  const gate = F.westGate?.struct;
  if (gate && !gate.opened && gate.hp > 0 && Math.hypot(rt.player.u.pos.x - GATE_WEST.x, rt.player.u.pos.z - GATE_WEST.z) < 6)
    return '西木戸の前で打て';
  return F.C.kuruwa.kyogoku.test(rt.player.u.pos.x, rt.player.u.pos.z)
    ? F.kyoTarget ? '京極丸の残る守りへ' : '京極丸を味方と守れ' : '西木戸への道';
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
const ODA = { flag: 'oda' };
const AZAI = { flag: 'azai' };
const AZ_ARMOR = 0x2e2a26, ODA_ARMOR = 0x2b3140;
// 足軽大将ほどの身分（信長で遊ぶ時は除く）：羽柴の先手の一隊を預かる
const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
const nextObj = (rt, text) => { if (!rt.flags.ending) rt.obj('main', text, 'main'); };
// 小谷当夜の秀吉の装備は ODANI_KACCHU の復元案を近景・遠景ともに使う。
// 八月二十七日の夜の攻め。月齢・晴雨は断定せず、暗い空を保つ。
// 小谷だけの月明かりと地面の照り返しで、岩肌・木・曲輪の輪郭を読めるようにする。
// 旧暦八月末（初秋）の夜。空からの光を抑え、土と草の色と篝火の明暗を残す。
const PREDAWN = { time: 'night', sky: 0x18212f, fog: 0x252c36, sun: 0xb6c3d9, sunI: 0.55, hs: 0x8a96ac, hg: 0x514638, hI: 0.55, top: 0x101722, glow: 0.03, dir: [0.6, 0.55, -0.3], mount: 0x141820 };
const battleReady = (u) => u.alive && !u.fleeing && !u.gone && !u.woundOut && !u.noTarget && !u.campProtected;
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
  for (const u of rt.army.units) {
    if (u.team === rt.player.u.team || u.isStruct || !battleReady(u)) continue;
    const dx = u.pos.x - p.x, dz = u.pos.z - p.z, d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius || Math.abs(u.pos.y - p.y) > 2.4) continue;
    // 見えていても、塀や切岸の向こうなら谷道を登る案内を消さない。
    if (rt.army.wallBetween(p, rt.player.u.team, u.pos) || rt.army.terrainBlocks(p, u.pos)) continue;
    if ((d2 < 25 || sightPoint(rt, u.pos)) && roadClear(rt.army, rt.player.u, p, u.pos)) return true;
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
const FORTS = [
  { id: 'otake', name: '大嶽', x: -128, z: -190, h: 0, flag: 'oda' },
  KINGO,
  { id: 'fukuju', name: '福寿丸', x: -150, z: 142, h: 0, flag: null },
  { id: 'yamazaki', name: '山崎丸', x: -154, z: 64, h: 0, flag: null },
  { id: 'gessho', name: '月所丸', x: 18, z: -218, h: 0, flag: null },
];
// 屋敷の平場：斜面を削って平らにする（大野木屋敷・赤尾屋敷）。高さは中心の元の高さ
const VILLAGE = [[-104, 167, .1], [-130, 174, -.2], [-75, 170, .1], [-143, 158, -.1]];
// 清水谷の寺・屋敷と西麓の町屋は、長浜市『史跡小谷城跡保存管理計画書』を参照。
// https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
// 城下は以前の攻撃で焼かれている。残った里の者が遠巻きに様子を見る場とし、賑わう市は置かない。
// 人数・立ち位置・避難の道筋は遊びの補い。尾根へ登らず、谷口から西の平野へ抜ける。
// 村の戸口と田の北の畦を通り、南西の虎御前山の本陣へは向かわない。
const PEOPLE_EXIT = [[-119, 178], [-142, 178], [-176, 178]];
const PEOPLE_PATHS = [
  [[TERA.x + 4, TERA.z + 18], [-114, 148], [-117, 163], ...PEOPLE_EXIT],
  [[-113, 151], [-117, 163], ...PEOPLE_EXIT],
  [[VILLAGE[0][0] + 7, VILLAGE[0][1] + 8], [-113, 178], ...PEOPLE_EXIT],
];
const PEOPLE_KINDS = [
  ['monk', 'monk', 'woman', 'child'],
  ['townsman', 'merchant', 'woman', 'child', 'elder'],
  ['farmer', 'farmer', 'woman', 'child', 'elder'],
];
const PEOPLE_BANDS = PEOPLE_PATHS.map((p, i) => ({
  x: p[0][0], z: p[0][1], kinds: PEOPLE_KINDS[i], mode: 'watch',
  route: p.slice(1).map(([x, z]) => ({ x, z })),
}));
const TERR = [{ ...TORAGOZEN, r: 20 }, ...VILLAGE.map(([x, z]) => ({ x, z, r: 6 })), { x: ONOGI.x, z: ONOGI.z, r: 12 }, { x: AKAO.x, z: AKAO.z, r: 12 }, ...FORTS.map((f) => ({ x: f.x, z: f.z, r: 9, f })),
  // 清水谷の居館・家臣の屋敷・寺も、斜面を削った平場に建てる（谷の高さのまま。家の下に高い白い台を立てない）
  { x: KYOKAN.x, z: KYOKAN.z, r: 15, own: true }, { x: TERA.x, z: TERA.z, r: 7, own: true }, ...YASHIKI.map(([x, z]) => ({ x, z, r: 6, own: true }))];
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
    const d = Math.hypot(x - t.x, z - t.z);
    if (d >= t.r + 6) continue;
    if (t.h == null) t.h = t.own ? valleyTerrain(t.x, t.z) : baseRaw(t.x, t.z);
    const k = d <= t.r ? 1 : 1 - (d - t.r) / 6;
    h += (t.h - h) * k * k * (3 - 2 * k);
  }
  return Math.max(0, h);
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
  // 南西の低い丘を平野から立ち上げる。谷道と城の尾根へは届かせない。
  const hill = Math.hypot((x - TORAGOZEN.x) / 44, (z - TORAGOZEN.z) / 58);
  const hillH = hill < 1 ? TORAGOZEN.h * (1 - hill * hill) ** 2 : 0;
  return Math.max(hillH, joined + 0.35 * Math.sin(x * 0.07 + 0.3) * Math.cos(z * 0.05) + 0.2 * Math.sin(z * 0.11 + x * 0.03));
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
  let h = H0(x, z);
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
  h = odaniExtraHeight(x, z, h);
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
        detail = mix(detail, grass, odaniWild * 0.6);
        // 高さの縞（横の帯）を作らず、まだらな土と草の濃淡だけにする。
        detail *= 0.9 + 0.12 * sin(vWP.x * 0.31 + vWP.z * 0.23) * sin(vWP.z * 0.37 - vWP.y * 0.11);
        diffuseColor.rgb = mix(diffuseColor.rgb, detail, odaniSlope * odaniArea * 0.8);
      }
      // 初秋の夜：月明かりの灰色で雪のように白く飛ばさず、暗い土と枯れかけた草の色に沈める。
      float odaniLum = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
      float odaniGrass = max(odaniWild, (1.0 - odaniSlope) * smoothstep(0.35, 0.75, sin(vWP.x * 0.13 + sin(vWP.z * 0.09) * 2.0) * sin(vWP.z * 0.11) * 0.5 + 0.5));
      vec3 odaniTone = mix(vec3(1.2, 1.02, 0.8), mix(vec3(0.98, 1.08, 0.78), vec3(0.85, 1.06, 0.74), odaniWild), odaniGrass);
      diffuseColor.rgb = mix(vec3(odaniLum) * odaniTone, diffuseColor.rgb, 0.65) * 0.64;
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

// 退去を後日の出来事として描く一枚絵。主人公の任務にはしない。
function odaniFarewell(rt) {
  const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 440;
  canvas.setAttribute('aria-label', '城を出るお市の方と三人の娘。後日の知らせ');
  canvas.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(92vw,960px);max-height:75vh;object-fit:contain;z-index:30;pointer-events:none';
  const c = canvas.getContext('2d'); if (!c) return;
  const sky = c.createLinearGradient(0, 0, 0, 440); sky.addColorStop(0, '#18212f'); sky.addColorStop(1, '#8b7760');
  c.fillStyle = sky; c.fillRect(0, 0, 960, 440);
  for (let i = 0; i < 4; i++) {
    c.fillStyle = ['#364039', '#2b342e', '#232c26', '#1b231e'][i];
    c.beginPath(); c.moveTo(0, 190 + i * 32); c.lineTo(170, 90 + i * 38); c.lineTo(470, 200 + i * 28); c.lineTo(720, 125 + i * 35); c.lineTo(960, 210 + i * 35); c.lineTo(960, 440); c.lineTo(0, 440); c.fill();
  }
  // 遠い山城は天守を描かず、尾根の館と板塀で示す。
  c.fillStyle = '#b9a789'; c.fillRect(164, 127, 77, 22); c.fillRect(225, 148, 50, 18);
  c.fillStyle = '#35291e'; c.beginPath(); c.moveTo(155, 129); c.lineTo(202, 110); c.lineTo(249, 129); c.fill();
  c.fillStyle = '#8d795a'; c.beginPath(); c.moveTo(440, 440); c.lineTo(630, 260); c.lineTo(660, 260); c.lineTo(780, 440); c.fill();
  const person = (x, y, h, color) => {
    c.fillStyle = '#1b1613'; c.beginPath(); c.ellipse(x, y - h, h * 0.1, h * 0.13, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = color; c.beginPath(); c.moveTo(x - h * 0.08, y - h * 0.86); c.lineTo(x + h * 0.08, y - h * 0.86); c.lineTo(x + h * 0.27, y); c.lineTo(x - h * 0.27, y); c.closePath(); c.fill();
    c.fillStyle = '#d9c8a9'; c.fillRect(x - h * 0.08, y - h * 0.62, h * 0.16, h * 0.08);
  };
  person(581, 363, 108, '#95765e'); person(638, 375, 78, '#84798d'); person(680, 385, 63, '#aa8b69'); person(718, 396, 49, '#9b7374');
  c.fillStyle = '#ece4d2'; c.font = 'bold 26px serif'; c.fillText('後日の知らせ', 36, 46);
  c.font = '24px serif'; c.fillText('お市の方と三人の娘は、小谷の城を出た。', 36, 416);
  rt.hud.root.appendChild(canvas);
  rt.after(4.5, () => canvas.remove());
  setTimeout(() => canvas.remove(), 6000);
}

// 南西の琵琶湖・竹生島・平野の村。位置と縮尺は遠景用の補い、城の中へ当たりを増やさない。
function addOdaniView(rt) {
  const groups = { land: [], water: [], wall: [], roof: [] };
  const box = (key, x, y, z, w, h, d, rot = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateY(rot); g.translate(x, y, z); groups[key].push(g); };
  box('land', -265, -2, 300, 410, 2, 270, -0.22);
  // 山麓の外の平野へ続く畑と村。家も田も材質ごとに一つへまとめる。
  for (let i = 0; i < 24; i++) {
    const x = -130 - (i % 6) * 28, z = 205 + Math.floor(i / 6) * 36;
    box('land', x, 0, z, 22, 0.3, 25, -0.22);
    if (i % 3 === 0) {
      box('wall', x, 1.5, z, 8, 3, 5);
      for (const sd of [-1, 1]) {
        const roof = new THREE.BoxGeometry(9, 0.12, 3.6); roof.rotateX(sd * 0.48); roof.translate(x, 3.6, z + sd * 1.5); groups.roof.push(roof);
      }
    }
  }
  const lake = new THREE.CircleGeometry(1, 40); lake.rotateX(-Math.PI / 2); lake.scale(360, 1, 270); lake.rotateY(-0.25); lake.translate(-650, -0.5, 365); groups.water.push(lake);
  // 竹生島は低い島影と二つの峰だけ。小谷からの方角を、南北へ回した縄張りに合わせる。
  const island = new THREE.SphereGeometry(1, 12, 6); island.scale(26, 17, 15); island.translate(-360, 0, 250); groups.land.push(island);
  const peak = new THREE.SphereGeometry(1, 10, 6); peak.scale(14, 13, 12); peak.translate(-377, 0, 253); groups.land.push(peak);
  const colors = { land: 0x394433, water: 0x455f70, wall: 0x65553e, roof: 0x3d382e };
  for (const key of Object.keys(groups)) {
    const geo = mergeGeometries(groups[key]), mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: colors[key] }));
    mesh.receiveShadow = false; mesh.castShadow = false; rt.scene.add(mesh);
    for (const g of groups[key]) g.dispose();
  }
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

const odani = {
  // 小谷の常設井楼だけ、通し柱を垂直にして横木の木口を交互に出す。
  lookoutLogFrame: true,
  // 共通の民の仕組みで描く。兵の名簿・兵数・戦功には加えない。
  civilianCrowd: { bands: PEOPLE_BANDS },
  // 番兵と槍を合わせる間は先の坂へ誘わない。退路と道へ戻る案内は残す。
  guideMarker: (rt) => rt.flags.retreatOn ? 'retreat' : rt.flags.step === 0 ? 'hide'
    : rt.flags.step === 1 && rt.flags.valleyFighting && !rt.flags.guideReturning && !rt.flags.guideBlocked ? ''
    : rt.flags.step === 3 && !rt.flags.komaAttack ? 'cutHon' : 'trail',
  namedGuideMarkers: true,
  // 行き先の名は道の印へ。札の「京極丸を守れ」に「へ」を継ぎ足さない。
  keepDestinationTask: true,
  keepTaskLabel: true,
  keepCombatTaskHeading: true,
  combatTaskLabel: (rt) => rt.flags.step === 1 && rt.flags.valleyFighting && !rt.flags.guideReturning && !rt.flags.guideBlocked ? '味方と共に番兵を退けよ' : '',
  keepCombatTaskDetail: true, // 戦闘中も、次の敵を待つ理由と守備の進みを残す。
  // 谷の突破と曲輪の制圧が主命。近くの一人の護衛へ任務と道案内を切り替えない。
  guardGuideAllowed: () => false,
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
  compactFlagGuide: true,
  // 画面外の道の印は矢印だけにし、命の札と重ならない空きを使う。
  // 実物の旗へ向かう場面と、谷道の曲がり角へ向かう場面を混同させない。
  avoidAllDestinationNotices: true,
  routeGuideArrowOnly: true,
  directionalDestinationArrow: true,
  travelGuideLabel: (rt) => rt.flags.retreatOn ? '退き口へ' : rt.flags.guideReturning ? '来た道の角へ戻れ' : '道の先へ',
  // 谷の途中の印を、登り口そのものまでの残り距離と取り違えない。
  distanceText: (rt, distance) => {
    if (rt.flags.retreatOn) return distance < 2.5 ? 'ここで構えよ' : `退く印まで${Math.round(distance)}歩`;
    if (rt.flags.guideBlocked) return '来た道へ戻る足場を探せ';
    if (rt.flags.guideReturning) return `戻る印まで${Math.max(1, Math.round(distance))}歩`;
    if (rt.flags.step === 1 && rt.flags.valleyFighting) return '';
    if (rt.flags.step === 1 && rt.flags.climbWaiting) return '先手の到着を待て';
    const metres = Math.max(0, Math.round(distance));
    return rt.missionGuide?.marker?.id === 'trail' && !rt.guideEnemyShown && !rt.guideEnemyDirection
      ? metres < 2 ? '足元の印まで進め' : `次の印まで${metres}歩`
      : `${metres}歩`;
  },
  // 止血して戦いを離れたら、残る傷だけで空き地への退避を繰り返さない。
  // 接近戦・出血・息切れ・矢の落下範囲の警告は共通の仕組みに渡す。
  // 谷では遠い矢を受けた余韻だけで道案内を隠さず、歩いて向き合える番兵で切り替える。
  routeGuidePriority: (rt) => !rt.flags.retreatOn && !(rt.flags.step === 1 ? rt.flags.valleyFighting : rt.player.inCombatT > 0) &&
    !(rt.player.u.wounds?.bleed > .0001) && !rt.player.u.mobbed && rt.player.sta >= 20,
  // 浅い一撃ごとに登りと退避を切り替えない。出血・深い傷・囲まれた時は退く。
  damageRetreatNeeded: (rt) => !!rt.flags.retreatOn || rt.player.u.hp < rt.player.u.maxHp * .6 ||
    rt.player.u.wounds?.bleed > .0001 || !!rt.player.u.mobbed || rt.player.sta < 20,
  // 止血して退き終えた後は、残った手足の傷だけで次の退き口へ誘わない。
  // 再び深手を負った時・出血中・退避の下知中は、任務より退く案内を優先する。
  woundRetreatNeeded: (rt) => !!rt.flags.retreatOn || rt.player.u.wounds?.bleed > .0001 ||
    rt.player.u.hp < rt.player.u.maxHp * .3 &&
      (rt.flags.retreatHp === undefined || rt.player.u.hp < rt.flags.retreatHp - 1),
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
  treatmentApproachLabel: '十字の印へ。そこで手当て',
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
  keepCombatTask: true, // 補足の生成も有効にし、出発の待ち時間・道順・木戸の打ち方を残す。
  cornerEnemyGuide: true, // 敵の手足を太い長方形で隠さず、四隅と頭上の印で示す。
  missionDangerText: (rt) => rt.flags.step === 3 && !rt.flags.komaAttack
    ? '味方が押されている！ 京極丸を守れ'
    : rt.flags.step <= 1 ? '味方が押されている！ 秀吉の列へ戻れ' : '味方が押されている！ 任務の印へ急げ',
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
  spawn: { x: MOUTH.x - 4, z: MOUTH.z + 6, heading: Math.PI - 0.2 },   // 谷道の内で秀吉の二列の脇に立つ。列の後ろと屋敷の軒を避ける
  world: {
    seed: 1573,
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
    namedKacchu: ODANI_KACCHU, // 兵の組み立ては世界の指定を読む。小谷当夜の復元を近景・遠景へ渡す。
    ordinaryFlagStride: 3, // 無名の長柄足軽は三人に一本。隊旗・旗持ち・本人の組は残す（割合は復元）。
    renderDetailBeforeDraw: true,
    lowHumanDetail: 12, // 兵数と骨の動きは保ち、離れた兵の細部だけ軽い形へ。
    armyHeightLOD: true, // 上の曲輪の兵は高低差も含めて遠さを測る。
    tightSceneryCull: true, // 草木と板塀の実寸で囲み、画面外の細長い部品を余分に送らない。
    sceneryViewOnly: true, // 景物は頂点色の陰影を使うため、近くても画面外の木・塀を送らない。
    armyViewCull: true, // 遠景の兵は人数を保ち、画面外の分だけ送らない。
    armyTerrainCull: true, // 山腹に完全に隠れる遠景兵だけ送らない。近景と影は保つ。
    singleSoldierLOD: true, // 遠近の境の兵を二重に送らず、一人につき一つの形で描く。
    routedSoldierLOD: true, // 敗走先も移動の余裕を含めて細部を選び、遠い兵を全員近景の形へ戻さない。
    armyFarDetail: 36, // 三十六メートルに足踏みの余裕を足した先は輪郭の形へ。人数・隊列・動きは同じ。
    highClashDetail: true, // 遠い斬り合いは輪郭の形へ。人数・位置・動きは保つ。
    highClashFarDetail: 24, // 二十四メートル先の顔と甲冑の細部だけを省く。
    soldierDetailNear: 12, // 十二メートルに移動の余裕を足すまで細かい形を保ち、その先も全員を描く。
    soldierDetailMiddle: 24, // 離れた控えの細部だけ輪郭の形へ。接近すれば元の形へ戻す。
    soldierDetailMargin: 3, // 押し引きの位置を反映した上で、足踏みと更新間隔の余裕を残す。
    terrainTriangles: true,
    terrainViewCull: true, // 足場の面は保ち、画面の外の地面だけ描かない。
    terrainBackfaceCull: true, // 尾根の裏向きの地面は送らない。足場・影・表向きの切岸は保つ。
    terrainCullCell: 32, // 尾根の地面を小区画で選び、画面外の斜面を同じ一回の描画から外す。
    terrainClipCells: 2, // 規則格子も二升ごとに選別し、画面外の急斜面を余分に送らない。
    keepTerrainGrid: true, // 携帯も足場と同じ格子。切岸の面に兵や道しるべを埋めない。
    groundedSlopeRocks: true, // 閉じた岩の腹を土へ埋め、斜面の黒い穴や浮いた小石を減らす。
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
    staticBatchBeforeDraw: true, // 城の索引も地面と同じく転送前にそろえ、柱や壁の欠けを防ぐ。
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
    time: 'night', // 信長公記の八月二十七日夜中。夕暮れの光源移動も止める。
    hazeColor: 0x12161d, // 夜明け前の靄は暗い青灰。夕暮れの明るい靄で遠くの尾根の間が白く光らないように
    fireLightLift: 1.5, // 篝火のそばだけ照らし、離れた登り道は夜の暗さを残す。
    blockedHint: (rt) => {
      if (rt.blockedMove?.cause === '兵の列') return '兵の列が詰まった。道の内で脇を通れ';
      const gate = rt.flags.westGate?.struct;
      return rt.flags.onoDone && gate && !gate.opened && gate.hp > 0 &&
        Math.hypot(rt.player.u.pos.x - GATE_WEST.x, rt.player.u.pos.z - GATE_WEST.z) < 6 &&
        roadClear(rt.army, rt.player.u, rt.player.u.pos, WEST_FACE)
        ? '塀沿いの印へ。木戸の前で「打つ」を押し続けよ'
        : '土塁や塀の端を回り、道の印へ進め';
    },
    blockedEscape: true,
    blockedEscapeAfter: 2.5,
    maxWalkDrop: 1.2,
    muddy: 0,   // 踏み固めた山道。薄い泥でも全員が転びやすくなる指定は外す
    paths: [CLIMB, OTE_CLIMB, ROAD_RIDGE, KOMA_WEST, ROUTE_O, LOOKOUT_WAY,
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
      if (ODANI_PLAN.kuruwa.some((k) => inPoly(k.poly, x, z))) c.setRGB(0.46, 0.39, 0.28);
      else if (x < -20 && x > -170 && z > -70 && z < 175 && alongLine(SHIMIZU, x, z).d < 65) {
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
      else if (h > 12) {
        // 伐採した山肌は土を主に、沢沿いに草を残す。既存の土・岩の絵を使う。
        const soil = 0.5 + 0.5 * Math.sin(x * 0.08 + Math.sin(z * 0.06) * 2) * Math.cos(z * 0.11);
        c.setRGB(0.35 + soil * 0.07, 0.34 + soil * 0.01, 0.23 + soil * 0.04);
      }
    },
    clear: (x, z) => odaniExtraClear(x, z) || (Math.abs(x) < ridgeHW(z) + (x < 0 && z > -70 && z < 175 ? 6 : 22) && z < 174 + SOUTH_SHIFT && z > -192)
      || (x < -14 && x > -125 && z > CLIMB_UP[1][1] - 16 && z < 170
        && (alongLine(SHIMIZU, x, z).d < 7 || alongLine(CLIMB_UP, x, z).d < 14))
      || Math.hypot(x - KYOKAN.x, z - KYOKAN.z) < 22 || Math.hypot(x - AKAO.x, z - AKAO.z) < 17 || Math.hypot(x - ONOGI.x, z - ONOGI.z) < 17 || FORTS.some((f) => Math.hypot(x - f.x, z - f.z) < 13),
    // 尾根の曲輪・切岸の外の山肌は、夏の杉と雑木の林（道・谷底・田・屋敷は clear と paths で空ける）。
    trees: 650,
    layeredNeedles: true, // 杉の枝房を段ごとに張らせ、細長い板のような輪郭を崩す。面数は保つ。
    tufts: 1900,
    tuftTint: 0x68704d, // 夜の下草は暗い灰緑。白い穂が一面を覆わないようにする。
    treeDensity: (x, z) => (x < -30 && x > -130 && z > -70 && z < 175 && alongLine(SHIMIZU, x, z).d < 7 ? 0 : 1),
    sugiAt: (x, z) => x < -20 && x > -170 && z > -70 && z < 175 && alongLine(SHIMIZU, x, z).d < 65 ? 0.6 : 0.35,
    groves: [],
    paddy: (x, z) => x > -151 && x < -64 && z > 179 && z < 226 ? 1 : 0,
    fleeOut: (x, z, team) => team === 1 && (x > 60 || z < -150 || z > 168 + SOUTH_SHIFT),
  },

  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  keepOpeningTaskLabel: true, // 開始直後の「出発を待て」を、なぞる操作の札で消さない。
  openingWait: (rt) => rt.flags.step === 0, // 秀吉の下知を待つ五秒間は、歩き出す絵を出さない。
  compactIntro: true,
  introTaskFirst: true, // 横持ちでも、人物紹介より先に最初の仕事を読めるようにする。
  introText: '秀吉のそばで五秒ほど待とう。出発したら道の印に沿って登ろう。京極丸を取って守り、北の小丸を攻めよう。',
  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
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
      if (mat.map && !mat.alphaTest) continue;
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
  width:min(280px, 34vw) !important;
 }
 /* 共通の任務中の高さ制限より優先し、危険の声を札の下まで読めるようにする。 */
 html.touch body #hud[data-odani].mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)),
 html.touch body #hud[data-odani] #battle-notices:not(.choosing) {
  max-height:min(52vh, calc(100% - var(--odani-notice-top) - max(104px, var(--notice-floor, calc(104px + env(safe-area-inset-bottom, 0px)))))) !important;
  overflow-y:auto;
 }
 html.touch body #hud[data-odani] #battle-notices > :is(#objectives,#battle-message) { flex:0 0 auto; }
 html.touch #hud[data-odani] #battle-notices #objectives li.cur small.goal-place { white-space:normal; overflow-wrap:anywhere; overflow-x:visible; }
html.touch.tc-low body #hud[data-odani] #battle-notices #objectives:not(.expand) #obj-list li.cur > small:not(.goal-place):not(.obj-cue) { display:block !important; font-size:max(15px, calc(15px * var(--text-scale, 1))) !important; line-height:1.4 !important; margin-top:4px; }
 html.touch #hud[data-odani] > #battle-log-entry::before { content:'記録'; display:block; font-size:12px; }
}`;
    document.head.appendChild(endStyle);
    const dispose = rt.dispose;
    rt.dispose = function (...args) {
      notices.push = noticePush;
      endStyle.remove(); document.getElementById('vignette')?.removeAttribute('data-odani-down');
      hud?.removeAttribute('data-odani');
      return dispose.apply(this, args);
    };
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
    if (F.westGate?.struct) F.westGate.struct.name = '西木戸';
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
    finalizeSimpleBatch(rt, ridgeHuts);
    // 小丸の南東は門から開く隊列と退き道。俵は北東の隅へ寄せる。
    rt.scene.add(tawara(W, KYO.x + 14, KYO.z1 - 3, 0.3, 5), tawara(W, KOM.x + 6, KOM.z0 + 4, -0.2, 5));
    // 馬洗池は南北9m・東西6.6m。石組みの縁も水面も道の西へ収める。
    {
      const { x, z, w, d } = UMAARAI, y = ONMAYA.level;
      const water = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.6, d - 0.6), new THREE.MeshStandardMaterial({ color: 0x2c3a36, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.9 }));
      water.rotation.x = -Math.PI / 2; water.position.set(x, y + 0.04, z); rt.scene.add(water);
      rt.scene.add(ishigaki(W, [[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x + w / 2, z + d / 2], [x - w / 2, z + d / 2], [x - w / 2, z - d / 2]], { topY: y + 0.35, minH: 0.4, maxH: 0.5, lean: 0, out: -1, noKit: true, big: 1.5 }));
    }
    // 御殿の庭：東側に小池・庭石・枝を横へ広げた松。道と南の縁側を空ける。
    // 一度だけ組み立て、二つの庭で形と材質を使い回す。
    {
      const gardens = [[6.5, HON.cz + 3, HON.level], [7.5, OOHIROMA.cz - 7, OOHIROMA.level]];
      const waterGeo = new THREE.CircleGeometry(1, 12);
      waterGeo.rotateX(-Math.PI / 2);
      const water = new THREE.InstancedMesh(waterGeo, new THREE.MeshStandardMaterial({ color: 0x416450, roughness: 0.25 }), 2);
      const stone = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x77766a }), 12);
      const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.1, .17, 1, 6), new THREE.MeshLambertMaterial({ color: 0x66513a }), 6);
      const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0x34552c }), 8);
      const pose = new THREE.Object3D();
      const put = (mesh, i, x, y, z, sx, sy, sz, tilt = 0) => { pose.position.set(x, y, z); pose.scale.set(sx, sy, sz); pose.rotation.set(0, i * .6, tilt); pose.updateMatrix(); mesh.setMatrixAt(i, pose.matrix); };
      gardens.forEach(([x, z, y], g) => {
        put(water, g, x, y + .06, z, 2.1, 1, 1.5);
        for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; put(stone, g * 6 + i, x + Math.cos(a) * 2.25, y + .18, z + Math.sin(a) * 1.7, .42, .3 + i % 2 * .15, .35); }
        const px = x + 2.8, pz = z - 2.5;
        put(trunks, g * 3, px, y + 1.7, pz, 1, 3.4, 1, -.15);
        for (let i = 0; i < 2; i++) put(trunks, g * 3 + i + 1, px + (i ? -.7 : .8), y + 2.5 + i * .6, pz, .65, 1.8, .65, i ? .9 : -.9);
        for (let i = 0; i < 4; i++) put(crowns, g * 4 + i, px + (i % 2 ? -1 : 1) * .7, y + 2.4 + i * .4, pz + (i % 2) * .4, 1.25, .38, 1);
      });
      rt.scene.add(water, stone, trunks, crowns);
    }
    // 浅井の旗：本丸と小丸に馬印（大将の居場所。長政・久政は建物の奥にいて、前には出ない）
    F.flagsKom = [];
    for (const [x, z, h] of [[HON.x - 9, HON.z1 - 4, 6], [HON.x + 6, HON.cz - 9, 7], [KOM.x - 6, KOM.cz, 6], [KOM.x + 6, KOM.z0 + 3, 7], [SANNO.x - 4, SANNO.cz, 6], [OOHIROMA.x - 10, OOHIROMA.cz, 6], [NAKAMARU.x + 6, NAKAMARU.cz, 5], [KYO.x - 12, KYO.z0 + 2, 6], [KYO.x - 12, KYO.z1 - 2, 6]]) {
      const n2 = nobori(W, x, z, 'azai', h); rt.scene.add(n2);
      if (z < KOM.z1 + 1 && z > KOM.z0 - 1) F.flagsKom.push(n2);
      if (z < KYO.z1 && z > KYO.z0) (F.flagsKyo = F.flagsKyo || []).push(n2);
    }
    for (const [x, z] of [[HON.x + 4, HON.z0 + 3], [KOM.x + 4, KOM.z1 - 2], [KYO.x - 2, KYO.cz + 3], [NAKAMARU.x + 2, NAKAMARU.z1 - 2], [SANNO.x + 4, SANNO.z1 - 4], [OOHIROMA.x - 4, OOHIROMA.z0 + 4]]) { rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.3, size: .55 }); }
    addOdaniNight(rt);
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
    const DA = (x, z, w, d, count, facing, armor, flag, seed, team) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), mon: flag, kind: 'spear', yose: false, host: false, seed, ...(team != null ? { team } : {}) });
    F.azHon = DA(OOHIROMA.x, OOHIROMA.cz, 22, 18, 72, 0, AZ_ARMOR, 'azai', 15736, 1);
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
        ruinedHouse(x, z, 7 + (i % 3), 5, r);
        if (i % 2 === 0) {
          // 回した戸口から庭の外へまっすぐ出られる木戸口。柵で玄関の前を塞がない。
          const entryX = x + Math.tan(r) * 5;
          sceneryFence(W, [x - 6, z + 5, entryX - 1.8, z + 5]);
          sceneryFence(W, [entryX + 1.8, z + 5, x + 6, z + 5]);
        }
      });
      rt.scene.add(umatsunagi(W, KYOKAN.x - 18, KYOKAN.z - 12, 1.4, 6), valleyTimber(W, KYOKAN.x - 17, KYOKAN.z + 12, 0.4));
      const ruins = new THREE.InstancedMesh(ruinGeo, new THREE.MeshLambertMaterial({ color: 0x302a23 }), ruinMatrices.length);
      for (let i = 0; i < ruinMatrices.length; i++) ruins.setMatrixAt(i, ruinMatrices[i]);
      ruins.instanceMatrix.needsUpdate = true;
      ruins.computeBoundingSphere(); rt.scene.add(ruins);
    }
    stampBuild('清水谷の建物と遠景');
    // ---- 防御帯：堀切・竪堀（縄張りの高さと当たり）／食い違い虎口（西の口の外）／隠し銃座／大野木屋敷・赤尾屋敷 ----
    {
      const kb = makeSimpleBatch();
      // 狭い裾に三メートル超を立てると直立壁に見える。小谷の復元だけ、裾のある低い土の堤にする。
      // 食い違いの位置と折れ道は保ち、弾よけの高さ・通れない幅も同じ形から作る。
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
        Object.assign(solidSeg(ax, az, bx, bz, 1.5), { missileH: 1.8, missileType: 'dust' });
      }
      finalizeSimpleBatch(rt, kb);
      F.nests = [];
      for (const nd of NESTS) {
        const nest = hiddenGunNest(W, nd.x, nd.z, nd.rot, { n: nd.n });
        rt.scene.add(nest.group);
        const g = enemyGroup(rt, { faction: 'azai', name: '隠し銃座', anchor: nest.center, fixed: true, facing: Math.atan2(nest.fwd.x, nest.fwd.z), width: 2, aggro: 22, morale: 90 },
          dress([{ type: 'gun', n: nd.n }], AZAI));
        g.units.forEach((u, i) => { const s = nest.spots[i % nest.spots.length]; u.pos.x = s.x; u.pos.z = s.z; u._nest = true; u._crouch = true; });
        F.nests.push({ id: nd.id, g, c: nest.center, mouth: nest.mouth });
      }
      F.yokoya = [];
      for (const yk of YOKOYA) {
        const z = yokoyaZa(W, yk.x, yk.z, yk.rot, { n: yk.n });
        rt.scene.add(z.group);
        const g = enemyGroup(rt, { faction: 'azai', name: '横矢の座', anchor: z.center, fixed: true, facing: Math.atan2(z.fwd.x, z.fwd.z), width: 2, aggro: 20, morale: 90 },
          dress([{ type: yk.k, n: yk.n }], AZAI));
        g.units.forEach((u, i) => { const s = z.spots[i % z.spots.length]; u.pos.x = s.x; u.pos.z = s.z; });
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
      // 全て元の半径の内側に収め、曲輪の外の兵と道には張り出さない。
      const outline = [[-3, 7.5], [3, 7.5], [7.5, 3], [6, -5], [1, -8], [-5, -6], [-7.5, -1], [-6, 5]];
      const width = f.id === 'gessho' ? .78 : f.id === 'yamazaki' ? .9 : 1;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        pts.push(high ? [f.x + outline[i % n][0] * width, f.z + outline[i % n][1]]
          : [f.x + Math.sin(a) * r, f.z + Math.cos(a) * r]);
      }
      // 金吾丸は東側を大手道が折れ返す。二つの口と中央の道を空ける。
      for (let i = 0; i < n; i++) if (f === KINGO ? i !== 1 && i !== 2 : i !== 0) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1], seg = [ax, az, bx, bz];
        if (high) {
          const len = Math.hypot(bx - ax, bz - az);
          const earth = dorui(W, seg, -(bz - az) / len, (bx - ax) / len,
            { batch: scenery, w: 1.2, h: .55, surfaceOnly: false, bareSoil: true, capEnds: true });
          if (!earth.isBatchedPart) rt.scene.add(earth);
        }
        addScenery(sceneryFence(W, seg));
      }
      addScenery(boardHut(W, f.x - (f === KINGO ? 5 : 0), f.z - 2, f === KINGO ? 4 : 6, 4, 0.2, { wall: 0x5a4a34 }));
      // 小さな板葺きの兵糧小屋と俵。門から火のある庭までの中央は空ける。
      if (high && f !== KINGO) {
        boardHut(W, f.x - 4.3 * width, f.z + 2.2, 2.4, 3, Math.PI / 2, { wall: 0x716047 });
        rt.scene.add(tawara(W, f.x + 4.2 * width, f.z - 1, .15, 3));
      }
      if (f.flag) rt.scene.add(nobori(W, f.x + 3, f.z + 3, f.flag, 7), nobori(W, f.x - 4, f.z, f.flag, 6));
      W.addFire(f.x + 2, f.z + 5, { torch: true, h: 1.4 });
    }
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
    DA(MOUTH.x - 10, MOUTH.z + 24, 34, 12, 110, Math.PI - 0.2, ODA_ARMOR, 'oda', 15731);
    DA(110, -30, 30, 14, 110, -Math.PI / 2, ODA_ARMOR, 'oda', 15732);
    DA(118, -110, 26, 12, 90, -Math.PI / 2, ODA_ARMOR, 'eiraku', 15733);
    DA(-40, 168 + SOUTH_SHIFT, 40, 10, 120, Math.PI, ODA_ARMOR, 'eiraku', 15734);
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
      finalizeSimpleBatch(rt, db);
    }
    KIT.honjin(rt, TORAGOZEN.x, TORAGOZEN.z, { mon: 'oda', people: false, fire: true, yoroi: false });
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
    for (const [x, z] of [[MOUTH.x - 6, MOUTH.z + 10], [100, -40], [110, -96], [-20, 160]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z, { torch: true, h: .15 }); }
    // ---- 南の大手：織田の本隊が番所に取りついている（遠景の合戦。一段ずつ攻め上がる） ----
    F.front = 0; F.frontAt = rt.t + 24;
    // 大手の道は別の組が登る。秀吉の組を本丸経由へ回して分断の筋を変えない。
    F.oteRoute = [BANSHO, OCHAYA, ONMAYA, SAKURABABA, { x: GATE_KURO.x, cz: GATE_KURO.z, name: '黒金御門' }, OOHIROMA, { x: HON.x, cz: HON.z1 + 5, name: '本丸の前' }];
    F.oteColumn = DA(0, BANSHO.z1 + 14, 4, 12, 24, Math.PI, ODA_ARMOR, 'oda', 15752, 0);
    F.oteColumn.army.noWake = true;
    F.clash = clash(rt, { x: 0, z: BANSHO.z1 + 8, facing: Math.PI, w: 13, gap0: 0, seed: 15751,
      A: { flag: 'oda', armor: ODA_ARMOR, count: 24, team: 0, faction: 'oda' }, B: { flag: 'azai', armor: AZ_ARMOR, count: 36, team: 1, faction: 'azai', bows: true } });
    // ---- 羽柴秀吉の手（自分の持ち場）と、蜂須賀の手 ----
    F.hide = allyGroup(rt, { name: '羽柴秀吉の手', fixed: true, formation: 'column', colW: 2, spacing: 1.2, anchor: { x: MOUTH.x, z: MOUTH.z }, facing: Math.PI, width: 10, aggro: 10 },
      dress([{ type: 'busho', n: 1, o: { name: '羽柴秀吉', invuln: true } },
        // 護衛の共通指定は後年の白い具足。小谷だけ、当夜の大将と同じ黒漆と威へ合わせる。
        { type: 'samurai', n: 2, o: { armor: ODANI_KACCHU['羽柴秀吉'].armor, lace: ODANI_KACCHU['羽柴秀吉'].lace } },
        { type: 'ashigaru', n: 16 }, { type: 'gun', n: 3 }], ODA));
    F.hideU = F.hide.units[0];
    F.hachi = allyGroup(rt, { name: '羽柴の先手', fixed: true, formation: 'column', colW: 2, spacing: 1.2, anchor: { x: MOUTH.x + 8, z: MOUTH.z + 4 }, facing: Math.PI, width: 10, aggro: 10 },
      dress([{ type: 'samurai', n: 1, o: { name: '先手組頭', invuln: true, hat: 'kabuto_m', haori: 0x3a2a1a } }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 14 }], ODA));
    F.oda = [F.hide, F.hachi];
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: MOUTH.x + 4, z: MOUTH.z + 10 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 清水谷の浅井勢：居館の番兵と、谷の奥の見張り ----
    F.yakata = enemyGroup(rt, { faction: 'azai', name: '居館の番兵', fixed: true, formation: 'yari', anchor: { x: KYOKAN.x - 21, z: KYOKAN.z + 2 }, facing: Math.PI / 2 + 0.6, width: 8, aggro: 16, morale: 75, fleeDir: { x: 0.3, z: -1 } },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 8 }, { type: 'bow', n: 2 }], AZAI));
    F.watch = enemyGroup(rt, { faction: 'azai', name: '谷の奥の見張り', fixed: true, formation: 'column', colW: 2, anchor: { x: HEAD.x - 4, z: HEAD.z + 12 }, facing: 0.4, width: 6, aggro: 14, morale: 70, fleeDir: { x: 0.6, z: -1 } },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }], AZAI));
    // 十八人を六人ずつ三つの番兵へ分ける。新しい兵は増やさない。
    F.patrol = rt.army.addGroup({ team: 1, faction: 'azai', name: '登り口の番兵', order: 'hold',
      anchor: { x: BELOW.x, z: BELOW.z }, formation: 'column', morale: 70, aggro: 8 });
    const patrols = [...F.yakata.units, ...F.watch.units];
    F.yakata.units.length = 0; F.watch.units.length = 0;
    for (let i = 0; i < patrols.length; i++) {
      const wave = Math.floor(i / 6), g = F[AMBUSH_IDS[wave]], u = patrols[i];
      u.group = g; u.slot = g.units.length; g.units.push(u);
      // 初めから道の三か所を守る。見えてから本人の前へ瞬間移動させない。
      const post = VALLEY_ROUTE[wave + 1], next = VALLEY_ROUTE[wave + 2];
      const len = Math.hypot(next[0] - post[0], next[1] - post[1]);
      const dx = (next[0] - post[0]) / len, dz = (next[1] - post[1]) / len;
      const row = Math.floor(u.slot / 2) * .9, side = u.slot % 2 ? .6 : -.6;
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
    F.kyoGate = enemyGroup(rt, { faction: 'azai', name: '西の口の門兵', fixed: true, formation: 'yari', anchor: { x: GATE_WEST.x + 4, z: GATE_WEST.z }, facing: -Math.PI / 2, width: 6, aggro: 10, morale: 80, fleeDir: { x: 1, z: 0 } },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5 }, { type: 'bow', n: 1 }], AZAI));
    F.kyo = enemyGroup(rt, { faction: 'azai', name: '京極丸の守り', fixed: true, anchor: { x: KC.x + 3, z: KC.z }, facing: -Math.PI / 2, width: 10, aggro: 9, morale: 95, fleeDir: { x: 0, z: 1 }, formation: 'yari' },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }, { type: 'bow', n: 2 }], AZAI));
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
    F.kyoAid = reserve('中丸の控え', { x: 0, z: NAKAMARU.cz }, Math.PI, 7);
    F.south = reserve('中丸の押し返す組', { x: -3, z: NAKAMARU.cz - 3 }, Math.PI, 8);
    F.north = reserve('小丸の押し返す組', { x: 3, z: KOM.cz + 3 }, 0, 7);
    F.koma = reserve('小丸の守り', { x: 0, z: KOM.cz - 2 }, 0, 8);
    F.sanno = reserve('山王丸の控え', { x: 0, z: SANNO.z1 - 5 }, 0, 6, 'gun');
    // 総大将を前線の組に混ぜない。史実の最期は戦後の文で伝える。
    const lord = (name, house, at) => {
      const spot = house.lordSpot || at;
      const g = enemyGroup(rt, { name: name + 'の居所', faction: 'azai', fixed: true,
        anchor: spot, facing: 0, aggro: 0, width: 1, noGuard: true, noRout: true },
        // 居所の大将は槍を振り回さず刀を佩く。銘は不明なので共通の刀で復元。
        dress([{ type: 'busho', n: 1, o: { name, invuln: true, weapon: 'sword' } }], AZAI));
      g.historicalOrders = true;
      const u = g.units[0]; u.noTarget = true; u.dmg = 0; u.campProtected = true;
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
    applyLook(rt, PREDAWN);
    W.lookDark = true; // 小谷専用の夜の色でも、描画の夜間露出を使う。
    rt.setPhase('brief');
    rt.obj('main', '秀吉のそばで出発を待て', 'main');
    rt.say('羽柴秀吉', '声を落とせ。京極丸を取り、南の長政と北の久政を切り離す！', 5);
    rt.marker('hide', () => F.hideU.pos, '羽柴秀吉（出発の合図）', { guideAlways: true, alwaysDistance: true, guidePerson: () => F.hideU, guideTalk: false });
    rt.marker('retreat', F.retreatPoint, () => F.retreatOn ? '退き口・来た道へ下がれ' : '', { h: 1.3, guideAlways: true, alwaysDistance: true, guideArea: 'retreat', guideRadius: 2.5 });
    rt.objProgress('main', '五秒ほどで出発する。合図が出たら道の印へ');
    rt.addInteract('talk', { x: MOUTH.x, z: MOUTH.z }, '秀吉の話を聞く', () => { rt.uninteract('talk'); rt.say('羽柴秀吉', 'よし、声を立てずに続け', 2); rt.after(2, () => this.climb(rt)); }, { r: 6 });
    rt.addInteract('oteRoad', { x: MOUTH.x + 4, z: MOUTH.z + 4 }, '大手の道を聞く', () => {
      rt.say('組頭', '南の尾根先は金吾丸じゃ。大手は番所、御茶屋、御馬屋、桜馬場を経て、黒金御門へ上る', 5);
      rt.after(5, () => { if (!F.ending) rt.say('組頭', '門の奥は大広間と本丸じゃ。大堀切の先は中丸、京極丸、小丸、山王丸。我らは京極丸を取る', 5); });
    }, { r: 6 });
    rt.after(5, () => this.climb(rt));
  },

  // ① 清水谷を登る
  climb(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t; F.climbGuideIdx = 1; F.climbProgress = 0; F.climbProgressAt = rt.t;
    rt.setPhase('climb');
    rt.uninteract('talk'); rt.uninteract('oteRoad'); rt.unmark('hide'); rt.unmark('kyoGoal');
    F.trailPoint = { x: CLIMB[2][0], z: CLIMB[2][1] };
    rt.marker('trail', () => F.trailPoint, () => F.guideBlocked || F.climbWaiting ? '' : F.guideReturning ? '来た道の角へ戻れ' : F.valleyFighting ? '' : F.trailGuard ? '登り口の番兵を退けよ' : '谷道の次の印へ', { h: 1.3, guideAlways: true, alwaysDistance: true });
    rt.obj('main', hi(rt) ? '一隊を率いて谷を登れ' : '道の印に沿って谷を登れ', 'main');
    rt.say('羽柴秀吉', '火を消せ。谷道の印に沿い、わしの旗に続け！', 4);
    const H = F.hide;
    H.order = 'path'; H.path = CLIMB.slice(2, SHIMIZU.length + 2); H.pathIdx = 0; H.speed = 3; H.formation = 'column'; H.aggro = 12; H.roadColumn = true;
    H.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: BELOW.x, z: BELOW.z }; g.formation = 'column'; g.aggro = 12; F.hideAt = rt.t; };
    const Hc = F.hachi;
    Hc.order = 'path'; Hc.path = CLIMB.slice(2, SHIMIZU.length + 2); Hc.pathIdx = 0; Hc.speed = 2.9; Hc.formation = 'column'; Hc.roadColumn = true;
    Hc.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: BELOW.x + (CLIMB_UP[1][0] - BELOW.x) * 0.15, z: BELOW.z + (CLIMB_UP[1][1] - BELOW.z) * 0.15 }; g.formation = 'column'; };
    rt.after(30, () => { if (F.step <= 2) { rt.bark('南の大手に鬨の声。味方が番所へ取りついた'); sfx('far', 0.6); } });
  },

  // ② 京極丸を取る
  assault(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    F.guideReturning = false;
    rt.setPhase('kyogoku');
    rt.unmark('watch'); rt.unmark('yakata'); rt.unmark('hide'); rt.unmark('kyoGoal'); rt.unmark('trail');
    roadPoint(ROUTE_O, rt.player.u.pos, ROUTE_FROM, rt.army, rt.player.u);
    F.onoTrailIdx = Number.isFinite(ROUTE_FROM.d) ? Math.ceil(ROUTE_FROM.s) : 0;
    // 任務の切替直後も、遠い曲がり角へ直進させず、歩ける手前の印から始める。
    F.onoTrailIdx = trailAhead(rt, ROUTE_O, F.onoTrailIdx);
    rt.marker('trail', () => F.trailPoint, () => assaultTrailLabel(rt), { h: 1.3, guideAlways: true, alwaysDistance: true });
    // 忍びの谷登りでは鳴らさず、攻め入る下知で初めて法螺と突撃の陣太鼓。
    sfx('sig_kakari', 0.9);
    rt.after(1.5, () => { if (F.step === 2 && !F.ending) sfx('toki', 0.7); });
    rt.banner('京極丸へ', '尾根の真ん中の曲輪に攻め入る');
    nextObj(rt, '屋敷の南木戸へ進め');
    rt.say('羽柴秀吉', '法螺と陣太鼓じゃ、かかれ！　大野木屋敷の南木戸から庭へ押し入れ！', 4);
    rt.marker('ono', F.onoHouse.doorOut, '大野木屋敷の戸口', { red: true, h: 6 });
    rt.after(5, () => { if (F.step === 2 && !F.onoDone) rt.say('先手組頭', '屋敷を抜けば西の木戸じゃ。今は南木戸へ、槍を揃えて続け！', 3); });
    // 遠い屋敷へ「攻めよ」だけでは索敵の外に残る。谷道と南の木戸を通してから攻める。
    for (const g of F.oda) {
      const c = g.center();
      roadPoint(ROUTE_O, c, ROUTE_FROM, rt.army, g.units.find((u) => u.alive));
      g.odaniPlayerPause = false; g.anchor = { x: c.x, z: c.z }; g.order = 'path'; g.path = ROUTE_O;
      g.pathIdx = Number.isFinite(ROUTE_FROM.d) ? Math.ceil(ROUTE_FROM.s) : 0;
      g.formation = 'column'; g.aggro = 6; g.speed = 3;
      g.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 34; gg.formation = 'yari'; };
    }
    F.kyoGate.order = 'hold'; F.kyoGate.seekRange = 12;
    F.kyo.seekRange = 22;
    rt.marker('kyo', centerOf(F.kyoGate), () => '西の口の門兵', { red: true, group: F.kyoGate });
    rt.after(26, () => {
      if (F.step !== 2 || gone(F.kyoAid)) return;
      this.march(F.kyoAid, [[0, NAKAMARU.cz], [0, GATE_NAKA_KYO.z], [0, KC.z]], Math.PI);
      rt.say('組頭', '中丸から新手じゃ！　西の木戸を急ぎ破れ！', 3);
    });
  },

  // ②の途中：大野木屋敷を奪って西の口へ迫る。父子の分断は京極丸を取ってから。
  onoFall(rt) {
    const F = rt.flags;
    if (F.onoDone) return;
    F.onoDone = true;
    F.guideReturning = false;
    rt.unmark('ono');
    if (gone(F.ono)) rt.award((t) => t.side.push('大野木屋敷を奪った'), '大野木屋敷を奪った');
    sfx('kane', 0.5);
    rt.say('浅井の兵', '屋敷を抜かれた！　京極丸の西木戸を固めろ！', 3.5);
    rt.after(4, () => { if (F.step === 2) rt.say('羽柴秀吉', '屋敷は取った！　南の木戸から出て、来た坂を戻れ。道の印から西木戸へ折れるぞ！', 4); });
    roadPoint(ONO_WEST_APPROACH, rt.player.u.pos, ROUTE_FROM, rt.army, rt.player.u);
    F.kyoTrailIdx = Number.isFinite(ROUTE_FROM.d) ? Math.ceil(ROUTE_FROM.s) : 0;
    trailAhead(rt, ONO_WEST_APPROACH, F.kyoTrailIdx);
    nextObj(rt, onogiExitTask(rt) || '西木戸を破って京極丸へ');
    rt.marker('trail', () => F.trailPoint, () => assaultTrailLabel(rt), { h: 1.3, guideAlways: true, alwaysDistance: true });
    for (const g of F.oda) {
      const c = g.center(), u = g.units.find(battleReady);
      if (!u) continue;
      roadPoint(ONO_WEST_ENTRY, c, ROUTE_FROM, rt.army, u);
      g.odaniPlayerPause = false; g.order = 'path'; g.path = ONO_WEST_ENTRY;
      g.pathIdx = Number.isFinite(ROUTE_FROM.d) ? Math.ceil(ROUTE_FROM.s) : 0;
      g.aggro = 4; g.speed = 3; g.formation = 'column';
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
    rt.award((t) => t.side.push('京極丸を取った'), '京極丸を取った');
    rt.objRemove('main'); // ここから小丸が落ちるまでは、段の任務だけを出す。
    sfx('sig_tomare', 0.7);
    rt.banner('浅井軍、二つに切れる', '本丸の長政と小丸の久政、父子の間が断たれた');
    // 京極丸の浅井の旗を倒す。夜の空は数分で朝に変えない
    (F.flagsKyo || []).forEach((n2, i) => rt.after(0.6 + i * 0.5, () => { n2.rotation.z = 1.3; }));

    // 二つに切れた城を見せる（南の本丸・北の小丸に印を少しの間）
    // 攻めない奥に目標の印を置かず、今守る京極丸へ案内する。
    rt.marker('cutHon', { x: KC.x, z: KC.z }, '京極丸を守れ', { h: 2, guideAlways: true, alwaysDistance: true });
    rt.say('羽柴秀吉', `${nm(rt)}、止まれの鉦じゃ！　父子の間は断った。京極丸の内で南北の口を守れ！`, 4.5);
    rt.after(5, () => { if (!F.ending && !F.komaAttack) rt.say('先手組頭', '南の細道から来るぞ！　京極丸の内で受け、外へ追うな！', 3); });
    rt.after(10, () => { if (!F.ending && !F.komaAttack && !gone(F.north)) rt.say('浅井の兵', '北の久政様へ道を開け！　京極丸を取り返せ！', 3); });
    // 連絡を断たれた守りは動揺するが、反撃の槍列は残す。
    for (const g of F.counter) g.morale = Math.max(65, g.morale - 10);
    for (const g of F.komaGuards) g.morale = Math.max(65, g.morale - 10);
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
    nextObj(rt, '京極丸で南北の反撃を退けよ');
  },

  staffHolders(rt) {
    const F = rt.flags;
    for (const g of F.kyoHolders) {
      let ready = 0;
      for (const u of g.units) if (u.alive && !u.fleeing && !u.gone && !u.woundOut && !u.noTarget) ready++;
      if (ready >= 2) continue;
      // 蜂須賀の手を先に使い、足りない時だけ秀吉の足軽を回す。本人の組は動かさない。
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
    F.komaAttack = true; F.captureT = 0; F.guideBlocked = false;
    rt.unmark('cutHon'); rt.unmark('cutKom');
    sfx('sig_susume', 0.8);
    nextObj(rt, '北木戸から小丸へ進め');
    rt.say('羽柴秀吉', '進み太鼓じゃ！　押さえは京極丸に残れ。先手はわしと北の小丸へ続け！', 4);
    const path = [[KC.x, KC.z], [GATE_KYO_KOMA.x, KYO.z0 + 2], [GATE_KYO_KOMA.x, GATE_KYO_KOMA.z], [KOM.x, KOM.z1 - 2], [KOM.x, KOM.cz + 4]];
    F.komaPath = path; F.komaIdx = 0;
    F.trailPoint.x = path[0][0]; F.trailPoint.z = path[0][1];
    rt.marker('trail', () => F.trailPoint, () => F.guideBlocked || F.C.kuruwa.koma.test(rt.player.u.pos.x, rt.player.u.pos.z) ? '' : F.guideReturning ? '来た道の角へ戻れ' : '北の木戸から小丸へ', { h: 1.3, guideAlways: true, alwaysDistance: true });
    this.march(F.hide, path, Math.PI);
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
    pressureTick(rt, stage, enemies, F.oda, stage === 1 ? '谷道を上り、秀吉の旗へ続け' : stage === 2 ? '屋敷の南の木戸へ。味方と守りを崩せ' : stage === 2.5 ? '西の木戸を破り、京極丸の内を押さえよ' : stage === 3 ? '京極丸の内へ戻れ。南北の口を守れ' : '北の木戸から小丸へ。内の守りを崩し、組で押さえよ');
    // 道案内は任務の札で続ける。同じ下知を三十秒ごとに重ねない。
    F.pressureSayAt = Infinity;
  },

  // 小丸を押さえた一組の任務はここまで。退去と長政の最期は後日の話。
  komaFall(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.komaDown = true;
    this.win(rt);
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
    rt.award((t) => { t.main = true; t.special = { label: '京極丸を守り、小丸の守りを崩した', pts: 20 }; }, '小丸の持ち場を押さえた');
    rt.banner('小丸の持ち場を押さえた', '京極丸から小丸まで、羽柴の手が押さえた');
    rt.say('羽柴秀吉', `${nm(rt)}、京極丸を守った働き、見届けたぞ。おぬしらが城を断ったのじゃ`, 4);
    rt.after(4.5, () => rt.say('使番', '小丸の久政殿は自害された。京極丸には押さえを残せとの下知じゃ', 4));
    rt.after(9, () => { odaniFarewell(rt); rt.say('', '――後日の知らせ。お市の方と三人の娘は城を出て、織田方へ返された', 4); });
    rt.after(14, () => rt.say('', '――妻子を送り出した長政は自害した。浅井家は滅びた。最期の日と場所には、違う伝えもある', 4));
    rt.finish({ scriptedEnd: true }, 19);
  },

  lose(rt, why = '京極丸の持ち場を守れなかった') {
    if (!rt.canFailMission()) return;
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; F.trailSign.visible = false; rt.setPhase('end');
    rt.objFail('main'); rt.tracker.main = false;
    for (const id of ['hide', 'trail', 'ono', 'kyo', 'cutHon', 'cutKom', 'yakata', 'watch', 'patrol', 'relief']) rt.unmark(id);
    for (const nest of F.nests || []) rt.unmark(nest.id);
    rt.uninteract('talk');
    rt.uninteract('oteRoad'); F.oteColumn.halt();
    rt.banner('この組は攻めを果たせず', why);
    sfx('sig_nobiki', 0.8);
    rt.obj('withdraw', '退き太鼓。動ける者は来た道を谷へ下がれ', 'order', true);
    rt.say('組頭', '退き太鼓じゃ、もう持たん！　動ける者は来た道を谷へ下がれ！', 4);
    rt.after(4, () => odaniFarewell(rt));
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
      if (g.order === 'path' && !g.odaniPlayerPause && (waitFight || ahead && distance > 16)) {
        // 道順と先頭の位置を保って待つ。持ち場を直線に戻すと後列が切岸へ出てしまう。
        g.odaniMarchSpeed = g.speed; g.speed = 0; g.odaniPlayerPause = true;
      } else if (g.odaniPlayerPause && (g.order !== 'path' || !waitFight && (!ahead || distance < 12))) {
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
    for (let i = 0; i < wave; i++) for (const u of F[AMBUSH_IDS[i]].units) {
      if (battleReady(u) && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 20) return;
    }
    // 登り口へ早く届いた時は、前の番兵を退けてから次を出す。
    // 未登場の組を待つだけの時間を減らす。三組の戦い自体は省かない。
    const atMouth = Math.hypot(p.x - BELOW.x, p.z - BELOW.z) < 20;
    const post = F[AMBUSH_IDS[wave]].anchor;
    const atPost = Math.hypot(p.x - post.x, p.z - post.z) < 12;
    const cleared = wave === 0 || gone(F[AMBUSH_IDS[wave - 1]]);
    const ready = rt.t - (F.ambushWaveAt ?? F.stepT) >= 12;
    if (!ready || rt.t - F.stepT < AMBUSH_TIMES[wave] && !((atMouth || atPost || F.climbNudge) && cleared)) return;
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
    // 主人公一人を囲まず、道で向き合う攻め手と槍を合わせる。
    this.march(g, path, g.facing);
    g.onArrive = (q) => { q.order = 'attack'; q.focus = null; q.seekRange = 12; };
    g.seekRange = 12; g.focus = null;
    F[id + 'On'] = true;
    rt.marker(id, unitPos(g.units[0]), '道の先の番兵', { red: true, group: g });
    rt.say('先手組頭', AMBUSH_LINES[wave], 3);
  },

  supportTick(rt) {
    const F = rt.flags;
    if (rt.t < (F.supportAt || 0)) return;
    F.supportAt = rt.t + 0.5;
    if (F.step !== 2 || F.onoDone || F.reliefOn || rt.t - F.stepT < 12) return;
    const count = F.oda.reduce((n, g) => n + g.count, 0);
    if (rt.t < 145 && count > F.odaInitial * 0.75) return;
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
    rt.say('組頭', '敵の槍が強い！　屋敷から小隊が出るぞ。道の先で味方を助けよ！', 4);
    rt.marker('relief', unitPos(g.units[0]), '味方を押す敵の小隊', { red: true, group: g });
  },

  update(rt, dt) {
    const F = rt.flags;
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    if (F.ending) return;
    // 兵の傷の処理で先に倒れた場合も、共通の重傷・やり直し・結果へ渡す。
    // やり直しの札が出ている間は、その十五秒の期限と選択を保つ。
    if (!rt.player.u.alive) {
      if (!rt.over && !rt.retryOpen) rt.playerDown();
      return;
    }
    // 深手になる前に、歩いて来た道の後ろを示す。十二秒後は任務の印へ戻す。
    const u = rt.player.u;
    const bleeding = u.wounds?.bleed > .0001;
    if (F.retreatHp !== undefined && u.hp > F.retreatHp) F.retreatHp = u.hp;
    // 包帯を一度巻いた印は残り続ける。再出血した時は、今の退避中に血を止めたかで戻す。
    // 印へ着いて敵も離れたら、傷の残りや手当ての布切れで十二秒待たせない。
    if (F.retreatOn && (rt.t >= F.retreatUntil || !bleeding &&
      (u.hp >= u.maxHp * .65 || rt.player.treatmentLeft < F.retreatTreatmentLeft ||
        rt.player.inCombatT <= 0 && rt.player.sta >= 20 &&
        Math.hypot(u.pos.x - F.retreatPoint.x, u.pos.z - F.retreatPoint.z) <= 2.5))) {
      F.retreatOn = false;
      const task = rt.objectives.find((o) => o.id === 'main');
      if (task && F.retreatTask) task.text = F.retreatTask;
      F.retreatTask = '';
      if (rt.missionGuide) rt.missionGuide.scan = 0;
    }
    // 手当てでも傷は残る。同じ傷だけで三十二秒ごとに十メートル戻さない。
    const hurtAgain = F.retreatHp === undefined || u.hp < F.retreatHp - 1;
    if (F.step >= 1 && (u.hp < u.maxHp * .6 && hurtAgain || bleeding) && !F.retreatOn && rt.t >= (F.retreatNext || 0)) {
      F.retreatNext = rt.t + .5;
      // 屋敷を取った後も、南木戸から出て西木戸へ向かった道を戻る。
      // 登り口の道へ切り替えると、庭の塀越しに退き口を探してしまう。
      const path = F.step === 1 ? VALLEY_ROUTE : F.step === 2
        ? F.onoDone ? ONO_WEST_ENTRY : ROUTE_O
        : F.komaAttack ? KOMA_WEST : ONO_WEST_ENTRY;
      const r = F.retreatRoad, q = F.retreatPoint;
      roadPoint(path, u.pos, r, rt.army, u);
      if (Number.isFinite(r.d)) {
        q.x = r.x; q.z = r.z;
        // 曲がり角を飛ばして塀や切岸へ向けない。見通せる範囲で十メートルまで戻す。
        let remaining = Math.max(0, 10 - r.d);
        for (let i = Math.floor(r.s); i >= 0; i--) {
          const dx = path[i][0] - q.x, dz = path[i][1] - q.z, len = Math.hypot(dx, dz);
          const fraction = len > 0 ? Math.min(1, remaining / len) : 0;
          ROAD_TEST.x = q.x + dx * fraction; ROAD_TEST.z = q.z + dz * fraction;
          if (!roadClear(rt.army, u, u.pos, ROAD_TEST)) break;
          q.x = ROAD_TEST.x; q.z = ROAD_TEST.z;
          remaining -= len * fraction;
          if (remaining <= .01) break;
        }
        if (Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 2) {
          F.retreatOn = true; F.retreatUntil = rt.t + 12; F.retreatNext = rt.t + 32;
          F.retreatTreatmentLeft = rt.player.treatmentLeft;
          F.retreatHp = u.hp;
          if (rt.missionGuide) rt.missionGuide.scan = 0;
          rt.bark('傷が深くなる前に退け！　退き口の印へ、敵を向いたまま下がれ', true);
        }
      }
    }
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
      const marker = rt.markers.find((m) => m.id === (F.retreatOn ? 'retreat' : 'trail'));
      const fighting = F.step === 1 && F.valleyFighting && !F.guideReturning && !F.retreatOn;
      const point = marker && !fighting && marker.pos();
      F.trailSign.visible = !!point;
      if (point) {
        const distance = Math.hypot(point.x - rt.player.u.pos.x, point.z - rt.player.u.pos.z);
        F.trailSign.visible = distance > .35 && distance < 18 && !F.ending && rt.player.u.alive && !(F.komaAttack && !F.retreatOn && F.C.kuruwa.koma.test(rt.player.u.pos.x, rt.player.u.pos.z));
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
    // 本人の任務に待ちを足さず、大手の別働隊が下の曲輪から順に近づく。
    // 本丸はまだ長政の持ち場。門前までで止め、制圧したとは告げない。
    if (F.step >= 1 && F.front < F.oteRoute.length - 1 && rt.t >= F.frontAt && (F.front < 3 || F.step >= 2)) {
      const k = F.oteRoute[++F.front];
      F.oteColumn.moveTo(k.x, k.cz, 18);
      F.frontAt = rt.t + 24;
      if (F.front === 3) rt.bark('南の桜馬場から鬨の声が上がる');
      else if (F.front === F.oteRoute.length - 1) rt.bark('本丸の門前で槍がぶつかる');
    }
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
      let idx = Math.min(VALLEY_ROUTE.length - 1, Math.max(F.climbGuideIdx, Math.floor(r.s) + 1));
      // 印の上に立ったら次の角を示す（「1メートル」のまま印が動かず、何も起きない待ちになっていた）
      while (idx < VALLEY_ROUTE.length - 1 && Math.hypot(VALLEY_ROUTE[idx][0] - p.x, VALLEY_ROUTE[idx][1] - p.z) < 4) idx++;
      if (r.s > F.climbProgress + .08) { F.climbProgress = r.s; F.climbProgressAt = rt.t; }
      // 印のそばで十二秒止まったら、次の角と秀吉の旗へ導く。兵数と制圧条件は増やさない。
      if (updateHud) F.climbNudge = !F.retreatOn && !rt.botRest && rt.player.sta >= 20 &&
        rt.t - F.climbProgressAt > 12 && Math.hypot(F.trailPoint.x - p.x, F.trailPoint.z - p.z) < 8 && !rt.army.nearestEnemy(rt.player.u, 12, battleReady);
      if (F.climbNudge && rt.t >= (F.climbNudgeAt || 0)) {
        F.climbNudgeAt = rt.t + 24;
        if (idx < VALLEY_ROUTE.length - 1) {
          ROAD_TEST.x = VALLEY_ROUTE[idx + 1][0]; ROAD_TEST.z = VALLEY_ROUTE[idx + 1][1];
          if (roadClear(rt.army, rt.player.u, p, ROAD_TEST)) idx++;
        }
        rt.say('羽柴秀吉', 'ここで止まるな。谷道の次の印へ、わしの旗に続け！', 4);
        // 進む先は歩ける道の印に一本化する。別の旗への直線距離で斜面へ誘わない。
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
      const d = Math.hypot(p.x - BELOW.x, p.z - BELOW.z);
      if (updateHud) {
        // 距離は次の印までにそろえ、補足では谷の奥へ進む目的を伝える。
        const fighting = valleyEncounter(rt);
        if (F.valleyFighting !== fighting && rt.missionGuide) rt.missionGuide.scan = 0;
        F.valleyFighting = fighting;
        const road = F.guideRoad;
        if (!F.retreatOn) rt.obj('main', F.guideReturning || F.guideBlocked ? '来た道の印へ戻れ'
          : F.valleyFighting ? '味方と共に番兵を退けよ'
          : F.climbWaiting ? 'ここで先手の到着を待て'
          : hi(rt) ? '一隊を率いて谷を登れ' : '道の印に沿って谷を登れ', 'main');
        if (F.guideReturning) rt.objProgress('main', '来た道の角の印へ戻れ。そこから登り直せ');
        else if (F.guideBlocked) rt.objProgress('main', '切岸や塀を避け、来た道の角へ戻れ');
        else if (F.valleyFighting) rt.objProgress('main', '味方の列で敵の方を向き、構えてから突け');
        else if (Number.isFinite(road.d)) {
          rt.objProgress('main', F.guideBlocked ? '切岸や塀を避け、来た道の角へ戻れ'
            : '印の先へ進め。谷の奥の登り口へ');
        } else rt.objProgress('main', '屋敷や切岸を避け、来た道の角へ戻れ');
      }
      this.ambushTick(rt);
      let joined = 0, guards = 0;
      for (const g of F.oda) for (const u of g.units) if (battleReady(u) && Math.hypot(u.pos.x - BELOW.x, u.pos.z - BELOW.z) < 18) joined++;
      // 谷の後方に残る番兵まで全滅を待たない。今登る口の守りは実際に退ける。
      let guard = null, guardDistance = Infinity;
      for (const id of AMBUSH_IDS) for (const u of F[id].units) {
        // まだ姿を見せていない番兵も、登り口に残る限り守りに数える。
        if (!u.alive || u.fleeing || u.gone || u.woundOut || Math.hypot(u.pos.x - BELOW.x, u.pos.z - BELOW.z) >= 28) continue;
        guards++;
        const distance = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
        if (distance < guardDistance) { guard = u; guardDistance = distance; }
      }
      F.trailGuard = !!(d < 16 && guard && guard.odaniReleased && sightPoint(rt, guard.pos));
      // 攻め始めるのと同じ範囲で待ちを案内する。待ちながら十二メートル先へ進ませない。
      F.climbWaiting = d < 16 && guards === 0 && F.patrolWave === AMBUSH_IDS.length;
      if (F.trailGuard) {
        F.guideBlocked = false;
        F.trailPoint.x = guard.pos.x; F.trailPoint.z = guard.pos.z;
      }
      // 三組の番兵を退けた後だけ合流を待つ。後続が遅れても八秒で取りつく。
      F.belowWait = d < 16 && guards === 0 && joined < 3 && F.patrolWave === AMBUSH_IDS.length ? (F.belowWait || 0) + dt : 0;
      if (F.belowWait >= 8 && F.patrolWave === AMBUSH_IDS.length) { rt.say('羽柴秀吉', '後続は待たぬ！　今いる者で取りつくぞ！', 3.5); this.assault(rt); }
      else if (d < 16 && guards === 0 && joined >= 3 && F.patrolWave === 3) this.assault(rt);
      else if (d < 16 && updateHud) rt.objProgress('main', guards > 0 ? '登り口の見張りを、先手と退けよ' : F.patrolWave < AMBUSH_IDS.length ? '味方と列を揃え、登り口の次の番兵に備えよ' : `ここで先手と合流。あと${Math.max(0, Math.ceil(8 - F.belowWait))}秒で攻める`);
    }
    for (const id of AMBUSH_IDS) {
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
          F.nestWarnT = rt.t + 8; rt.bark('鉄砲がこちらを狙う！　横へ逃れ、塀の陰へ！', true);
        }
        continue;
      }
      const dn = Math.hypot(p.x - nst.c.x, p.z - nst.c.z), dm = Math.hypot(p.x - nst.mouth.x, p.z - nst.mouth.z);
      // 目に入った銃座だけ知らせる。物陰の照準先から位置を教えない。
      if ((dn < 17 || dm < 11) && sightPoint(rt, nst.c)) { nst.seen = true; F.nestWarnT = rt.t + 8; rt.army.play('eshout', nst.c, 1); sfx('far', 0.5); rt.bark('塀の陰に鉄砲じゃ！　身を隠し、裏へ回れ！'); rt.marker(nst.id, nst.c, () => '隠し銃座', { red: true, h: 3, group: nst.g }); }
    }
    if (F.step === 2) {
      this.ambushTick(rt);
      if (!F.onoDone && gone(F.ono) && gone(F.relief)) this.onoFall(rt);
      const gate = F.westGate?.struct;
      const breached = !gate || gate.opened || gate.hp <= 0;
      if (F.onoDone && breached && !F.westEnteredOrder) {
        F.westEnteredOrder = true;
        nextObj(rt, '京極丸に残る敵を退けよ');
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
      const path = F.onoDone ? breached ? ONO_WEST_ENTRY : ONO_WEST_APPROACH : ROUTE_O;
      let idx = F.onoDone ? F.kyoTrailIdx : F.onoTrailIdx;
      while (idx < path.length - 1 && Math.hypot(p.x - path[idx][0], p.z - path[idx][1]) < 1.8) idx++;
      if (updateHud) {
        if (!F.onoDone && onogiGuide(rt)) {
          // 庭へ着いた後の行き先は、道の終点ではなく届く守りに切り替え済み。
        } else if (F.onoDone && breached && inside) {
          F.guideBlocked = false; F.guideReturning = false;
          // 残兵がいる間はそちらへ。無人の中心で待ち続けさせない。
          const q = roadWay(rt.army, rt.player.u, target ? target.pos : KC);
          F.trailPoint.x = q.x; F.trailPoint.z = q.z;
          const goal = target ? target.pos : KC;
          if (Math.hypot(goal.x - p.x, goal.z - p.z) > 1.6 && Math.hypot(q.x - p.x, q.z - p.z) < .6) {
            F.guideBlocked = true;
            returnTrail(rt);
          }
          for (const g of F.oda) if (!gone(g) && F.C.kuruwa.kyogoku.test(g.anchor.x, g.anchor.z)) {
            g.focus = target;
          }
        } else idx = trailAhead(rt, path, Math.min(idx, path.length - 1));
      }
      if (F.onoDone) F.kyoTrailIdx = idx; else F.onoTrailIdx = idx;
      // 門兵が崩れたら、曲輪の中の守りへ印を移す
      if (gone(F.kyoGate) && !F.kyoMark && !gone(F.kyo)) { F.kyoMark = true; rt.marker('kyo', centerOf(F.kyo), () => '京極丸の守り', { red: true, group: F.kyo }); F.kyo.order = 'attack'; F.kyo.seekRange = 30; }
      let friends = 0;
      for (const u of rt.army.units) if (u.alive && !u.fleeing && !u.gone && !u.woundOut && !u.noTarget && !u.isStruct && u.team === 0 && F.C.kuruwa.kyogoku.test(u.pos.x, u.pos.z)) friends++;
      // 閉じた木戸の向こうへ印を置かず、打てる側の足場を示す。
      if (updateHud && F.onoDone && !breached && Math.hypot(p.x - GATE_WEST.x, p.z - GATE_WEST.z) < 6 && roadClear(rt.army, rt.player.u, p, WEST_FACE)) {
        F.guideBlocked = false; F.guideReturning = false;
        F.trailPoint.x = GATE_WEST.x - 1.4; F.trailPoint.z = GATE_WEST.z;
      }
      if (updateHud && F.onoDone && !F.retreatOn) {
        const text = F.guideReturning || F.guideBlocked ? '来た道の印へ戻れ'
          : onogiExitTask(rt) || (breached ? left ? '京極丸に残る敵を退けよ' : '京極丸を味方と守れ' : '西木戸を破って京極丸へ');
        const task = rt.objectives.find((o) => o.id === 'main');
        if (task?.text !== text) nextObj(rt, text);
      }
      if (updateHud) rt.objProgress('main', F.guideReturning ? F.onoDone ? '南木戸から来た坂へ戻れ。印に沿って西木戸へ' : '来た道の印へ戻れ。そこから屋敷の南木戸へ' : !F.onoDone && F.onoInGarden ? '庭の敵を味方と退けよ。塀の外へ追うな' : F.guideBlocked ? '塀や切岸を避け、来た道の角へ戻れ' : !F.onoDone ? F.reliefOn && !gone(F.relief) ? '道へ出た敵の小隊を退け、味方を助けよ' : '道の印から屋敷の南木戸へ' : !breached ? Math.hypot(p.x - GATE_WEST.x, p.z - GATE_WEST.z) >= 6 ? '屋敷の南木戸から出て、道の印に沿って西木戸へ' : '木戸の前で「打つ」を押し続けよ' : left ? `地上の守りはあと${left}人。印の先の敵を味方と退けよ` : '京極丸の内を味方六人で十秒保て。櫓は別の任務');
      F.captureT = F.onoDone && breached && left === 0 && friends >= 6 && F.C.kuruwa.kyogoku.test(p.x, p.z) ? F.captureT + dt : 0;
      if (updateHud && F.onoDone && !F.guideReturning && !F.guideBlocked) {
        const exit = onogiExitTask(rt);
        // 味方が先に木戸を開けても、庭にいる本人へ曲輪の制圧を急がせない。
        if (exit) rt.objProgress('main', '南木戸から来た坂へ。塀を越えず、足元の印に沿え');
        else if (breached && left === 0) rt.objProgress('main', !inside ? '道の印から京極丸へ入り、味方と押さえよ' : friends < 6 ? `京極丸の味方${friends}／6人。後続を待て` : `京極丸を守る ${Math.min(10, Math.floor(F.captureT))}／10秒`);
      }
      if (F.captureT >= 10) this.cut(rt);
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
        let friends = 0, enemies = 0;
        // 櫓上の番兵は別任務。制圧の時と同じく、地上へ降りた者だけを数える。
        // 地上を守っても櫓の弓兵一人で守備時間が進まなくなるのを防ぐ。
        for (const u of rt.army.units) if (u.alive && !u.fleeing && !u.gone && !u.woundOut && !u.noTarget && !u.isStruct && F.C.kuruwa.kyogoku.test(u.pos.x, u.pos.z)) {
          if (u.team === 0) friends++; else if (u.team === 1 && !inKyoLookout(rt, u)) enemies++;
        }
        F.awayT = enemies > 0 && friends === 0 ? F.awayT + dt : 0;
        const southRepelled = counterRepelled(rt, F.south, KYO.z1);
        const northRepelled = counterRepelled(rt, F.north, KYO.z0);
        const repelled = southRepelled && northRepelled;
        // 補足を畳む画面でも、同じ「反撃」を待ち続ける札にしない。
        // 既存の守備判定をそのまま読み、敵を倒す条件と待つ条件を見出しで分ける。
        if (updateHud && !F.retreatOn) {
          const text = !inside ? '京極丸の内へ戻れ' : enemies > 0 ? '京極丸の内で敵を退けよ'
            : !repelled ? southRepelled ? '北の木戸を味方と守れ' : northRepelled ? '南の木戸を味方と守れ' : '南北の木戸を味方と守れ'
              : !heldMouths ? '南北の木戸で味方を待て'
              : `京極丸を守れ あと${Math.max(0, Math.ceil(20 - F.holdT))}秒`;
          const task = rt.objectives.find((o) => o.id === 'main');
          if (task?.text !== text) nextObj(rt, text);
        }
        if (updateHud) rt.objProgress('main', F.awayT > 0 ? `京極丸を取り返せ。猶予${Math.max(0, Math.ceil(35 - F.awayT))}秒` : !inside ? '京極丸へ戻り、二十秒守れ' : enemies > 0 ? '曲輪の内の敵を退けよ。外へ追うな' : !repelled ? `南の組${southRepelled ? 'は退いた' : F.south.odaniReachedKyo ? 'を押し返せ' : 'を待て'}。北の組${northRepelled ? 'は退いた' : F.north.odaniReachedKyo ? 'を押し返せ' : 'を待て'}` : !heldMouths ? `押さえ 南${south}／2人・北${north}／2人。後続を待て` : `京極丸を守る ${Math.min(20, Math.floor(F.holdT))}／20秒`);
        if (F.awayT >= 5 && !F.awayWarned && rt.canFailMission()) {
          F.awayWarned = true;
          rt.say('組頭', `あと${Math.max(0, Math.ceil(35 - F.awayT))}秒で持ち場を失う！　京極丸へ戻れ！`, 5);
        }
        if (F.awayT > 35) { this.lose(rt); return; }
        if (enemies === 0 && repelled && inside && heldMouths) F.holdT += dt;
        else F.holdT = 0;
        if (F.holdT >= 5 && !F.restCalled) {
          F.restCalled = true;
          rt.say('先手組頭', '南北の口は押さえた！　ここで息を整えよ。次は北の小丸じゃ', 4);
        }
        if (F.holdT >= 20) this.attackKoma(rt);
      } else {
        // 小丸の外へ退いても印は残す。戻る道の角を半秒ごとに示す。
        if (updateHud && !F.C.kuruwa.koma.test(p.x, p.z)) F.komaIdx = trailAhead(rt, F.komaPath, F.komaIdx);
        if (F.C.kuruwa.koma.test(p.x, p.z)) {
          // 久政は奥の居所に留まる。下知だけを聞かせ、討取りの任務にはしない。
          if (!F.hisamasaCalled) {
            F.hisamasaCalled = true;
            rt.say('浅井久政', 'ここは浅井の城じゃ！　小丸を守れ！', 3);
          }
        }
        let friends = 0, enemies = 0;
        for (const u of rt.army.units) if (u.alive && !u.fleeing && !u.gone && !u.woundOut && !u.noTarget && !u.isStruct && F.C.kuruwa.koma.test(u.pos.x, u.pos.z)) {
          if (u.team === 0) friends++; else if (u.team === 1) enemies++;
        }
        const inKoma = F.C.kuruwa.koma.test(p.x, p.z);
        F.captureT = enemies === 0 && friends >= 4 && inKoma ? F.captureT + dt : 0;
        if (updateHud) {
          // 到着後も「進め」を残さず、残敵・後続待ち・守る時間を実際の制圧条件で分ける。
          const text = !inKoma ? '北木戸から小丸へ進め' : enemies > 0 ? `小丸の敵を退けよ あと${enemies}人`
            : friends < 4 ? '小丸で味方の到着を待て' : `小丸を守れ あと${Math.max(0, Math.ceil(12 - F.captureT))}秒`;
          const task = rt.objectives.find((o) => o.id === 'main');
          if (!F.retreatOn && task?.text !== text) nextObj(rt, text);
          rt.objProgress('main', !inKoma ? F.guideReturning ? '来た道の角の印へ戻れ。そこから北木戸へ進め' : F.guideBlocked ? '塀や切岸を避け、来た道の角へ戻れ' : '秀吉と道の印から北木戸を抜け、小丸へ進め' : enemies > 0 ? '小丸の内の敵を味方と退けよ。外へ追うな' : friends < 4 ? `小丸の味方 ${friends}／4人。列を待て` : `小丸を守る ${Math.min(12, Math.floor(F.captureT))}／12秒`);
        }
        if (F.captureT >= 12) this.komaFall(rt);
      }
    }
    if (F.step >= 1 && F.oda.every(gone) && rt.canFailMission()) {
      if (F.collapseAt === undefined) {
        F.collapseAt = Math.max(rt.t + 30, F.helpUntil || 0);
        if (!F.collapseWarned) {
          F.collapseWarned = true;
          rt.say('組頭', `あと${Math.ceil(F.collapseAt - rt.t)}秒で攻めを退く！　味方と持ち場を押さえよ！`, 5);
        }
      }
      if (rt.t >= F.collapseAt) this.lose(rt, '羽柴の攻め手が崩れ、この組も進めなくなった');
    } else F.collapseAt = undefined;
    // 退き口の印と下知をそろえる。占領や木戸の判定は元の任務のまま保つ。
    if (F.retreatOn && !F.ending) {
      const task = rt.objectives.find((o) => o.id === 'main');
      if (task) {
        const text = '退き口の印へ下がれ';
        if (task.text !== text) F.retreatTask = task.text;
        task.text = text;
        rt.objProgress('main', rt.player.treatmentLeft > 0
          ? rt.player.treatmentNext > rt.t ? '味方の後ろへ。手当てできるまで敵に構えよ'
            : rt.player.treatmentReady ? 'ここで止まれ。「手当て」を三秒長押し'
              : '敵を向いて味方の後ろへ。敵が離れたら止まれ'
          : '布は使い切った。味方の後ろで敵に構えよ');
      }
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout() {},
};

// 両軍の総勢（織田 三万ほど、浅井 五千ほど。数には諸説ある）
odani.force = () => ({ a: 30000, a0: 30000, b: 5000, b0: 5000 });
odani.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '浅井軍', mon: 'azai' } };
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
odani.date = () => '天正元年八月二十七日　秋・夜の攻め';
odani.canSkip = (rt) => rt.phase === 'brief' && rt.t > 3 ? '登りの下知まで待つ' : '';
odani.skip = (rt) => { if (rt.phase === 'brief') odani.climb(rt); };
odani.history = '天正元年（1573）八月、織田信長は刀根坂で朝倉勢を破り、一乗谷を焼いて朝倉家を滅ぼした。すぐに兵を返して北近江の小谷城を囲む。小谷城は小谷山の尾根に曲輪を連ねた大きな山城だった。南の尾根先に金吾丸があり、番所・御茶屋・御馬屋・桜馬場・大広間・本丸・中丸・京極丸・小丸・山王丸へ続く。斜面には小さな曲輪と竪堀があり、信長は南西の虎御前山に本陣を置いた。虎御前山には前年から土塁や曲輪を備える砦が築かれていた。本丸の北は大堀切で断たれていた。西の清水谷には浅井氏の居館や家臣の屋敷があったが、長浜市の保存管理計画は元亀元年と三年の攻撃で落とされたと見る。ここでは以前の焼け跡として描く。南の本丸に浅井長政、北の小丸に父の久政がいた。羽柴秀吉は、その間の京極丸へ攻め上って本丸と小丸を切り離し、小丸の久政は自害した。長政は、妻のお市の方（信長の妹）と三人の娘（のちの茶々・初・江）を城から出して織田方へ返した。信長公記巻六は八月二十七日の夜に京極丸へ攻め上り、久政の居城を取ったと記す。翌日に信長が京極丸へ上り、長政と赤尾清綱も最期を迎えたとする。長政が九月一日に赤尾屋敷で自害したとも伝わり、日付・場所には異説がある。浅井の旧領の多くは秀吉に与えられ、秀吉はのちに今浜を長浜と改めて城を築いた。秀吉が攻め上った道（清水谷からとも）や、一行を送った者の名には諸説がある。両軍の総勢と攻め口ごとの兵数は確定できない。曲輪ごとの兵数、清水谷の道、南北の反撃、天気と建物、屋敷の焼損の形と虎御前山の囲いは復元。地形は国土地理院の標高を下地に、谷・曲輪・道を加工した推定である。清水谷の当時の水流は確定していない。主人公の任務は羽柴の一組として京極丸を守り、小丸の守りを崩す所まで。お市の方の退去を指揮したり、赤尾清綱を京極丸で討つ役は持たない。';
// 夜の羽柴の攻めは信長用の一覧から外す（lord.js）。足軽の攻め口を信長の居所として登録しない。

// 自動操作も組と登り、木戸を破り、京極丸と小丸の持ち場を押さえる。
odani.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  // 傷は自然回復しない。短く退いて手当てを試し、全快を待たず任務へ戻る。
  const canTreat = p.treatmentLeft > 0 && !(p.treatmentNext > b.t) && !p.mounted &&
    (u.hp < u.maxHp * .6 || u.wounds?.bleed > .0001);
  if (F.step < 4 && canTreat && !b.botRest && !(b.botRestNext > b.t)) {
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
    const c = shelter ? cue : F.retreatOn ? F.retreatPoint : F.hide.center();
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
  const entering = F.step === 2 && F.onoDone && !F.C.kuruwa.kyogoku.test(u.pos.x, u.pos.z);
  let e = strikeTarget(b, entering ? 3 : 12);
  if (e && inKyoLookout(b, e) && Math.abs(e.pos.y - u.pos.y) > 1.8) e = null;
  // 京極丸の中では、外へ退いた敵を追って持ち場を離れない。
  if ((F.step === 2 && F.onoDone && !entering || F.step === 3 && !F.komaAttack) &&
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
    if (F.step === 0) { const a = F.hideU.pos; goTo(p, inp, a.x + 3, a.z + 3, 3); return; }
    // 角の一メートル手前では次の坂が通れない。人と同じ足元の印まで進む。
    goTo(p, inp, F.trailPoint.x, F.trailPoint.z, .3, true);
    return;
  }
  if (F.step === 2) {
    if (!F.onoDone) {
      goTo(p, inp, F.trailPoint.x, F.trailPoint.z, .3, true); return;
    }
    const gate = F.westGate?.struct;
    if (gate && !gate.opened && gate.hp > 0 && Math.hypot(u.pos.x - GATE_WEST.x, u.pos.z - GATE_WEST.z) < 6 && roadClear(b.army, u, u.pos, WEST_FACE)) {
      // 道へ向く操作を東向きで上書きすると、門の脇から壁へ歩き続ける。
      // 人に出る掛矢の長押しと同じ手で木戸を打つ。
      const x = GATE_WEST.x - 1.4, z = GATE_WEST.z;
      goTo(p, inp, x, z, 0.2);
      if (Math.hypot(u.pos.x - x, u.pos.z - z) > 0.2) return;
      if (p.lock) inp.e.add('KeyQ');
      p.yaw = Math.PI / 2;
      inp.leftPressed = false; inp.chargeHold = false; inp.guardHold = false;
      inp.k.add('KeyE');
      return;
    }
    // 人に示す印と同じ道を通る。斬り合いで戻っても、塀の向こうの古い角へ直進しない。
    if (!F.C.kuruwa.kyogoku.test(u.pos.x, u.pos.z)) {
      goTo(p, inp, F.trailPoint.x, F.trailPoint.z, .3, true); return;
    }
    // 人と同じ印をたどる。壊れた門や、散った組の古い中心へは戻らない。
    goTo(p, inp, F.trailPoint.x, F.trailPoint.z, F.kyoTarget ? 1 : 2, true);
    return;
  }
  if (F.step === 3) {
    // 小丸へ直進すると北の木戸の塀に当たる。任務と同じ折れ点を順に通る。
    const inside = F.komaAttack && F.C.kuruwa.koma.test(u.pos.x, u.pos.z);
    const target = F.komaAttack ? inside ? KOMC : F.trailPoint : KC;
    const q = roadWay(b.army, u, target);
    goTo(p, inp, q.x, q.z, F.komaAttack && !inside ? .3 : 3);
  }
};

// 信長公記巻六：虎御前山の囲み、清水谷から京極丸、本丸の長政と小丸の久政。
// 小谷の攻略の段は変えず、既存の曲輪・屋敷と遠景へ結ぶ。
installBattleJinkei(odani, [
  battleJin('付城と谷の仕寄り', 0, TORAGOZEN, Math.PI, [
    ['odani_nobunaga', '本陣・虎御前山', '織田信長', 6000, { x: TORAGOZEN.x, z: TORAGOZEN.z + 10 }, 'eiraku', 'oda', null, { named: false }],
    ['odani_hide', '清水谷・京極丸への仕寄り', '羽柴秀吉', 4000, MOUTH, 'oda', 'oda', (r) => r.flags.hide, { form: 'column' }],
    ['odani_hachi', '谷の先手', '先手組頭', 1000, { x: MOUTH.x + 8, z: MOUTH.z + 4 }, 'hachisuka', 'hachisuka', (r) => r.flags.hachi, { form: 'column' }],
    ['odani_valley', '清水谷の控え', '羽柴秀吉の手', 3000, { x: MOUTH.x - 10, z: MOUTH.z + 24 }, 'oda', 'oda', null, { named: false }],
    ['odani_east', '東の囲みの陣', '織田の衆（将の名は不明）', 6000, { x: 110, z: -30 }, 'oda', 'oda', null, { named: false }],
    ['odani_northeast', '東の尾根を塞ぐ陣', '織田の衆（将の名は不明）', 4000, { x: 118, z: -110 }, 'oda', 'oda', null, { named: false }],
    ['odani_south', '南の付城・大手の仕寄り', '織田の衆（将の名は不明）', 6000, { x: -40, z: 168 + SOUTH_SHIFT }, 'oda', 'oda', null, { named: false }],
  ], '織田方の兵数は表示上の目安で、史料の確定値ではない。先手の組頭や囲みの将名は不明。羽柴の京極丸攻めを示す。'),
  battleJin('尾根の曲輪と家臣の屋敷の守り', 1, HONC, 0, [
    ['odani_nagamasa', '本陣・本丸', '浅井長政', 1500, HONC, 'azai', 'azai', (r) => r.flags.nagamasa],
    ['odani_hisamasa', '小丸', '浅井久政', 900, KOMC, 'azai', 'azai', (r) => r.flags.hisamasa],
    ['odani_kyogoku', '京極丸・西の木戸', '将の名は不明', 700, { x: KC.x + 3, z: KC.z }, 'azai', 'azai', (r) => r.flags.kyo, { named: false }],
    ['odani_nakamaru', '中丸', '将の名は不明', 500, { x: NAKAMARU.x, z: NAKAMARU.cz }, 'azai', 'azai', (r) => r.flags.kyoAid, { named: false }],
    ['odani_ohiroma', '大広間・大手の守り', '将の名は不明', 600, { x: OOHIROMA.x, z: OOHIROMA.cz }, 'azai', 'azai', (r) => r.flags.azHon, { named: false }],
    ['odani_sanno', '山王丸', '将の名は不明', 300, { x: SANNO.x, z: SANNO.cz }, 'azai', 'azai', (r) => r.flags.sanno, { named: false }],
    ['odani_ono', '大野木屋敷', '大野木屋敷の守り（将は不明）', 250, { x: ONOGI.x, z: ONOGI.z + 3 }, 'azai', 'azai', (r) => r.flags.ono, { named: false }],
    ['odani_akao', '赤尾屋敷・本丸の下', '赤尾清綱の手', 250, { x: AKAO.x, z: AKAO.z }, 'azai', 'azai', (r) => r.flags.akao],
  ], '浅井五千の目安を割り振った復元。長政と久政の居所を採用し、他の曲輪の将は不明とする。'),
]);

export { odani };
