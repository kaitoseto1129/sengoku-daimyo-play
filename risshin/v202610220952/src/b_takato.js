// 七曲輪・東大手・西搦手の復元は共用し、高遠の遊びやすさだけをここで補う。
// 登録時に縄張り版を写す読み口にも、同じ高遠の補正を渡す。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { takato_siege as takato } from './b_takato_siege.js';
import { isTouch } from './touch.js';
import { allyCover } from './ally_cover.js';
import { placeTaba } from './taketaba.js';
import { ROAD_OTE } from './castles/takato.js';
import { clearFoot } from './cover_guide.js';
import { localClear } from './army_local_way.js';
import { dirtTex } from './nature.js';
import { NAKA, nakaFind, nakaRoomAt } from './naka.js';
import { interiorWaypoint } from './interior_layouts.js';
import { retreatThroughGap, retreatDodge } from './bot_retreat.js';

const baseSetup = takato.setup;
const baseUpdate = takato.update;
const baseTint = takato.world.tint;
const baseGuide = takato.guideMarker;
const baseBot = takato.botBrain;
const baseClampCamera = takato.clampCamera;
// 曲輪を取るまでは、番所の中を休む場所にしない。迷い込んだら家具を避けて戸口へ戻る。
// 本丸を取った後の城将探しと、上の階の戦いには割り込まない。
function roomExit(rt) {
  const F = rt.flags, p = rt.player.u.pos;
  if (rt.G.lord || F.honFell || F.ending || rt.over || !rt.player.u.alive) return null;
  const room = nakaRoomAt(p.x, p.z, p.y);
  if (room && room.lv.k !== 0) { F.exitRoom = null; return null; }
  if (room) F.exitRoom = room.I;
  const I = F.exitRoom;
  if (!I || I.disabled) return null;
  if (!room && Math.hypot(p.x - I.doorOut.x, p.z - I.doorOut.z) < 1) {
    F.exitRoom = null; return null;
  }
  const q = F.roomExitPoint;
  if (!room) { q.x = I.doorOut.x; q.z = I.doorOut.z; q.y = rt.world.heightAt(q.x, q.z); return q; }
  const dx = p.x - I.x, dz = p.z - I.z, lv = room.lv;
  interiorWaypoint(lv.layout, dx * I.c - dz * I.s, dx * I.s + dz * I.c,
    I.door.lx, I.door.side * (lv.d / 2 + .8), F.roomExitLocal);
  q.x = I.x + F.roomExitLocal.x * I.c + F.roomExitLocal.z * I.s;
  q.z = I.z - F.roomExitLocal.x * I.s + F.roomExitLocal.z * I.c;
  q.y = lv.y;
  return q;
}
// 近い梁を画面の長方形で切らず、既存の距離による見通しだけを使う。
takato.nearSceneryScreenCut = false;
// 塀際で肩まで寄った時は、足を収めるために真下を向かない。
takato.footFrameMinDistance = 2.5;
takato.terrainLookWeight = .35;
// 束ねた板塀の面検査は待ち行列になる。狭間を視点が抜けないよう、
// 描画と同じ柱間を準備時だけ箱にし、壊れた区画はその場で除く。
function takatoCameraWalls(rt) {
  const W = rt.world, previous = W.cameraBlockFraction, boxes = [];
  for (const wall of rt.flags.C.walls) {
    if (!wall.seg || wall.h !== 2.6) continue;
    const [ax, az, bx, bz] = wall.seg, length = Math.hypot(bx - ax, bz - az);
    if (length < .01) continue;
    const tx = (bx - ax) / length, tz = (bz - az) / length;
    const count = Math.max(1, Math.round(length / (wall.samaStep || 1.5))), span = length / count;
    for (let i = 0; i < count; i++) {
      const x = ax + tx * (i + .5) * span, z = az + tz * (i + .5) * span;
      boxes.push({ wall, x, z, y: W.heightAt(x, z), tx, tz, half: span / 2 + .04 });
    }
  }
  W.cameraBlockFraction = function (from, to) {
    let hit = previous?.call(this, from, to) ?? null;
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    for (const b of boxes) {
      if (!b.wall.alive || b.wall.opened) continue;
      const x = from.x - b.x, z = from.z - b.z;
      // 遠い柱間は軸ごとの検査へ入れない。
      if (Math.abs(x) > Math.abs(dx) + b.half + .4 || Math.abs(z) > Math.abs(dz) + b.half + .4) continue;
      let lo = 0, hi = hit ?? 1;
      for (let axis = 0; axis < 3; axis++) {
        const p = axis === 0 ? x * b.tx + z * b.tz : axis === 1 ? -x * b.tz + z * b.tx : from.y - b.y;
        const d = axis === 0 ? dx * b.tx + dz * b.tz : axis === 1 ? -dx * b.tz + dz * b.tx : dy;
        const min = axis === 0 ? -b.half : axis === 1 ? -.3 : -.1;
        const max = axis === 0 ? b.half : axis === 1 ? .3 : 2.85;
        if (Math.abs(d) < .000001) {
          if (p < min || p > max) { hi = -1; break; }
        } else {
          const a = (min - p) / d, c = (max - p) / d;
          lo = Math.max(lo, Math.min(a, c)); hi = Math.min(hi, Math.max(a, c));
          if (lo > hi) break;
        }
      }
      if (lo <= hi && lo <= 1 && (hit === null || lo < hit)) hit = lo;
    }
    return hit;
  };
}
// 生存中も、斜面を避けて高さを直した後に塀の裏へ視点を押し出さない。
takato.clampCamera = (rt, pos) => {
  baseClampCamera(rt, pos);
  if (NAKA.cur || rt.game?.photo || rt.player.fpK >= .5 || rt.player.mounted) return;
  const from = rt.flags.cameraHead, corner = rt.flags.cameraCorner;
  if (!from || !corner) return;
  from.copy(rt.player.u.pos); from.y += 2.05 * (rt.player.u.mesh?.scale.y || 1);
  // 補正後の中心線は残りの実測枠を使う。初めて寄る塀も待ち行列だけで見逃さない。
  let hit = rt.player.camBlockHit(from, pos, true);
  // 高さ補正前の四隅だけでは、補正後に寄る塀の横木と角を見落とす。
  // 共通の待ち行列と一コマ二本までの実測を使い、面の探索を増やさない。
  const dx = pos.x - from.x, dz = pos.z - from.z, len = Math.hypot(dx, dz) || 1;
  for (let i = 0; i < 4; i++) {
    const side = i % 2 ? -.35 : .35;
    corner.set(pos.x + dz / len * side, pos.y + (i < 2 ? .2 : -.1), pos.z - dx / len * side);
    const edge = rt.player.camBlockHit(from, corner);
    if (edge !== null && (hit === null || edge < hit)) hit = edge;
  }
  if (hit !== null) pos.lerpVectors(from, pos, Math.max(0, hit - .25 / Math.max(.25, from.distanceTo(pos))));
};

// 現在の大手道と門の順を使う。旧い道の座標へ戻すと、三の丸の柵へ誘導してしまう。
const offRoad = (rt) => !rt.G.lord && !rt.flags.honFell &&
  baseGuide(rt) === 'oteRoad' && rt.flags.roadGuide.returning;
// 道の端へ戻れただけで追撃へ切り替えると、同じ角と城兵の間を往復する。
// 次の角か門前まで戻り切ってから、通常の戦い方へ渡す。
const recoverRoad = (rt) => {
  const F = rt.flags;
  if (rt.G.lord || F.honFell || F.ending || rt.over || !rt.player.u.alive) {
    F.roadRecoverI = null; return false;
  }
  const guide = baseGuide(rt), i = F.guideRoadI ?? 1;
  if (F.roadRecoverI != null) {
    // 人の道案内が通過を確かめた角だけ、自動の道順にも引き継ぐ。
    F.botRoadI = Math.max(F.botRoadI ?? 1, i);
    if (guide !== 'oteRoad' || F.roadRecoverI !== i ||
        (!F.roadGuide.returning && Math.hypot(rt.player.u.pos.x - F.roadGuide.x,
          rt.player.u.pos.z - F.roadGuide.z) < 1.25)) F.roadRecoverI = null;
  }
  if (guide === 'oteRoad' && F.roadGuide.returning) F.roadRecoverI = i;
  return F.roadRecoverI != null;
};
// 安全を調べた退き先がある間は、深手でも専用の頭で印まで下がる。
// 共通の退避で近い味方へ戻すと、竹束の陰や手当ての待ちを捨ててしまう。
// 印がない時の深手・息切れは、引き続き共通の退避を使う。
takato.botEvacuating = (rt) =>
  (roomExit(rt) || !rt.G.lord && rt.flags.retreatTo && !rt.flags.ending && !rt.over && rt.player.u.alive)
    ? true : recoverRoad(rt) && !needsBreath(rt);
// 深手で列へ下がる間と決着後の退きにも、火縄の光を見て射線を外す。
takato.botCoverRetreat = true;
// 城兵との接触が早いので、構えと竹束の役目は出陣する前に伝える。
takato.introText = () => isTouch
  ? '竹束の切れ目を通り、味方と進もう。敵は追わず、列で待とう。「構える」で受け、「突く」で返そう。傷を負ったら味方の後ろで手当て。息切れは下がって休もう。'
  : '竹束の切れ目を通り、味方と進もう。敵は追わず、列で待とう。右クリックで受け、左クリックで返そう。傷を負ったら味方の後ろで手当て。息切れは下がって休もう。';
const coverNear = { below: .75, reach: 5, near: 8 };
const coverTired = { below: 1.01, reach: 5, near: 8 };
// 次の布を巻けるまでの待ち時間も、手当てが必要な傷として扱う。
// 待っている途中で前進へ戻し、出血したまま味方から離れさせない。
const needsBandage = (rt) => rt.player.treatmentLeft > 0 &&
  (rt.player.u.hp < rt.player.u.maxHp * .6 || rt.player.u.wounds?.bleed > .0001);
// 布が尽きた後も、血が落ち着くまでは護衛の後ろに留まる。
// 命が半分残っているだけで前進へ戻すと、出血の警告と下知が食い違う。
// 出血の自然な減衰を使い、体力の全快を待って進軍を止めることはしない。
const needsShelter = (rt) => needsBandage(rt) || rt.player.treatmentLeft <= 0 &&
  rt.player.u.wounds?.bleed > .0001;
// 退く途中も布の有無を知らせる。
const retreatTravelLabel = (rt) => rt.player.u.wounds?.bleed > .0001 && rt.player.treatmentLeft <= 0
  ? '布は使い切った。味方の後ろへ'
  : !rt.flags.retreatTo ? '敵を向いて味方の後ろへ'
  : !rt.flags.retreatGuarded ? rt.player.u.wounds?.bleed > .0001
    ? '出血中。敵から離れよう'
    : needsRest(rt) ? '息切れだ。敵から離れよう' : '城兵から離れよう'
  : needsBandage(rt) ? rt.flags.retreatSheltered
    ? '印へ下がり、止まって手当て'
    : 'まず敵から離れ、味方の後ろへ'
  : rt.flags.meleePressure ? '囲まれる前に、敵を向いて印へ'
  : '休む印へ。敵を向いて下がろう';
// 一撃三割五分の戦で、残り三割五分まで退き始めないと次の一撃に間に合わない。
// 手当て案内と同じ六割を切ったら列へ下がる。傷と兵の強さは変えない。
const needsRest = (rt) => rt.player.sta < rt.player.maxSta * .35 || rt.player.guardBroken > 0;
// 二人の刃を受け続けてからでは退き足が間に合わない。無傷でも列へ戻る。
const needsBreath = (rt) => needsRest(rt) || rt.flags.meleePressure ||
  rt.player.u.hp < rt.player.u.maxHp * .6 || needsShelter(rt);
// 到着は一歩半手前でも認める。護衛から六歩を越えない余裕を残す。
const retreatOffsets = [2, 3.5, 4.25];
// 道から押し出された時だけ、周囲の退き先も調べる。候補は全ての探索で共用する。
const retreatField = [];
for (const radius of [6, 10, 14, 2, 3.5]) for (let i = 0; i < 8; i++) {
  const angle = i * Math.PI / 4;
  retreatField.push({ x: Math.sin(angle) * radius, z: Math.cos(angle) * radius, distance: radius });
}
// 味方が前へ出た後にも、通って来た寄せ道を退き先にできるよう準備しておく。
// 道順に四歩以内で刻み、探索中は同じ点と座標入れを使い回す。
const retreatRoad = [];
for (let i = 1; i < ROAD_OTE.length; i++) {
  const a = ROAD_OTE[i - 1], b = ROAD_OTE[i];
  const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4);
  for (let j = 0; j < steps; j++) retreatRoad.push({
    x: a[0] + (b[0] - a[0]) * j / steps,
    z: a[1] + (b[1] - a[1]) * j / steps,
  });
}
// 手当ては敵から八歩以上離れる必要がある。到着の誤差も含めて十歩あける。
// すでに立っている所は実際の手当てと同じ八歩。歩いて向かう先だけ到着の余裕を取る。
const bandageSpace = (rt, to, clearance = 10) => {
  for (const o of rt.army.units) {
    if (!o.alive || o.team === rt.player.u.team || o.fleeing || o.civ || o.noTarget ||
        o.isStruct || o.type === 'dummy' || o.type === 'porter' ||
        Math.abs(o.pos.y - to.y) > 3) continue;
    if (Math.hypot(o.pos.x - to.x, o.pos.z - to.z) < clearance &&
        !rt.army.wallBetween(to, -1, o.pos)) return false;
  }
  // 敵から離れただけの野原では布を巻けない。六歩以内の護衛も実際の手当てとそろえる。
  return rt.player.treatmentShelter(to);
};
// 敵が近くてまだ布を巻けなくても、まず戦える味方の後ろへ戻る。
// 敵との距離だけで選ぶと、護衛のいない野原へ退き続けてしまう。
const retreatGuard = (rt, to) => {
  const foe = rt.flags.closeFoe;
  for (const o of rt.army.units) {
    if (!o.alive || o.isPlayer || o.team !== rt.player.u.team || o.isStruct || o.civ ||
        o.fleeing || o.noTarget || o.farSim || o.woundOut || o.rearWound || o.downed ||
        o.group?.hidden || o.group?.routed || o.stagger > 0 || o.hp < o.maxHp * .35 ||
        o.type === 'dummy' || o.type === 'porter' ||
        (!needsShelter(rt) && (o.type === 'gun' || o.type === 'bow'))) continue;
    const dx = o.pos.x - to.x, dz = o.pos.z - to.z;
    if (dx * dx + dz * dz >= 4.5 * 4.5 || Math.abs(o.pos.y - to.y) > 2.5 ||
        rt.army.wallBetween(to, -1, o.pos)) continue;
    if (!foe?.alive || dx * (foe.pos.x - to.x) + dz * (foe.pos.z - to.z) > 0) return true;
  }
  return false;
};
const retreatCost = (rt, probe) => bandageSpace(rt, probe.pos) ? 0
  : retreatGuard(rt, probe.pos) ? 1000 : 10000;
// 列の兵で退路が詰まった時は横へ一歩よける余地も残す。
// 印から離れる幅は四分の一歩まで。敵・壁・切岸を横切る足は従来どおり除く。
const retreatGapAllowed = (rt, step) => {
  const p = rt.player.u.pos, q = rt.flags.retreatTo;
  step.y = rt.world.heightAt(step.x, step.z);
  return !!q && Math.hypot(step.x - q.x, step.z - q.z) <= Math.hypot(p.x - q.x, p.z - q.z) + .25 &&
    retreatClear(rt, p, step);
};
// 退き先までの線を調べる。敵の向こうにいる味方へ、斬り合いを横切って戻さない。
const retreatEdgeDrop = (rt, x, z) => {
  const floor = rt.world.heightAt(x, z);
  return floor - Math.min(rt.world.heightAt(x + 2, z), rt.world.heightAt(x - 2, z),
    rt.world.heightAt(x, z + 2), rt.world.heightAt(x, z - 2));
};
const retreatClear = (rt, from, to) => {
  // 地図の縁は視点が遠景へ出る。護衛を探す退避で端へ追い込まない。
  if (Math.max(Math.abs(to.x), Math.abs(to.z)) > rt.world.half - 12) return false;
  // 門柱や逆茂木の中、空堀を横切る先を休む場所として示さない。
  // 既存の足場と坂の判定を使い、探索は一秒ごとのまま保つ。
  if (nakaFind(to.x, to.z) || !clearFoot(rt, to) || !localClear(rt.army, from, to, true)) return false;
  // 足元だけ平らでも、すぐ脇が切岸なら休む印を置かない。押し合いの余裕を残す。
  if (retreatEdgeDrop(rt, to.x, to.z) > 1.5) return false;
  const dx = to.x - from.x, dz = to.z - from.z, l2 = dx * dx + dz * dz;
  // 終点が空いていても、途中で逆茂木や竹束の端を横切る退路は使わない。
  // 座標入れは支度時に作り、既存の足場検査と同じ間隔で使い回す。
  const step = rt.flags.retreatStep, steps = Math.max(1, Math.ceil(Math.sqrt(l2) / .75));
  // 終点だけ広くても、途中の切岸際は押し合いで空堀へ落ちる。
  // すでに縁へ押された時は、危険を増やさず広い足場へ離れる一歩を残す。
  let edgeDrop = Math.max(1.5, retreatEdgeDrop(rt, from.x, from.z));
  let previousY = from.y;
  for (let i = 1; i <= steps; i++) {
    step.x = from.x + dx * i / steps; step.z = from.z + dz * i / steps;
    step.y = rt.world.heightAt(step.x, step.z);
    // 道の指定で歩ける扱いの場所にも急な段差はある。堀底へ落ちる線は退路にしない。
    if (Math.abs(step.y - previousY) > .65 || !clearFoot(rt, step)) return false;
    previousY = step.y;
    const nextDrop = retreatEdgeDrop(rt, step.x, step.z);
    if (nextDrop > edgeDrop + .05) return false;
    edgeDrop = Math.max(1.5, Math.min(edgeDrop, nextDrop));
  }
  for (const o of rt.army.units) {
    if (!o.alive || o.team === rt.player.u.team || o.isStruct || o.noTarget || o.fleeing ||
        o.woundOut || o.downed || o.rearWound || o.group?.hidden || Math.abs(o.pos.y - to.y) >= 3 ||
        ((o.type === 'gun' || o.type === 'bow') && !o.sidearm)) continue;
    const start = Math.hypot(o.pos.x - from.x, o.pos.z - from.z);
    const end = Math.hypot(o.pos.x - to.x, o.pos.z - to.z);
    // 左右に挟まれた時、全員から一度に半歩離れる条件では出口への一歩も消える。
    // 敵へ近づかず横へ抜ける足を残す。刃の間合いでは構えながら退く。
    // 近づく先・敵を横切る線・手当ての安全条件は引き続き除く。
    if (end < 5 && end < start && !rt.army.wallBetween(o.pos, -1, to)) return false;
    const t = Math.max(0, Math.min(1, ((o.pos.x - from.x) * dx + (o.pos.z - from.z) * dz) / (l2 || 1)));
    if (t > 0 && t < 1 && Math.hypot(o.pos.x - from.x - dx * t, o.pos.z - from.z - dz * t) <
        Math.min(3, start - .25) && !rt.army.wallBetween(o.pos, -1, from)) return false;
  }
  return true;
};
// 既存の射線と竹束の防ぎ方で、狙われる退き先より陰を優先する（一秒に一度）。
const retreatExposure = (rt, probe) => {
  let exposed = 0;
  for (const o of rt.army.threats || []) {
    if (!o.alive || o.fleeing || o.team === probe.team || o.sidearm ||
        (o.type !== 'gun' && o.type !== 'bow') || rt.army.shotBlocked(o, probe.pos) ||
        rt.army.hiddenBehind(o, probe) || rt.army.terrainBlocks(o.pos, probe.pos)) continue;
    const sx = o.pos.x - probe.pos.x, sz = o.pos.z - probe.pos.z, sd = Math.hypot(sx, sz);
    let covered = false;
    for (const tb of rt.flags.tabas || []) {
      if (tb.team !== probe.team) continue;
      const dx = tb.x - probe.pos.x, dz = tb.z - probe.pos.z, d = Math.hypot(dx, dz);
      if (sd > 6 && d >= .05 && d <= 2.6 && (dx * sx + dz * sz) / (d * sd) > .5) { covered = true; break; }
    }
    if (!covered) exposed++;
  }
  return exposed;
};
// 危険・道しるべは、気力と間合いの字を避ける既存の配置を使う。
takato.reserveCombatCues = true;
// 隠れる先は旗とは限らない。共通の遮蔽案内が調べた場所の名を使う。
takato.coverGuidePlace = true;
// 遠い城壁が射線を遮っただけの野原を、物陰として案内しない。
// 胸と頭の射線を受ける実物が三歩以内にある場所だけ、共通の探索へ渡す。
takato.coverHitAllowed = (rt, hit, point, shooter) => !!hit.object &&
  (1 - hit.q) * Math.hypot(point.x - shooter.pos.x, point.z - shooter.pos.z) <= 3;
// 手当てへ歩く途中に「止まる」を出さず、着いてから実際の支度を伝える。
// 残り回数・被弾後の待ち・護衛・回復量は既存の判定を使う。
takato.treatmentTaskGuidance = true;
takato.treatmentApproachLabel = '手当ての印へ下がろう';
// 共通の手当て探索も、木の根元・家・竹束の中を行き先にしない。
takato.retreatPointAllowed = (rt, point) => {
  point.y = rt.world.heightAt(point.x, point.z);
  return Math.max(Math.abs(point.x), Math.abs(point.z)) <= rt.world.half - 12 &&
    retreatEdgeDrop(rt, point.x, point.z) <= 1.5 &&
    !nakaFind(point.x, point.z) && clearFoot(rt, point);
};
// 専用の退き先がない時も、共通の横歩きと画面の退避案内を同じ退路で調べる。
// 終点だけの判定では、塀際の細い足場から空堀へ下がってしまう。
// 回避の矢印も同じ道を調べる。専用の退き先がない間だけ緩い旧判定へ戻さない。
takato.dodgePointAllowed = takato.botRetreatStepAllowed = takato.retreatPathAllowed = (rt, point) => {
  point.y = rt.world.heightAt(point.x, point.z);
  return retreatClear(rt, rt.player.u.pos, point);
};
// 鉄砲への横歩きでも、専用の退路と同じく切岸・竹束・城兵を避ける。
takato.botCoverBlocked = (rt, from, to) => {
  to.y = rt.world.heightAt(to.x, to.z);
  return !retreatClear(rt, from, to);
};
// 退く印と手当ての印で、着いた後の案内をそろえる。
// 出血中に「息を整える」だけを出して、布を巻く条件を隠さない。
const restingTreatmentLabel = (rt) => {
  const p = rt.player;
  if (p.treating) return 'そのまま押し続けよう';
  if (p.treatmentReady) return '「手当て」を三秒長押し';
  if (p.treatmentLeft <= 0) return p.treatmentShelter(p.u.pos)
    ? '布は使い切った。血が落ち着くまで、ここで休もう'
    : '布は使い切った。敵から離れ、味方の後ろへ';
  if (!p.treatmentShelter(p.u.pos)) return '敵から離れ、戦える味方のすぐ後ろへ下がろう';
  if (p.treatmentNext > rt.t) return `次の手当てまであと${Math.ceil(p.treatmentNext - rt.t)}秒`;
  if (p.u.lastHitT <= 6) return `手当ての支度。あと${Math.max(1, Math.ceil(6 - p.u.lastHitT))}秒`;
  if (p.inCombatT > 0) return '敵から離れたまま、戦いの息が静まるのを待とう';
  return '足を止め、狙いと攻撃をやめて手当ての支度をしよう';
};
takato.treatmentGuideLabel = (rt, cue) => {
  const p = rt.player;
  if (roomExit(rt)) return '戸口の印から外へ出て、味方と合流しよう';
  if (p.mounted) return '馬を降りて手当て';
  if (p.treating || p.treatmentReady) return restingTreatmentLabel(rt);
  if (!cue?.valid) return rt.flags.closeFoe?.alive
    ? '敵を向いたまま味方の列へ下がろう'
    : '道の印へ戻り、味方の列へ合流しよう';
  if (Math.hypot(cue.x - p.u.pos.x, cue.z - p.u.pos.z) >= cue.radius)
    return '手当ての印へ下がろう';
  return restingTreatmentLabel(rt);
};
// 息を戻す退避と、敵を受ける構えを取り違えさせない。
takato.retreatGuideLabel = (rt, reached) => {
  // 共通の傷の案内からも呼ばれる。退路も追手もない野原で、架空の列へ下がらせない。
  if (!rt.flags.retreatTo && !rt.flags.closeFoe?.alive &&
      !rt.player.treating && !rt.player.treatmentReady) return needsRest(rt) && !needsShelter(rt)
    ? '足を止め、構えを解いて息を整えよう'
    : '道の印へ戻り、味方と合流しよう';
  if (!reached) return retreatTravelLabel(rt);
  if (rt.player.treating || rt.player.treatmentReady || needsBandage(rt) ||
      rt.player.u.wounds?.bleed > .0001) return restingTreatmentLabel(rt);
  return rt.flags.closeFoe?.alive ? '敵を向いたまま下がろう' : '構えを解いて息を整えよう';
};
// 横画面でも操作の説明を人物紹介より先に読む。
takato.introTaskFirst = true;
takato.compactIntro = true;
// 城兵一人への討取りの札に替えず、味方の列で受ける下知を保つ。
// 退き先や門の打ち場へ切り替わった時も、古い下知を十秒残さない。
takato.keepTaskLabel = true;
takato.keepGuardTaskLabel = true;
takato.immediateTaskChanges = true;
takato.keepCombatTask = true;
// 距離も歩数で読み、退く理由を共通の旗案内で置き換えない。
takato.distanceUnit = 'steps';
takato.keepRetreatReason = true;
// 携帯の指の絵が出ても、下がる理由と休む場所を本文に残す。
takato.keepRetreatGestureReason = true;
takato.dodgeMoveCaption = (_rt, side, rain) =>
  `${rain ? '矢玉をよける' : '敵から離れる'}。${side}へなぞる`;
takato.coverGuideLabel = '矢玉を避け、物かげへ';
takato.coverGuideTouchLabel = '長押しで\n物かげへ移動';
// 出血時にも専用の退き方を使い、実物のない「旗まで」へ言い換えない。
takato.keepWoundRetreatReason = true;
// 長い下知へ歩数を足さず、退く向きは足元の矢印で伝える。
takato.retreatMoveGesture = true;
// 寄せ道の印を隊旗と呼ばず、味方と進む下知を残す。
takato.keepFlagTravelTask = true;
// 城攻めの苦戦で、本陣の旗へ戻る共通の下知を重ねない。
takato.missionDangerText = () => '先手が押されている。城兵を追わず、味方の列で受けよう';
// 先手の交代と壊滅を区別し、守城用の共通文へ言い換えない。
takato.retryReason = (_rt, info) => info.failureReason || null;
// 命が残っていても寄せ手が崩れれば攻めは終わる。道の印を追う案内に戻さない。
takato.retryAdvice = (_rt, info) => info.down ? ''
  : /交代/.test(info.failureReason || '') ? '味方と門へ進み、曲輪を一つずつ取ろう'
  : '城兵を追わず、味方の槍の列で受けよう';
// 近い具足を部位ごとに透かすと、顔・笠・胴の内側が重なって見える。
// 視点に入る一人と本人を隠す一人だけ、既存の仕組みで描く間よける。
takato.nearAllySolidBody = true;
takato.nearAllyWholeOcclusion = true;
takato.nearAllyFadeRadius = 1.25;
takato.nearAllySightWidth = 1.1;
takato.nearHatFadeRadius = 0;
// 塀や門柱で肩へ寄った時は、足を映すために笠と地面へ向き直らない。
// 通常の引いた視点では足元の補正を保ち、敵と門が見える距離だけを空ける。
takato.footFrameMinDistance = 2.5;
// 城兵を味方の列で受ける戦で、たまたま近い一人を護衛する任務へ替えない。
// 共通の敵へ向く・構える案内を使い、大きな盾で槍先と相手を隠さない。
takato.guardGuideAllowed = () => false;
// 槍の軌跡を細く短くし、地面を横切る白い板に見せない。
// 刃先・当たり・材質は共通のまま、既存の細帯の指定だけを使う。
takato.narrowWeaponTrail = true;
// 出陣直後でも城兵が寄ったら、上へ歩く絵より構える下知を優先する。
// 六秒の導入札は保ち、共通の移動案内だけを既存の指定で止める。
takato.openingWait = (rt) => !!rt.flags.closeFoe?.alive || !!rt.flags.retreatTo;
takato.openingLinkedLabel = '上へなぞり、味方と進む';
// 城兵の姿を太い人型と大矢印で覆わず、既存の小さい隅印を使う。
takato.compactFieldGuides = true;
// 近い城兵の全身を太い枠で隠さず、隅印と「てき」の字で示す。
// 携帯で押せる範囲と、構え・攻撃の判定は共通のまま保つ。
takato.subtleEnemyFrames = true;
takato.subtleTargetFrames = true;
// 現在の人物枠が読む指定を使う。古い細枠の指定だけでは太い全周が残る。
takato.cornerEnemyGuide = true;
// 描画を間引いた兵の古い骨位置へ枠を残さず、現在の立ち位置で示す。
takato.positionPersonGuide = true;
takato.bodyHeightGuides = true;
// 足元の本人確認は小さく保ち、退く先の印と見分ける。
takato.playerSignScale = .45;
takato.playerSignMinScale = .45;
takato.compactPlayerSign = true;
// 肩越しで本人の横へ浮く白い人形を省き、足元の輪だけで位置を伝える。
takato.playerSignBodyScale = 0;
takato.playerFootSignOnly = true;
// 開戦六秒の案内にも足元だけの指定を渡し、肩越しの横へ白い囲みを残さない。
takato.openingFootSignOnly = true;
// 小旗が下知や警告と重なる時は畳む。道の矢印と地面の到着点は残す。
takato.smallFlagAvoidNotices = true;
// 寄せ道と退き先には実物の旗がない。端の矢印と歩数も足元の印と呼ぶ。
takato.guidePlaceName = '印';
takato.edgeDestinationLabel = () => '印へ';
takato.namedGuideMarkers = true;
takato.travelGuideLabel = () => '印へ進もう';
// 肩越しで構えた本人の槍を、視界を遮る味方の槍として消さない。
takato.keepPlayerWeapon = true;
takato.compactCombatGuides = true;
// 足元の輪が近い視点で体を囲まないよう、既存の大きさ制限を使う。
takato.groundCombatMarkers = true;
// 肩越しでは人形の輪郭が本人から離れて見える。位置は既存の足元の輪で示す。
takato.noUnitContrast = true;
takato.compactFloorGuides = true;
takato.compactDestinationArea = true;
takato.compactDestinationSign = true;
// 退き先の実物の旗を大きな輪・矢印・旗の絵で三重に覆わない。
takato.compactFlagGuide = true;
takato.groundFlagGuides = true;
takato.smallTaskAreas = true;
takato.avoidWaymarkThreats = true;
takato.edgeBehindWaymarks = true;
// 安全を調べた退き先がある間は、共通の回避が別の空き地を指さないようにする。
// 矢の落下範囲から逃れる案内は共通側で引き続き優先される。
takato.routeGuidePriority = (rt) => !!(roomExit(rt) || rt.flags.retreatTo) && rt.player.u.alive &&
  !rt.over && !rt.flags.ending && !rt.flags.honFell;
// 回避先の絵の旗を、本物の味方の隊旗と取り違えさせない。
takato.dodgeLabel = (_rt, direction, rain) => direction || (rain ? '矢の外へよけよう' : '足元の印へ下がろう');
takato.dodgeGuideLabel = (_rt, reached, rain) => reached ? 'ここで敵へ槍を向けよう'
  : rain ? '矢の外へよけよう' : '足元の印へ下がろう';
// 見回す手を出し続けず、退く先を見たら城兵と足元の小さな印を見せる。
takato.dodgeTurnLabel = (_rt, right, touch) => touch
  ? `${right ? '右' : '左'}へなぞり、退く先を見る`
  : `マウスを${right ? '右' : '左'}へ動かし、退く先を見る`;
// 退き先が背後でも、大きな手の絵を繰り返して竹束の切れ目を覆わない。
// 画面端の方向矢印と退く印の案内は残す。
takato.dodgeTurnDuration = 0;
takato.dodgeGestureBelowNotices = true;
takato.compactDodgeGuide = true;
// 退く先は隊旗ではなく足元の印。短い矢印で城兵と竹束の口を空ける。
takato.escapePlaceLabel = (_rt, rain) => rain ? '矢の外の印へ' : '敵を向いて印へ下がろう';
// 押す結果を短く伝え、末尾の一字だけの折り返しと大きな空白をなくす。
takato.dodgeActionText = '長押しでよける';
takato.dodgeActionHeight = 64;
takato.compactDodgeArrow = true;
takato.retreatArrowLength = 80;
takato.dodgeAvoidNotices = true;
// 横画面で折り返した退避の札が、残りの命を覆わないようにする。
takato.retreatOrderAvoidHealth = true;
takato.guideMarker = (rt) => roomExit(rt) ? 'roomExit' : !rt.over && !rt.flags.ending && !rt.flags.honFell &&
  (rt.flags.retreatTo || rt.flags.closeFoe?.alive)
  // 斬り合い中は移動先を示さない。敵の印は案内に選ばれず、別の遠い印が残るため。
  ? rt.flags.retreatTo ? 'fallBack' : null : baseGuide(rt);
takato.botRetreatWay = (rt, back) => roomExit(rt) || rt.flags.retreatTo || back;
const retreatDodgeAllowed = (rt, step) => retreatClear(rt, rt.player.u.pos, step);
takato.botBrain = (rt, inp, helpers) => {
  const exit = roomExit(rt);
  if (exit) {
    const p = rt.player;
    rt.botFollowingTaba = true;
    inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.k.delete('KeyE');
    inp.leftPressed = false; inp.chargeHold = false; inp.runHeld = false; inp.guardHold = false;
    if (p.lock) inp.e.add('KeyQ');
    helpers.goTo(p, inp, exit.x, exit.z, .35);
    return;
  }
  // 刃の間合いを抜けても、印まで退いて息を戻す。門への前進をすぐに再開しない。
  if (rt.flags.retreatTo && !rt.flags.ending && !rt.over && rt.player.u.alive) {
    const p = rt.player, q = rt.flags.retreatTo;
    rt.botFollowingTaba = true;
    inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.k.delete('KeyE');
    inp.leftPressed = false; inp.chargeHold = false; inp.runHeld = false; inp.guardHold = false;
    if (p.lock) inp.e.add('KeyQ');
    let foe = rt.flags.closeFoe?.alive ? rt.flags.closeFoe : null, soonest = Infinity;
    // 八歩先の城兵へ後ずさりを続けると、刃を離しても追いつかれる。
    // まだ打ち込まれていない間は駆けて離れ、間合いに入った追手へ向き直る。
    if (foe && Math.hypot(foe.pos.x - p.u.pos.x, foe.pos.z - p.u.pos.z) > (foe.reach || 2.8) + 1.5)
      foe = null;
    let firstAngle = null, crossed = false;
    // 近い城兵だけを向くと、横や背から先に届く槍を受け損なう。
    // 退く足は保ち、実際に自分へ打ち込む刃のうち先に届く方を受ける。
    for (const o of rt.army.threats || []) {
      if (!o.alive || o.team === p.u.team || o.fleeing || o.noTarget || o.woundOut ||
          Math.abs(o.pos.y - p.u.pos.y) >= 3) continue;
      const atk = o.atk?.target === p.u && !o.atk.ranged && !o.atk.bow;
      const swing = o.swing?.target === p.u && !o.swing.done;
      if (!atk && !swing && !(o.charging && o.target === p.u)) continue;
      const d = Math.hypot(o.pos.x - p.u.pos.x, o.pos.z - p.u.pos.z);
      if (d > 8 || rt.army.wallBetween(o.pos, -1, p.u.pos,
          (o.wpnKind || o.lookWeapon) === 'spear' && d <= o.reach + .3)) continue;
      const soon = o.charging ? 0 : swing ? Math.max(0, o.swing.dur * o.swing.at - o.swing.t) : o.atk.t;
      if (soon < soonest) { foe = o; soonest = soon; }
      if (soon <= .65 && d <= (o.reach || 2.8) + .6) {
        const angle = Math.atan2(o.pos.x - p.u.pos.x, o.pos.z - p.u.pos.z);
        if (firstAngle === null) firstAngle = angle;
        else if (Math.cos(angle - firstAngle) < .5) crossed = true;
      }
    }
    // 城兵が近い間こそ退く。敵が離れるまで応戦を優先すると、印があっても退けない。
    if (!foe && p.treatmentReady) inp.k.add('KeyE');
    // 着いた後は足を止め、最後の被弾から六秒たつのを待つ。歩き続けると布を巻けない。
    else if (!foe && Math.hypot(p.u.pos.x - q.x, p.u.pos.z - q.z) < 1.5) return;
    else {
      // 調べた退路を歩き、列の肩が塞ぐ時だけ通れる一歩へよける。
      // 横へよけても印から大きく離れず、壁・切岸・城兵へ向かう足は選ばない。
      p.yaw = Math.atan2(q.x - p.u.pos.x, q.z - p.u.pos.z);
      if (Math.hypot(p.u.pos.x - q.x, p.u.pos.z - q.z) >= 1.5) inp.k.add('KeyW');
      retreatThroughGap(rt, inp, retreatGapAllowed);
      if (!foe) {
        if (p.sta < p.maxSta * .35) rt.takatoCatchBreath = true;
        else if (p.sta >= p.maxSta * .6) rt.takatoCatchBreath = false;
        inp.runHeld = inp.k.has('KeyW') && !rt.takatoCatchBreath;
      }
      if (foe) {
        const walk = p.yaw, moving = inp.k.has('KeyW');
        const uncovered = p.guardBroken > 0 ||
          Math.cos(Math.atan2(foe.pos.x - p.u.pos.x, foe.pos.z - p.u.pos.z) - p.u.heading) <= .25;
        p.yaw = Math.atan2(foe.pos.x - p.u.pos.x, foe.pos.z - p.u.pos.z);
        const gap = Math.hypot(foe.pos.x - p.u.pos.x, foe.pos.z - p.u.pos.z);
        // 追手が振っていない間は向きだけ保ち、構えを解いて列へ戻る歩みと気力を保つ。
        // 背後の振りには、体が向き直る分だけ早く構える。
        const guardLead = Math.cos(p.yaw - p.u.heading) < .5 ? 1.3 : .9;
        inp.guardHold = soonest <= guardLead;
        // 退き先への歩く向きを保ち、背を向けず横歩き・後ずさりで列へ戻る。
        if (inp.k.has('KeyW')) {
          inp.k.delete('KeyW');
          // 八方向へ丸めず、安全を調べた退路の線を保つ。城兵の側へ斜めに戻らない。
          const axis = rt.takatoGuardAxis || (rt.takatoGuardAxis = { x: 0, y: 0 });
          axis.x = Math.sin(p.yaw - walk); axis.y = -Math.cos(walk - p.yaw);
          inp.axis = axis;
        }
        // 構えで受けきれない刃は、印へ退く向きに回避する。気力を使い切らず、
        // 土橋の外・空堀・城兵の列を横切る先へは跳ばない。
        // 深手では正面の刃にも回避を使い、構えを抜かれる一撃を待たない。
        if ((crossed || uncovered || p.u.hp <= p.u.maxHp * .35) && soonest <= .35 && gap <= (foe.reach || 2.8) + .6 &&
            !p.mounted && !p.u.climb && !(p.knockT > 0) && p.dodgeT <= -.3 &&
            p.sta >= 20 + (p.u.hp <= p.u.maxHp * .35 || p.guardBroken > 0 ? 0 : p.maxSta * .4)) {
          retreatDodge(rt, inp, moving ? walk : p.yaw + Math.PI, retreatDodgeAllowed);
        }
      }
    }
    return;
  }
  if (!recoverRoad(rt)) return baseBot(rt, inp, helpers);
  const p = rt.player, u = p.u;
  rt.botFollowingTaba = true;
  inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.k.delete('KeyE');
  inp.leftPressed = false; inp.chargeHold = false; inp.runHeld = false;
  const q = rt.flags.roadGuide;
  helpers.goTo(p, inp, q.x, q.z, 1);
  const walk = p.yaw;
  const foe = rt.army.nearestEnemy(u, 8, (o) => !o.isStruct && !o.fleeing && !o.woundOut && !o.noTarget &&
    Math.abs(o.pos.y - u.pos.y) < 3 && !rt.army.wallBetween(o.pos, -1, u.pos,
      (o.wpnKind || o.lookWeapon) === 'spear' &&
        Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) <= o.reach + .3) &&
    ((o.atk && !o.atk.ranged && !o.atk.bow && o.atk.target === u) ||
      (o.swing && !o.swing.done && o.swing.target === u) || (o.charging && o.target === u) ||
      (o.target === u && (o.sidearm || (o.type !== 'gun' && o.type !== 'bow')) &&
        Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) <= (o.reach || 2) + .3)));
  inp.guardHold = !!foe;
  if (p.lock) inp.e.add('KeyQ');
  if (!foe) return;
  p.yaw = Math.atan2(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z);
  const gap = Math.hypot(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z);
  if (gap <= (p.weapon === 'sword' ? 1.6 : 2.5) && !needsBreath(rt)) {
    // 道へ戻る間も、自分を狙う近い城兵には隙を見て打ち返す。遠くへは追わない。
    let opening = true;
    // 攻撃の支度中の名簿だけでは、すぐ横で次の一撃を待つ城兵を見落とす。
    // 味方・壁の向こう・戦えない兵は除き、二人目がいる間は退く足を保つ。
    for (const other of rt.army.units) {
      if (other === foe || other.team === u.team || !other.alive || other.isStruct ||
          other.fleeing || other.woundOut || other.noTarget || other.group?.hidden ||
          ((other.type === 'gun' || other.type === 'bow') && !other.sidearm) ||
          Math.abs(other.pos.y - u.pos.y) >= 3) continue;
      const d = Math.hypot(other.pos.x - u.pos.x, other.pos.z - u.pos.z);
      if (d < 8 && !rt.army.wallBetween(other.pos, -1, u.pos,
          (other.wpnKind || other.lookWeapon) === 'spear' && d <= other.reach + 0.3)) {
        opening = false; break;
      }
    }
    helpers.patientStrike(p, inp, foe, gap, opening);
    if (inp.leftPressed || p.botStrikeUntil > p.time) {
      inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
      return;
    }
  }
  if (!inp.k.has('KeyW')) return;
  inp.k.delete('KeyW');
  const axis = rt.takatoGuardAxis || (rt.takatoGuardAxis = { x: 0, y: 0 });
  axis.x = Math.sin(p.yaw - walk); axis.y = -Math.cos(walk - p.yaw);
  inp.axis = axis;
};

// 段を重ねた三角形の杉は、既存の枝張りと細い梢の形で補う。
// 門の下からも、葺き板の隙間を空や細い破片に見せない。
takato.world.gateRoofBacking = true;
// 携帯でも切岸と土橋の描く格子を歩く足場にそろえる。
takato.world.keepTerrainGrid = true;
// 隊旗の布と竿を一緒に透かし、近い白い布で城兵を隠さない。
takato.fadeCloseStandards = true;
takato.fadeCloseStandardFrame = true;
// 狭い寄せ道の長旗は布だけ縮め、顔の高さまで白い幕を垂らさない。
// 竿・旗持ち・隊の動きは既存のまま、ほかの戦へは広げない。
takato.standardClothScale = .72;
// 近い据え竹束も細竹の束にする。遠くは既存の軽い形へ戻す。
// 束幅・切れ目・矢玉を防ぐ範囲は変えず、共用の形と材質を使う。
takato.world.denseTabaBundles = true;
takato.world.layeredNeedles = true;
takato.world.softFarNeedles = true;
takato.world.raggedNeedles = true;
// 杉の段の底を開き、枝先を垂らす。既存の共有形を使い、平らな円盤を残さない。
takato.world.brokenNeedleTiers = true;
// 松・雑木も透ける枝房へ替える。幹と矢玉の当たり、本数は保つ。
takato.world.branchFoliage = true;
takato.world.foldedNeedleCards = true;
// 縦に立った細い葉房を、幹から外へ垂れる枝先にする。形と材質は全株で共有する。
takato.world.slopingNeedleBoughs = true;
// 横から薄い棚になる杉の房を起こす。既存の少ない葉房を全株で共有する。
takato.world.cedarBoughs = true;
takato.world.cedarBoughPitch = .65;
takato.world.cedarBoughWidth = 1.2;
// 葉だけ枝張りを戻す。幹の寸法・位置と矢玉の当たりは変えない。
takato.world.treeScale = { ...takato.world.treeScale, crown: .78 };
// 高画質だけ杉の全樹冠を縦長の交差板へ戻していた。既存の枝房を残す。
// 低・中画質と遠景の簡略化、幹と矢玉の当たりは保つ。
takato.world.nearCedarBranches = true;
// 切岸の岩は丸い割れ面を残し、根元を描画面へ据える。
takato.world.groundedSlopeRocks = true;
takato.world.rockDrawGround = true;
takato.world.curvedRockTufts = true;
// 亡骸の胴と手足を坂へ沿わせ、落ちた布も地面へ畳む。
takato.world.slopeContactFalls = true;
takato.world.settleFallenLimbs = true;
takato.world.slopeLitter = true;
takato.world.crumpledFlags = true;
// 近接戦では実物の刃を見せ、白い帯の面を重ねない。
takato.hideWeaponTrail = true;
// 松も枝先ごとの輪郭を崩し、水平な多角形の棚に見える房を減らす。
// 共通の形を作る時の指定だけで、木や描画の数は増やさない。
takato.world.unevenCrowns = true;
// 狭い寄せ道では、長く広がる硝煙と幹の壁で次の口を隠さない。
takato.world.gunHazeScale = .6;
takato.world.smokeFogFloor = 140;
takato.world.groundMistScale = .25;
takato.world.nearTreeFadeRadius = 5.5;
// 門の喰違いと土橋は徒歩で攻める。武将の自動の乗馬も準備時から止める。
takato.world.noHorse = true;
takato.noHorse = true;
// 顔と笠を別々に透かさない。視点が体へ入る一人だけ描く間避ける。
// 既存の徒歩用処理を使い、隣の兵の具足と顔は濃く残す。
takato.nearAllySolidBody = true;
takato.nearAllyFadeRadius = 1.1;
takato.world.nearAllyFadeRadius = 1.1;
// 長柄足軽の指物は三人に一本。名のある将・旗持ち・自分の組の旗は保つ。
takato.world.ordinaryFlagStride = 3;

// 寄せる列の歩調と槍の息遣いを一人ずつずらす。敗走も脚を振り上げすぎない。
// 移動速度・槍衾の段・斬り合いの間合いと密度は保つ。
takato.world.variedMarch = true;
takato.world.strideLimit = 1.1;
takato.world.livingSpearHedge = true;
// 同時に討たれても膝の折れる間を変え、横斬りの肩と胴を斜面へ寝かせる。
takato.world.fallPaceSpread = .35;
takato.world.settleSideFalls = true;
takato.world.groundedFalls = true;
// 胴が地を打つ瞬間に一度だけ具足を鳴らし、既存の粒から低い土煙を添える。
// 板床・雨・水中は煙を出さず、近場でも全体で一秒に六十粒まで。
takato.world.contactFalls = true;
// 土画像を替えるだけでは残る升ごとの陰と凹凸を、既存の補正でならす。
// 坂の模様も連続させる。絵の読み出し・面・歩く地形は増やさない。
takato.world.softEarthCrust = true;
takato.world.subtleMudRelief = true;
takato.world.stableSlopeGrain = true;

takato.world.tint = (x, z, h, c) => {
  baseTint(x, z, h, c);
  const shade = .91 + .09 * Math.sin(x * .19 + z * .07) * Math.cos(z * .23)
    + .035 * Math.sin(x * .73 - z * .51);
  c.multiplyScalar(shade);
};

takato.setup = function (rt) {
  baseSetup.call(this, rt);
  // 裸地と切岸に同じ粒の土を使い、四角い土塊と足跡の反復を広場へ敷き詰めない。
  // 既存の共有画像だけを切り替え、残雪・踏み荒れ・血と地形の当たりは保つ。
  rt.world.groundU.tDirt.value = rt.world.groundU.tBank.value = dirtTex(true);
  // 遠景の粗い三角形が切岸を横切り、緑の四角い板として手前へ出るのを防ぐ。
  // 高遠だけ、戦場内を描く役は本来の地面へ渡す。面の数は増やさない。
  const land = rt.world.farLand, compileLand = land.material.onBeforeCompile;
  const edge = rt.world.half.toFixed(1);
  land.material.onBeforeCompile = function (shader) {
    compileLand.call(this, shader);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>',
      `if (max(abs(vLW.x), abs(vLW.y)) < ${edge}) discard;\n#include <color_fragment>`);
  };
  const farPos = land.geometry.attributes.position, farColor = land.geometry.attributes.color;
  const soil = new THREE.Color();
  for (let i = 0; i < farPos.count; i++) {
    this.world.tint(farPos.getX(i), farPos.getZ(i), farPos.getY(i), soil);
    farColor.setXYZ(i, soil.r, soil.g, soil.b);
  }
  farColor.needsUpdate = true;
  land.material.needsUpdate = true;
  const F = rt.flags;
  F.closeFoe = null;
  F.meleePressure = false;
  F.cameraHead = new THREE.Vector3();
  F.cameraCorner = new THREE.Vector3();
  takatoCameraWalls(rt);
  F.exitRoom = null;
  F.roomExitPoint = { x: 0, y: 0, z: 0 };
  F.roomExitLocal = { x: 0, z: 0 };
  rt.marker('roomExit', () => roomExit(rt), '戸口から味方の列へ', { h: 1.2 });
  F.retreatTo = null;
  F.retreatPoint = { x: 0, y: 0, z: 0 };
  F.retreatStep = { x: 0, y: 0, z: 0 };
  F.retreatProbe = { team: rt.player.u.team, pos: { x: 0, y: 0, z: 0 } };
  rt.marker('fallBack', () => rt.player.u.alive && !F.ending && !rt.over && !F.honFell
    ? F.retreatTo : null, () => !F.retreatGuarded ? '退く印' : needsBandage(rt)
      ? F.retreatSheltered ? '味方の後ろ' : '退く印'
      : F.retreatOnRoad ? '寄せ道の休み場' : '休む印', { h: 1.2 });
  rt.marker('closeFight', () => F.closeFoe?.alive && !F.retreatTo && !F.ending && !rt.over && !F.honFell
    ? F.closeFoe.pos : null, '近い城兵を受ける', { red: true, h: 1.8 });
  const roadMark = rt.markers.find((m) => m.id === 'oteRoad'), roadPos = roadMark.pos;
  roadMark.pos = () => F.retreatTo || F.closeFoe?.alive ? null : roadPos();
  // 各備え十四人の新しい配置を保つ。苦戦は竹束・援護・案内で補い、兵を間引かない。

  // 竹束を左右へ分け、兵が一人通れる切れ目を残す。寄せの速さと束の数は保つ。
  // 運ぶ間も共通の front がこの横の間隔を使い、据えた後に壁へ戻らない。
  for (const item of F.TA.items) {
    const split = Math.ceil(item.tabas.length / 2);
    for (let i = 0; i < item.tabas.length; i++) {
      const tb = item.tabas[i], old = tb.off;
      tb.off = i < split ? (i - split + 1) * 1.9 - 1.8 : (i - split) * 1.9 + 1.8;
      tb.x += Math.cos(tb.rot) * (tb.off - old);
      tb.z -= Math.sin(tb.rot) * (tb.off - old);
      placeTaba(rt, tb);
    }
  }

  // 霞で三層とも砂色にならないよう、近い尾根ほど濃い青灰色を残す。
  for (const m of rt.world.mountMats) {
    const layer = m.uniforms.layer.value;
    m.color.setHex([0x394d48, 0x566762, 0x75817f][layer]);
    m.fragmentShader = m.fragmentShader.replace('mix(c, hc, hz)',
      'mix(c, hc, min(hz, mix(0.52 + layer * 0.15, 0.88, night)))');
    m.needsUpdate = true;
  }

  // 樹冠の滑らかな円錐・饅頭の輪郭を崩す。形は木の種類ごとに共有したまま。
  for (const mesh of rt.world.treeMeshes || []) {
    if (!mesh.userData.treeFoliage) continue;
    const p = mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const edge = Math.sin(x * 9 + y * 7 + z * 5) * Math.cos(z * 11 - y * 6);
      p.setXYZ(i, x * (1 + edge * .12), y + edge * .14, z * (1 + edge * .12));
    }
    p.needsUpdate = true;
    mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingSphere();
    mesh.material.color.setHex(0x7b9169);
    mesh.material.emissive.setHex(0x172313);
    mesh.material.emissiveIntensity = .22;
  }

  // 手持ち幟・指物も、紋ごとの材質と一つの布形を共有する。
  const clothShapes = new Map(), clothMats = new Map(), ringParts = [];
  for (const y of [.28, 0, -.28]) {
    const g = new THREE.TorusGeometry(.025, .008, 4, 8);
    g.rotateX(Math.PI / 2); g.translate(-.19, y, 0); ringParts.push(g);
  }
  const rings = mergeGeometries(ringParts);
  for (const g of ringParts) g.dispose();
  const ringColors = new Float32Array(rings.attributes.position.count * 3);
  ringColors.fill(1);
  rings.setAttribute('color', new THREE.BufferAttribute(ringColors, 3));
  for (let i = 0; i < rings.attributes.uv.count; i++) rings.attributes.uv.setXY(i, .02, .5);
  const dressFlag = (flag) => {
    if (!flag || flag.userData.takatoCloth) return;
    flag.userData.takatoCloth = true;
    const original = flag.geometry;
    if (!clothShapes.has(original)) {
      const g = original.clone(), p = g.attributes.position;
      const colors = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), free = Math.max(0, Math.min(1, (x + .18) / .36));
        const fold = x * 27 + y * 5;
        p.setZ(i, p.getZ(i) + Math.sin(fold) * .045 * free);
        p.setY(i, y - .025 * free * free);
        const shade = .84 + .16 * Math.cos(fold);
        colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = shade;
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      g.computeVertexNormals();
      // 乳の輪も布と同じ一描画へ。兵ごとに小道具の描画を増やさない。
      clothShapes.set(original, mergeGeometries([g, rings])); g.dispose();
    }
    const base = flag.material;
    if (!clothMats.has(base)) {
      const mat = base.clone(); mat.vertexColors = true;
      mat.onBeforeCompile = base.onBeforeCompile;
      mat.customProgramCacheKey = () => base.customProgramCacheKey() + '高遠の皺';
      clothMats.set(base, mat);
    }
    flag.geometry = clothShapes.get(original); flag.material = clothMats.get(base);
  };
  const dressUnit = (u) => { dressFlag(u.flag); dressFlag(u.standardFlag); };
  for (const u of rt.army.units) dressUnit(u);
  const addUnit = rt.army.addUnit;
  rt.army.addUnit = function (...args) {
    const u = addUnit.apply(this, args); dressUnit(u); return u;
  };

  // 深手の視点は、障害物を避けて最後の一撃を見る共通処理へ任せる。

  // 開門の目印は小さな垂れ布にする。門の屋根を隠す大きな板旗にしない。
  const poleGeo = new THREE.CylinderGeometry(.035, .045, 3.5, 5);
  const flagGeo = new THREE.PlaneGeometry(.38, .8, 4, 6);
  const flagP = flagGeo.attributes.position;
  for (let i = 0; i < flagP.count; i++) {
    const x = flagP.getX(i), y = flagP.getY(i), free = (.4 - y) / .8;
    flagP.setXYZ(i, x + .23, y + 2.95, Math.sin(y * 13 + x * 9) * .055 * free);
  }
  flagGeo.computeVertexNormals();
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x4b4034 });
  const flagMat = new THREE.MeshLambertMaterial({ color: 0xeee1ba, side: THREE.DoubleSide });
  F.openFlags = [];
  for (const gate of Object.values(F.gates)) {
    const s = gate.struct, x = s.seg[0] + s.nx * .7, z = s.seg[1] + s.nz * .7;
    const flag = new THREE.Group(), pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 1.75;
    flag.add(pole, new THREE.Mesh(flagGeo, flagMat));
    flag.position.set(x, rt.world.heightAt(x, z), z);
    flag.rotation.y = Math.atan2(s.nx, s.nz); flag.visible = false;
    rt.scene.add(flag); F.openFlags.push({ gate, flag });
    const open = gate._openNow;
    gate._openNow = function (byForce) {
      const wasOpen = this.opened, bark = rt.bark;
      // 共通の開門通知を、この戦の任務に結び付けた一文へ置き換える。
      rt.bark = () => {};
      try { open.call(this, byForce); } finally { rt.bark = bark; }
      flag.visible = this.opened;
      if (wasOpen || rt.over || F.ending) return;
      takato.guideAssault(rt);
      const task = F.guideText || '大手の先手に続け';
      const action = byForce ? 'を破った' : 'が開いた';
      const who = this === F.gates.karamete || this === F.gates.hodoin ? '大手の先手は、' : '';
      rt.bark(`${this.name}${action}。${who}${task}`);
    };
  }

  // 薄い赤枠は高遠の間だけ。戦を離れる際に必ず元へ戻す。
  const style = document.createElement('style');
  style.textContent = `
#vignette.hurt { background: radial-gradient(ellipse at center, transparent 65%, rgba(130,12,4,.14) 100%); }
#vignette.dying, body.rm #vignette.dying { animation: none; box-shadow: inset 0 0 95px rgba(130,12,4,.24); backdrop-filter: none; -webkit-backdrop-filter: none; }
#vignette.side { opacity: .45; }
/* 照準の上は任務と台詞が使う。攻撃の距離は照準の下で読む。 */
#hud.spaced-combat-cues #crosshair .range-cue { top:36px; bottom:auto; }
/* 敵味方を一軍ずつ読む。広い画面でも「武」と「田軍」を分けない。 */
#hud #intro .card .sides { display:grid; grid-template-columns:1fr; gap:4px; letter-spacing:0; }
#hud #intro .card .sides em { display:none; }
/* 長い傷の文で格子を押し広げず、命の帯と残量を下地に収める。 */
html body #hud .bl #h-hp.hp {
  grid-template-columns:minmax(0,1fr) max-content !important;
  width:min(280px,calc(100vw - 40px)); min-width:0 !important;
}
html body #hud .bl #h-hp.hp > :is(i,em) {
  min-width:0; max-width:100%; box-sizing:border-box;
}
html body #hud .bl #h-hp.hp em {
  white-space:normal !important; word-break:normal !important; overflow-wrap:anywhere !important;
  font-size:max(16px,calc(16px * var(--text-scale,1))) !important; line-height:1.5;
}
html body #hud .bl #h-hp.hp em svg { width:18px; height:22px; }
/* 今の印を隠した時も、補足の二列目で本文の幅を奪わない。
   退く下知・補足・距離を一段ずつ、札いっぱいの幅で読む。 */
html body #hud #battle-notices #objectives:not(.expand) li.cur {
  display:block !important; width:100%; min-width:0; box-sizing:border-box;
}
html body #hud #battle-notices #objectives:not(.expand) li.cur :is(.obj-text,.obj-now,small) {
  display:block; width:auto !important; min-width:0 !important; max-width:100% !important;
  white-space:normal !important; overflow-wrap:anywhere; word-break:normal;
}
/* 任務を地面へ移す共通の指定より、この戦の一列の知らせを優先する。
   固定位置の札と欄内の警告が別々の高さを使い、重なるのを防ぐ。 */
html:root body #hud #battle-notices:not(.choosing) #objectives#objectives.ground-order:not(.expand) {
  position:relative !important; inset:auto !important; transform:none !important;
  width:100% !important; max-width:100% !important; min-width:0 !important;
}
html:root body #hud #battle-notices #tutorial.coach {
  width:100% !important; max-width:100% !important; min-width:0 !important;
  height:auto !important; max-height:none !important; overflow:visible !important;
}
html:root body #hud #battle-notices #tutorial :is(.what,.how,.lbl) {
  width:auto !important; min-width:0 !important; max-width:100% !important;
  white-space:normal !important; overflow-wrap:anywhere; word-break:normal;
}
@media (min-height:501px) {
  /* 高遠の警告と任務は左の一列へ。右上の地図と長い下知を重ねない。 */
  html:not(.touch) body #hud #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
    left:16px !important; right:auto !important; top:104px !important;
    width:min(320px, 30vw) !important; max-height:calc(100% - 304px) !important;
    gap:8px; overflow-y:auto;
  }
  html:not(.touch) body #hud #battle-notices:not(.choosing) > :is(#battle-message,#tutorial,#banner,#situation,#skiphint),
  html:not(.touch) body #hud #battle-notices:not(.choosing) #objectives:not(.expand):not(:has(.guard-action-button)) {
    position:relative !important; inset:auto !important; transform:none !important;
    box-sizing:border-box; width:100% !important; max-width:100% !important;
    height:auto !important; max-height:none !important; min-width:0; flex:0 0 auto;
  }
  html:not(.touch) body #hud #battle-notices #objectives:not(.expand) :is(li.cur,.obj-text,.obj-now,.battle-action,small),
  html:not(.touch) body #hud #battle-notices #battle-message > :is(#subtitle,.battle-notice) {
    white-space:normal !important; overflow-wrap:anywhere; word-break:normal;
    height:auto !important; max-height:none !important; overflow:visible !important;
    line-height:1.5 !important;
  }
  html:not(.touch) body #hud #battle-notices #objectives:not(.expand) li.cur .obj-now {
    font-size:max(20px, calc(20px * var(--text-scale, 1))) !important;
  }
  /* 地上の印や敵へ向く案内も、この戦では同じ欄に積む。
     共通の固定座標と幅の指定を残すと、細い黒札が台詞へ重なる。 */
  html:root:not(.touch) body #hud #battle-notices:not(.choosing) #objectives#objectives:not(.expand):not(.order-settled) {
    position:relative !important; inset:auto !important; transform:none !important;
    box-sizing:border-box; width:100% !important; max-width:100% !important;
    min-width:0 !important; height:auto !important; max-height:none !important; flex:0 0 auto;
  }
  /* 台詞の幅を内容任せにせず、本文が一文字の幅へ縮むのを防ぐ。 */
  html:root:not(.touch) body #hud #battle-notices:not(.choosing) > #battle-message {
    width:100% !important; min-width:0 !important; flex:0 0 auto;
  }
}
@media (max-height:500px) {
  /* 長い下知にも小地図一つ分の間を空け、全文を折り返す。 */
  html body #hud #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
    left:auto !important; right:calc(88px + env(safe-area-inset-right, 0px)) !important;
    width:min(320px, 42vw) !important;
  }
  html body #hud #battle-notices #objectives:not(.expand) :is(li.cur,.obj-text,.obj-now) {
    min-width:0; white-space:normal !important; overflow-wrap:anywhere;
    height:auto !important; max-height:none !important; line-height:1.4 !important;
  }
  /* 任務と危険の二枚を収め、行き先の下段を切らない。中央の戦場は空ける。 */
  html.touch #hud #battle-notices:not(.choosing):not(:has(#objectives.expand)),
  html.touch.tc-low #hud #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
    /* 後から入る共通の三割の高さ制限より優先する。下端の安全域も引く。 */
    max-height:min(48vh, calc(100% - var(--notice-top, 60px) - env(safe-area-inset-top, 0px) - max(104px, var(--notice-floor, 104px)))) !important;
    overflow-y:auto;
  }
  /* 携帯用の共通の省略より優先し、退き方と門の操作を全文で読む。 */
  html.touch body #hud #battle-notices:not(.choosing) #objectives:not(.expand) li.cur small { display:block !important; white-space:normal; line-height:1.5; }
  html.touch body #hud #battle-notices #objectives:not(.expand) li.cur small {
    font-size:max(16px,calc(16px * var(--text-scale,1))) !important;
  }
  /* 大きな字の設定でも距離と補足は札の高さに収め、長い時は任務の中を送る。 */
  html.touch body #hud #battle-notices:not(.choosing) #objectives:not(.expand) {
    max-height:min(46vh, calc(100dvh - var(--notice-top, 60px) - env(safe-area-inset-top, 0px) - max(104px, var(--notice-floor, 104px)) - 8px)) !important;
    overflow-y:auto !important;
  }
  html.touch body #hud #battle-notices:not(.choosing) #objectives:not(.expand) li.cur small.goal-place {
    font-size:max(16px, calc(16px * var(--text-scale, 1))) !important;
    line-height:1.4 !important;
  }
  /* 共通の歩数付き退避札の改行禁止より優先し、右端と下端の切れを防ぐ。
     配置側が測る幅と、文が実際に使う幅をそろえる。 */
  html:root body #hud #battle-notices:not(.choosing) #objectives#objectives.travel-retreat.ground-order:not(.expand) {
    width:min(272px, 40vw) !important; max-width:calc(100vw - 24px) !important;
    box-sizing:border-box; max-height:calc(100dvh - 24px) !important;
    overflow-y:auto !important;
  }
  html:root body #hud #battle-notices:not(.choosing) #objectives#objectives.travel-retreat.ground-order:not(.expand) #obj-list li.cur :is(.obj-now,.obj-text,.task-phrase) {
    white-space:normal !important; word-break:normal !important; overflow-wrap:anywhere !important;
    min-width:0 !important; max-width:100% !important;
    font-size:max(18px,calc(18px * var(--text-scale,1))) !important; line-height:1.4 !important;
  }
  /* 高遠だけ説明の横幅を確保し、読む所をスクロール、出陣は縮めず残す。 */
  html.touch body #hud #intro > .card.card { width:min(560px, calc(100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))); max-height:calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important; }
  html.touch #hud #intro .intro-reading { flex:1 1 auto; }
  html.touch #hud #intro-go { flex:0 0 auto; }
}

`;
  document.head.appendChild(style);
  const dispose = rt.dispose;
  rt.dispose = function (...args) {
    style.remove();
    rt.army.addUnit = addUnit;
    for (const g of clothShapes.values()) g.dispose();
    for (const m of clothMats.values()) m.dispose();
    rings.dispose();
    rt.hud.updateThreats = threats;
    poleGeo.dispose(); flagGeo.dispose(); poleMat.dispose(); flagMat.dispose();
    return dispose.apply(this, args);
  };

  // 共通の射線判定と三枠を使い、鉄砲の向きを矢印で示す。
  const threats = rt.hud.updateThreats;
  rt.hud.updateThreats = function (battle) {
    const before = this.threatAt;
    threats.call(this, battle);
    if (before === this.threatAt) return;
    for (const el of this.threatEls) {
      if (el.hidden || !el.textContent.includes('鉄砲')) continue;
      const text = el.textContent;
      const arrow = text.includes('前') ? '↑' : text.includes('後ろ') ? '↓' : text.includes('左') ? '←' : '→';
      el.textContent = arrow + text.slice(1);
    }
  };
  rt.after(1, () => {
    if (rt.over || F.ending || !rt.player.u.alive) return;
    rt.hud.hint(isTouch
      ? '敵が寄ったら「構える」で受け、「突く」で打ち返そう。鉄砲は竹束の陰へ。'
      : '敵が寄ったら右クリックで受け、左クリックで打ち返そう。鉄砲は竹束の陰へ。', null, 9000);
  });
};

takato.guideAssault = function (rt) {
  const F = rt.flags;
  if ((F.step < 1 && !F.closeFoe) || F.ending) return;
  if (F.honFell) {
    const outside = !F.C.kuruwa.hon.test(rt.player.u.pos.x, rt.player.u.pos.z);
    const text = outside ? '道の印に沿い、本丸の門を通れ'
      : F.keep.down || F.lordDying ? '味方と本丸の旗を守れ' : '本丸の城兵を退け、主殿の守りを崩せ';
    if (F.guideText !== text) { F.guideText = text; rt.obj('main', text, 'main', true); }
    return;
  }
  const g = F.gates;
  let text;
  const guide = baseGuide(rt);
  // 退き先が消えても、布を巻く間に前進の下知へ戻さない。
  if (roomExit(rt)) text = '戸口の印から外へ出て、味方と合流しよう';
  else if (rt.player.treating || rt.player.treatmentReady) text = restingTreatmentLabel(rt);
  else if (F.retreatTo) text = Math.hypot(rt.player.u.pos.x - F.retreatTo.x, rt.player.u.pos.z - F.retreatTo.z) < 1.5
    ? this.retreatGuideLabel(rt, true)
    : retreatTravelLabel(rt);
  else if (F.closeFoe) text = needsBreath(rt) ? retreatTravelLabel(rt) : '味方と構え、城兵を受けよ';
  else if (offRoad(rt)) text = '寄せ道へ戻り、味方と進め';
  else if ((guide === '_gate' || guide === 'oteRoad') && F.roadGuide.gate)
    text = `${F.roadGuide.gate.name}を掛矢で打て`;
  else if (guide === 'oteRoad' && !F.roadGuide.gate) text = '道の印に沿い、味方と進め';
  else if (F.niFell) text = g.honInner.opened ? '本丸門を通り、城兵を退けよ'
    : `${g.honOuter.opened ? g.honInner.name : g.honOuter.name}を破れ`;
  else if (F.sanFell) text = g.gateNi.opened ? `${g.gateNi.name}を通り、城兵を退けよ`
    : `${g.gateNi.name}を破り、二の丸へ入れ`;
  else if (F.sallyOut || F.sallyUntil) text = '味方の列で構え、城兵を受けよ';
  else if (g.oteInner.opened) text = '三の丸へ入り、城兵を退けよ';
  else text = `${g.oteOuter.opened ? g.oteInner.name : g.oteOuter.name}を破れ`;
  if (F.guideText !== text || rt.objectives.find(o => o.id === 'main')?.text !== text) {
    F.guideText = text; rt.obj('main', text, 'main', true);
  }
};

takato.update = function (rt, dt) {
  const F = rt.flags;
  // 下知と同じ一秒間隔。目の前で戦う間は、四十メートル先の角へ戻せと言わない。
  if (F.stageCheck <= dt) {
    const p = rt.player.u;
    let closest = F.closeFoe?.alive ? 7 : 5;
    F.closeFoe = null;
    let attackers = 0, nearby = 0;
    if (!rt.G.lord && p.alive && !rt.over && !F.ending && !F.honFell) for (const o of rt.army.units) {
      if (!o.alive || o.team === p.team || o.isStruct || o.noTarget || o.fleeing || o.woundOut ||
          o.downed || o.rearWound || o.civ || o.farSim || o.type === 'dummy' || o.type === 'porter' ||
          o.group?.hidden || o.group?.routed || Math.abs(o.pos.y - p.pos.y) >= 3 ||
          ((o.type === 'gun' || o.type === 'bow') && !o.sidearm)) continue;
      const d = Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z);
      if (d > 8 || rt.army.wallBetween(o.pos, -1, p.pos,
          (o.wpnKind || o.lookWeapon) === 'spear' && d <= o.reach + .3)) continue;
      // 一人を受けている間に、横の城兵も刃の届く所へ入ったら列へ退く。
      // 二人目が狙いを替えてからでは、構え直す前に挟まれてしまう。
      // 味方だけと戦う一団を通る時は、これだけで退避させない。
      if (!o.downed && !o.rearWound && !(o.stagger > 0) && d <= (o.reach || 2.8) + 1) {
        nearby++;
        if (o.target === p || o.atk?.target === p ||
            (o.swing?.target === p && !o.swing.done)) attackers++;
      }
      if (d < closest) {
        closest = d; F.closeFoe = o;
      }
    }
    F.meleePressure = attackers > 0 && nearby >= 2;
  }
  baseUpdate.call(this, rt, dt);
  for (const item of F.openFlags) item.flag.visible = item.gate.opened;
  // 息切れも援護の合図にする。無傷でも構えが続かない時は近い味方が受け持つ。
  // 一秒ごとの既存の探索を使い、壁越しや離れた味方には割り込ませない。
  const spent = needsRest(rt) || F.meleePressure;
  if (F.refresh && rt.player.u.alive && (!rt.over || rt.withdrawal))
    allyCover(rt, rt.player.u, spent ? coverTired : coverNear);
  if (!F.refresh || F.ending || rt.over || !rt.player.u.alive) return;
  // 息切れの時は敵の足元でなく、敵から離れた味方の後ろへ印を置く。
  // 一秒に一度だけ探し、座標は使い回す。壁と崖の向こうは退き先にしない。
  const player = rt.player, pos = player.u.pos;
  // 布が尽きても、安全な退き先の選び方と到着後の待ちを保つ。
  const treating = needsShelter(rt);
  // 敵から七歩離れただけで印を消さない。安全な印へ着き、気力が戻るまで保つ。
  // 傷そのものの全快は待たず、布が使えない時も戦の進行へ戻れるようにする。
  if (F.retreatTo) {
    const q = F.retreatTo, probe = F.retreatProbe;
    probe.pos.x = q.x; probe.pos.y = q.y; probe.pos.z = q.z;
    const distance = Math.hypot(pos.x - q.x, pos.z - q.z);
    // 構えた退き足では十二秒で届かないことがある。半歩進める間は退避を保つ。
    // 同じ所で詰まった時の打ち切りは残し、安全な到着先だけで手当てを待つ。
    if (distance < F.retreatBest - .5) {
      F.retreatBest = distance; F.retreatUntil = rt.t + 12;
    }
    // 安全な後方へ着いたら、布の待ち時間や三秒の長押し中に印を消さない。
    // 護衛と間合いが崩れた時の再探索は、この下の判定へ渡す。
    if (distance < 1.5 && treating && bandageSpace(rt, pos, 8))
      F.retreatUntil = Math.max(F.retreatUntil, rt.t + 12, player.treatmentNext + 6);
    if (F.honFell || rt.t >= F.retreatUntil || !rt.world.walkable(q.x, q.z, pos.y) || rt.army.wallBetween(pos, -1, q) ||
        !retreatClear(rt, pos, q) ||
        // 護衛のいない緊急の一歩は、城兵を離したら役目を終える。
        // 野原の印を追い続けず、今の味方の後ろを探し直す。
        (!F.retreatGuarded && !F.closeFoe?.alive) ||
        // 緊急の一歩へ着いても、追手の刃が届くなら次の退き先を探す。
        // 印の手前で二十四秒待ち続け、構えを崩されるのを防ぐ。
        (distance < 1.5 && F.closeFoe?.alive && needsBreath(rt) &&
          Math.hypot(pos.x - F.closeFoe.pos.x, pos.z - F.closeFoe.pos.z) <= (F.closeFoe.reach || 2.8) + 1) ||
        // 選んだ後に護衛が進む・城兵が寄ることもある。着く前でも安全を失った印は選び直す。
        // 緊急の退き先は残し、安全な場所がない乱戦で退く足を止めない。
        (treating && F.retreatSheltered && !bandageSpace(rt, distance < 1.5 ? pos : q, distance < 1.5 ? 8 : 10)) ||
        // 布を巻ける前の退避も、護衛が去った野原に印を残さない。
        (F.retreatGuarded && !retreatGuard(rt, q)) ||
        // 着いた後に護衛が去った所で、出血したまま手当てを待ち続けない。
        (distance < 1.5 && treating && !player.treatmentShelter(pos)) ||
        (distance < 1.5 && player.sta >= player.maxSta * .65 &&
          !(player.guardBroken > 0) && !F.meleePressure && !treating)) F.retreatTo = null;
  }
  if (!F.retreatTo && !F.honFell && needsBreath(rt) && (F.closeFoe?.alive || treating || needsRest(rt))) {
    const p = rt.player.u.pos, foe = F.closeFoe?.alive ? F.closeFoe.pos : null;
    const point = F.retreatPoint, probe = F.retreatProbe;
    const danger = foe ? Math.hypot(p.x - foe.x, p.z - foe.z) : 0;
    let best = Infinity, support = null, supportDistance = Infinity;
    F.retreatOnRoad = false;
    // 城兵が離れた直後も、息切れしたまま門へ進み直さない。
    // すでに護衛の後ろなら足を止める。敵との間合いと足場は既存の判定で調べる。
    if (!F.closeFoe && (treating || needsRest(rt)) && clearFoot(rt, p) &&
        (treating || retreatGuard(rt, p)) && bandageSpace(rt, p, 8)) {
      point.x = p.x; point.y = p.y; point.z = p.z;
      F.retreatTo = point;
      best = 0;
    }
    for (const ally of rt.army.units) {
      if (best === 0) break;
      if (!ally.alive || ally.isPlayer || ally.team !== rt.player.u.team || ally.isStruct ||
          ally.fleeing || ally.woundOut || ally.rearWound || ally.downed || ally.noTarget ||
          ally.group?.hidden || ally.group?.routed || ally.type === 'porter' ||
          ally.civ || ally.farSim || ally.stagger > 0 || ally.hp < ally.maxHp * .35 ||
          ally.type === 'dummy' || (!treating && (ally.type === 'gun' || ally.type === 'bow')) ||
          Math.abs(ally.pos.y - p.y) >= 3) continue;
      const d = Math.hypot(ally.pos.x - p.x, ally.pos.z - p.z);
      // 一度で護衛まで届かなくても、緊急の退き足を味方の側へ寄せる。
      // 壁の向こうの兵は目当てにせず、同じ探索で近い一人だけを覚える。
      if (d < supportDistance && !rt.army.wallBetween(p, -1, ally.pos)) {
        support = ally; supportDistance = d;
      }
      const source = foe || p;
      const away = Math.hypot(ally.pos.x - source.x, ally.pos.z - source.z);
      if (d > (treating ? 18 : 12) || away < danger + 2) continue;
      for (const offset of retreatOffsets) {
        const x = ally.pos.x + (ally.pos.x - source.x) / away * offset;
        const z = ally.pos.z + (ally.pos.z - source.z) / away * offset;
        probe.pos.x = x; probe.pos.z = z; probe.pos.y = rt.world.heightAt(x, z);
        if (!rt.world.walkable(x, z, p.y) || rt.army.wallBetween(p, -1, probe.pos)) continue;
        const distance = Math.hypot(x - p.x, z - p.z);
        if (distance > (treating ? 24 : 18) || !retreatClear(rt, p, probe.pos)) continue;
        // 「味方の後ろ」と案内する先には、実際に戦える護衛を残す。
        if (!retreatGuard(rt, probe.pos)) continue;
        // 手当てできる陰を優先する。十歩あく所がなくても、まず刃の間合いから退いて息を戻す。
        // 乱戦で全候補を捨てると、息切れしたまま城兵の前に居残ってしまう。
        // 手当てできずに離れたばかりの足元を、同じ退き先として選び直さない。
        if (treating && distance < 3 && !player.treatmentShelter(p)) continue;
        // 護衛のいる候補から、布を巻ける間合いを距離より優先する。
        const score = distance + retreatExposure(rt, probe) * 6 + retreatCost(rt, probe);
        if (score >= best) continue;
        best = score;
        point.x = x; point.z = z; point.y = probe.pos.y;
        F.retreatTo = point;
      }
    }
    // 味方の後ろが見つかっても手当てできない時は、通って来た道とも比べる。
    // 息を戻すだけなら従来どおり近い退き先を使い、探索は一秒に一度に保つ。
    if (best !== 0 && (!F.retreatTo || treating && !bandageSpace(rt, point))) {
      let nearest = -1, roadDistance = 6;
      for (let i = 0; i < retreatRoad.length; i++) {
        const q = retreatRoad[i], d = Math.hypot(q.x - p.x, q.z - p.z);
        if (d < roadDistance) { roadDistance = d; nearest = i; }
      }
      for (let i = nearest; i >= 0; i--) {
        const q = retreatRoad[i], distance = Math.hypot(q.x - p.x, q.z - p.z);
        if (distance < 3 || distance > 18 ||
            (foe && Math.hypot(q.x - foe.x, q.z - foe.z) < danger + 2)) continue;
        probe.pos.x = q.x; probe.pos.z = q.z; probe.pos.y = rt.world.heightAt(q.x, q.z);
        if (!rt.world.walkable(q.x, q.z, p.y) || rt.army.wallBetween(p, -1, probe.pos) ||
            !retreatClear(rt, p, probe.pos)) continue;
        if (!retreatGuard(rt, probe.pos)) continue;
        const score = distance + retreatExposure(rt, probe) * 6 + retreatCost(rt, probe);
        if (score >= best) continue;
        best = score;
        point.x = q.x; point.z = q.z; point.y = probe.pos.y;
        F.retreatTo = point; F.retreatOnRoad = true;
      }
    }
    // 道でも手当てできなければ周囲も比べ、先に見つけた危険な場所で探索を打ち切らない。
    // 崖・壁・敵を横切る候補は既存の判定で除き、矢玉の少ない場所を優先する。
    if (best !== 0 && (!F.retreatTo || treating && !bandageSpace(rt, point))) for (const q of retreatField) {
      if (q.distance < 6) continue;
      const x = p.x + q.x, z = p.z + q.z;
      if (foe && Math.hypot(x - foe.x, z - foe.z) < danger + 2) continue;
      probe.pos.x = x; probe.pos.z = z; probe.pos.y = rt.world.heightAt(x, z);
      // 道を外れる退避は護衛の届く所だけ。孤立した時は寄せ道へ戻す案内を残す。
      if (!retreatGuard(rt, probe.pos)) continue;
      if (!rt.world.walkable(x, z, p.y) || !retreatClear(rt, p, probe.pos)) continue;
      const score = q.distance + retreatExposure(rt, probe) * 6 + retreatCost(rt, probe);
      if (score >= best) continue;
      best = score;
      point.x = x; point.z = z; point.y = probe.pos.y;
      F.retreatTo = point; F.retreatOnRoad = false;
    }
    // 護衛の後ろへ一度で戻れない乱戦でも、息切れしたまま前進を再開しない。
    // 六歩先が門柱や喰違いの塀でも、二歩・三歩半の退き足は残す。
    // 広く退ける候補を優先し、短い足は次の探索で護衛へつなぐ。
    // 手当てできる所とは呼ばず、壁・切岸・城兵を横切る線は従来どおり除く。
    if (!F.retreatTo && foe) for (const q of retreatField) {
      if (q.distance > 6) continue;
      const x = p.x + q.x, z = p.z + q.z;
      if (Math.hypot(x - foe.x, z - foe.z) < danger + 2) continue;
      probe.pos.x = x; probe.pos.z = z; probe.pos.y = rt.world.heightAt(x, z);
      if (!rt.world.walkable(x, z, p.y) || !retreatClear(rt, p, probe.pos)) continue;
      const score = (q.distance < 6 ? 100 : 0) + q.distance + retreatExposure(rt, probe) * 6 +
        (support ? Math.hypot(x - support.pos.x, z - support.pos.z) : 0);
      if (score >= best) continue;
      best = score;
      point.x = x; point.z = z; point.y = probe.pos.y;
      F.retreatTo = point;
    }
    // 味方が移動して手当ての条件が崩れても、同じ場所で待ち続けない。
    if (F.retreatTo) {
      F.retreatSheltered = bandageSpace(rt, point, Math.hypot(p.x - point.x, p.z - point.z) < 1.5 ? 8 : 10);
      F.retreatGuarded = retreatGuard(rt, point);
      F.retreatBest = Math.hypot(p.x - point.x, p.z - point.z);
      F.retreatUntil = rt.t + 24;
    }
  }
  // 手負いで二人に挟まれかけたら、そばの味方の槍が割って入り、寄せる城兵を押し返す（九秒に一度）。
  // 兵の数と一撃の重さは変えない。押し返した一息に、列の後ろへ退ける。
  const P = rt.player.u;
  // 気力が尽きて構えが崩れた時も同じ（崩れた構えで二人を受け続けると、一撃ごとに深手になる）。
  if ((P.hp < P.maxHp * 0.75 || spent) && rt.t >= (F.rallyAt || 0)) {
    let close = 0, mate = false;
    rt.army.forNear(P.pos.x, P.pos.z, 8, (o) => {
      if (!o.alive || o.isPlayer || o.fleeing || o.isStruct || o.noTarget || o.woundOut ||
          o.downed || o.rearWound || o.group?.hidden || o.group?.routed ||
          Math.abs(o.pos.y - P.pos.y) > 2.5 || rt.army.wallBetween(o.pos, -1, P.pos, false)) return;
      const d = Math.hypot(o.pos.x - P.pos.x, o.pos.z - P.pos.z);
      if (o.team !== P.team) { if (d < 5 && (o.sidearm || o.type !== 'gun' && o.type !== 'bow')) close++; }
      else if (o.type !== 'porter' && o.type !== 'gun' && o.type !== 'bow') mate = true;
    });
    if (mate && close >= 2) {
      F.rallyAt = rt.t + 9;
      rt.army.forNear(P.pos.x, P.pos.z, 5, (o) => {
        if (!o.alive || o.team === P.team || o.fleeing || o.isStruct || o.noTarget || o.woundOut ||
            Math.abs(o.pos.y - P.pos.y) > 2.5 || rt.army.wallBetween(o.pos, -1, P.pos, false)) return;
        const dx = o.pos.x - P.pos.x, dz = o.pos.z - P.pos.z, l = Math.hypot(dx, dz) || 1;
        if (l > 5) return;
        o.push.x += dx / l * 4; o.push.z += dz / l * 4;
        o.stagger = Math.max(o.stagger || 0, 1.2);
        o.atk = null; o.swing = null; o.target = null; o.cd = Math.max(o.cd || 0, 1.4); o.aiT = 0.8;
      });
      rt.bark('味方が受け持つ！　列の後ろへ下がれ', true);
    }
  }
  const guide = this.guideMarker(rt), gateTask = rt.objectives.find(o => o.id === '_gate');
  // 退き先を解除した同じ更新で、曲輪の案内にも現在の下知を戻す。
  this.guideAssault(rt);
  // 遠い門の掛矢の札で、城兵を受ける下知や喰違いの道案内を上書きしない。
  if (gateTask) {
    gateTask.kind = guide === '_gate' ? 'order' : 'side';
    // 操作キーの英字を札へ出さず、打ち場と長押しを伝える。
    if (rt._gg?.cur) gateTask.text = `${rt._gg.cur.name}を打て（${isTouch ? '「打つ」' : '打つ操作'}を長押し）`;
  }
  if (guide === 'roomExit') {
    this.guideAssault(rt);
    rt.objProgress('main', '壁へ進まず、戸口の印を通ろう');
  } else if (!F.honFell && !F.ending && !rt.over && (player.treating || player.treatmentReady)) {
    this.guideAssault(rt);
    // 道へ戻る補足も残さず、長押しの間は足を止める案内にそろえる。
    rt.objProgress('main', '足を止めたまま「手当て」を三秒長押し');
  } else if (guide === 'fallBack') {
    this.guideAssault(rt);
    rt.objProgress('main', player.treating || player.treatmentReady ? restingTreatmentLabel(rt)
      : Math.hypot(pos.x - F.retreatTo.x, pos.z - F.retreatTo.z) < 1.5
        ? this.retreatGuideLabel(rt, true)
        : retreatTravelLabel(rt));
  } else if (F.closeFoe?.alive) {
    this.guideAssault(rt);
    rt.objProgress('main', needsBreath(rt) ? retreatTravelLabel(rt)
      : isTouch ? '「構える」で受け、「突く」で返せ' : '右クリックで受け、左クリックで返せ');
  } else if (guide === '_gate') {
    this.guideAssault(rt);
    rt.objProgress('main', isTouch ? '「打つ」を長押し。槍では門を壊せない'
      : '打つ操作を長押し。槍では門を壊せない');
  } else if (guide === 'sally') {
    const p = rt.player.u.pos;
    let near = false;
    for (let i = 0; i < 2 && !near; i++) {
      const group = (i === 0 ? F.oteSpear : F.reserve).real;
      if (!group || group.routed) continue;
      for (const u of group.units) {
        if (!u.alive || u.fleeing || u.woundOut || u.noTarget) continue;
        if ((u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2 < 64 && Math.abs(u.pos.y - p.y) < 3) { near = true; break; }
      }
    }
    rt.objProgress('main', near ? '味方の列で構え、城兵を受けよ。追って離れるな'
      : '味方の槍の列へ戻れ。城兵を追って離れるな');
  } else if (guide === 'oteRoad' && F.step >= 1) {
    const gate = F.roadGuide.gate;
    rt.objProgress('main', F.roadGuide.returning ? '城兵を追って離れるな。道の印へ戻り、味方と進め'
      : gate ? '門の印へ寄せ、掛矢で打て'
      : F.roadGuide.x >= 90 ? '竹束の切れ目を通り、道の印へ進め' : '道の印へ。柵に沿って口を曲がれ');
  }
};

export { takato };
