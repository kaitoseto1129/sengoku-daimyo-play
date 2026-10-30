import { rosterPlan } from './jinkei_roster.js';
// ======================================================================
// 織田家編　第二次木津川口の戦い（天正六年十一月六日）
// 石山本願寺へ海から兵糧を運ぶ毛利の水軍に、二年前、織田の水軍は焙烙火矢で焼かれて大敗した。
// 信長は九鬼嘉隆に、鉄の板で覆った大きな安宅船（鉄甲船）を造らせた。天正六年十一月、六艘の大船は木津川口で毛利の船団を迎え、
// 大鉄砲（大筒）で打ち払って退けた。
// 自分は九鬼嘉隆の船の持ち場を守る。包囲→消火→甲板防衛→近距離の大将船へ一斉射→退く船団。
// 大将船への砲撃が史実の芯。消火・乗り込み・荷駄船の個別阻止は遊びの補完。
// 向き：毛利は南西から北東へ。六艘の九鬼船団は河口の沖。東が大坂、北東が本願寺。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tawara, solidSeg, solidRect } from './props.js';
import { INTERIOR_WALLS } from './shironaka.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { enemyGroup, allyGroup, nm } from './bhelp.js';
import { dress, gone } from './b_inabayama.js';
import { battleEvent, EVENT_VOLLEY, EVENT_FIRE_START, EVENT_UNIT_BREAK, EVENT_RETREAT } from './battle_events.js';
import { addDeck, addLadder, FL } from './floors.js';
import { addInterior } from './naka.js';
import { S } from './settings.js';
import { DEATH_END } from './units.js';
import { WIND_STATE } from './world.js';
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

// 船体は舳先を含め約32m×11m。歩く甲板も同じ幅にする。水面は0。
const DECK = { x0: -5.5, x1: 5.5, z0: -13, z1: 13, y: 2.3 };
// 南の乗り口は屋形の脇。中央へ着けると屋形の床下へ上がってしまう。
const SOUTH_X = 3.8;
const CABIN = { x0: -2.475, x1: 2.475, z0: 5.5, z1: 12.5 };
const CANNONS = [{ x: -4.6, z: -8 }, { x: -4.6, z: 0 }, { x: -4.6, z: 8 }];   // 西の舷の大筒

// 屋形の格子を視線が抜けても、壁の向こうまで肩越しの視点を引かない。
// 外から見る時だけ囲いの手前で止める。矢倉の中では実際の柱・壁の判定を使う。
function cabinCameraFraction(from, to) {
  if (from.x >= CABIN.x0 && from.x <= CABIN.x1 && from.z >= CABIN.z0 && from.z <= CABIN.z1 &&
      from.y >= DECK.y && from.y <= YAG_Y + 2.7) return null;
  let enter = 0, exit = 1;
  for (let axis = 0; axis < 3; axis++) {
    const p = axis === 0 ? from.x : axis === 1 ? from.y : from.z;
    const v = (axis === 0 ? to.x : axis === 1 ? to.y : to.z) - p;
    // 板壁だけでなく張り出す床・軒まで避け、近い面で画面を塞がない余白も取る。
    let low = axis === 0 ? -3.55 : axis === 1 ? DECK.y : 4.45;
    let high = axis === 0 ? 3.55 : axis === 1 ? YAG_Y + 4.1 : 13.55;
    // 通路に立つ人の目が余白の内側にある時は、余白だけを狭める。
    // 出発点で衝突すると割合が零になり、補正のたびに視点が体へ戻ってしまう。
    if (axis !== 1) {
      const wallLow = axis === 0 ? CABIN.x0 : CABIN.z0;
      const wallHigh = axis === 0 ? CABIN.x1 : CABIN.z1;
      if (p < wallLow) low = Math.max(low, (p + wallLow) / 2);
      else if (p > wallHigh) high = Math.min(high, (p + wallHigh) / 2);
    }
    if (Math.abs(v) < 0.00001) { if (p < low || p > high) return null; }
    else {
      const a = (low - p) / v, b = (high - p) / v;
      enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
    }
    if (enter > exit) return null;
  }
  return enter;
}

// 帆柱は細い面の検査待ちでも避ける。肩越しの画面に入る太さまで余白を取る。
// 柱に近い人から外へ引く時は、出発点を囲わないよう余白を狭める。
function mastCameraFraction(from, to) {
  const x = from.x, z = from.z - (DECK.z0 + 11);
  const dx = to.x - from.x, dz = to.z - from.z;
  const length2 = dx * dx + dz * dz;
  if (length2 < 0.000001) return null;
  const radius = Math.min(0.8, Math.hypot(x, z) * 0.5);
  const b = x * dx + z * dz, c = x * x + z * z - radius * radius;
  const disc = b * b - length2 * c;
  if (disc <= 0) return null;
  const hit = (-b - Math.sqrt(disc)) / length2;
  if (hit < 0 || hit > 1) return null;
  const y = from.y + (to.y - from.y) * hit;
  return y >= 0 && y <= 13.2 ? hit : null;
}

// 舷と屋形に挟まれたら、頭上ではなく通路の空いた側へ視点を引く。
// 八方向を二つの距離で調べる。検査用の入れ物は準備時に作って使い回す。
function deckShoulderCamera(rt, pos, eye, probe) {
  const u = rt.player.u;
  if (Math.hypot(pos.x - u.pos.x, pos.z - u.pos.z) >= 2.8) return false;
  // 総矢倉の前の端で寄せた視点（frameCamera）は、ここで壁ぞいの三歩後ろへ戻さない。
  if (rt.flags.wallFrameAt === rt.t && Math.hypot(pos.x - u.pos.x, pos.z - u.pos.z) >= 1.2) return false;
  const angle = Math.atan2(pos.x - u.pos.x, pos.z - u.pos.z);
  let best = -Infinity, bx = pos.x, bz = pos.z;
  for (let i = 0; i < 16; i++) {
    const a = angle + (i % 8) * Math.PI / 4, dx = Math.sin(a), dz = Math.cos(a);
    // 屋形脇で顔だけが大きくならないよう、通路に沿って足元まで収まる距離を取る。
    const distance = i < 8 ? 3.8 : 3;
    probe.set(u.pos.x + dx * distance, eye.y + 0.85, u.pos.z + dz * distance);
    if (probe.x < DECK.x0 + 0.4 || probe.x > DECK.x1 - 0.4 ||
        probe.z < DECK.z0 + 0.4 || probe.z > DECK.z1 - 0.4 ||
        rt.world.cameraBlockFraction(eye, probe) !== null) continue;
    const score = Math.cos(a - angle) + (distance - 3) * 0.25 - 0.05 * (dx * Math.sin(u.heading) + dz * Math.cos(u.heading));
    if (score > best) { best = score; bx = probe.x; bz = probe.z; }
  }
  if (best === -Infinity) return false;
  pos.set(bx, eye.y + 0.85, bz);
  return true;
}

// 下の甲板では、屋形の板壁を挟む相手へ槍を振らない。
// 上甲板と小舟の乗員は元の高さの判定に任せる。
function cabinDeckBlocked(from, to) {
  if (Math.abs((from.y ?? DECK.y) - DECK.y) > 0.5 ||
      Math.abs((to.y ?? DECK.y) - DECK.y) > 0.5) return false;
  let enter = 0, exit = 1;
  for (let axis = 0; axis < 2; axis++) {
    const p = axis === 0 ? from.x : from.z;
    const v = (axis === 0 ? to.x : to.z) - p;
    const low = axis === 0 ? CABIN.x0 : CABIN.z0;
    const high = axis === 0 ? CABIN.x1 : CABIN.z1;
    if (Math.abs(v) < 0.00001) { if (p < low || p > high) return false; }
    else {
      const a = (low - p) / v, b = (high - p) / v;
      enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
    }
    if (enter > exit) return false;
  }
  return exit > 0 && enter < 1;
}

// 足元の通行判定より高い屋形の板壁も、頭上の所属印から透視させない。
// 高さを含む線分だけで調べ、見通しの検査用に物を作らない。
function cabinSightBlocked(from, to, ay, by) {
  // 上甲板の中で互いに見える兵まで、囲いの体積だけで隠さない。
  if (from.x > CABIN.x0 && from.x < CABIN.x1 && from.z > CABIN.z0 && from.z < CABIN.z1 &&
      to.x > CABIN.x0 && to.x < CABIN.x1 && to.z > CABIN.z0 && to.z < CABIN.z1 &&
      ay > YAG_Y && by > YAG_Y) return false;
  let enter = 0.001, exit = 0.999;
  for (let axis = 0; axis < 3; axis++) {
    const p = axis === 0 ? from.x : axis === 1 ? ay : from.z;
    const v = (axis === 0 ? to.x : axis === 1 ? by : to.z) - p;
    const low = axis === 0 ? CABIN.x0 : axis === 1 ? DECK.y : CABIN.z0;
    const high = axis === 0 ? CABIN.x1 : axis === 1 ? YAG_Y + 2.6 : CABIN.z1;
    if (Math.abs(v) < 0.00001) { if (p < low || p > high) return false; }
    else {
      const a = (low - p) / v, b = (high - p) / v;
      enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
    }
    if (enter > exit) return false;
  }
  return true;
}

// 甲板へ来る敵と接舷中の後続、退く船団を見張る間は、持ち場の任務を優先する。
function boardingThreat(rt) {
  if (rt.flags.step === 3 || rt.flags.step === 5) return true;
  for (const u of rt.army.units) if (deckEnemy(u) || u.team === 1 && u.alive && !u.fleeing && !u.woundOut && u.shipTransit?.active) return true;
  for (const b of rt.flags.boats || []) if (b.alive && b.exit && !b.damageStage && !b.withdrawing && b.remaining > 0) return true;
  return false;
}

// 甲板の端は斜面ではない。深手の兵も含め、船内で倒れた体を板床へ沿わせる。
function deckFall(rt, u) {
  const D = u.death;
  if (!D || u.mounted || u.shipBoat || u.shipTransit?.active || Math.abs(u.pos.y - DECK.y) >= 0.4 ||
      u.pos.x < DECK.x0 || u.pos.x > DECK.x1 || u.pos.z < DECK.z0 || u.pos.z > DECK.z1) return;
  D.floor = true; D.roll = null;
  u.corpseLift = 0.28;
  // 骨の手足も同じ板床を見る。舷の外の海底へ沿わせない。
  u.corpseFloorY = DECK.y;
  if (D.deckPlaced || D.aid) return;
  D.deckPlaced = true;
  // 受けた勢いを残し、足元の半歩だけを探す。空いた所へ一メートルも滑らせない。
  const q = rt.flags.deckFallPoint;
  const impulseX = D.sx || 0, impulseZ = D.sz || 0, length = Math.hypot(impulseX, impulseZ);
  const scale = length > 0.45 ? 0.45 / length : 1;
  // 足元だけでなく、寝た胴の中央も台から離す。倒れる向きは共通の動きとそろえる。
  const heading = u.heading + (D.tw || 0);
  const forward = D.kind === 'forward' || D.kind === 'crumple' && D.fwd;
  const backward = D.kind === 'back';
  const bodyX = forward || backward ? Math.sin(heading) * (forward ? -0.85 : 0.85) : Math.cos(heading) * (D.side || 1) * 0.85;
  const bodyZ = forward || backward ? Math.cos(heading) * (forward ? -0.85 : 0.85) : -Math.sin(heading) * (D.side || 1) * 0.85;
  let best = -1, sx = 0, sz = 0;
  for (let i = 0; i < 10; i++) {
    const a = u.id * 2.39996 + i * 2.39996, r = i < 2 ? 0 : 0.45;
    const dx = i === 0 ? impulseX * scale : Math.sin(a) * r, dz = i === 0 ? impulseZ * scale : Math.cos(a) * r;
    if (dx * impulseX + dz * impulseZ < -0.01) continue;
    q.x = u.pos.x + dx; q.z = u.pos.z + dz;
    if (q.x < DECK.x0 + 0.8 || q.x > DECK.x1 - 0.8 || q.z < DECK.z0 + 1 || q.z > DECK.z1 - 1 ||
        q.z > 4.8 && Math.abs(q.x) < 3.3 || rt.army.wallBetween(u.pos, -1, q)) continue;
    let onGun = false;
    for (const c of CANNONS) if (Math.abs(q.x + bodyX - (c.x - 0.575)) < 1.2 && Math.abs(q.z + bodyZ - c.z) < 0.7) { onGun = true; break; }
    if (onGun) continue;
    // 水桶は床ではない。足元と寝た胴の間も調べ、桶の下へ体を差し込まない。
    let onBucket = false;
    const bodyLength2 = bodyX * bodyX + bodyZ * bodyZ;
    for (const water of WATER) {
      const along = Math.max(0, Math.min(1, ((water.x - q.x) * bodyX + (water.z - q.z) * bodyZ) / Math.max(0.001, bodyLength2)));
      if (Math.hypot(q.x + bodyX * along - water.x, q.z + bodyZ * along - water.z) < 0.65) { onBucket = true; break; }
    }
    if (onBucket) continue;
    let gap = 4;
    for (const d of rt.army.dead) {
      if (d === u || d.gone || Math.abs(d.pos.y - DECK.y) > 0.4) continue;
      gap = Math.min(gap, (q.x - d.pos.x - (d.death?.sx || 0)) ** 2 + (q.z - d.pos.z - (d.death?.sz || 0)) ** 2);
    }
    if (gap > best) { best = gap; sx = dx; sz = dz; }
    if (gap >= 1.1 ** 2) break;
  }
  D.sx = sx; D.sz = sz;
}

// 舟の傾きも足元へ反映する。生きた兵と亡骸で同じ入れ物を使い回す。
const shipFloorPoint = new THREE.Vector3();
function shipFloor(b, local) {
  return shipFloorPoint.set(local.x, b.deckY, local.z).applyEuler(b.m.rotation).add(b.m.position);
}

// 舟で倒れた兵も舟の床へ残す。生きた乗員だけ追従させると、退く舟の跡に体が浮く。
function shipFall(u, time) {
  const b = u.shipBoat, D = u.death;
  const tr = u.shipTransit;
  if (u.alive || u.gone || !D || u.seaRemains) return;
  // 飛び移る途中や、舷の外へ押された直後に倒れた兵も水面まで落とす。
  // 生きた兵だけの落水判定では、同じコマで討たれた体が甲板の高さへ残る。
  const offDeck = !b && (u.pos.x < DECK.x0 || u.pos.x > DECK.x1 || u.pos.z < DECK.z0 || u.pos.z > DECK.z1);
  if (tr?.active || offDeck && u.pos.y > 0) {
    if (D.shipDropAt === undefined) { D.shipDropAt = time; D.shipDropY = u.pos.y; }
    const floor = u.pos.x >= DECK.x0 && u.pos.x <= DECK.x1 && u.pos.z >= DECK.z0 && u.pos.z <= DECK.z1 ? DECK.y : 0;
    const y = Math.max(floor, D.shipDropY - 4.9 * (time - D.shipDropAt) ** 2);
    u.mesh.position.y += y - u.pos.y; u.pos.y = y;
    D.floor = true; D.roll = null; D.sx = D.sz = 0; u.corpseFloorY = y;
    if (y <= floor) { if (tr) tr.active = false; u.shipBoat = null; u.shipPost = null; u.perch = null; }
    return;
  }
  if (!b) return;
  const point = shipFloor(b, u.shipLocal);
  const x = point.x, z = point.z, y = Math.max(0, point.y);
  // 倒れ切って骨の更新が止まった後も、固まった姿ごと運ぶ。
  u.mesh.position.x += x - u.pos.x; u.mesh.position.y += y - u.pos.y; u.mesh.position.z += z - u.pos.z;
  u.pos.set(x, y, z);
  if (D.shipHeading === undefined) D.shipHeading = u.heading - b.m.rotation.y;
  const heading = D.shipHeading + b.m.rotation.y;
  u.mesh.rotation.y += heading - u.heading; u.heading = heading;
  D.floor = true; D.roll = null; D.sx = D.sz = 0;
  u.corpseFloorY = y; u.corpseLift = 0.28;
  if (y <= 0) { u.shipBoat = null; u.shipPost = null; u.perch = null; }
}

// 波の輪と流木は初めに用意し、亡骸へ順に割り当てる。毎コマ形を作らない。
function seaRemains(rt, dt, t) {
  const F = rt.flags;
  for (const u of rt.army.dead) {
    shipFall(u, rt.t);
    deckFall(rt, u);
    if (u.alive || u.gone || u.dying || u.pos.y > 0.1 || u.seaRemains || !u.mesh?.parent ||
        (u.death ? u.death.t < DEATH_END : u.deadT < 1)) continue;
    u.seaRemains = true; u.noHead = true;
    const r = F.seaRemains[F.seaRemainsNext++ % F.seaRemains.length];
    if (r.flag) { r.flag.removeFromParent(); r.flag = null; }
    r.u = u; r.x = u.pos.x; r.z = u.pos.z; r.bodyX = u.mesh.position.x; r.bodyZ = u.mesh.position.z; r.age = 0;
    r.ring.visible = r.board.visible = true;
    // 指物を亡骸から離し、流木とは別の場所で浮かせる。
    if (u.flag) { r.flag = u.flag; rt.scene.add(r.flag); u.flag = null; r.flag.visible = true; r.flag.rotation.set(-Math.PI / 2, 0, u.heading); }
  }
  for (const r of F.seaRemains) {
    if (!r.u) continue;
    r.age += dt;
    const u = r.u, wave = Math.sin(t * 1.3 + u.id) * 0.035;
    if (u.gone || !u.mesh.parent) { r.ring.visible = r.board.visible = false; if (r.flag) r.flag.visible = false; continue; }
    // 陸の倒れ方のまま水面へ載せず、胴の半分を沈める。
    const drift = Math.min(18, r.age * 0.18);
    // 流木と同じ潮で亡骸も流す。陸で倒れた時の半歩のずれは保つ。
    u.mesh.position.set(r.bodyX - drift, -0.25 + wave, r.bodyZ + drift * 0.45);
    u.pos.set(r.x - drift, 0, r.z + drift * 0.45);
    r.ring.position.set(u.mesh.position.x, 0.04 + wave * 0.3, u.mesh.position.z);
    // 落水の波紋は一度だけ広がる。亡骸の周りで白い輪を繰り返さない。
    r.ring.visible = r.age < 4;
    r.ring.scale.setScalar(S.reduceMotion ? 1 : 0.8 + Math.min(4, r.age) * 0.25);
    r.board.position.set(r.x - 1.4 - drift, 0.05 + wave, r.z + 0.9 + drift * 0.45);
    r.board.rotation.set(0.04, u.heading + t * 0.025, 0.06);
    if (r.flag) r.flag.position.set(r.x - 0.8 - drift * 0.7, 0.07 + wave, r.z - 1.3 + drift * 0.3);
  }
}
// 桶・消火・兵の行き先は、欄干の内側と屋形の両脇にそろえる。
const WATER = [{ x: -4.6, z: -8 }, { x: 4.6, z: -8 / 3 }, { x: -4.6, z: 8 / 3 }, { x: 4.6, z: 8 }];
function deckWay(u, want) {
  const q = u.deckWay || (u.deckWay = { x: 0, z: 0 });
  q.x = Math.max(-4.6, Math.min(4.6, want.x));
  q.z = Math.max(-11.8, Math.min(11.8, want.z));
  // 屋形脇の大筒は x=-3。余白へ寄せる時も行き先の舷を保つ。
  // 自分のいる側を選ぶと、東から西の大筒へ渡れなくなる。
  if (q.z > 4.8 && Math.abs(q.x) < 3.3) q.x = Math.sign(q.x || u.pos.x || 1) * 3.8;
  // 屋形の奥から反対側へ行く時は、手前へ出てから横切る。
  if (u.pos.z > 4.1 && (u.pos.x * q.x < 0 || Math.abs(q.x) < 3.3)) { q.x = (u.pos.x < 0 ? -1 : 1) * 3.8; q.z = 3.8; }
  // 大筒の持ち場 x=±3 は既に壁の外。同じ舷なら船首へ戻さない。
  else if (q.z > 4.8 && (u.pos.x * q.x < 0 || Math.abs(u.pos.x) < 2.9)) q.z = 3.8;
  // 屋形を回る補正の後で筒を避ける。屋形脇にも人一人の通り道を残す。
  if (q.x < -3.65) for (const c of CANNONS) {
    if (Math.abs(q.z - c.z) < 1.1) { q.x = -3.65; break; }
  }
  return q;
}
// 遊び手の道案内と同じ角を曲がる。行き先の入れ物は準備時に一つだけ作る。
function goDeckTo(rt, inp, x, z, stop, goTo) {
  const u = rt.player.u, goal = rt.flags.botDeckGoal;
  goal.x = x; goal.z = z;
  const q = u.pos.y > DECK.y + 0.5 ? goal : deckWay(u, goal);
  const turning = Math.abs(q.x - x) > 0.1 || Math.abs(q.z - z) > 0.1;
  goTo(rt.player, inp, q.x, q.z, turning ? 0.3 : stop);
}
// 屋形越しの直線ではなく、両脇と手前の角を通る距離を案内へ載せる。
function deckRouteDistance(u, want) {
  if (u.pos.y > DECK.y + 0.5) return Math.hypot(want.x - u.pos.x, want.z - u.pos.z);
  const q = deckWay(u, want);
  const first = Math.hypot(q.x - u.pos.x, q.z - u.pos.z);
  if (q.z === 3.8 && want.z > 4.8 && q.x * want.x < 0) {
    return first + Math.abs(want.x - q.x) + Math.abs(want.z - q.z);
  }
  return first + Math.hypot(want.x - q.x, want.z - q.z);
}
// 方角だけで壁へ進ませず、既存の道案内と同じ角を言葉でも示す。
function cannonApproachTask(rt, c) {
  const u = rt.player.u, q = u.pos.y > DECK.y + 0.5 ? c.post : deckWay(u, c.post);
  if (q.z === 3.8 && Math.hypot(q.x - c.post.x, q.z - c.post.z) > 0.1)
    return u.pos.z > 4.1 ? '屋形の脇から前へ回れ' : '屋形の前から大筒へ';
  return '船べりの大筒へ進め';
}
// 乗り口も大筒と同じ通路をたどる。屋形の向こうへ直進する下知にしない。
function boardingApproachTask(rt, post) {
  const u = rt.player.u, goal = rt.flags.guardPost;
  const q = u.pos.y > DECK.y + 0.5 ? goal : deckWay(u, goal);
  if (Math.hypot(q.x - goal.x, q.z - goal.z) > 0.1)
    return u.pos.z > 4.1 ? '屋形の脇から前へ回れ' : `屋形の前から${post}の乗り口へ`;
  return HI(rt) ? `組を${post}の乗り口へ寄せ、守れ` : `${post}の乗り口で敵を迎えよ`;
}
// 本の足軽装束：黒・茶の漆胴、渋い赤茶の陣笠、茶の小袖（味方に青を使わない。10/29）。陣羽織は着せない。
const ODA = { flag: 'oda', armor: 0x302923, hatColor: 0x613a2d, lace: 0x9a8b70, cloth: 0x4a3b2c, doStyle: 'okegawa', kasaDrape: true, haori: 0 };
const MORI = { flag: 'mori', armor: 0x382c25, hatColor: 0x654032, lace: 0x95836a, cloth: 0x303d49, doStyle: 'okegawa', kasaDrape: true, haori: 0 };
// この戦の知らせだけを間引く。手柄の加算は止めない。
function noticeReady(rt, text) {
  const times = rt.flags.noticeTimes;
  if (rt.t < (times[text] ?? -8) + 8) return false;
  times[text] = rt.t;
  return true;
}

// 水の有無に合わせ、札と押せる操作を一緒に切り替える。
function fireTask(rt) {
  const F = rt.flags;
  rt.obj('main', F.water ? '桶の水を残る火へ掛けよ' : '船べりの水桶を取れ', 'main');
  for (const it of rt.interacts) {
    if (/^water[0-3]$/.test(it.id)) it.r = F.water ? 0 : 2.2;
    else if (/^f[0-2]$/.test(it.id)) it.r = F.water ? 2.8 : 0;
  }
  if (rt.missionGuide) rt.missionGuide.scan = 0;
}

function deckMeleeThreat(u) {
  return !u.shipBoat && !u.shipTransit?.active && !u.fleeing && !u.woundOut &&
    Math.abs(u.pos.y - DECK.y) < 1;
}

// 小舟の乗員を横の位置だけで甲板の残敵に数えない。屋形の上の敵は残す。
function deckEnemy(u) {
  return u.alive && u.team === 1 && !u.fleeing && !u.woundOut &&
    !u.shipBoat && !u.shipTransit?.active && u.pos.y >= DECK.y - 0.4 &&
    u.pos.x >= DECK.x0 && u.pos.x <= DECK.x1 && u.pos.z >= DECK.z0 && u.pos.z <= DECK.z1;
}

// 甲板に残る敵だけを探す。屋形の裏も拾い、案内側で通れる角へ回す。
function nearestDeckObjective(rt) {
  const F = rt.flags;
  if (F.objectiveScan === rt.t && F.objectiveEnemy?.alive && !F.objectiveEnemy.gone &&
      !F.objectiveEnemy.dying && !F.objectiveEnemy.fleeing && !F.objectiveEnemy.woundOut) return F.objectiveEnemy;
  let best = null, distance = Infinity;
  const me = rt.player.u.pos;
  for (const u of rt.army.units) {
    if (!deckEnemy(u) || u.gone || u.dying || u.noTarget || u.invuln) continue;
    const d = (u.pos.x - me.x) ** 2 + (u.pos.z - me.z) ** 2;
    if (d < distance) { best = u; distance = d; }
  }
  F.objectiveScan = rt.t; F.objectiveEnemy = best;
  return best;
}

// 案内と構えの声は同じ敵を見る。弓・鉄砲の兵も間近なら守りを優先する。
function nearestDeckThreat(rt, u, radius) {
  rt.flags.deckThreatFrom = u;
  return rt.army.nearestEnemy(u, radius, rt.flags.deckThreatFilter);
}

// 舟上の敵ではなく、同じ甲板へ上がった敵を迎える場所を短く示す。
function deckGuardTask(enemy) {
  if (enemy.pos.z >= 9) return '南の乗り口で構えよ';
  if (enemy.pos.z >= 2) return '屋形の前で構えよ';
  if (enemy.pos.x <= -2) return '西の船べりで構えよ';
  return '甲板の敵へ向き、構えよ';
}

function kukiGuardTask(F) {
  return F.kukiRetired ? '屋形の脇で九鬼嘉隆を守れ' : '屋形の前で九鬼嘉隆を守れ';
}
function rescueTask(rt) {
  const F = rt.flags, u = rt.player.u, goal = F.roofDanger ? F.roofPost : F.kukiU.pos;
  const q = deckWay(u, goal);
  const around = u.pos.y <= DECK.y + 0.5 && Math.hypot(q.x - goal.x, q.z - goal.z) > 0.1;
  if (F.roofDanger) return around ? '屋形が危ない。脇から前へ' :
    F.deckLost >= 10 ? '屋形を奪われる。前の敵を押し返せ' : '屋形が危ない。前の敵を押し返せ';
  return around ? '九鬼嘉隆が危ない。脇を戻れ' : kukiGuardTask(F);
}

function closeGuardTask(F) {
  return F.roofDanger ? '屋形が危ない。近い敵を突け' :
    F.kukiDanger ? '九鬼嘉隆を守れ。敵の隙に突け' : '目の前の敵へ向き、構えて防げ';
}

// 行き先には場所だけを書く。携帯の札へ任務の全文を重ねない。
function rescuePlace(rt) {
  const F = rt.flags, goal = F.roofDanger ? F.roofPost : F.kukiU.pos;
  const q = deckWay(rt.player.u, goal);
  return rt.player.u.pos.y <= DECK.y + 0.5 && Math.hypot(q.x - goal.x, q.z - goal.z) > 0.1 ?
    '屋形の前の角' : F.roofDanger ? '屋形の前' : '九鬼嘉隆のそば';
}

// 南に固定せず、次に敵が上がる乗り口へ案内する。自動の遊び手も同じ船を選ぶ。
function nextBoardingBoat(rt) {
  let next = null, distance = Infinity;
  for (const boat of rt.flags.boats) {
    if (!boat.alive || boat.big || boat.supply || boat.damageStage || boat.withdrawing || !boat.remaining) continue;
    const d = boat.landed ? 0 : Math.hypot(boat.t.x - boat.x, boat.t.z - boat.z) +
      (boat.approach ? Math.hypot(boat.dock.x - boat.t.x, boat.dock.z - boat.t.z) : 0);
    if (d < distance) { next = boat; distance = d; }
  }
  return next;
}

// 射界の判定は発砲と狙い札で共有する。船の形や兵は増やさない。
function cannonTarget(F, c) {
  let best = null, distance = F.step === 4 ? 60 : 95;
  for (const b of F.boats) {
    if (!b.alive || b.damageStage || b.withdrawing || b.landed && !b.big && !b.ranged || F.step === 4 && b !== F.big || b.x >= c.x - 3 || Math.abs(b.z - c.z) > (c.x - b.x) * 0.55 + 3) continue;
    const d = Math.hypot(b.x - c.x, b.z - c.z);
    if (d <= (F.step === 4 ? 60 : 95) && (!best || d < distance)) { best = b; distance = d; }
  }
  return best;
}
function broadside(b, c) { return Math.abs(Math.sin(b.m.rotation.y - Math.atan2(c.x - b.x, c.z - b.z))); }
// 乗り込む小舟は船首をこちらへ向ける。横腹だけを待つと、撃つ前に必ず接舷してしまう。
// 決め手となる大将船への一斉射は、従来どおり横腹を待つ。
function cannonFacing(b, c) { return !b.big || broadside(b, c) >= 0.4; }
// 「待て」の間に撃つ釦を出さない。狙い札と長押し完了時も同じ射撃条件を見る。
function cannonReady(rt, c) {
  const F = rt.flags;
  if (F.ending || rt.over || !rt.player.u.alive ||
      !(F.step === 1 || F.step === 4 && !F.bigSunk) || F.cannonGuard || F.kukiDanger || rt.t < c.cd) return false;
  const b = cannonTarget(F, c);
  return !!b && Math.hypot(b.x - c.x, b.z - c.z) <= 55 && cannonFacing(b, c);
}
function aimWord(b, c) {
  const d = Math.hypot(b.x - c.x, b.z - c.z);
  return d > 55 ? 'まだ遠いぞ。弾がそれる' : !cannonFacing(b, c) ? '船首しか見えぬ。横腹を待て' :
    broadside(b, c) < 0.4 ? '船首が近いぞ。狙って放て！' : d > 30 ? '横腹が見えたぞ。筒先を合わせよ' : '横腹が近いぞ。放て！';
}
function cannonLabel(rt, c) {
  if (rt.t < c.cd) return `西の大筒・弾込めあと${Math.ceil(c.cd - rt.t)}秒`;
  const b = cannonTarget(rt.flags, c);
  if (!b) return '西の大筒・敵船を待て';
  if (Math.hypot(b.x - c.x, b.z - c.z) > 55) return '西の大筒・近寄るのを待て';
  return !cannonFacing(b, c) ? '西の大筒・横腹を待て' : '西の大筒・敵船を撃て';
}
function cannonPriority(rt, c) {
  // 今撃てる筒を先に案内する。大将船は横腹を待つ。
  if (rt.t < c.cd) return -200;
  const b = cannonTarget(rt.flags, c);
  if (!b) return 30;
  return Math.hypot(b.x - c.x, b.z - c.z) <= 55 && cannonFacing(b, c) ? 200 : 100;
}

// 接舷の鉤（鉤縄）：乗り込みの前に、縄が舷に掛かる見た目（軽い・使い回し・数秒で消す）
let HOOK = null, SUPPLY_BALE = null, SUPPLY_MAT = null;
function grapple(rt, x, z) {
  if (!HOOK) HOOK = { rope: new THREE.CylinderGeometry(0.05, 0.05, 1, 4), hook: new THREE.TorusGeometry(0.22, 0.05, 4, 8), m: new THREE.MeshStandardMaterial({ color: 0x3a2f20, roughness: 0.9 }), i: new THREE.MeshStandardMaterial({ color: 0x4a4440, metalness: 0.5, roughness: 0.5 }) };
  const g = new THREE.Group();
  const h2 = DECK.y + 0.6;
  const rope = new THREE.Mesh(HOOK.rope, HOOK.m); rope.scale.y = h2; rope.position.set(x, h2 / 2, z); g.add(rope);
  const hook = new THREE.Mesh(HOOK.hook, HOOK.i); hook.position.set(x, h2, z); hook.rotation.x = Math.PI / 2; g.add(hook);
  rt.scene.add(g);
  rt.after(9, () => { if (g.parent) rt.scene.remove(g); });
}

function height(x, z) {
  // 海の底
  let h = -3 + 0.4 * Math.sin(x * 0.05) * Math.cos(z * 0.04);
  // 甲板。縁の外は海底のまま。歩く床は準備時にも登録する。
  const dx = Math.max(DECK.x0 - x, x - DECK.x1, 0), dz = Math.max(DECK.z0 - z, z - DECK.z1, 0);
  const d = Math.hypot(dx, dz);
  if (d === 0) return DECK.y;
  // 大坂市立図書館「中世・近世の大坂」：台地以外の多くは低湿地。
  // 近い岸は低い砂州にする。上町台地や堺を数百メートルの沖へ縮めない。
  // 岸と川筋の位置・幅は推定。接舷する小早の動く海域には届かない。
  if (x > 180) {
    const bank = Math.min(1, Math.max(0, (Math.abs(z) - 24) / 46));
    const shore = Math.min(1, (x - 180) / 80);
    h = -3 + 6 * shore * shore * (3 - 2 * shore) * bank * bank * (3 - 2 * bank);
  }
  return h;
}

// ---- 船の形（見回り 10/2：前は箱を並べただけで、甲板は芝の四角・矢倉は灰色の箱・小早は茶色の箱だった） ----
// 画質「高」は参考の復元像に合わせ、箱形の舷を黒い鉄板で覆う。鉄張りの範囲は推定。
// 舷の上に狭間（鉄砲を出す穴）の並ぶ楯板（垣立）、外の舷に櫓（漕ぐ櫂）、中央の船に二重の矢倉と望楼。
let SHIPTEX = null;
function shipTex() {
  if (SHIPTEX) return SHIPTEX;
  const mk = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  // 鉄の板：一枚 1m×0.5m ほど。継ぎ目は黒く、鋲は少し明るく、板ごとに錆と色むら
  const plate = mk(256, 128, (g, w, h) => {
    g.fillStyle = '#2a2a2e'; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const x = c * 64 + (r % 2) * 32, y = r * 32, v = 36 + ((r * 7 + c * 13) % 9);
      g.fillStyle = `rgb(${v},${v},${v + 4})`; g.fillRect(x + 1, y + 1, 62, 30); g.fillRect(x - 255, y + 1, 62, 30);
      g.fillStyle = 'rgba(110,60,30,0.18)'; g.fillRect(x + 8 + (c * 11) % 30, y + 18, 20, 10);
      g.fillStyle = '#5a5650'; for (let k = 0; k < 6; k++) { g.fillRect(x + 4 + k * 11, y + 3, 2, 2); g.fillRect(x + 4 + k * 11, y + 27, 2, 2); }
    }
    // 鉄板の段の間に、船体の木の外板を一段のぞかせる（手本の復元像は木の船体に鉄板。黒一色の箱に見えていた。10/29 採点）。張った範囲は推定。
    for (const y of [32, 96]) {
      g.fillStyle = '#4b3a28'; g.fillRect(0, y + 4, w, 24);
      for (let k = 0; k < 9; k++) { g.fillStyle = `rgba(${k % 2 ? '30,20,12' : '120,92,60'},0.35)`; g.fillRect(0, y + 6 + k * 2.4 + (k % 3), w, 1); }
      g.fillStyle = '#1d1712'; for (let c = 0; c < 3; c++) g.fillRect(c * 96 + 30 + (y % 64), y + 4, 2, 24);
      g.fillStyle = '#1a1a1c'; g.fillRect(0, y + 3, w, 1.5); g.fillRect(0, y + 28, w, 1.5);
    }
  });
  // 楯板（垣立）：鉄の板に、角を丸めた狭間を一間ごとに。上は白木の笠木
  const tate = mk(256, 64, (g, w, h) => {
    g.fillStyle = '#2a2a2e'; g.fillRect(0, 0, w, h);
    for (let c = 0; c < 4; c++) { g.fillStyle = c % 2 ? '#34312d' : '#302d2a'; g.fillRect(c * 64 + 1, 8, 62, 56); }
    g.fillStyle = '#6a5a44'; g.fillRect(0, 0, w, 8);
    g.fillStyle = '#0a0908'; for (let c = 0; c < 4; c++) { g.beginPath(); g.roundRect(c * 64 + 25, 25, 14, 18, 5); g.fill(); }
    g.fillStyle = '#5a5650'; for (let c = 0; c < 4; c++) for (const y of [12, 58]) for (const x of [6, 56]) g.fillRect(c * 64 + x, y, 2, 2);
    // 鉄板の裾から楯板の木の板がのぞく（木目の横筋と板の継ぎ目。10/29 採点：鉄の黒一色）。
    g.fillStyle = '#4e3c29'; g.fillRect(0, 50, w, 14);
    for (let k = 0; k < 5; k++) { g.fillStyle = `rgba(${k % 2 ? '28,19,11' : '125,96,62'},0.4)`; g.fillRect(0, 52 + k * 2.4, w, 1); }
    g.fillStyle = '#1c1611'; for (let c = 0; c < 4; c++) g.fillRect(c * 64 + 40, 50, 2, 14);
    g.fillStyle = '#141416'; g.fillRect(0, 49, w, 1.5);
  });
  // 板（小早・矢倉の下見板）：横に張った板と継ぎ目
  const board = mk(128, 128, (g, w, h) => {
    g.fillStyle = '#4a3a2a'; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 8; r++) {
      const y = r * 16, v = 62 + (r * 5) % 14;
      g.fillStyle = `rgb(${v + 12},${v},${v - 14})`; g.fillRect(0, y + 1, w, 14);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y + 15, w, 1); g.fillRect((r * 37) % w, y + 1, 1, 14);
      g.fillStyle = 'rgba(24,18,12,0.2)'; g.fillRect((r * 19) % 96, y + 8, 28, 5);
      g.strokeStyle = 'rgba(155,117,75,0.25)';
      g.beginPath(); g.moveTo(0, y + 4); g.quadraticCurveTo(64, y + 2 + r % 4, w, y + 5); g.stroke();
    }
  });
  // 舷だけは高さ全体に絵を張る。水際の濡れを一メートルごとに繰り返さない。
  const hull = mk(256, 256, (g, w, h) => {
    g.drawImage(board.image, 0, 0, w, h);
    for (let x = 20; x < w; x += 64) {
      g.fillStyle = '#292a28'; g.fillRect(x, 0, 7, h);
      g.fillStyle = '#77736b';
      for (let y = 9; y < h; y += 23) { g.beginPath(); g.arc(x + 3.5, y, 1.5, 0, Math.PI * 2); g.fill(); }
    }
    const wet = g.createLinearGradient(0, 110, 0, 200);
    wet.addColorStop(0, 'rgba(18,32,29,0)'); wet.addColorStop(0.35, 'rgba(18,32,29,.28)'); wet.addColorStop(1, 'rgba(13,26,24,.65)');
    g.fillStyle = wet; g.fillRect(0, 100, w, h - 100);
    g.strokeStyle = 'rgba(12,24,22,.3)';
    for (let x = 3; x < w; x += 11) { g.beginPath(); g.moveTo(x, 112 + (x * 7) % 27); g.lineTo(x + 2, 180 + x % 40); g.stroke(); }
  });
  const deck = mk(1024, 1024, (g, w, h) => {
    g.fillStyle = '#171b1a'; g.fillRect(0, 0, w, h);
    // 板の端を互い違いにし、絵の端をまたぐ板も描いて繰り返しをつなぐ。
    for (let i = 0; i < 32; i++) for (let j = -1; j < 8; j++) {
      const x = i * 32, y = j * 128 + (i * 47) % 128, v = (i * 17 + (j + 1) * 11) % 23;
      g.fillStyle = `rgb(${77 + v},${69 + v},${54 + v})`; g.fillRect(x + 1, y + 1, 30, 126);
      g.strokeStyle = 'rgba(70,48,27,.28)'; g.lineWidth = 1;
      for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(x + 4 + k * 5, y + 2); g.quadraticCurveTo(x + 3 + k * 5 + v % 5, y + 70, x + 4 + k * 5, y + 125); g.stroke(); }
      if ((i + j) % 3) {
        g.beginPath(); g.ellipse(x + 9 + v % 13, y + 20 + (i * 31 + j * 43) % 85, 1.5 + v % 3, 4 + v % 7, (v - 11) * 0.035, 0, Math.PI * 2); g.stroke();
      }
      // 木目に沿う擦れと、継ぎ目へ染みた水。板ごとに位置と濃さを変える。
      g.strokeStyle = 'rgba(214,189,144,.22)';
      for (let k = 0; k < 4; k++) {
        const xx = x + 4 + (v * 7 + k * 13) % 24, yy = y + 12 + (v * 11 + k * 23) % 70;
        g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx + .7, yy + 18 + v); g.stroke();
      }
      if ((i * 3 + j + 4) % 4 === 0) {
        const wet = g.createLinearGradient(x, 0, x + 30, 0);
        wet.addColorStop(0, 'rgba(30,42,35,.36)'); wet.addColorStop(.65, 'rgba(30,42,35,.08)'); wet.addColorStop(1, 'rgba(30,42,35,0)');
        g.fillStyle = wet; g.fillRect(x + 1, y + 1, 30, 48 + v * 3);
      }
      g.fillStyle = '#171a19'; for (const yy of [y + 5, y + 121]) { g.fillRect(x + 5, yy, 1.5, 1.5); g.fillRect(x + 25, yy, 1.5, 1.5); }
    }
    // 舷の水濡れと、踏みならされた中央。甲板全体へ一度だけ張る。
    const edge = g.createLinearGradient(0, 0, w, 0);
    for (const [at, alpha] of [[0, .76], [.14, .43], [.36, .05], [.64, .05], [.86, .43], [1, .76]])
      edge.addColorStop(at, `rgba(9,20,21,${alpha})`);
    g.fillStyle = edge; g.fillRect(0, 0, w, h);
    // 実際の三門と舳先の口前。煤・火薬・水の染みを床の絵へ焼き込む。
    const stain = (x, z, rx, rz, opacity) => {
      g.save(); g.translate((x / 10.6 + .5) * w, (z + 18.4) / 31.4 * h);
      g.scale(rx / 10.6 * w, rz / 31.4 * h);
      const soot = g.createRadialGradient(0, 0, .08, 0, 0, 1);
      soot.addColorStop(0, `rgba(5,9,10,${opacity})`); soot.addColorStop(.5, `rgba(8,13,14,${opacity * .7})`); soot.addColorStop(1, 'rgba(8,13,14,0)');
      g.fillStyle = soot; g.fillRect(-1, -1, 2, 2); g.restore();
    };
    for (const c of CANNONS) {
      stain(c.x + .2, c.z, 1.25, 1.3, .6);
      stain(-5.1, c.z, 1.15, .65, .95);
      for (let k = 0; k < 16; k++) stain(-5.15 + (k * 7 % 13) * .09, c.z + Math.sin(k * 2.4) * .65, .045, .04, .7);
    }
    stain(0, -17.5, 1.2, 1.3, .85);
  });
  // 舷の濡れと大筒の煤を実際の位置へ合わせ、甲板全体に一度だけ張る。
  deck.wrapS = deck.wrapT = THREE.ClampToEdgeWrapping;
  // 同じ長さ・間隔の縞にせず、切れた白波と暗い谷を散らす。端の九枚を描いて継ぎ目を消す。
  const sea = mk(512, 512, (g, w, h) => {
    g.fillStyle = '#365f69'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 118; i++) {
      const x = (i * 137.53) % w, y = (i * 83.71) % h, len = 12 + (i * 31) % 77;
      for (let sx = -w; sx <= w; sx += w) for (let sy = -h; sy <= h; sy += h) {
        const xx = x + sx, yy = y + sy;
        g.strokeStyle = 'rgba(16,43,55,.22)'; g.lineWidth = 5;
        g.beginPath(); g.moveTo(xx, yy + 5); g.quadraticCurveTo(xx + len * .4, yy - 1, xx + len, yy + 3); g.stroke();
        g.strokeStyle = i % 4 ? 'rgba(135,171,175,.16)' : 'rgba(205,224,216,.32)';
        g.lineWidth = i % 4 ? 1 : 1.5;
        g.beginPath(); g.moveTo(xx, yy); g.bezierCurveTo(xx + len * .27, yy - 5, xx + len * .7, yy + 4, xx + len, yy - 2); g.stroke();
        if (i % 4 === 0) {
          g.fillStyle = 'rgba(218,234,224,.22)';
          for (let j = 0; j < 5; j++) { g.beginPath(); g.ellipse(xx + len * j / 6, yy + 3 + j % 3, 1.4, .8, 0, 0, Math.PI * 2); g.fill(); }
        }
      }
    }
  });
  sea.repeat.set(80, 80);
  // 柱・貫・大筒の台の木肌（10/29 手本と並べて：一色の茶の箱に見えていた）。縦の木目・節・雨だれの黒ずみ・角の擦れ。
  const grain = mk(128, 256, (g, w, h) => {
    g.fillStyle = '#6b5640'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 2) {
      const v = Math.sin(x * 0.37) * 9 + Math.sin(x * 1.9) * 5 + ((x * 53) % 11) - 5;
      g.fillStyle = `rgba(${v > 0 ? '150,120,86' : '30,22,14'},${Math.min(0.32, Math.abs(v) / 40)})`; g.fillRect(x, 0, 2, h);
    }
    g.strokeStyle = 'rgba(28,20,12,0.35)';
    for (let i = 0; i < 9; i++) { const x = (i * 41) % w; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 6, h * 0.3, x - 5, h * 0.6, x + 3, h); g.stroke(); }
    for (let i = 0; i < 3; i++) { const x = 20 + (i * 47) % 90, y = 40 + i * 80; g.fillStyle = 'rgba(40,26,14,0.55)'; g.beginPath(); g.ellipse(x, y, 4, 7, 0, 0, Math.PI * 2); g.fill(); }
    const rain = g.createLinearGradient(0, 0, 0, h);
    rain.addColorStop(0, 'rgba(20,16,12,0.25)'); rain.addColorStop(0.25, 'rgba(20,16,12,0)'); rain.addColorStop(0.8, 'rgba(20,16,12,0.05)'); rain.addColorStop(1, 'rgba(14,12,10,0.4)');
    g.fillStyle = rain; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(12,10,8,0.18)'; g.fillRect((i * 29) % w, (i * 67) % h, 1 + i % 2, 20 + (i * 13) % 50); }
  });
  // 大筒の青銅：鋳肌の斑と緑青、筒先の煤（滑らかな一色の筒にしない）
  const bronze = mk(128, 128, (g, w, h) => {
    g.fillStyle = '#4e4535'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const x = (i * 73) % w, y = (i * 151) % h, r = 1 + (i % 4);
      g.fillStyle = i % 5 === 0 ? 'rgba(70,96,78,0.35)' : i % 3 ? 'rgba(28,24,18,0.3)' : 'rgba(120,100,70,0.25)';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  });
  SHIPTEX = { plate, tate, board, hull, deck, sea, grain, bronze };
  return SHIPTEX;
}
let SHIPMAT = null;
// 海上の船は水面と同じ距離の霞へ溶かす。陸の低地用の濃い靄で白く塗り潰さない。
// 硝煙で共通の見通しが縮んでも、海・帆・乗員と同じ150〜360mを保つ。
// 船体だけを手前で白く消すと、旗と兵が海の上へ浮いて見えてしまう。
function shipHaze(mat) {
  mat.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', `
      #ifdef USE_FOG
        float shipHaze = smoothstep(150.0, 360.0, length(vFogOff));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, shipHaze);
      #endif
    `);
  };
  mat.customProgramCacheKey = () => 'kizugawa-ship-haze-2';
  return mat;
}
function shipMats() {
  if (SHIPMAT) return SHIPMAT;
  const T = shipTex();
  SHIPMAT = {
    deck: new THREE.MeshStandardMaterial({ map: T.deck, bumpMap: T.deck, bumpScale: 0.012, roughness: 0.4, envMapIntensity: 0.45 }),
    iron: new THREE.MeshStandardMaterial({ map: T.plate, color: 0xb0aaa2, roughness: 0.55, metalness: 0.4, side: THREE.DoubleSide }),
    tate: new THREE.MeshStandardMaterial({ map: T.tate, color: 0xc0b8ae, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide }),
    board: new THREE.MeshStandardMaterial({ map: T.board, roughness: 0.92, side: THREE.DoubleSide }),
    hull: new THREE.MeshStandardMaterial({ map: T.hull, roughness: 0.8, side: THREE.DoubleSide }),
    rope: new THREE.MeshStandardMaterial({ color: 0x998365, roughness: 1 }),
    wood: new THREE.MeshStandardMaterial({ map: T.grain, bumpMap: T.grain, bumpScale: 0.01, color: 0xb8a68e, roughness: 0.9 }),
    dark: new THREE.MeshStandardMaterial({ map: T.grain, bumpMap: T.grain, bumpScale: 0.01, color: 0x8a7a66, roughness: 0.9 }),
    tile: new THREE.MeshStandardMaterial({ color: 0x514334, roughness: 0.95 }),
    plaster: new THREE.MeshStandardMaterial({ color: 0x897352, roughness: 0.95 }),
    black: new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 0.8 }),
    copper: new THREE.MeshStandardMaterial({ map: T.bronze, bumpMap: T.bronze, bumpScale: 0.006, color: 0xd8ccb8, roughness: 0.62, metalness: 0.45 }),
  };
  for (const mat of Object.values(SHIPMAT)) shipHaze(mat);
  return SHIPMAT;
}
// 大安宅船だけの鉄張り。鋲と狭間はキャンバスにまとめ、面の数を増やさない。
let IRONSHIP = null;
function ironShipMats() {
  if (IRONSHIP) return IRONSHIP;
  const make = (w, h, draw) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  };
  const armor = make(512, 256, (c, w, h) => {
    c.fillStyle = '#171513'; c.fillRect(0, 0, w, h);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 8; k++) {
      const x = k * 64, y = r * 64, v = 38 + (r * 7 + k * 3) % 9;
      c.fillStyle = `rgb(${v},${v},${v + 4})`; c.fillRect(x + 2, y + 2, 60, 60);
      c.strokeStyle = '#101316'; c.strokeRect(x + 3, y + 3, 58, 58);
      for (const a of [8, 24, 40, 56]) for (const edge of [8, 56]) {
        for (const [xx, yy] of [[x + a, y + edge], [x + edge, y + a]]) {
          c.fillStyle = '#0d1113'; c.beginPath(); c.arc(xx, yy + 1, 2.6, 0, Math.PI * 2); c.fill();
          c.fillStyle = '#697174'; c.beginPath(); c.arc(xx, yy, 1.8, 0, Math.PI * 2); c.fill();
        }
      }
    }
    // 鉄板の段の間に、船体の木の外板を一段ずつのぞかせる（手本の復元像は木の船体に鉄板。黒一色の箱に見えていた。10/29 採点）。張り分けは推定。
    for (const y of [64, 192]) {
      c.fillStyle = '#3f3022'; c.fillRect(0, y + 2, w, 60);
      for (let k = 0; k < 4; k++) {
        const v = 58 + (k * 9) % 14; c.fillStyle = `rgb(${v + 10},${v - 2},${v - 18})`; c.fillRect(0, y + 3 + k * 15, w, 13);
        c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(0, y + 16 + k * 15, w, 2);
        c.strokeStyle = 'rgba(150,112,72,.28)'; c.beginPath(); c.moveTo(0, y + 7 + k * 15); c.quadraticCurveTo(w / 2, y + 5 + k * 15 + k % 3, w, y + 8 + k * 15); c.stroke();
        for (let j = 0; j < 3; j++) { c.fillStyle = 'rgba(20,14,9,.5)'; c.fillRect((k * 151 + j * 173) % w, y + 3 + k * 15, 2, 13); }
      }
    }
    // 鉄の帯で板を押さえる。明るい木枠の格子にはしない。
    for (let x = 0; x < w; x += 128) {
      c.fillStyle = '#241e17'; c.fillRect(x, 0, 12, h);
      c.fillStyle = '#303034'; c.fillRect(x + 2, 0, 7, h);
      c.fillStyle = 'rgba(112,74,46,.3)'; c.fillRect(x + 2, 0, 2, h);
    }
    for (const y of [0, 84, 168, 248]) {
      c.fillStyle = '#241e17'; c.fillRect(0, y, w, 9);
      c.fillStyle = '#303034'; c.fillRect(0, y + 1, w, 6);
      c.fillStyle = 'rgba(112,74,46,.3)'; c.fillRect(0, y + 1, w, 1);
    }
    for (let k = 0; k < 24; k++) {
      const x = (k * 73) % w, y = (k * 41) % 220;
      c.fillStyle = 'rgba(108,65,32,.15)'; c.fillRect(x, y, 3, 12 + k % 15);
    }
    // 鋲の下の細い錆だれと、板ごとに残る煤。太い木枠を汚れで塗り潰さない。
    for (let r = 0; r < 4; r++) for (let k = 0; k < 8; k++) {
      const x = k * 64, y = r * 64;
      const soot = c.createLinearGradient(0, y + 6, 0, y + 56);
      soot.addColorStop(0, 'rgba(5,7,8,.25)'); soot.addColorStop(1, 'rgba(5,7,8,0)');
      c.fillStyle = soot; c.fillRect(x + 14, y + 6, 42, 50);
      for (const dx of [24, 40]) {
        const drip = c.createLinearGradient(0, y + 10, 0, y + 39);
        drip.addColorStop(0, 'rgba(129,77,39,.3)'); drip.addColorStop(1, 'rgba(129,77,39,0)');
        c.fillStyle = drip; c.fillRect(x + dx - 1, y + 10, 2, 22 + (r + k) % 8);
      }
      c.strokeStyle = 'rgba(142,133,108,.12)';
      c.beginPath(); c.moveTo(x + 16, y + 53); c.lineTo(x + 43 + k % 8, y + 51); c.stroke();
    }
    const wet = c.createLinearGradient(0, 150, 0, h);
    wet.addColorStop(0, 'rgba(6,16,20,0)'); wet.addColorStop(1, 'rgba(6,16,20,.65)');
    c.fillStyle = wet; c.fillRect(0, 150, w, h - 150);
  });
  const ports = make(256, 128, (c, w, h) => {
    c.drawImage(armor.image, 0, 0, w, h);
    for (let k = 0; k < 4; k++) {
      const x = k * 64 + 32;
      // 小さい矢狭間。縁の錆と暗い穴だけを残す。
      c.fillStyle = '#624334'; c.beginPath();
      if (k % 2) c.rect(x - 5, 51, 10, 17);
      else { c.moveTo(x, 49); c.lineTo(x + 7, 68); c.lineTo(x - 7, 68); c.closePath(); }
      c.fill(); c.fillStyle = '#050708'; c.beginPath();
      if (k % 2) c.rect(x - 3, 53, 6, 13);
      else { c.moveTo(x, 53); c.lineTo(x + 5, 66); c.lineTo(x - 5, 66); c.closePath(); }
      c.fill();
    }
  });
  // 黒褐色の板葺き。縦の継ぎ目と明るい押縁をキャンバスへまとめる。
  const roofBoards = make(256, 256, (c, w, h) => {
    c.fillStyle = '#302b24'; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) {
      c.fillStyle = x % 64 ? '#393126' : '#332d25'; c.fillRect(x + 1, 0, 29, h);
      c.fillStyle = '#1e1b17'; c.fillRect(x, 0, 2, h);
      c.fillStyle = '#796044'; c.fillRect(x + 3, 0, 3, h);
      c.fillStyle = 'rgba(160,125,78,.35)'; c.fillRect(x + 3, 0, 1, h);
      for (let y = 13; y < h; y += 39) {
        c.fillStyle = 'rgba(20,18,15,.3)'; c.fillRect(x + 10, y, 1, 25);
      }
      // 長い板の継ぎ足しと木目。押縁の間だけに描き、葺き下ろす方向を残す。
      const joint = 55 + (x * 13) % 145;
      c.fillStyle = 'rgba(12,11,9,.65)'; c.fillRect(x + 7, joint, 23, 2);
      c.fillStyle = 'rgba(144,119,82,.22)'; c.fillRect(x + 7, joint + 2, 23, 1);
      c.strokeStyle = 'rgba(162,143,111,.16)';
      for (let k = 0; k < 3; k++) {
        c.beginPath(); c.moveTo(x + 11 + k * 6, 0);
        c.bezierCurveTo(x + 8 + k * 6, 80, x + 15 + k * 6, 180, x + 11 + k * 6, h); c.stroke();
      }
      const faded = c.createLinearGradient(0, 0, 0, h);
      faded.addColorStop(0, 'rgba(155,140,115,.12)'); faded.addColorStop(0.55, 'rgba(155,140,115,.04)');
      faded.addColorStop(1, 'rgba(9,13,12,.25)');
      c.fillStyle = faded; c.fillRect(x + 7, 0, 23, h);
    }
  });
  // 天守の上層は横板の小屋と分け、煤けた縦板にする。
  const upperBoards = make(128, 128, (c, w, h) => {
    c.fillStyle = '#504333'; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      const v = (x * 7) % 19;
      c.fillStyle = `rgb(${74 + v},${61 + v},${45 + v})`; c.fillRect(x + 1, 0, 14, h);
      c.fillStyle = '#29251e'; c.fillRect(x, 0, 1, h);
      c.fillStyle = 'rgba(177,143,93,.2)'; c.fillRect(x + 2, 0, 1, h);
      for (let y = 7; y < h; y += 23) {
        c.fillStyle = 'rgba(25,22,17,.22)'; c.fillRect(x + 6 + y % 5, y, 1, 18);
      }
    }
  });
  // 総矢倉の外壁（一枚＝幅2m・高さ2m）：煤けた縦板の継ぎ目、腰の鉄板と鋲、梁の影、一間ごとの狭間。
  const cabinWall = make(256, 256, (c, w, h) => {
    c.fillStyle = '#2b241d'; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) {
      const v = (x * 11) % 17;
      c.fillStyle = `rgb(${92 + v},${76 + v},${56 + v})`; c.fillRect(x + 1, 0, 30, h);
      c.fillStyle = '#120f0c'; c.fillRect(x, 0, 2, h);
      c.fillStyle = 'rgba(196,164,118,.35)'; c.fillRect(x + 2, 0, 2, h);
      c.strokeStyle = 'rgba(18,14,10,.35)';
      for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(x + 8 + k * 8, 0); c.bezierCurveTo(x + 5 + k * 8, 90, x + 12 + k * 8, 170, x + 8 + k * 8, h); c.stroke(); }
      const joint = 30 + (x * 7) % 90;
      c.fillStyle = 'rgba(10,8,6,.7)'; c.fillRect(x + 2, joint, 29, 2);
    }
    // 腰の鉄板（下の三分の一）。板ごとに色を変え、鋲と錆だれを付ける。
    for (let k = 0; k < 4; k++) {
      const x = k * 64, y = 170, v = 58 + (k * 5) % 11;
      c.fillStyle = `rgb(${v},${v},${v + 3})`; c.fillRect(x + 2, y, 60, h - y - 2);
      c.strokeStyle = '#0b0d0e'; c.lineWidth = 2; c.strokeRect(x + 2, y, 60, h - y - 2); c.lineWidth = 1;
      for (let i = 0; i < 4; i++) for (const yy of [y + 6, h - 8]) {
        const xx = x + 9 + i * 15;
        c.fillStyle = '#0b0d0e'; c.beginPath(); c.arc(xx, yy + 1, 2.4, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#6f7677'; c.beginPath(); c.arc(xx, yy, 1.6, 0, Math.PI * 2); c.fill();
      }
      const drip = c.createLinearGradient(0, y + 8, 0, h);
      drip.addColorStop(0, 'rgba(126,74,36,.35)'); drip.addColorStop(1, 'rgba(126,74,36,0)');
      c.fillStyle = drip; c.fillRect(x + 20 + k % 3 * 9, y + 8, 3, 50);
    }
    // 鉄板の上の縁が落とす影と、上の梁の下の影。
    let sh = c.createLinearGradient(0, 150, 0, 172); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.5)');
    c.fillStyle = sh; c.fillRect(0, 150, w, 22);
    sh = c.createLinearGradient(0, 0, 0, 40); sh.addColorStop(0, 'rgba(0,0,0,.55)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = sh; c.fillRect(0, 0, w, 40);
    // 狭間：一間（約1m）ごとに、角の窓と三角の窓を交互に。白木の縁と暗い穴。
    for (let k = 0; k < 2; k++) {
      const x = k * 128 + 64, y = 108;
      c.fillStyle = '#8a6c4a'; c.beginPath();
      if (k) c.rect(x - 11, y - 18, 22, 34); else { c.moveTo(x, y - 20); c.lineTo(x + 15, y + 16); c.lineTo(x - 15, y + 16); c.closePath(); }
      c.fill(); c.fillStyle = '#040505'; c.beginPath();
      if (k) c.rect(x - 7, y - 14, 14, 26); else { c.moveTo(x, y - 14); c.lineTo(x + 10, y + 12); c.lineTo(x - 10, y + 12); c.closePath(); }
      c.fill();
      c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(x - 13, y + 17, 26, 6);
    }
  });
  const M = shipMats();
  IRONSHIP = { ...M,
    cabinWall: new THREE.MeshStandardMaterial({ map: cabinWall, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide }),
    hull: new THREE.MeshStandardMaterial({ map: armor, roughness: 0.66, metalness: 0.38, side: THREE.DoubleSide }),
    // 影の面でも鉄板の継ぎ目・鋲・狭間が読めるよう、同じ絵を弱く自ら光らせる（絵の読み出しは増やさない）。
    tate: new THREE.MeshStandardMaterial({ map: ports, emissiveMap: ports, emissive: 0x8a8a8a, roughness: 0.62, metalness: 0.3, side: THREE.DoubleSide }),
    tile: new THREE.MeshStandardMaterial({ map: roofBoards, roughness: 0.95 }),
    upperBoard: new THREE.MeshStandardMaterial({ map: upperBoards, roughness: 1, side: THREE.DoubleSide }),
    plaster: new THREE.MeshStandardMaterial({ map: shipTex().board, color: 0xbca483, roughness: 1 })
  };
  for (const mat of Object.values(IRONSHIP)) shipHaze(mat);
  return IRONSHIP;
}
// 竿側を原点に固定し、自由な端だけたわませる。遠い船も同じ小さな形を使う。
function shipFlagGeometry(w, h) {
  const geo = new THREE.PlaneGeometry(w, h, 3, 3), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + w / 2, y = p.getY(i), free = x / w;
    p.setXYZ(i, x, y - h * 0.035 * free * free, w * 0.18 * free * Math.sin(y / h * Math.PI * 2 + free * 2));
  }
  geo.computeVertexNormals();
  return geo;
}
// 船首と屋形の手前は九鬼の七曜、船尾は四つ連ねた織田木瓜。形と材質を全艘で共有する。
let SHIPFLAGS = null;
function addShipFlags(g, cx, z, y, halfWidth = 1.9, forwardZ = z, count = 5, self = false) {
  const R = rigParts(), D = R.dummy;
  if (!SHIPFLAGS) {
    const maps = [];
    for (let kind = 0; kind < 2; kind++) {
      const c = document.createElement('canvas'); c.width = 128; c.height = 256;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#292333'; ctx.fillRect(0, 0, 128, 256);
      for (let row = 0; row < (kind ? 4 : 1); row++) {
        ctx.save(); ctx.translate(64, kind ? 35 + row * 61 : 78);
        ctx.fillStyle = '#e3dfd3';
        if (!kind) {
          ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
          for (let i = 0; i < 6; i++) {
            const a = i * Math.PI / 3; ctx.beginPath(); ctx.arc(Math.cos(a) * 27, Math.sin(a) * 27, 9, 0, Math.PI * 2); ctx.fill();
          }
        } else {
          // 五つの窠と中央の唐花。書籍の絵を写さず、紋の輪郭を描く。
          for (const [radius, color] of [[19, '#e3dfd3'], [15, '#292333'], [12, '#e3dfd3']]) {
            ctx.fillStyle = color;
            for (let i = 0; i < 5; i++) {
              const a = i * Math.PI * 2 / 5 - Math.PI / 2;
              ctx.beginPath(); ctx.arc(Math.cos(a) * 9, Math.sin(a) * 9, radius * 0.62, 0, Math.PI * 2); ctx.fill();
            }
          }
          ctx.fillStyle = '#292333';
          for (let i = 0; i < 5; i++) {
            const a = i * Math.PI * 2 / 5;
            ctx.beginPath(); ctx.ellipse(Math.cos(a) * 5, Math.sin(a) * 5, 5, 2, a, 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.restore();
      }
      for (let x = 0; x < 128; x += 3) { ctx.fillStyle = 'rgba(230,220,199,.05)'; ctx.fillRect(x, 0, 1, 256); }
      const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; maps.push(map);
    }
    SHIPFLAGS = { geo: shipFlagGeometry(0.95, 2.6), mats: maps.map(map =>
      new THREE.MeshStandardMaterial({ map, roughness: 1, side: THREE.DoubleSide, transparent: true, depthWrite: false })) };
    // 船尾の狭い通路でも布で視界を塞がない。自船の既存の近距離処理が
    // 画素ごとに薄くし、遠い旗は元の濃さに戻す。二つの材質は全艘で共有する。
    for (const mat of SHIPFLAGS.mats) mat.userData.camNearSmooth = true;
  }
  // 欄干より内側に立つ旗竿は、欄干の高さで宙に止めず甲板まで通す。
  // 布の上辺を支える横木も同じ形・材質でまとめ、描く回数を増やさない。
  // 自船の旗竿は視点が通る舷の内側にある。舷の不透明材質へまとめず、
  // 布と同じ近距離の透かしを使う。全竿で材質を一つだけ共有する。
  if (self && !SHIPFLAGS.pole) {
    const mat = shipMats().dark.clone();
    mat.userData.camNearSmooth = true;
    mat.transparent = true; mat.depthWrite = false;
    SHIPFLAGS.pole = mat;
  }
  const poles = new THREE.InstancedMesh(R.pole, self ? SHIPFLAGS.pole : shipMats().dark, count * 2);
  const footY = DECK.y + 0.1, poleTop = y + 3.6;
  for (let j = 0; j < count; j++) {
    const i = count === 5 ? j : j * 2;
    // 五本目は屋形の前の左舷。四隅の旗だけにせず、軒と大筒の間へ置く。
    const x = cx + (i === 4 ? -0.8 : i % 2 ? 1 : -1) * halfWidth;
    const zz = i === 4 ? z + (forwardZ - z) * 0.38 : i < 2 ? forwardZ : z;
    D.position.set(x, (footY + poleTop) / 2, zz); D.rotation.set(0, 0, 0); D.scale.set(1, poleTop - footY, 1); D.updateMatrix(); poles.setMatrixAt(j * 2, D.matrix);
    D.position.set(x + 0.475 * Math.SQRT1_2, y + 3.5, zz - 0.475 * Math.SQRT1_2);
    D.rotation.set(0, Math.PI / 4, -Math.PI / 2); D.scale.set(0.65, 1.09, 0.65); D.updateMatrix(); poles.setMatrixAt(j * 2 + 1, D.matrix);
    const flag = new THREE.Mesh(SHIPFLAGS.geo, SHIPFLAGS.mats[i < 2 || i === 4 ? 0 : 1]);
    flag.position.set(x, y + 2.2, zz); flag.rotation.y = Math.PI / 4; g.add(flag);
  }
  g.add(poles);
}
// 舳先の大筒は姿だけ。操作する西舷の三門と任務の射界はそのまま。
function addBowGun(g, x, z, y, heading) {
  const gun = taihou(shipMats());
  const stand = new THREE.Mesh(rigParts().box, shipMats().dark);
  stand.scale.set(2.6, 0.65, 1.1); stand.position.set(0.3, -0.925, 0); gun.add(stand);
  // 台は水平に据え、筒と頬板だけを少し仰角にする。
  const axis = new THREE.Vector3(0, 0, 1), tilt = new THREE.Quaternion().setFromAxisAngle(axis, -0.16);
  for (const part of gun.children) if (part !== stand && part.position.y >= -0.3) {
    part.position.applyQuaternion(tilt);
    part.quaternion.premultiply(tilt);
  }
  compactShip(gun);
  gun.position.set(x, y, z); gun.rotation.y = heading; g.add(gun);
}
// 舷から張り出す船梁の木口。大船だけに並べ、低い毛利船と輪郭を分ける。
function addShipBeams(g, cx, hw, z0, z1, y, left = true, right = true) {
  const R = rigParts(), D = R.dummy, count = 12;
  const beams = new THREE.InstancedMesh(R.box, shipMats().wood, count * (Number(left) + Number(right)));
  let n = 0;
  for (const sd of [-1, 1]) if (sd < 0 ? left : right) for (let i = 0; i < count; i++) {
    D.position.set(cx + sd * (hw + 0.35), y, z0 + (z1 - z0) * i / (count - 1));
    D.rotation.set(0, 0, 0); D.scale.set(1.25, 0.3, 0.32); D.updateMatrix(); beams.setMatrixAt(n++, D.matrix);
  }
  beams.castShadow = beams.receiveShadow = true; g.add(beams);
}
// 自船だけに十個の備品。既存の箱形と木の材質を共有し、一回で描く。
// 縄・桶の丸みも少数の部品で作り、遠い供船には追加しない。
function addDeckStores(g, cx, hw, mastZ) {
  const R = rigParts(), parts = [];
  const timber = 0xb4a186, iron = 0x555964, rope = 0xd2bb91, water = 0x3c575b;
  const put = (x, y, z, sx, sy, sz, color, ry = 0, rz = 0) =>
    parts.push({ x: cx + x, y: DECK.y + .1 + y, z, sx, sy, sz, color, ry, rz });
  const ring = (x, y, z, radius, thick, color) => {
    for (let j = 0; j < 12; j++) {
      const a = j * Math.PI / 6;
      put(x + Math.cos(a) * radius, y, z + Math.sin(a) * radius,
        thick, thick, radius * .54, color, -a);
    }
  };
  for (const [x, z] of [[hw - .85, -9.5], [-.65, mastZ - .8]]) {
    for (const r of [.17, .26, .35]) ring(x, .05, z, r, .065, rope);
  }
  for (const [x, z] of [[-hw + .9, -11], [hw - .9, 10]]) {
    put(x, .08, z, .13, .13, 1.25, iron);
    put(x, .12, z + .22, .85, .12, .12, timber);
    for (const sd of [-1, 1]) {
      put(x + sd * .24, .08, z - .43, .58, .13, .12, iron, sd * .6);
      put(x + sd * .46, .08, z - .55, .22, .13, .26, iron, sd * .6);
    }
  }
  for (const [x, z] of [[hw - .75, -4.5], [.7, mastZ + .7]]) {
    put(x, .05, z, .5, .1, .5, timber);
    for (let j = 0; j < 8; j++) {
      const a = j * Math.PI / 4;
      put(x + Math.cos(a) * .27, .28, z + Math.sin(a) * .27, .09, .5, .23, timber, -a);
    }
    ring(x, .13, z, .28, .035, iron); ring(x, .43, z, .28, .035, iron);
    put(x, .38, z, .39, .025, .39, water);
  }
  for (const [x, z] of [[hw - .8, .5], [-hw + .85, 4.5]]) {
    put(x, .22, z, .65, .44, 1.15, timber);
    for (const dz of [-.4, .4]) put(x, .45, z + dz, .68, .045, .07, iron);
    for (let j = 0; j < 5; j++) {
      put(x - .22 + j * .11, .51, z, .025, .025, 1.35, rope);
      put(x - .22 + j * .11, .51, z + .58, .07, .045, .18, timber);
    }
  }
  for (const [x, z, tilt] of [[hw - .36, 3.2, -.18], [-hw + .36, -4.6, .18]]) {
    put(x, .6, z, .09, 1.2, .85, timber, 0, tilt);
    for (const y of [.25, .9]) put(x, y, z, .13, .09, .9, iron, 0, tilt);
  }
  const mesh = new THREE.InstancedMesh(R.box, shipMats().wood, parts.length), D = R.dummy;
  const color = new THREE.Color();
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]; D.position.set(p.x, p.y, p.z); D.rotation.set(0, p.ry, p.rz);
    D.scale.set(p.sx, p.sy, p.sz); D.updateMatrix(); mesh.setMatrixAt(i, D.matrix);
    mesh.setColorAt(i, color.setHex(p.color));
  }
  mesh.castShadow = mesh.receiveShadow = true; g.add(mesh);
}
// 本の木盾・竹束・縄掛けを船具へ応用した補完。自船の右舷だけに置く。
// 大筒の射界・接舷口・水桶・中央の甲板へは張り出さない。供船には細部を複製しない。
function addDeckBulwark(g, cx, hw) {
  const R = rigParts(), M = shipMats(), D = R.dummy;
  if (!R.wovenMat) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const c = canvas.getContext('2d');
    c.fillStyle = '#a39167'; c.fillRect(0, 0, 128, 128);
    // 藁の撚りと縦の経糸。下端ほど濡れて暗く、四隅の縄は絵に含める。
    for (let y = 0; y < 128; y += 3) {
      c.fillStyle = y % 9 ? '#b3a077' : '#88764f'; c.fillRect(0, y, 128, 1);
    }
    for (let x = 4; x < 128; x += 12) {
      c.fillStyle = '#6d6044'; c.fillRect(x, 0, 1, 128);
      c.fillStyle = '#c5b48d';
      for (let y = 0; y < 128; y += 12) c.fillRect(x, y, 2, 6);
    }
    const wet = c.createLinearGradient(0, 70, 0, 128);
    wet.addColorStop(0, 'rgba(37,34,24,0)'); wet.addColorStop(1, 'rgba(37,34,24,.48)');
    c.fillStyle = wet; c.fillRect(0, 70, 128, 58);
    c.strokeStyle = '#d0b98d'; c.lineWidth = 3;
    for (const x of [9, 119]) {
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 26); c.lineTo(x - 5, 32);
      c.moveTo(x, 26); c.lineTo(x + 5, 32); c.stroke();
    }
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    R.wovenMat = shipHaze(new THREE.MeshStandardMaterial({ map, roughness: 1, side: THREE.DoubleSide }));
    R.wovenGeo = new THREE.PlaneGeometry(1, 1, 4, 1);
    const p = R.wovenGeo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, .035 * Math.cos(p.getX(i) * Math.PI * 4));
    R.wovenGeo.computeVertexNormals();
  }
  const mats = new THREE.InstancedMesh(R.wovenGeo, R.wovenMat, 4);
  const bamboo = new THREE.InstancedMesh(R.pole, M.rope, 28);
  const ties = new THREE.InstancedMesh(R.sailTie, M.rope, 8);
  const color = new THREE.Color();
  for (let i = 0; i < 4; i++) {
    const z = -10 + i * 6;
    D.position.set(cx + hw - .17, DECK.y + .66, z);
    D.rotation.set(0, -Math.PI / 2, 0); D.scale.set(2.6, .95, 1);
    D.updateMatrix(); mats.setMatrixAt(i, D.matrix);
    // 七本の竹を束ね、切り口が分かる五角柱にする。幅は舷から半歩以内。
    for (let j = 0; j < 7; j++) {
      const a = j * Math.PI / 3;
      const dx = j === 6 ? 0 : Math.cos(a) * .12;
      const dz = j === 6 ? 0 : Math.sin(a) * .12;
      D.position.set(cx + hw - .38 + dx, DECK.y + .68, z + 1.7 + dz);
      D.rotation.set(0, j * .7, .045); D.scale.set(.84, 1.25 + (j % 3) * .06, .84);
      D.updateMatrix(); bamboo.setMatrixAt(i * 7 + j, D.matrix);
      bamboo.setColorAt(i * 7 + j, color.setHex(j % 2 ? 0xaaa17c : 0x8b9470));
    }
    for (let j = 0; j < 2; j++) {
      D.position.set(cx + hw - .38, DECK.y + .3 + j * .72, z + 1.7);
      D.rotation.set(Math.PI / 2, 0, 0); D.scale.set(.21, .21, .3);
      D.updateMatrix(); ties.setMatrixAt(i * 2 + j, D.matrix);
    }
  }
  mats.receiveShadow = bamboo.receiveShadow = ties.receiveShadow = true;
  g.add(mats, bamboo, ties);
}
// 冬の河口は背の低い枯れ葦。河道を避け、水際にだけ疎らに置く（岸の植生は推定）。
// 三枚の葉を一株にした形を共有。透過・影・風の更新を持たず、遠岸を一回で描く。
function addEstuaryReeds(scene) {
  const R = rigParts(), D = R.dummy;
  if (!R.reedGeo) {
    const v = [];
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3, x = Math.cos(a), z = Math.sin(a);
      v.push(-z * .09, 0, x * .09, z * .09, 0, -x * .09, x * .45, 1.1 + i * .2, z * .45);
    }
    R.reedGeo = new THREE.BufferGeometry();
    R.reedGeo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    R.reedGeo.computeVertexNormals();
    R.reedMat = shipHaze(new THREE.MeshStandardMaterial({ color: 0x968868, roughness: 1, side: THREE.DoubleSide }));
  }
  const reeds = new THREE.InstancedMesh(R.reedGeo, R.reedMat, 192);
  let n = 0;
  for (let i = 0; i < 192; i++) {
    const x = 222 + (i % 8) * 3.6 + Math.sin(i * 4.7) * 1.8;
    const z = -320 + Math.floor(i / 8) * 27 + Math.cos(i * 2.3) * 9;
    const y = height(x, z);
    if (y < .12 || y > 2.1) continue;
    D.position.set(x, y - .04, z); D.rotation.set(0, i * 2.4, 0);
    D.scale.setScalar(.65 + (i % 5) * .16); D.updateMatrix(); reeds.setMatrixAt(n++, D.matrix);
  }
  reeds.count = n; scene.add(reeds);
}
// 船梁から水際へ下りる太い肋材。箱形船腹の折れに沿わせ、艪とは直交する縦の並びにする。
function addHullRibs(g, cx, hw, z0, z1, top, bottom, left = true, right = true) {
  const R = rigParts(), D = R.dummy, count = 12;
  const ribs = new THREE.InstancedMesh(R.box, shipMats().dark, count * 2 * (Number(left) + Number(right)));
  const depth = top - bottom, ring = [[1, 0.22], [1, 0.55], [0.96, 0.78]];
  let n = 0;
  for (const sd of [-1, 1]) if (sd < 0 ? left : right) for (let i = 0; i < count; i++) {
    const z = z0 + (z1 - z0) * i / (count - 1);
    for (let j = 0; j < 2; j++) {
      const ax = cx + sd * (hw * ring[j][0] + 0.075), ay = top - depth * ring[j][1];
      const bx = cx + sd * (hw * ring[j + 1][0] + 0.075), by = top - depth * ring[j + 1][1];
      D.position.set((ax + bx) / 2, (ay + by) / 2, z);
      D.rotation.set(0, 0, Math.atan2(by - ay, bx - ax));
      D.scale.set(Math.hypot(bx - ax, by - ay) + 0.04, 0.18, 0.22);
      D.updateMatrix(); ribs.setMatrixAt(n++, D.matrix);
    }
  }
  ribs.castShadow = ribs.receiveShadow = true; g.add(ribs);
}
// 大筒を出す中央だけ垣立を低くし、筒口を前へ通す。
function bowGunWall(g, cx, z, halfWidth, y, h, M) {
  g.add(tateWall(cx - halfWidth, z, cx - 0.75, z, y, h, M),
    tateWall(cx + 0.75, z, cx + halfWidth, z, y, h, M));
  const sill = new THREE.Mesh(rigParts().box, M.wood);
  sill.scale.set(1.5, 0.55, 0.18); sill.position.set(cx, y + 0.275, z); g.add(sill);
}
// 櫓は一艘につき一つの描画。柄と水を押す平たい先を同じ形にまとめる。
let RIG = null;
function rigParts() {
  if (RIG) return RIG;
  const shaft = new THREE.BoxGeometry(0.055, 1, 0.055).toNonIndexed();
  const blade = new THREE.BoxGeometry(0.16, 0.28, 0.045).toNonIndexed(); blade.translate(0, -0.42, 0);
  const geo = new THREE.BufferGeometry();
  for (const key of ['position', 'normal', 'uv']) {
    const a = shaft.attributes[key], b = blade.attributes[key];
    const data = new Float32Array(a.array.length + b.array.length); data.set(a.array); data.set(b.array, a.array.length);
    geo.setAttribute(key, new THREE.BufferAttribute(data, a.itemSize));
  }
  shaft.dispose(); blade.dispose();
  const sail = new THREE.PlaneGeometry(1, 1, 8, 5);
  const a = sail.attributes.position;
  for (let i = 0; i < a.count; i++) a.setZ(i, 0.16 * Math.cos(a.getX(i) * Math.PI) * Math.cos(a.getY(i) * Math.PI));
  sail.computeVertexNormals();
  const cloth = shipHaze(new THREE.MeshStandardMaterial({ color: 0xd7c9a8, roughness: 1, side: THREE.DoubleSide }));
  // 帆布の縦の継ぎ目。外の素材を読まず小さな絵を共有する。
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#ded2b9'; ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#b5a88e'; for (let i = 0; i < 64; i += 8) ctx.fillRect(i, 0, 1, 64);
  cloth.map = new THREE.CanvasTexture(c); cloth.map.colorSpace = THREE.SRGBColorSpace;
  const fc = document.createElement('canvas'); fc.width = 32; fc.height = 128;
  const fg = fc.getContext('2d');
  // 輪郭のつながった白い帯ではなく、透ける小さな飛沫を散らす。
  for (let i = 0; i < 32; i++) {
    fg.fillStyle = `rgba(226,239,234,${0.18 + (i % 5) * 0.09})`;
    fg.beginPath(); fg.ellipse(7 + (i * 13 % 19), 3 + (i * 29 % 122), 0.8 + i % 3 * 0.45, 1.2 + i % 4 * 0.5, i * 0.7, 0, Math.PI * 2); fg.fill();
  }
  const foamMap = new THREE.CanvasTexture(fc); foamMap.colorSpace = THREE.SRGBColorSpace;
  const coilPoints = [];
  for (let i = 0; i <= 128; i++) {
    const a = i / 128 * Math.PI * 8, r = 0.055 + i / 128 * 0.32;
    coilPoints.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
  }
  const coil = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coilPoints), 128, 0.032, 8, false);
  RIG = { coil, coilShadow: new THREE.MeshBasicMaterial({ color: 0x241a10, transparent: true, opacity: 0.32, depthWrite: false }), oar: geo, sail, cloth,
    sailRoll: new THREE.CylinderGeometry(0.5, 0.5, 1, 8).rotateZ(Math.PI / 2), sailTie: new THREE.TorusGeometry(1, 0.09, 4, 8),
    box: new THREE.BoxGeometry(1, 1, 1), pole: new THREE.CylinderGeometry(0.06, 0.08, 1, 5), dummy: new THREE.Object3D(),
    foam: new THREE.PlaneGeometry(1, 1), foamMat: new THREE.MeshBasicMaterial({ map: foamMap, color: 0xc2d4d0, transparent: true, opacity: 0.26, depthWrite: false }) };
  return RIG;
}
function addOars(g, cx, hw, z0, z1, count, length, left = true, right = true, pivotY = 0.45, stern = 0) {
  const R = rigParts(), rows = [];
  for (let sd = -1; sd <= 1; sd += 2) if (sd < 0 ? left : right) for (let i = 0; i < count; i++) rows.push({ sd, z: z0 + (z1 - z0) * i / Math.max(1, count - 1) });
  const mesh = new THREE.InstancedMesh(R.oar, shipMats().wood, rows.length);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
  g.add(mesh); g.userData.rowing = { mesh, rows, cx, hw, length, pivotY, stern };
  animateRig(g, 0, true);
}
// 自船の柱だけ、目の近くと正面の数歩先では全体を薄くする。写真の視点でも効かせ、
// 画面の長方形で切り抜かない。柱ごとの材質は初めに一度だけ作って使い回す。
function nearShipPost(post, halfHeight) {
  const mat = post.material.clone();
  post.material = mat; post.userData.shipPostFade = true;
  mat.transparent = true; mat.userData.camNearSolid = true;
  post.onBeforeRender = (_renderer, _scene, camera) => {
    const e = post.matrixWorld.elements, p = camera.position;
    const dy = Math.max(0, Math.abs(p.y - e[13]) - Math.abs(e[5]) * halfHeight);
    let d = Math.hypot(p.x - e[12], dy, p.z - e[14]);
    // 近さだけでは、二、三歩先の柱が自分と敵を隠したまま残る。
    // 見ている線の四歩先まで測る。柱の外や背後の景色は元のまま。
    const v = camera.matrixWorld.elements, dx = e[12] - p.x, dz = e[14] - p.z;
    const horizontal = v[8] * v[8] + v[10] * v[10];
    const along = horizontal > 0.000001 ? Math.max(0, Math.min(4, -(dx * v[8] + dz * v[10]) / horizontal)) : 0;
    const viewY = p.y - v[9] * along;
    const viewDy = Math.max(0, Math.abs(viewY - e[13]) - Math.abs(e[5]) * halfHeight);
    d = Math.min(d, Math.hypot(dx + v[8] * along, viewDy, dz + v[10] * along));
    const k = Math.max(0, Math.min(1, (d - 0.35) / 0.9));
    mat.opacity = k * k * (3 - 2 * k); mat.depthWrite = k >= 1;
  };
  // 次の柱や影を描く時に、手前の柱の薄さを持ち越さない。
  post.onAfterRender = () => { mat.opacity = 1; mat.depthWrite = true; };
}
function addSail(g, z, width, height, y, furled = false, block = false) {
  const R = rigParts(), M = shipMats();
  const mast = new THREE.Mesh(R.pole, M.dark); mast.scale.y = y + height * 0.6; mast.position.set(0, mast.scale.y / 2, z); g.add(mast);
  if (block) nearShipPost(mast, 0.5);
  const yard = new THREE.Mesh(R.pole, M.wood); yard.scale.y = width + 0.7; yard.rotation.z = Math.PI / 2; yard.position.set(0, y + height / 2, z); g.add(yard);
  const cloth = new THREE.Mesh(furled ? R.sailRoll : R.sail, R.cloth);
  cloth.scale.set(width, furled ? 0.28 : height, furled ? 0.28 : width * 0.6);
  cloth.position.set(0, furled ? y + height / 2 - 0.18 : y, z); g.add(cloth);
  if (furled) {
    // 巻いた帆を横木へ縛る。四本の縄を一つにまとめ、他の船とも形を共有する。
    const ties = new THREE.InstancedMesh(R.sailTie, M.dark, 4), D = R.dummy;
    for (let i = 0; i < 4; i++) {
      D.position.set(width * (i / 3 - 0.5) * 0.8, cloth.position.y, z);
      D.rotation.set(0, Math.PI / 2, 0); D.scale.setScalar(0.15); D.updateMatrix(); ties.setMatrixAt(i, D.matrix);
    }
    g.add(ties);
  }
  g.userData.sail = cloth;
  if (block) for (const m of [mast, yard, cloth]) m.userData.camBlock = true;
}
function addWake(g, hw, length) {
  // 舟ごとの四枚を描かず、海の泡の一括描画へ寸法を渡す。
  g.userData.waterHull = { hw, length, x: g.position.x, z: g.position.z, ready: false };
}

// 船と海の霞を同じ距離にそろえる。陸戦の百四十メートルの白幕は使わない。
// 他の戦で使う元の材質は変えず、船用の複製を一度だけ作って共有する。
const SEA_HAZE_MATS = new WeakMap();
function shipSeaHaze(g) {
  const material = source => {
    if (source.userData.seaHaze) return source;
    let mat = SEA_HAZE_MATS.get(source);
    if (!mat) {
      mat = source.clone(); mat.userData.seaHaze = true;
      const compile = source.onBeforeCompile, key = source.customProgramCacheKey();
      mat.onBeforeCompile = function (shader, renderer) {
        compile.call(this, shader, renderer);
        shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', `
          #ifdef USE_FOG
            float seaHaze = smoothstep(150.0, 360.0, length(vFogOff));
            gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, seaHaze);
          #endif
        `);
      };
      mat.customProgramCacheKey = () => key + '-sea-haze';
      SEA_HAZE_MATS.set(source, mat);
    }
    return mat;
  };
  g.traverse(o => {
    if (o.isMesh && !o.userData.shipPostFade) o.material = Array.isArray(o.material) ? o.material.map(material) : material(o.material);
  });
  return g;
}

// 海は一枚のまま。空色の小さな環境絵は準備時だけ作り、反射用の場面は描かない。
function seaMaterial(rt) {
  const W = rt.world, faces = [];
  for (let i = 0; i < 6; i++) {
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, 16);
    grad.addColorStop(0, W.skyMat.uniforms.top.value.getStyle());
    grad.addColorStop(1, rt.scene.fog.color.getStyle()); g.fillStyle = grad; g.fillRect(0, 0, 16, 16); faces.push(c);
  }
  const env = new THREE.CubeTexture(faces); env.colorSpace = THREE.SRGBColorSpace; env.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({ map: shipTex().sea, roughness: 0.32, metalness: 0,
    envMap: env, envMapIntensity: 0.65 });
  const U = { waterTime: { value: 0 }, waterWind: { value: new THREE.Vector2(WIND_STATE.dirX, WIND_STATE.dirZ) } };
  rt.flags.waterU = U;
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = 'varying vec3 vWaterWorld;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = `uniform float waterTime; uniform vec2 waterWind; varying vec3 vWaterWorld;
      vec2 waterUV(vec2 p) { return vec2(dot(p, waterWind), dot(p, vec2(-waterWind.y, waterWind.x))); }
      ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      vec2 waterP = waterUV(vWaterWorld.xz);
      // 大きく緩い流れで模様をずらし、同じ白線が遠くまで整列するのを防ぐ。
      vec2 waterDrift = vec2(sin(waterP.y * 0.071 + waterP.x * 0.023),
        sin(waterP.x * 0.063 - waterP.y * 0.037)) * 2.8;
      vec2 fineUV = (waterP + waterDrift) * (80.0 / 2000.0) - vec2(waterTime * 0.009, waterTime * 0.002);
      vec2 broadUV = mat2(0.8, 0.6, -0.6, 0.8) * waterP * (23.0 / 2000.0) - vec2(waterTime * 0.004, -waterTime * 0.0015) + 0.37;
      vec4 fineWater = texture2D(map, fineUV), broadWater = texture2D(map, broadUV);
      diffuseColor *= mix(fineWater, broadWater, 0.32);
    `);
    // 小波の法線は画素で求める。遠い頂点を細分化せず、太陽の反射が細かくほどける。
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', `
      #include <normal_fragment_begin>
      // 二方向の等間隔の波だけでは、遠くまで畝のような反射が並ぶ。
      // 波の向きと間隔を崩し、細かい波は画素より小さくなる前に弱める。
      float swellPhase = waterP.x * 1.13 + waterP.y * 0.37 - waterTime * 1.3
        + sin(waterP.y * 0.31 + waterP.x * 0.19) * 2.3;
      float ripplePhase = waterP.y * 2.73 - waterP.x * 1.21 - waterTime * 1.9
        + sin(waterP.x * 0.57 + waterP.y * 0.23) * 1.7;
      float swell = cos(swellPhase) * 0.045 / (1.0 + fwidth(swellPhase) * 2.0);
      float ripple = cos(ripplePhase) * 0.028 / (1.0 + fwidth(ripplePhase) * 2.0);
      float crossWave = cos(waterP.x * 0.53 - waterP.y * 0.67 + waterTime * 0.8) * 0.022;
      vec2 slope = waterWind * (swell + ripple * 0.35 + crossWave)
        + vec2(-waterWind.y, waterWind.x) * (ripple - swell * 0.3 - crossWave * 0.6);
      normal = normalize(mat3(viewMatrix) * vec3(-slope.x, 1.0, -slope.y));
      // 風の筋：うねりの山に沿って切れ切れの白い筋と、風の当たる広い面の照り・凪いだ暗い面。
      // 遠くで画素より細くなる筋は fwidth で弱め、縞のちらつきにしない。
      float streakFade = 1.0 / (1.0 + fwidth(swellPhase) * 5.0);
      float breakUp = smoothstep(0.35, 0.95, sin(waterP.y * 0.19 + waterP.x * 0.043 + sin(waterP.x * 0.09) * 2.4));
      float crest = smoothstep(0.84, 0.98, cos(swellPhase)) * breakUp * streakFade;
      float slick = sin(waterP.x * 0.011 + waterP.y * 0.017 + sin(waterP.y * 0.006) * 3.0) * sin(waterP.y * 0.013 - waterP.x * 0.008);
      diffuseColor.rgb *= 0.9 + 0.2 * smoothstep(-0.6, 0.6, slick);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.85, 0.84), crest * 0.45);
    `);
    // 照り：風の当たる面だけ水面を滑らかにし、日の筋を細かく切って光らせる。
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
      #include <roughnessmap_fragment>
      float glint = sin(waterP.x * 0.011 + waterP.y * 0.017 + sin(waterP.y * 0.006) * 3.0) * sin(waterP.y * 0.013 - waterP.x * 0.008);
      roughnessFactor = mix(roughnessFactor * 1.25, roughnessFactor * 0.55, smoothstep(-0.4, 0.6, glint));
    `);
    // 船と同じ霧の式を使う。海だけ青く残して、沖の船を白い切り絵にしない。
    // 共通の霧は雲の時計と見通しを分けて読み、高さと日の向きもそろえる。
  };
  mat.customProgramCacheKey = () => 'kizugawa-water-6';
  const dispose = rt.dispose;
  rt.dispose = function () { env.dispose(); mat.dispose(); this.flags.sea.geometry.dispose(); this.flags.foam.dispose(); this.flags.foam.material.dispose(); dispose.call(this); };
  return mat;
}

// 舷の両側の細かな飛沫と、進んだ後ろの航跡。同じ一回の描画を使う。
function updateSeaFoam(rt, t) {
  const F = rt.flags, D = rigParts().dummy;
  let n = 0;
  for (const g of F.waterShips) {
    const h = g.userData.waterHull, x = g.position.x, z = g.position.z;
    const dx = h.ready ? x - h.x : 0, dz = h.ready ? z - h.z : 0, distance = Math.hypot(dx, dz);
    h.x = x; h.z = z; h.ready = true;
    if (!g.visible || g.position.y < -0.65 || Math.hypot(x - rt.camera.position.x, z - rt.camera.position.z) > 150) continue;
    const a = g.rotation.y, sn = Math.sin(a), cs = Math.cos(a), half = h.length * .5;
    for (let side = 0; side < 2; side++) {
      const pulse = S.reduceMotion ? 0 : Math.sin(t * 1.6 + side * 2 + x * .07) * .12;
      const lx = (side ? 1 : -1) * (h.hw + .18);
      D.position.set(x + lx * cs, .12 + pulse * .15, z - lx * sn);
      D.rotation.set(-Math.PI / 2, 0, a);
      D.scale.set(.45 + pulse, h.length * .82, 1);
      D.updateMatrix(); F.foam.setMatrixAt(n++, D.matrix);
    }
    if (distance > .015 && !S.reduceMotion) {
      const ux = dx / distance, uz = dz / distance, trail = Math.min(18, 5 + distance * 35);
      D.position.set(x - ux * (half + trail * .5), .32, z - uz * (half + trail * .5));
      D.rotation.set(-Math.PI / 2, 0, Math.atan2(ux, uz));
      D.scale.set(h.hw * .9, trail, 1); D.updateMatrix(); F.foam.setMatrixAt(n++, D.matrix);
    }
  }
  F.foam.count = n; F.foam.instanceMatrix.needsUpdate = true;
}
function animateRig(g, t, rowing) {
  const r = g.userData.rowing, R = rigParts(), D = R.dummy;
  if (r) {
    for (let i = 0; i < r.rows.length; i++) {
      const o = r.rows[i], beat = rowing ? Math.sin(t * 1.7 + o.z * 0.055) : 0;
      if (r.stern) {
        // 鉄甲船は上端を舷へ固定し、先を艫へ流して水中へ下ろす。船首の向きが逆でも同じ並び。
        const angle = 0.9 + beat * 0.06, sweep = r.stern * (0.22 + beat * 0.08), half = r.length * 0.5;
        D.rotation.set(0, -o.sd * sweep, o.sd * angle);
        D.position.set(r.cx + o.sd * (r.hw + half * Math.sin(angle) * Math.cos(sweep)),
          r.pivotY + 0.65 - half * Math.cos(angle), o.z + half * Math.sin(angle) * Math.sin(sweep));
      } else {
        D.position.set(r.cx + o.sd * (r.hw + r.length * 0.28), r.pivotY, o.z);
        D.rotation.set(beat * 0.2, o.sd * beat * 0.2, o.sd * (1.05 + beat * 0.08));
      }
      D.scale.set(r.length * 0.4, r.length, r.length * 0.4); D.updateMatrix(); r.mesh.setMatrixAt(i, D.matrix);
    }
    r.mesh.instanceMatrix.needsUpdate = true;
  }
  if (g.userData.sail) { g.userData.sail.rotation.y = 0.24 + Math.sin(t * 0.8 + g.position.x * 0.02) * 0.08; g.userData.sail.rotation.x = Math.sin(t * 1.1) * 0.025; }
  if (g.userData.wakes) for (const m of g.userData.wakes) m.visible = rowing;
}
function floatShip(g, t, rowing, heavy = false) {
  const phase = t + g.position.x * 0.03 + g.position.z * 0.025;
  g.position.y = (heavy ? 0.08 : 0.16) * Math.sin(phase);
  g.rotation.x = Math.sin(phase * 0.8) * (heavy ? 0.005 : 0.018);
  g.rotation.z = Math.sin(phase * 0.9 + 1) * (heavy ? 0.008 : 0.028);
  animateRig(g, t, rowing);
}

// 胴の形：長さ方向に輪切りを並べてつなぐ。zA＝舳先の尖り、zB＝艫、hw(z)＝その所の半幅、top(z)＝舷の上の高さ
function loftHull(zA, zB, hwAt, topAt, bottomY, n = 18, boxy = false) {
  const pos = [], uv = [], idx = [];
  const ring = boxy ? [[1, 0], [1, 0.55], [0.96, 0.78], [0.65, 1]] : [[1, 0], [0.97, 0.45], [0.82, 0.78], [0.55, 1]];   // [半幅の割, 上から下への割]
  const rows = [];
  for (let i = 0; i <= n; i++) {
    const z = zA + (zB - zA) * i / n, hw = hwAt(z), ty = topAt(z);
    const r = [];
    for (const sd of [-1, 1]) for (let k = 0; k < ring.length; k++) {
      const [fw, fy] = ring[k];
      r.push(pos.length / 3); pos.push(sd * hw * fw, ty + (bottomY - ty) * fy, z); uv.push(z / 2, (ty - (ty + (bottomY - ty) * fy)) / 1.0);
    }
    rows.push(r);
  }
  const K = ring.length;
  for (let i = 0; i < n; i++) {
    const a = rows[i], b = rows[i + 1];
    for (let k = 0; k < K - 1; k++) {
      // 左の舷（外向きに巻く）と右の舷
      idx.push(a[k], b[k], a[k + 1], b[k], b[k + 1], a[k + 1]);
      idx.push(a[K + k], a[K + k + 1], b[K + k], b[K + k], a[K + k + 1], b[K + k + 1]);
    }
    // 船底
    idx.push(a[K - 1], b[K - 1], a[2 * K - 1], b[K - 1], b[2 * K - 1], a[2 * K - 1]);
  }
  // 舳先の木口も閉じ、波の間から船体の内側が透けないようにする。
  const front = rows[0];
  for (let k = 0; k < K - 1; k++) idx.push(front[k], front[K + k], front[k + 1], front[K + k], front[K + k + 1], front[k + 1]);
  // 艫の板（平らな戸立て）
  const e = rows[n];
  for (let k = 0; k < K - 1; k++) idx.push(e[k], e[k + 1], e[K + k], e[K + k], e[k + 1], e[K + k + 1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// 船首・船尾は横幅で鉄板を割り付ける。側面と頂点を分け、端で鋲が縦線へ潰れるのを防ぐ。
function ironHullUV(source, topAt, bottomY) {
  const geo = source.toNonIndexed(); source.dispose();
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i += 3) {
    const end = Math.abs(p.getZ(i) - p.getZ(i + 1)) < 0.001 && Math.abs(p.getZ(i) - p.getZ(i + 2)) < 0.001;
    for (let k = i; k < i + 3; k++) {
      uv.setXY(k, (end ? p.getX(k) : p.getZ(k)) / 8, (p.getY(k) - bottomY) / (topAt(p.getZ(k)) - bottomY));
    }
  }
  return geo;
}
// 箱の面の uv を寸法（m）に合わせる。鉄板の絵（一枚 1m・横 4 枚・縦 2 枚）が大きな面で一枚に伸びず、
// 継ぎ目・鋲・狭間が一間ごとに並ぶ。準備時に一度だけ。
function plateBox(w, h, d, v0 = 0, v1 = h / 2) {
  return cabinWallUV(new THREE.BoxGeometry(w, h, d), v0, v1, 4, 2);
}

// 楯板の一枚（a→b の線に沿って、高さ h）。狭間の絵が 1m ごとに並ぶよう uv を長さに合わせる
function tateWall(ax, az, bx, bz, y0, h, M) {
  const L = Math.hypot(bx - ax, bz - az);
  const g = new THREE.PlaneGeometry(L, h);
  const uvs = g.attributes.uv; for (let i = 0; i < uvs.count; i++) uvs.setX(i, uvs.getX(i) * L / 4);
  const m = new THREE.Mesh(g, M.tate);
  m.position.set((ax + bx) / 2, y0 + h / 2, (az + bz) / 2);
  m.rotation.y = Math.atan2(bx - ax, bz - az) - Math.PI / 2;
  const wall = new THREE.Group(); wall.add(m);
  const R = rigParts(), cap = new THREE.Mesh(R.box, M === IRONSHIP ? M.black : M.wood);
  cap.scale.set(L, 0.12, 0.18); cap.position.set(m.position.x, y0 + h, m.position.z); cap.rotation.y = m.rotation.y; wall.add(cap);
  const count = Math.ceil(L / 1.5), posts = new THREE.InstancedMesh(R.box, M.wood, count + 1), D = R.dummy;
  for (let i = 0; i <= count; i++) {
    D.position.set(ax + (bx - ax) * i / count, y0 + h / 2, az + (bz - az) * i / count);
    D.rotation.set(0, 0, 0); D.scale.set(0.1, h, 0.1); D.updateMatrix(); posts.setMatrixAt(i, D.matrix);
  }
  // 船縁の細い綱。柱と同じ高さに張り、兵の足元を横切らせない。
  const rope = new THREE.Mesh(R.pole, M.rope); rope.scale.set(0.45, L, 0.45);
  rope.position.set(m.position.x, y0 + h - 0.18, m.position.z);
  rope.rotation.set(Math.PI / 2, 0, -Math.atan2(bx - ax, bz - az));
  wall.add(posts, rope); return wall;
}
// 屋根。「高」の鉄甲船は板葺き、上層は切妻。軒の四隅は少し反らせる。
const SHIP_ROOFS = new Map();
function hipRoof(w, d, h, M, gabled = false) {
  const g = new THREE.Group();
  const iron = true && M === IRONSHIP;
  let body;
  if (iron) {
    // 上辺を狭めて長い棟を通す。切妻は棟を妻側の端まで延ばす。
    const key = `${w}/${d}/${h}/${gabled}`;
    let roof = SHIP_ROOFS.get(key);
    if (!roof) {
      roof = new THREE.BoxGeometry(w, h, d);
      const p = roof.attributes.position, uv = roof.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) > 0) { p.setX(i, Math.sign(p.getX(i)) * 0.1); p.setZ(i, Math.sign(p.getZ(i)) * d * (gabled ? 0.5 : 0.22)); }
        // 押縁は棟と平行にせず、棟から軒へ下ろす。幅八十センチほどごとに並べる。
        uv.setXY(i, p.getZ(i) / 6.4, (p.getX(i) + w / 2) / w);
      }
      roof.computeVertexNormals(); SHIP_ROOFS.set(key, roof);
    }
    body = new THREE.Mesh(roof, M.tile);
  } else {
    body = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.72, h, 4, 1), M.tile);
    body.rotation.y = Math.PI / 4; body.scale.set(w, 1, d);
  }
  body.position.y = h / 2; g.add(body);
  if (iron) {
    // 板葺きの押縁は棟から軒へ下がり、先だけ起きる。共有する箱を一度に描く。
    // 既存の屋根面より少し上へ載せ、遠い供船も同じ形を使う。
    const R = rigParts(), D = R.dummy, count = Math.max(2, Math.floor(d / 0.8));
    const ribs = new THREE.InstancedMesh(R.box, M.wood, (count + 1) * 6);
    let n = 0;
    for (let i = 0; i <= count; i++) {
      const z = -d / 2 + 0.12 + (d - 0.24) * i / count;
      // 寄棟の端は妻側の斜面に合わせて高さを落とす。
      const peak = gabled ? h : h * Math.min(1, (d / 2 - Math.abs(z)) / (d * 0.28));
      for (const sd of [-1, 1]) for (let j = 0; j < 3; j++) {
        const a = j / 3, b = (j + 1) / 3;
        const ax = sd * w / 2 * a, bx = sd * w / 2 * b;
        const ay = Math.min(peak, h * (1 - a)) + 0.045 + 0.14 * a ** 6;
        const by = Math.min(peak, h * (1 - b)) + 0.045 + 0.14 * b ** 6;
        D.position.set((ax + bx) / 2, (ay + by) / 2, z);
        D.rotation.set(0, 0, Math.atan2(by - ay, bx - ax));
        D.scale.set(Math.hypot(bx - ax, by - ay) + 0.025, 0.07, 0.075);
        D.updateMatrix(); ribs.setMatrixAt(n++, D.matrix);
      }
    }
    ribs.castShadow = ribs.receiveShadow = true; g.add(ribs);
  }
  if (iron && gabled) {
    const key = `妻/${w}/${h}`;
    let face = SHIP_ROOFS.get(key);
    if (!face) {
      face = new THREE.PlaneGeometry(w * 0.94, h * 0.94);
      const p = face.attributes.position, uv = face.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) > 0) p.setX(i, 0);
        uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
      }
      face.computeVertexNormals(); SHIP_ROOFS.set(key, face);
    }
    const R = rigParts();
    for (const sz of [-1, 1]) {
      const panel = new THREE.Mesh(face, M.upperBoard);
      panel.position.set(0, h / 2, sz * (d / 2 + 0.012)); panel.rotation.y = sz < 0 ? Math.PI : 0; g.add(panel);
      for (const sx of [-1, 1]) {
        const barge = new THREE.Mesh(R.box, M.wood);
        barge.scale.set(Math.hypot(w / 2, h), 0.14, 0.18);
        barge.position.set(sx * w / 4, h / 2, sz * (d / 2 + 0.08));
        barge.rotation.z = -sx * Math.atan2(h, w / 2); g.add(barge);
      }
      const post = new THREE.Mesh(R.box, M.wood);
      post.scale.set(0.16, h * 0.86, 0.14); post.position.set(0, h * 0.43, sz * (d / 2 + 0.04)); g.add(post);
      const tie = new THREE.Mesh(R.box, M.wood);
      tie.scale.set(w * 0.94, 0.16, 0.3); tie.position.set(0, h * 0.13, sz * (d / 2 + 0.09)); g.add(tie);
      for (const sx of [-1, 1]) {
        const stud = new THREE.Mesh(R.box, M.wood);
        stud.scale.set(0.12, h * 0.42, 0.18); stud.position.set(sx * w * 0.23, h * 0.33, sz * (d / 2 + 0.05)); g.add(stud);
        const end = new THREE.Mesh(R.box, M.wood);
        end.scale.set(0.28, 0.2, 0.45); end.position.set(sx * w * 0.23, h * 0.13, sz * (d / 2 + 0.24)); g.add(end);
      }
    }
  }
  const eave = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 0.12, d * 1.02), M.dark); eave.position.y = 0.02; g.add(eave);
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(iron ? 0.28 : Math.max(0.2, (w - d) * 0.5 + 0.3), 0.18, iron ? d * (gabled ? 1.02 : 0.48) : 0.22), iron ? M.tile : M.plaster); ridge.position.y = h + 0.02; g.add(ridge);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.12), M.dark); c.position.set(sx * w * 0.5, 0.12, sz * d * 0.5); c.rotation.y = sx * sz * Math.PI / 4; c.rotation.z = sx * 0.35; g.add(c); }
  return g;
}

// 近くで見る屋形の柱・板目・窓格子・軒。箱の形と材質を共有し、準備時にまとめて描く。
function cabinDetails(g, cx, cz, w, d, y, h, front = true, boards = true) {
  const R = rigParts(), M = shipMats(), timber = [], seams = [], panes = [];
  const part = (list, x, yy, z, sx, sy, sz) => list.push([x, yy, z, sx, sy, sz]);
  for (const sd of [-1, 1]) {
    const x = cx + sd * (w / 2 + 0.04), z = cz + sd * (d / 2 + 0.04);
    for (const q of [-1, 1]) part(timber, x, y + h / 2, cz + q * (d / 2 - 0.12), 0.18, h, 0.18);
    for (const yy of [y + 0.12, y + h - 0.12]) {
      part(timber, x, yy, cz, 0.16, 0.16, d + 0.3);
      if (front) part(timber, cx, yy, z, w + 0.3, 0.16, 0.16);
    }
    // 屋根を支える軒桁と短い垂木。歩く通り道には張り出さない。
    part(timber, x, y + h, cz, 0.22, 0.18, d + 0.6);
    if (front) part(timber, cx, y + h, z, w + 0.6, 0.18, 0.22);
    for (let zz = -d / 2 + 0.3; zz < d / 2; zz += 0.7) part(timber, x, y + h - 0.08, cz + zz, 0.6, 0.1, 0.09);
    if (boards) for (let yy = 0.3; yy < h - 0.2; yy += 0.28) {
      part(seams, x, y + yy, cz, 0.025, 0.025, d - 0.25);
      if (front) part(seams, cx, y + yy, z, w - 0.25, 0.025, 0.025);
    }
    if (front && !boards) {
      // 上層は大きな格子窓ではなく、縦板の柱間に細い暗い窓を一つずつ開ける。
      for (const side of [true, false]) {
        const span = side ? d : w, bays = Math.max(2, Math.floor(span / 1.5));
        for (let i = 0; i < bays; i++) {
          const q = -span / 2 + (i + 0.5) * span / bays;
          const px = side ? x : cx + q, pz = side ? cz + q : z;
          part(panes, px, y + h * 0.58, pz, side ? 0.065 : 0.24, h * 0.38, side ? 0.24 : 0.065);
          const post = -span / 2 + (i + 1) * span / bays;
          part(timber, side ? x : cx + post, y + h / 2, side ? cz + post : z, 0.14, h, 0.14);
        }
      }
      continue;
    }
    const wy = y + h * 0.66, wh = Math.min(0.6, h * 0.34), ww = Math.min(1.8, d * 0.4);
    part(panes, x, wy, cz, 0.06, wh, ww);
    for (const q of [-1, 0, 1]) part(timber, x + sd * 0.06, wy + q * wh / 2, cz, 0.09, 0.06, ww + 0.12);
    for (let i = 0; i <= 6; i++) part(timber, x + sd * 0.06, wy, cz - ww / 2 + ww * i / 6, 0.09, wh + 0.1, 0.045);
    if (front) {
      const fw = Math.min(1.5, w * 0.45);
      part(panes, cx, wy, z, fw, wh, 0.06);
      for (const q of [-1, 0, 1]) part(timber, cx, wy + q * wh / 2, z + sd * 0.06, fw + 0.12, 0.06, 0.09);
      for (let i = 0; i <= 6; i++) part(timber, cx - fw / 2 + fw * i / 6, wy, z + sd * 0.06, 0.045, wh + 0.1, 0.09);
    }
  }
  for (const [parts, mat] of [[timber, M.wood], [seams, M.dark], [panes, M.black]]) {
    if (!parts.length) continue;
    const mesh = new THREE.InstancedMesh(R.box, mat, parts.length), D = R.dummy;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]; D.position.set(p[0], p[1], p[2]); D.rotation.set(0, 0, 0); D.scale.set(p[3], p[4], p[5]); D.updateMatrix(); mesh.setMatrixAt(i, D.matrix);
    }
    mesh.castShadow = mesh.receiveShadow = true; g.add(mesh);
  }
}

// 総矢倉の外壁の uv を寸法に合わせる（横は tileW メートルで一枚、縦は v0→v1）。準備時だけ書き換える。
function cabinWallUV(geo, v0 = 0, v1 = 1, tileW = 2, tileD = tileW) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  geo.computeBoundingBox();
  const b = geo.boundingBox, hy = b.max.y - b.min.y || 1;
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    if (ny > 0.5) uv.setXY(i, p.getX(i) / tileW, p.getZ(i) / tileD);
    else uv.setXY(i, (nx > 0.5 ? p.getZ(i) : p.getX(i)) / tileW, v0 + (v1 - v0) * (p.getY(i) - b.min.y) / hy);
  }
  uv.needsUpdate = true;
  return geo;
}

// 鉄甲船の船体。castle：true の船（プレイヤーの乗る中央の船）だけ、矢倉を一段上げて床（floors.js）を張り、
// 梯子で上がれる「小さな城」にする（甲板・上甲板・矢倉・階段）。outL・outR：左右の舷に楯板と櫂を付ける
// 西の舷で沖の船団を肩越しに見る視点の置き場（本人から：内へ一歩半・舳先へ一歩半。向きは南西の沖）
const KZ_SEA_BACK = { x: 1.34, z: -1.34 };
const YAG_Y = DECK.y + 1.6;   // 矢倉（上甲板）の床の高さ
function hull(W, cx, z0, z1, w, castle, outL = true, outR = true) {
  const high = true, M = ironShipMats();
  const g = new THREE.Group();
  g.userData.noFreeze = true;
  const hw0 = w / 2;
  // 舳先（-z）は六メートルで細る。「高」は幅を残し、舷を水平にして箱形を強める。
  const hwAt = (z) => hw0 * (z < z0 ? (high ? 0.55 : 0.18) + (high ? 0.45 : 0.82) * Math.sqrt(Math.max(0, (z - (z0 - 6)) / 6)) : z > z1 - 3 ? 1 - (z - (z1 - 3)) * 0.04 : 1);
  const topAt = (z) => DECK.y + 0.25 + (!high && z < z0 ? 1.4 * ((z0 - z) / 6) ** 2 : 0);
  const body = new THREE.Mesh(loftHull(z0 - 6, z1, hwAt, topAt, -2.6, 22, high), M.hull);
  const hp = body.geometry.attributes.position, hu = body.geometry.attributes.uv;
  if (high) body.geometry = ironHullUV(body.geometry, topAt, -2.6);
  else for (let i = 0; i < hp.count; i++) hu.setY(i, 1 - hu.getY(i) / (topAt(hp.getZ(i)) + 2.6));
  body.position.x = cx; g.add(body);
  // 舷の上の楯板（狭間の並ぶ鉄張りの垣立）：外の舷と、舳先・艫の端。大筒の所は筒口のぶん空ける
  const TH = 1.25;
  const gaps = (zA, zB) => {
    if (!outL) return [[zA, zB]];
    const out = []; let s = zA;
    for (const c of CANNONS) { if (c.z - 1.1 > s && c.z - 1.1 < zB) { out.push([s, c.z - 1.1]); s = c.z + 1.1; } }
    out.push([s, zB]); return out;
  };
  if (outL) for (const [a, b] of gaps(z0 + 1, z1)) g.add(tateWall(cx - hw0 + 0.05, a, cx - hw0 + 0.05, b, DECK.y, TH, M));
  if (outR) g.add(tateWall(cx + hw0 - 0.05, z1, cx + hw0 - 0.05, z0 + 1, DECK.y, TH, M));
  if (castle) {
    // 乗り移る所は見た目も開け、屋形の脇の通り道へそろえる。
    g.add(tateWall(cx - hw0 + 0.1, z1 - 0.05, cx + SOUTH_X - 1.1, z1 - 0.05, DECK.y, TH, M),
      tateWall(cx + SOUTH_X + 1.1, z1 - 0.05, cx + hw0 - 0.1, z1 - 0.05, DECK.y, TH, M));
  } else g.add(tateWall(cx - hw0 + 0.1, z1 - 0.05, cx + hw0 - 0.1, z1 - 0.05, DECK.y, TH, M));
  // 舳先の楯板（尖りに沿って二枚）と、舳先の水押（みよし）の太い木
  const bowHalf = high ? hwAt(z0 - 5.4) : 0;
  g.add(tateWall(cx - hwAt(z0 + 1), z0 + 1, cx - bowHalf, z0 - 5.4, topAt(z0 + 1) - 0.25, TH, M), tateWall(cx + bowHalf, z0 - 5.4, cx + hwAt(z0 + 1), z0 + 1, topAt(z0 + 1) - 0.25, TH, M));
  if (high) bowGunWall(g, cx, z0 - 5.4, bowHalf, DECK.y, TH, M);
  { const st = new THREE.Mesh(new THREE.BoxGeometry(0.45, 4.4, 0.6), M.dark); st.position.set(cx, topAt(z0 - 6) - 1.6, z0 - 6.1); st.rotation.x = 0.35; g.add(st); }
  // 甲板の板（船の床）と継ぎ目
  const deck = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, 0.3, z1 - z0 - 0.4), M.deck);
  deck.position.set(cx, DECK.y - 0.05, (z0 + z1) / 2); g.add(deck);
  const deckUV = (geo, offsetX, offsetZ) => {
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i,
      (pos.getX(i) + offsetX - cx) / (w - .4) + .5,
      1 - (pos.getZ(i) + offsetZ - z0 + 5.4) / (z1 - z0 + 5.4));
  };
  deckUV(deck.geometry, cx, (z0 + z1) / 2);
  // 四角い甲板の先も、舳先の楯板まで板で塞ぐ。船体の上面は元の形では開いている。
  const bowG = new THREE.BufferGeometry(), bowW = hw0 - 0.2;
  bowG.setAttribute('position', new THREE.Float32BufferAttribute([
    cx - bowW, DECK.y + 0.1, z0 + 0.2,
    cx + bowW, DECK.y + 0.1, z0 + 0.2,
    cx + bowHalf, DECK.y + 0.1, z0 - 5.4,
    cx - bowHalf, DECK.y + 0.1, z0 - 5.4,
  ], 3));
  bowG.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, high ? 0.75 : 0.5, 0.75, 0.25, 0.75], 2));
  bowG.setIndex(high ? [0, 1, 2, 0, 2, 3] : [0, 1, 2]); bowG.computeVertexNormals();
  deckUV(bowG, 0, 0);
  g.add(new THREE.Mesh(bowG, M.deck));
  // 継ぎ目は板目の絵にまとめる。太い十本の縞を重ねない。
  // 丸い縄を四周に巻く。板の上面は DECK.y + 0.1。低画質でも接地の影を残す。
  { const R = rigParts(), D = R.dummy;
    // 消火用の四つの桶は口を開け、水面を縁より下へ置く。同じ形を使い回す。
    if (!R.bucket) {
      R.bucket = new THREE.LatheGeometry([[0, -.35], [.3, -.35], [.34, .35], [.29, .35], [.26, -.28], [0, -.28]]
        .map(([r, y]) => new THREE.Vector2(r, y)), 12);
      R.bucketBand = new THREE.TorusGeometry(1, .045, 4, 12).rotateX(Math.PI / 2);
      R.bucketWater = new THREE.CircleGeometry(.28, 12).rotateX(-Math.PI / 2);
      R.bucketWaterMat = new THREE.MeshStandardMaterial({ color: 0x3c575b, roughness: .3 });
    }
    const buckets = new THREE.InstancedMesh(R.bucket, M.board, 4);
    const bands = new THREE.InstancedMesh(R.bucketBand, M.rope, 8);
    const water = new THREE.InstancedMesh(R.bucketWater, R.bucketWaterMat, 4);
    buckets.castShadow = buckets.receiveShadow = bands.castShadow = true;
    for (let i = 0; i < 4; i++) {
      const sd = i % 2 ? 1 : -1, zz = WATER[i].z;
      const x = cx + WATER[i].x;
      D.position.set(x, DECK.y + .4, zz); D.rotation.set(0, 0, 0); D.scale.set(1, 1, 1);
      D.updateMatrix(); buckets.setMatrixAt(i, D.matrix);
      for (let j = 0; j < 2; j++) {
        D.position.y = DECK.y + .2 + j * .4; D.scale.setScalar(.31 + j * .023);
        D.updateMatrix(); bands.setMatrixAt(i * 2 + j, D.matrix);
      }
      D.position.y = DECK.y + .55; D.scale.set(1, 1, 1);
      D.updateMatrix(); water.setMatrixAt(i, D.matrix);
      const rope = new THREE.Mesh(R.coil, M.rope);
      rope.position.set(cx + sd * (hw0 - 0.65), DECK.y + 0.138, zz + 1.1); rope.castShadow = rope.receiveShadow = true;
      const shadow = new THREE.Mesh(R.coil, R.coilShadow); shadow.scale.set(1.12, 0.04, 1.12);
      shadow.position.set(rope.position.x, DECK.y + 0.103, rope.position.z); g.add(shadow, rope);
    }
    g.add(buckets, bands, water);
  }
  if (high && castle) addDeckStores(g, cx, hw0, z0 + 11);
  addOars(g, cx, hw0, z0 + 6, z1 - 4, high ? 22 : 14, 7, outL, outR, high ? 1.55 : 0.45, high ? 1 : 0);
  addShipBeams(g, cx, hw0, z0 + 2, z1 - 2, DECK.y - 1.1, outL, outR);
  addHullRibs(g, cx, hw0, z0 + 2, z1 - 3, topAt(z0), -2.6, outL, outR);
  // 戦う時は帆を巻き上げ、甲板と大筒の射界を空ける。
  addSail(g, z0 + 11, w * 0.48, 7, 9, true, castle);
  if (castle) {
    const cabinStart = g.children.length;
    // 矢倉（一段上がった上甲板。床柱を四隅に立てて持ち上げる＝階下から見上げる形）
    const yagW = w * 0.45, yagL = 7, yz = z1 - 4;
    const postH = YAG_Y - DECK.y;
    // 床下の柱は共通の室内の柱へつなぎ、近接表示で視界を空ける。
    // 板壁・床とは材質を分け、形は四本で共有する。
    const postGeo = new THREE.BoxGeometry(0.3, postH, 0.3);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, M.dark);
      post.position.set(cx + sx * (yagW / 2 - 0.2), DECK.y + postH / 2, yz + sz * (yagL / 2 - 0.2)); g.add(post);
      nearShipPost(post, postH / 2);
    }
    // 床下の囲い（板張り）と床
    for (const sd of [-1, 1]) { const sk = new THREE.Mesh(new THREE.BoxGeometry(0.12, postH, yagL), M.board); sk.position.set(cx + sd * (yagW / 2 - 0.1), DECK.y + postH / 2, yz); g.add(sk); }
    cabinDetails(g, cx, yz, yagW, yagL, DECK.y, postH, false);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(yagW + 0.4, 0.25, yagL + 0.4), M.wood);
    floor.position.set(cx, YAG_Y - 0.125, yz); g.add(floor);
    // 自船の屋形は出入りできる部屋にする。間取りは推定で、入口の板間と畳の控えを分ける。
    // 外壁・柱・長押・竿縁天井と引き戸は共通の室内に任せ、窓の黒い板や楯を重ねない。
    const inside = addInterior(W, { name: '九鬼船の屋形', kind: 'shisha', profile: 'kizugawa', x: cx, z: yz,
      levels: [{ y: YAG_Y, w: yagW, d: yagL, h: 2.6 }],
      door: { side: -1, lx: 0, w: 1.8, h: 2.2 }, team: 0 });
    // 一重目の屋根（柱の上。四方へ葺き下ろす板屋根）
    const r1 = hipRoof(yagW + 1.6, yagL + 1.6, 1.3, M); r1.position.set(cx, YAG_Y + 2.6, yz); g.add(r1);
    // 二重目：望楼と黒い腰板。「高」は木の壁と切妻の板葺き屋根。
    // 復元像の上層は細い望楼ではなく、下層の大半を覆う長い屋形。
    // 本の大安宅船（cg/ataka1）：鉄板の総矢倉が同じ幅のまま三層に重なり、その上に切妻の望楼が載る。
    // 二・三層目は下と同じ幅の狭間の箱にし、望楼だけを細い板壁と切妻屋根で据える（見た目だけ。床・当たりは今まで通り）。
    const tier = new THREE.Mesh(plateBox(yagW + 0.3, 3.0, yagL + 0.3), M.tate);
    tier.position.set(cx, YAG_Y + 3.35 + 1.5, yz); g.add(tier);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(yagW + 0.5, 0.14, yagL + 0.5), M.wood);
    cap.position.set(cx, YAG_Y + 6.42, yz); g.add(cap);
    const bw = yagW * 0.55, bd = yagL * 0.45, by = YAG_Y + 6.5;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(bw, 1.7, bd), M.upperBoard); wall.position.set(cx, by + 0.85, yz); g.add(wall);
    cabinDetails(g, cx, yz, bw, bd, by, 1.7, true, false);
    const r2 = hipRoof(bw + 1.3, bd + 1.3, 1.4, M, true); r2.position.set(cx, by + 1.75, yz); g.add(r2);
    // 大筒から西を向くと視点は屋形側へ下がる。壁・柱・床・屋根を既存の遮り判定へ
    // 登録し、追従や揺れの後も壁の手前で止める。準備時だけ行い、舷や船体は含めない。
    // 屋形は壁の手前で視点を止め、板を透かさない。近距離の透かしを重ねると
    // 梁越しに奥の壁が浮き、床が四角く抜けて見える。材質は準備時だけ分けて使い回す。
    // 本の大安宅船（cg/ataka1・2）の総矢倉は、白い壁でなく鉄板を鋲で留めた黒い箱に狭間が並ぶ。
    // 戸口の面は出入りのため従来の壁のまま残し、左右と奥の三面だけ外から狭間の板で包む（見た目だけ。当たりは室内の壁）。
    for (const sd of [-1, 1]) {
      const side = new THREE.Mesh(plateBox(0.06, 2.6, yagL + 0.24), M.tate);
      side.position.set(cx + sd * (yagW / 2 + 0.12), YAG_Y + 1.3, yz); g.add(side);
    }
    const back = new THREE.Mesh(plateBox(yagW + 0.3, 2.6, 0.06), M.tate);
    back.position.set(cx, YAG_Y + 1.3, yz + yagL / 2 + 0.12); g.add(back);
    // 戸口の面も、戸（幅1.8m・高さ2.2m）の左右と上だけを包む。出入りの幅と高さは保つ。
    const frontZ = yz - yagL / 2 - 0.12, sideW = (yagW + 0.3 - 1.9) / 2;
    for (const sd of [-1, 1]) {
      const f = new THREE.Mesh(plateBox(sideW, 2.6, 0.06), M.tate);
      f.position.set(cx + sd * (0.95 + sideW / 2), YAG_Y + 1.3, frontZ); g.add(f);
    }
    const lintel = new THREE.Mesh(plateBox(1.9, 0.36, 0.06, 0.84, 0.98), M.tate);
    lintel.position.set(cx, YAG_Y + 2.42, frontZ); g.add(lintel);
    // 本の総矢倉は層の間に庇を出さず、鉄板の箱が二層目まで続く。一重目の板屋根を隠し、同じ板の帯で上の層へつなぐ。
    r1.visible = false;
    const band = new THREE.Mesh(plateBox(yagW + 0.3, 0.75, yagL + 0.3, 0.7, 0.98), M.tate);
    band.position.set(cx, YAG_Y + 2.6 + 0.37, yz); g.add(band);
    // 本の大安宅船（cg/ataka1）：黒い鉄板を明るい木の柱（一間おき）と段ごとの貫で押さえる格子。一つの InstancedMesh（見た目だけ）。
    // 戸口の両脇には通し柱を残し、下の貫を二つに分けて出入りの幅を保つ。床・当たりは変えない。
    {
      if (!ATK_FRAME) { ATK_FRAME = new THREE.MeshStandardMaterial({ map: shipTex().grain, bumpMap: shipTex().grain, bumpScale: 0.012, color: 0xc0a888, roughness: 0.86 }); shipHaze(ATK_FRAME); }
      const R = rigParts(), D = R.dummy, y0 = YAG_Y, y1 = YAG_Y + 6.4, hx = yagW / 2 + 0.2, hz = yagL / 2 + 0.2, parts = [];
      for (const sd of [-1, 1]) {
        const n = Math.max(2, Math.round(yagL / 1.15));
        for (let i = 0; i <= n; i++) parts.push([cx + sd * hx, (y0 + y1) / 2, yz - hz + 2 * hz * i / n, .16, y1 - y0, .16]);
      }
      for (const fz of [-1, 1]) {
        const n = Math.max(2, Math.round(yagW / 1.15));
        for (let i = 1; i < n; i++) {
          const x = cx - hx + 2 * hx * i / n;
          if (fz < 0 && Math.abs(x - cx) < 1.05) continue;
          parts.push([x, fz < 0 ? (y0 + 2.6 + y1) / 2 : (y0 + y1) / 2, yz + fz * hz, .16, fz < 0 ? y1 - y0 - 2.6 : y1 - y0, .16]);
        }
      }
      for (const sd of [-1, 1]) parts.push([cx + sd * 1.04, (y0 + y1) / 2, yz - hz, .18, y1 - y0, .18]);
      for (const y of [y0 + .08, y0 + 2.6, y0 + 3.35, y0 + 4.85, y1]) {
        for (const sd of [-1, 1]) parts.push([cx + sd * hx, y, yz, .2, .18, 2 * hz + .2]);
        parts.push([cx, y, yz + hz, 2 * hx + .2, .18, .2]);
        if (y > y0 + 2.5) parts.push([cx, y, yz - hz, 2 * hx + .2, .18, .2]);
        else for (const sd of [-1, 1]) parts.push([cx + sd * (hx + .95) / 2, y, yz - hz, hx - .95, .18, .2]);
      }
      const frame = new THREE.InstancedMesh(R.box, ATK_FRAME, parts.length);
      parts.forEach(([x, y, z, sx, sy, sz], i) => { D.position.set(x, y, z); D.rotation.set(0, 0, 0); D.scale.set(sx, sy, sz); D.updateMatrix(); frame.setMatrixAt(i, D.matrix); });
      frame.castShadow = true; frame.receiveShadow = true; g.add(frame);
    }
    const cabinMats = new Map();
    for (let i = cabinStart; i < g.children.length; i++) g.children[i].traverse((o) => {
      if (!o.isMesh) return;
      o.userData.camBlock = true;
      if (o.userData.shipPostFade) return;
      let mat = cabinMats.get(o.material);
      if (!mat) {
        mat = o.material.clone();
        mat.transparent = false; mat.depthWrite = true;
        mat.userData.camNearSolid = true;
        cabinMats.set(o.material, mat);
      }
      o.material = mat;
    });
    // 元の梯子位置を保つ。上端には戸口の踊り場を張り、出入りの札も同じ場所へ結ぶ。
    // 鉄板の箱を一枚の黒に見せない：外から柱と梁を浮かせ、床下の囲いには矢盾を立て並べる（見た目だけ。当たりは今まで通り）。
    {
      const R = rigParts(), D = R.dummy, frame = [], shields = [];
      const ox = yagW / 2 + 0.2, oz = yagL / 2 + 0.2, top = YAG_Y + 6.35;
      const put = (list, x, y, z, sx, sy, sz, rz = 0, rx = 0) => list.push([x, y, z, sx, sy, sz, rz, rx]);
      for (const y of [YAG_Y + 0.08, YAG_Y + 2.62, YAG_Y + 3.37, YAG_Y + 4.86]) {
        for (const sd of [-1, 1]) put(frame, cx + sd * ox, y, yz, 0.12, 0.16, yagL + 0.5);
        put(frame, cx, y, yz + oz, yagW + 0.5, 0.16, 0.12);
        if (y > YAG_Y + 2) put(frame, cx, y, yz - oz, yagW + 0.5, 0.16, 0.12);
      }
      const nz = Math.max(2, Math.round(yagL / 1.8)), nx = Math.max(2, Math.round(yagW / 1.8));
      for (let i = 0; i <= nz; i++) for (const sd of [-1, 1]) put(frame, cx + sd * ox, (YAG_Y + top) / 2, yz - oz + 2 * oz * i / nz, 0.15, top - YAG_Y, 0.15);
      for (let i = 1; i < nx; i++) put(frame, cx - ox + 2 * ox * i / nx, (YAG_Y + top) / 2, yz + oz, 0.15, top - YAG_Y, 0.15);
      // 戸口の面は柱を戸の両脇に立てる。出入りの幅は空けたまま。
      for (const sd of [-1, 1]) put(frame, cx + sd * 1.02, (YAG_Y + top) / 2, yz - oz, 0.15, top - YAG_Y, 0.15);
      // 床下の囲いの矢盾：板を束ねた楯を少し寝かせて並べ、横木を二本ずつ。
      const sx0 = yagW / 2 + 0.04, ns = Math.max(3, Math.floor(yagL / 1.25));
      for (const sd of [-1, 1]) for (let i = 0; i < ns; i++) {
        const z = yz - yagL / 2 + (i + 0.5) * yagL / ns, h = postH - 0.25, lean = sd * 0.09;
        put(shields, cx + sd * sx0, DECK.y + h / 2 + 0.05, z, 0.07, h, yagL / ns - 0.12, lean);
        for (const q of [0.28, 0.72]) put(frame, cx + sd * (sx0 + 0.05) + sd * (q - 0.5) * h * 0.09, DECK.y + 0.05 + h * q, z, 0.05, 0.08, yagL / ns - 0.2, lean);
      }
      for (const [list, mat] of [[frame, M.wood], [shields, M.board]]) {
        const mesh = new THREE.InstancedMesh(R.box, mat, list.length);
        for (let i = 0; i < list.length; i++) {
          const q = list[i]; D.position.set(q[0], q[1], q[2]); D.rotation.set(q[7], 0, q[6]); D.scale.set(q[3], q[4], q[5]); D.updateMatrix(); mesh.setMatrixAt(i, D.matrix);
        }
        mesh.castShadow = mesh.receiveShadow = true; g.add(mesh);
      }
    }
    const landingZ = yz - yagL / 2 - 0.3;
    const landing = new THREE.Mesh(rigParts().box, M.wood);
    landing.scale.set(2.1, 0.12, 0.6); landing.position.set(cx, YAG_Y - 0.06, landingZ);
    landing.userData.camBlock = true; g.add(landing);
    const deckId = addDeck({ x0: cx - 1.05, x1: cx + 1.05, z0: landingZ - 0.3, z1: landingZ + 0.3, y: YAG_Y, name: '屋形の踊り場' });
    const stair = new THREE.Mesh(rigParts().box, M.wood);
    stair.scale.set(1.4, 0.2, postH / Math.cos(0.9));
    stair.position.set(cx, DECK.y + postH / 2, yz - yagL / 2 - postH * 0.4); stair.rotation.x = -0.9;
    stair.userData.camBlock = true; g.add(stair);
    inside.ladderId = addLadder({ x: cx, z: yz - yagL / 2 - 0.6, y0: DECK.y, y1: YAG_Y, deck: deckId, name: '屋形の梯子' });
    const ladder = FL.ladders[inside.ladderId];
    ladder.topX = cx; ladder.topZ = landingZ;
    addShipFlags(g, cx, z1 - 0.7, DECK.y + TH, hw0 - 0.5, z0 - 2, high ? 5 : 2, true);
  } else {
    // 両脇の船：甲板の艫寄りに、板張りの低い屋形（見た目だけ。床は張らない）
    const yw = w * 0.4, yl = 6, yz = z1 - 6;
    const hut = new THREE.Mesh(new THREE.BoxGeometry(yw, 2.2, yl), M.board); hut.position.set(cx, DECK.y + 1.1, yz); g.add(hut);
    cabinDetails(g, cx, yz, yw, yl, DECK.y, 2.2);
    const r = hipRoof(yw + 1.2, yl + 1.2, 1.0, M); r.position.set(cx, DECK.y + 2.2, yz); g.add(r);
  }
  addBowGun(g, cx, z0 - 4.5, DECK.y + 1.25, -Math.PI / 2);
  for (const m of g.children) { m.castShadow = true; m.receiveShadow = true; }
  // 小さな編み目や縄まで影の描画を増やさない。
  if (high && castle) addDeckBulwark(g, cx, hw0);
  // 舷と船体を画面中央の透かしへ入れると、近い楯板が四角く消えて海が露出する。
  // 視点は船内へ収めるので板は残す。帆柱の遮り判定と布の透かしは従来どおり。
  // この船の不透明な材質だけを準備時に分け、同じ材質の部品で共有する。
  const hullMats = new Map();
  g.traverse((m) => {
    if (!m.isMesh) return;
    m.userData.camNear = true;
    const source = m.material;
    if (m.userData.camBlock || Array.isArray(source) || source.transparent || source.userData.camNearSolid) return;
    let mat = hullMats.get(source);
    if (!mat) {
      mat = source.clone(); mat.userData.camNearSolid = true;
      hullMats.set(source, mat);
    }
    m.material = mat;
  });
  return g;
}
// 船体・楯・屋根・大筒の動かない部品を材質ごとに結合し、同型の船で共有する。
const SHIP_PARTS = new Map();
function mergeShip(g, kind) {
  // 船体だけを共通の静止物の束へ写すと、動く乗員と旗から離れてしまう。
  // 船専用の結合と一括描画は残し、陸の景物の結合・固定からは船全体を外す。
  g.userData.noFreeze = true;
  const groups = new Map();
  g.updateMatrixWorld(true);
  g.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o === g.userData.sail || o === g.userData.flag ||
        o.material.transparent || o.material === rigParts().flagMat || o.userData.camBlock) return;
    const sig = Object.keys(o.geometry.attributes).sort().join(',');
    const key = o.material.uuid + '|' + o.castShadow + '|' + o.receiveShadow + '|' + sig;
    let list = groups.get(key);
    if (!list) { list = []; groups.set(key, list); }
    list.push(o);
  });
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const cacheKey = kind + '|' + key;
    let geo = SHIP_PARTS.get(cacheKey);
    if (!geo) {
      const parts = list.map(o => {
        const part = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        part.clearGroups(); part.applyMatrix4(o.matrixWorld); return part;
      });
      geo = mergeGeometries(parts, false);
      for (const part of parts) part.dispose();
      if (!geo) continue;
      geo.computeBoundingSphere(); SHIP_PARTS.set(cacheKey, geo);
    }
    const first = list[0], mesh = new THREE.Mesh(geo, first.material);
    mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow;
    for (const o of list) o.removeFromParent();
    g.add(mesh);
  }
  return shipSeaHaze(g);
}
// 大安宅船の総矢倉（reports/ref/cg/ataka1・ataka2）：舷の上に二段の箱を立て、黒い鉄板（鋲・三角と四角の狭間）を
// 明るい木の柱と貫の格子で押さえる。上は板張りの戦う床と楯板、艫寄りに二重の天守（板壁・板葺き）。
// 形は全艘で共有し、材質ごとに一つへまとめる（mergeShip）。舳先の大筒の台は箱の外に残す
const ATK_TOP = 6.1, ATK_BOX = { x: 5.3, z0: -12.6, z1: 9.6, y0: 2.5, tiers: [2.5, 4.3, 6.1] };
let ATK_FRAME = null;
function ironBox(g, M) {
  const B = ATK_BOX, R = rigParts();
  if (!ATK_FRAME) { ATK_FRAME = new THREE.MeshStandardMaterial({ map: shipTex().grain, bumpMap: shipTex().grain, bumpScale: 0.012, color: 0xc0a888, roughness: 0.86 }); shipHaze(ATK_FRAME); }
  const panel = (ax, az, bx, bz, y0, h) => {
    const L = Math.hypot(bx - ax, bz - az), geo = new THREE.PlaneGeometry(L, h), uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * L / 4);
    const m = new THREE.Mesh(geo, M.tate);
    m.position.set((ax + bx) / 2, y0 + h / 2, (az + bz) / 2); m.rotation.y = Math.atan2(bx - ax, bz - az) - Math.PI / 2; g.add(m);
  };
  const sides = [[-B.x, B.z0, -B.x, B.z1], [B.x, B.z1, B.x, B.z0], [-B.x, B.z1, B.x, B.z1], [B.x, B.z0, -B.x, B.z0]];
  for (let t = 0; t < B.tiers.length - 1; t++) for (const [ax, az, bx, bz] of sides) panel(ax, az, bx, bz, B.tiers[t], B.tiers[t + 1] - B.tiers[t]);
  // 柱（2.2m おき）と貫（段の境）。明るい木で鉄板を押さえる
  const posts = [], H = ATK_TOP - B.y0 + 0.2;
  for (const [ax, az, bx, bz] of sides) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.round(L / 2.2);
    for (let i = 0; i < n; i++) posts.push([ax + (bx - ax) * i / n, az + (bz - az) * i / n]);
  }
  const post = new THREE.InstancedMesh(R.box, ATK_FRAME, posts.length), D = R.dummy;
  posts.forEach(([x, z], i) => {
    const out = Math.abs(Math.abs(x) - B.x) < 0.01 ? Math.sign(x) * 0.08 : 0, outZ = out ? 0 : Math.sign(z) * 0.08;
    D.position.set(x + out, B.y0 + H / 2 - 0.1, z + outZ); D.rotation.set(0, 0, 0); D.scale.set(0.24, H, 0.24); D.updateMatrix(); post.setMatrixAt(i, D.matrix);
  });
  g.add(post);
  for (const y of B.tiers) {
    for (const sd of [-1, 1]) {
      const a = new THREE.Mesh(R.box, ATK_FRAME); a.scale.set(0.26, 0.24, B.z1 - B.z0 + 0.3); a.position.set(sd * (B.x + 0.1), y, (B.z0 + B.z1) / 2); g.add(a);
      const b = new THREE.Mesh(R.box, ATK_FRAME); b.scale.set(2 * B.x + 0.3, 0.24, 0.26); b.position.set(0, y, sd > 0 ? B.z1 + 0.1 : B.z0 - 0.1); g.add(b);
    }
  }
  // 上の床と楯板
  const top = new THREE.Mesh(R.box, M.deck); top.scale.set(2 * B.x - 0.1, 0.16, B.z1 - B.z0 - 0.1); top.position.set(0, ATK_TOP, (B.z0 + B.z1) / 2); g.add(top);
  for (const [ax, az, bx, bz] of sides) g.add(tateWall(ax * 0.99, az, bx * 0.99, bz, ATK_TOP, 1.1, M));
  // 二重の天守（艫寄り）。下重は板壁に武者窓、腰の庇。上重は切妻
  const tz = -7.6;
  const w1 = new THREE.Mesh(new THREE.BoxGeometry(6.2, 2.3, 5.4), M.upperBoard); w1.position.set(0, ATK_TOP + 1.15, tz); g.add(w1);
  cabinDetails(g, 0, tz, 6.2, 5.4, ATK_TOP, 2.3, true, false);
  const r1 = hipRoof(7.6, 6.8, 0.9, M); r1.position.set(0, ATK_TOP + 2.3, tz); g.add(r1);
  const w2 = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.9, 3.8), M.upperBoard); w2.position.set(0, ATK_TOP + 3.0 + 0.95, tz); g.add(w2);
  cabinDetails(g, 0, tz, 4.4, 3.8, ATK_TOP + 3.0, 1.9, true, false);
  const r2 = hipRoof(5.8, 5.2, 1.6, M, true); r2.position.set(0, ATK_TOP + 4.9, tz); g.add(r2);
}
// 遠い五艘の供船。乗員は共有する軽い形で表す。舳先は +z
let ATK = null;
function atakeLite(W) {
  const high = true, M = ironShipMats();
  if (!ATK) {
    const L = 26, hw = 5.5; // 舳先を含め長さ32m・幅11m（別本の寸法を採る）
    ATK = {
      body: loftHull(-L / 2, L / 2 + 6, (z) => hw * (z > L / 2 - 4 ? 0.18 + 0.82 * Math.sqrt(Math.max(0, (L / 2 + 6 - z) / 10)) : 1), (z) => 2.6 + (z > L / 2 - 4 ? 1.1 * ((z - (L / 2 - 4)) / 10) ** 2 : 0), -2, 14),
      tateL: L, hw,
      yag: new THREE.BoxGeometry(5.6, 2.4, 8), bow: null,
    };
  }
  const g = new THREE.Group();
  if (high && !ATK.ironBody) {
    ATK.ironBody = loftHull(-13, 19, z => 5.5 * (z > 10 ? 0.55 + 0.45 * Math.sqrt(Math.max(0, (19 - z) / 9)) : 1), () => 2.6, -2, 14, true);
    ATK.ironBody = ironHullUV(ATK.ironBody, () => 2.6, -2);
  }
  g.add(new THREE.Mesh(high ? ATK.ironBody : ATK.body, high ? M.hull : M.board));
  const deck = new THREE.Mesh(rigParts().box, M.wood); deck.scale.set(10.5, 0.18, 24); deck.position.set(0, 2.5, -1); g.add(deck);
  if (high) ironBox(g, M);
  else {
    for (const sd of [-1, 1]) g.add(tateWall(sd * (ATK.hw - 0.05), -ATK.tateL / 2, sd * (ATK.hw - 0.05), ATK.tateL / 2 - 3, 2.5, 1.2, M));
    const y1 = new THREE.Mesh(ATK.yag, M.board); y1.position.set(0, 3.8, -4); g.add(y1);
    const r1 = hipRoof(7, 9.6, 1.4, M); r1.position.set(0, 5.0, -4); g.add(r1);
    const tw = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.6, 3.2), M.plaster); tw.position.set(0, 6.6, -4); g.add(tw);
    const r2 = hipRoof(3.8, 4.2, 1.0, M); r2.position.set(0, 7.4, -4); g.add(r2);
  }
  addShipFlags(g, 0, -12, high ? ATK_TOP + 1.1 : 3.7, ATK.hw - 0.5, 16, high ? 5 : 1);
  addOars(g, 0, ATK.hw, high ? -10 : -9, 10, high ? 22 : 10, high ? 7 : 5.5, true, true, high ? 1.55 : 0.45, high ? -1 : 0);
  addShipBeams(g, 0, ATK.hw, -11, 9, 1.4);
  addHullRibs(g, 0, ATK.hw, -11, 9, 2.6, -2);
  addSail(g, 5, 7, 5, 7.2, true); addWake(g, ATK.hw, 30);
  for (const sd of [-1, 1]) {
    g.add(tateWall(sd * (high ? 3.0 : 0), 19, sd * ATK.hw, 10, 2.5, 1.2, M));
  }
  if (high) {
    bowGunWall(g, 0, 19, 3, 2.5, 1.2, M);
    // 舷の折れに沿う台形の床。元の矩形床との隙間と、両脇の海が見える穴を塞ぐ。
    if (!ATK.foredeck) {
      const floor = new THREE.BufferGeometry();
      floor.setAttribute('position', new THREE.Float32BufferAttribute([
        -5.45, 2.59, 10, 5.45, 2.59, 10, 3, 2.59, 19, -3, 2.59, 19,
      ], 3));
      floor.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.78, 1, 0.22, 1], 2));
      floor.setIndex([0, 2, 1, 0, 3, 2]); floor.computeVertexNormals(); ATK.foredeck = floor;
    }
    g.add(new THREE.Mesh(ATK.foredeck, M.deck));
    addBowGun(g, 0, 18.2, 3.75, Math.PI / 2);
  }
  // 自船と同じ三門を、西の舷へ。遠景でも筒を小さくせず、共有する形を使う。
  for (const z of [-8, 0, 8]) {
    const gun = taihou(M); compactShip(gun); gun.position.set(-5.4, 3.4, z); g.add(gun);
  }
  for (const m of g.children) m.castShadow = m.material !== RIG?.foamMat;
  return mergeShip(g, high ? 'atakeIron2' : 'atake');
}
// 小早（毛利の小舟）：細い胴、舷に竹の楯（たてかけた板）、櫂。舳先は +z
// 小早の形と材質は一つを使い回す（出すたびに作ると、戦の途中で作り直しが起きて重い）
let KOB = null;
function kobaya() {
  const M = shipMats();
  if (!KOB) {
    KOB = {
      body: loftHull(-5, 5.6, (z) => 1.35 * (z > 2 ? 0.15 + 0.85 * Math.sqrt(Math.max(0, (5.6 - z) / 3.6)) : z < -4 ? 0.8 : 1), (z) => 0.75 + (z > 2.5 ? 0.6 * ((z - 2.5) / 3.1) ** 2 : 0), -0.5, 10),
      shield: new THREE.BoxGeometry(0.08, 0.9, 1.1),
      mast: new THREE.CylinderGeometry(0.04, 0.05, 3.2, 4),
      flag: rigParts().flagGeo ||= shipFlagGeometry(0.6, 1.6),
    };
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(KOB.body, M.board));
  for (const sd of [-1, 1]) for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(KOB.shield, M.wood); s.position.set(sd * 1.25, 1.15, -3.6 + i * 1.15); s.rotation.z = sd * -0.12; g.add(s); }
  const deck = new THREE.Mesh(rigParts().box, M.wood); deck.scale.set(2.4, 0.12, 8.2); deck.position.set(0, 0.65, -0.6); g.add(deck);
  addOars(g, 0, 1.25, -2.8, 2, 4, 3.2); addWake(g, 1.35, 10);
  const mast = new THREE.Mesh(KOB.mast, M.dark); mast.position.set(0, 2.3, -3.8); g.add(mast);
  const R = rigParts();
  if (!R.flagMat) R.flagMat = new THREE.MeshStandardMaterial({ map: flagTexture('mori'), side: THREE.DoubleSide, roughness: 0.9 });
  const fl = new THREE.Mesh(KOB.flag, R.flagMat); g.userData.flag = fl; fl.position.set(0, 2.9, -3.8); fl.rotation.y = Math.PI / 2; g.add(fl);
  for (const m of g.children) m.castShadow = m.material !== RIG?.foamMat;
  return mergeShip(g, 'kobaya');
}
let CREW = null;
function addCrew(g, y, count, wide = false) {
  if (!CREW) CREW = { body: new THREE.CylinderGeometry(0.22, 0.25, 1.15, 5), mat: new THREE.MeshStandardMaterial({ color: 0x393831, roughness: 1 }) };
  // 供船の乗員だけは、頭・胴・曲げた手足を一つの形へ束ねる。遠い船団は元の軽い形。
  if (!CREW.ready) {
    const parts = [], color = new THREE.Color();
    const piece = (geo, x, y, z, rx, shade) => {
      geo.rotateX(rx); geo.translate(x, y, z); color.setHex(shade);
      const colors = new Float32Array(geo.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3)); parts.push(geo);
    };
    piece(new THREE.BoxGeometry(.42, .48, .25), 0, 1.08, 0, .12, 0x303735);
    piece(new THREE.CylinderGeometry(.23, .27, .3, 6), 0, .73, 0, 0, 0x3d4140);
    piece(new THREE.SphereGeometry(.115, 6, 4), 0, 1.47, .015, 0, 0x9a8061);
    piece(new THREE.ConeGeometry(.25, .13, 8), 0, 1.6, 0, 0, 0x252b2b);
    for (const side of [-1, 1]) {
      piece(new THREE.BoxGeometry(.14, .35, .15), side * .13, .49, side * .09, side * .3, 0x414944);
      piece(new THREE.BoxGeometry(.1, .32, .12), side * .13, .17, side * .1, -side * .22, 0x303632);
      piece(new THREE.BoxGeometry(.13, .32, .13), side * .28, 1.06, .08, -.55, 0x414944);
      piece(new THREE.BoxGeometry(.1, .28, .1), side * .27, .93, .26, -1.15, 0x343b37);
    }
    piece(new THREE.CylinderGeometry(.018, .018, 2.2, 4), .27, 1.25, .38, -.55, 0x82765a);
    CREW.ready = mergeGeometries(parts, false); for (const part of parts) part.dispose();
    CREW.readyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9 });
  }
  const mesh = new THREE.InstancedMesh(CREW.ready, CREW.readyMat, count), D = rigParts().dummy;
  for (let i = 0; i < count; i++) {
    D.position.set((i % 2 ? 1 : -1) * (wide ? 3.5 : 0.6), y, -3.4 + Math.floor(i / 2) * (wide ? .9 : 1.1));
    D.rotation.set(0, (i % 2 ? 1 : -1) * Math.PI / 2 + Math.sin(i * 2.4) * .18, 0); D.scale.set(1, 1, 1); D.updateMatrix(); mesh.setMatrixAt(i, D.matrix);
  }
  g.add(mesh); g.userData.crew = mesh; shipSeaHaze(mesh);
}

const boardingAxis = new THREE.Vector3(0, 0, 1), boardingDirection = new THREE.Vector3();
// 近い舟の乗員は準備時か出撃時に本物へ替える。同じ兵が舟と甲板を往復する。
function shipCrew(rt, b, team, count, wide = false, ranged = false) {
  const make = team ? enemyGroup : allyGroup;
  const list = ranged ? [...(b.big ? [{ type: 'samurai', n: 1, o: { name: '毛利方の将', horse: false, hat: 'kabuto_m', flagScale: 1.8 } }] : []), { type: 'gun', n: count / 4 - (b.big ? 1 : 0) }, { type: 'bow', n: count / 4 }, { type: 'ashigaru', n: count / 2, o: { spear: 'su' } }]
    : [{ type: 'ashigaru', n: count, o: { spear: 'su' } }];
  const g = make(rt, { name: team ? '舟の毛利勢' : '供船の兵', faction: team ? 'mori' : 'oda', fixed: true,
    fullStrength: true, noGuard: true, anchor: { x: b.x, z: b.z }, order: 'hold', width: 2, spacing: 0.8,
    seekRange: 90, aggro: 14, morale: 80 }, dress(list, team ? MORI : ODA));
  b.group = g; g.boat = b;
  if (b.exit) {
    // 乗り口の板は一艘に一本。舟から甲板までの足場を、兵と同じ座標で描く。
    b.boardLocal = { x: 0, z: 3.2 }; b.boardPoint = new THREE.Vector3();
    b.boardPlank = new THREE.Mesh(rigParts().box, shipMats().wood);
    b.boardPlank.visible = false; b.boardPlank.receiveShadow = true;
    rt.scene.add(b.boardPlank);
  }
  for (let i = 0; i < g.units.length; i++) {
    const u = g.units[i]; u.shipBoat = b;
    u.shipLocal = { x: (i % 2 ? 1 : -1) * (wide ? 3 : 0.55), z: -3 + Math.floor(i / 2) * 1.25 };
    u.shipPost = { x: b.x, y: b.deckY, z: b.z }; u.shipHold = u.shipPost; u.perch = u.shipPost;
    // 乗り移る時も同じ入れ物を使う。毎コマの生成をしない。
    u.shipTransit = { active: false, start: 0, returning: false, x: 0, y: 0, z: 0, heading: 0, stepped: false };
  }
  if (b.m.userData.crew) b.m.userData.crew.visible = false;
  syncShipCrew(rt, b);
  return g;
}
function syncShipCrew(rt, b) {
  if (!b.group) return;
  if (b.boardPlank) {
    b.boardPoint.copy(shipFloor(b, b.boardLocal));
    const q = b.boardPoint, p = b.boardPlank;
    // 被弾しても、渡り始めた兵の足元から板だけを消さない。
    // 新たな乗り込みは元の被弾判定で止め、最後の一人が渡り終えたら外す。
    let crossing = false;
    if (b.damageStage) for (const u of b.group.units) {
      if (u.alive && u.shipTransit?.active) { crossing = true; break; }
    }
    p.visible = b.alive && b.landed && (!b.damageStage || crossing);
    if (p.visible) {
      boardingDirection.set(b.landing.x - q.x, DECK.y - q.y, b.landing.z - q.z);
      const length = boardingDirection.length();
      p.position.set((q.x + b.landing.x) / 2, (q.y + DECK.y) / 2 - 0.05, (q.z + b.landing.z) / 2);
      p.scale.set(0.85, 0.1, length);
      p.quaternion.setFromUnitVectors(boardingAxis, boardingDirection.normalize());
    }
  }
  b.group.anchor.x = b.exit && b.landed ? b.exit.x + (b.from === 's' ? 0 : 2) : b.x;
  b.group.anchor.z = b.exit && b.landed ? b.exit.z - (b.from === 's' ? 2 : 0) : b.z;
  b.group.fire = rt.flags.step >= 1 && !b.damageStage && !b.withdrawing && !rt.flags.ending;
  // 舟上の持ち場と甲板での攻めを分ける。乗り口へ戻るだけの隊にしない。
  if (b.exit && b.boarded && !b.group.routed) {
    if (b.withdrawing) {
      b.group.order = 'retreat'; b.group.focus = null; b.group.dest = b.landing;
      b.group.anchor.x = b.landing.x; b.group.anchor.z = b.landing.z;
    } else if (rt.t >= (b.deckAimAt || 0)) {
      b.deckAimAt = rt.t + 1;
      let foe = null, nearest = Infinity;
      for (const u of rt.army.units) {
        if (!u.alive || u.team !== 0 || u.fleeing || u.woundOut || u.shipBoat || u.noTarget || Math.abs(u.pos.y - DECK.y) > 0.5 || u.pos.x < DECK.x0 || u.pos.x > DECK.x1 || u.pos.z < DECK.z0 || u.pos.z > DECK.z1) continue;
        const d = Math.hypot(u.pos.x - b.exit.x, u.pos.z - b.exit.z);
        if (d < nearest) { nearest = d; foe = u; }
      }
      b.group.order = 'attack'; b.group.focus = foe;
    }
    if (!b.withdrawing) {
      b.group.anchor.x = b.group.focus?.pos.x ?? (b.from === 's' ? 3.8 : -3.8);
      b.group.anchor.z = b.group.focus?.pos.z ?? 3.8;
    }
  }
  for (const u of b.group.units) {
    const tr = u.shipTransit;
    if (!u.alive || (!u.shipBoat && !tr?.active)) continue;
    const q = u.shipPost, point = shipFloor(b, u.shipLocal);
    const x = point.x, z = point.z, y = point.y;
    if (tr.active) {
      const age = Math.min(1, (rt.t - tr.start) / 1.8);
      // 舟内で舳先へ進み、渡した板を上る。舟の奥から海の上を斜めに滑らせない。
      // 帰る時は同じ板を逆にたどる。乗り込みの時間と人数は保つ。
      const tx = tr.returning ? x : b.landing.x, tz = tr.returning ? z : b.landing.z, ty = tr.returning ? y : DECK.y;
      const mid = b.boardPoint;
      const first = Math.hypot(mid.x - tr.x, mid.y - tr.y, mid.z - tr.z);
      const last = Math.hypot(tx - mid.x, ty - mid.y, tz - mid.z);
      const walked = age * (first + last), next = walked >= first;
      const f = next ? Math.min(1, (walked - first) / Math.max(0.001, last)) : walked / Math.max(0.001, first);
      const sx = next ? mid.x : tr.x, sy = next ? mid.y : tr.y, sz = next ? mid.z : tr.z;
      const ex = next ? tx : mid.x, ey = next ? ty : mid.y, ez = next ? tz : mid.z;
      const heading = Math.atan2(ex - sx, ez - sz);
      const turn = Math.atan2(Math.sin(heading - tr.heading), Math.cos(heading - tr.heading));
      u.heading = tr.heading + turn * Math.min(1, age * 5);
      u.mesh.rotation.y = u.heading;
      q.x = sx + (ex - sx) * f; q.z = sz + (ez - sz) * f;
      q.y = sy + (ey - sy) * f;
      u.pos.set(q.x, q.y, q.z); u.mesh.position.copy(u.pos);
      if (!tr.stepped && age >= 0.12) { tr.stepped = true; rt.army.play('stepWood', u.pos, 0.6); }
      if (age >= 1) {
        rt.army.play('stepWood', u.pos, tr.returning ? 0.65 : 0.9);
        tr.active = false;
        if (tr.returning) u.shipBoat = b;
        else { u.shipBoat = null; u.shipPost = null; u.perch = null; u.target = null; u.moveTo = null; u.aiT = 0; }
      }
    } else { q.x = x; q.z = z; q.y = y; }
    if (u.shipPost) {
      u.perch = q; u.pos.set(q.x, q.y, q.z); u.mesh.position.copy(u.pos); u.moveTo = null;
      u.moving = tr.active ? 0.9 * Math.sin(Math.PI * Math.min(1, (rt.t - tr.start) / 1.8)) : 0;
    }
  }
}
function shipMove(b, dt, speed) {
  const dx = b.t.x - b.x, dz = b.t.z - b.z, d = Math.hypot(dx, dz);
  if (d < 0.7) return true;
  const turn = Math.atan2(Math.sin(Math.atan2(dx, dz) - b.m.rotation.y), Math.cos(Math.atan2(dx, dz) - b.m.rotation.y));
  b.m.rotation.y += Math.max(-dt * 0.35, Math.min(dt * 0.35, turn));
  const near = d < 6;
  const advance = Math.min(d, dt * speed) * (near ? 1 : Math.max(0, Math.cos(turn)));
  b.x += (near ? dx / d : Math.sin(b.m.rotation.y)) * advance; b.z += (near ? dz / d : Math.cos(b.m.rotation.y)) * advance;
  b.m.position.x = b.x; b.m.position.z = b.z;
  return false;
}

// 関船は小早より長く幅広い。低い屋形、板の垣立と多い櫓で姿を分ける。
let SEK = null;
function sekibune(furled = false) {
  const M = shipMats(), R = rigParts();
  if (!SEK) SEK = loftHull(-10, 12, z => 2.6 * (z > 6 ? 0.08 + 0.92 * Math.sqrt(Math.max(0, (12 - z) / 6)) : z < -8 ? 0.85 : 1), z => 1.45 + Math.max(0, z - 6) * 0.12, -1.1, 14);
  const g = new THREE.Group(); g.add(new THREE.Mesh(SEK, M.board));
  const deck = new THREE.Mesh(R.box, M.wood); deck.scale.set(4.8, 0.16, 17); deck.position.set(0, 1.3, -0.8); g.add(deck);
  // 毛利の安宅船（reports/ref/cg/ataka2 の下の写し）：舷に狭間を切った楯板、艫寄りに板壁の二重の矢倉と板葺きの屋根。
  // 鉄は張らない（木の安宅）。楯板と屋根の形は全艘で共有する
  for (const sd of [-1, 1]) g.add(tateWall(sd * 2.45, -9, sd * 2.45, 7, 1.35, 1.1, M));
  g.add(tateWall(-2.3, -9.2, 2.3, -9.2, 1.35, 1.1, M));
  const hut = new THREE.Mesh(R.box, M.board); hut.scale.set(3.8, 1.7, 4.6); hut.position.set(0, 2.2, -6); g.add(hut);
  const r1 = hipRoof(4.8, 5.6, 0.8, M); r1.position.set(0, 3.05, -6); g.add(r1);
  const up = new THREE.Mesh(R.box, M.board); up.scale.set(2.6, 1.3, 3.0); up.position.set(0, 4.15, -6); g.add(up);
  const win = new THREE.Mesh(R.box, M.black); win.scale.set(2.64, 0.35, 1.6); win.position.set(0, 4.3, -6); g.add(win);
  const r2 = hipRoof(3.6, 4.0, 1.1, M, true); r2.position.set(0, 4.8, -6); g.add(r2);
  addOars(g, 0, 2.5, -7.5, 6, 10, 4.4); addSail(g, 1, 5.6, 5, 5.7, furled); addWake(g, 2.6, 22);
  // 毛利の旗は小早と同じ材質を使う。
  if (!R.flagMat) R.flagMat = new THREE.MeshStandardMaterial({ map: flagTexture('mori'), side: THREE.DoubleSide, roughness: 0.9 });
  if (!R.flagGeo) R.flagGeo = shipFlagGeometry(0.6, 1.6);
  const flag = new THREE.Mesh(R.flagGeo, R.flagMat); flag.position.set(0, 5.6, -9.4); flag.rotation.y = Math.PI / 2; g.add(flag);
  const pole = new THREE.Mesh(R.pole, M.dark); pole.scale.y = 6.4; pole.position.set(0, 3.4, -9.4); g.add(pole);
  return mergeShip(g, furled ? 'sekiFurled2' : 'seki2');
}
// 船団の同じ部品は一度に描く。元の船は残し、沈没・帆・旗・乗り込みの動きを読む。
// 行列と見える部品の一覧は準備時に確保し、描く直前だけ元の部品を隠す。
function batchFleet(rt) {
  const F = rt.flags, ships = new Set([...F.far, ...F.escorts.map(b => b.m), ...F.seaShips.map(b => b.m)]);
  const groups = new Map(), hidden = [];
  for (const ship of ships) ship.traverse(o => {
    if (!o.isMesh || Array.isArray(o.material) || o.userData.camNear || o.userData.camBlock) return;
    const key = o.geometry.uuid + '|' + o.material.uuid + '|' + o.castShadow + '|' + o.receiveShadow;
    let list = groups.get(key);
    if (!list) { list = []; groups.set(key, list); }
    list.push(o);
  });
  const batches = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const first = list[0], capacity = list.reduce((n, o) => n + (o.isInstancedMesh ? o.count : 1), 0);
    const mesh = new THREE.InstancedMesh(first.geometry, first.material, capacity);
    mesh.userData.noFreeze = true;
    mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0;
    rt.scene.add(mesh); batches.push({ list, mesh });
  }
  const fr = new THREE.Frustum(), pm = new THREE.Matrix4(), local = new THREE.Matrix4(), world = new THREE.Matrix4();
  const before = rt.scene.onBeforeRender, after = rt.scene.onAfterRender;
  rt.scene.onBeforeRender = function (r, sc, cam, target) {
    before.call(this, r, sc, cam, target);
    fr.setFromProjectionMatrix(pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    hidden.length = 0;
    for (const { list, mesh } of batches) {
      let n = 0;
      for (const o of list) {
        let visible = o.visible;
        for (let p = o.parent; visible && p; p = p.parent) visible = p.visible;
        if (!visible || o.material !== mesh.material) continue;
        // 帆や船が視野の外なら、束にも入れない。兵の数や動きには触れない。
        if (true || !o.frustumCulled || fr.intersectsObject(o)) {
          if (o.isInstancedMesh) {
            for (let i = 0; i < o.count; i++) {
              o.getMatrixAt(i, local); world.multiplyMatrices(o.matrixWorld, local); mesh.setMatrixAt(n++, world);
            }
          } else mesh.setMatrixAt(n++, o.matrixWorld);
        }
        hidden.push(o); o.visible = false;
      }
      mesh.count = n; mesh.instanceMatrix.needsUpdate = true;
    }
  };
  rt.scene.onAfterRender = function (r, sc, cam) {
    for (const o of hidden) o.visible = true;
    hidden.length = 0;
    after.call(this, r, sc, cam);
  };
  const dispose = rt.dispose;
  rt.dispose = function () {
    for (const o of hidden) o.visible = true;
    hidden.length = 0;
    for (const { mesh } of batches) mesh.dispose();
    dispose.call(this);
  };
}
// 遠くの船団の舟は、動かない部品（盾板・甲板・船体・帆柱など）を材質ごとに一つの形へまとめる（一艘 20 回ほど描いていた）。
// 旗・帆・櫂・波・乗員は動くので元のまま。舟ごとの位置・向き・沈みは舟の入れ物で動かすので変わらない
const SHIP_MERGED = new Map();
let SHIP_PLAIN = null;
function compactShip(g) {
  // 波（四枚）は見える見えないが舟ごとに一緒なので、一枚の形にまとめる
  const W = g.userData.wakes;
  if (W && W.length > 1) {
    const sig = 'wake|' + W.map((m) => { m.updateMatrix(); return m.matrix.elements.map((v) => v.toFixed(3)).join(','); }).join('|');
    let geo = SHIP_MERGED.get(sig);
    if (!geo) { geo = mergeGeometries(W.map((m) => (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix))); if (geo) SHIP_MERGED.set(sig, geo); }
    if (geo) {
      const one = new THREE.Mesh(geo, W[0].material); one.visible = W[0].visible; one.castShadow = false;
      for (const m of W) g.remove(m);
      g.add(one); g.userData.wakes = [one];
    }
  }
  const keep = new Set([g.userData.flag, g.userData.sail, ...(g.userData.wakes || [])]);
  const groups = new Map();
  for (const m of g.children) {
    if (!m.isMesh || m.isInstancedMesh || keep.has(m) || m.children.length) continue;
    const at = m.geometry.attributes, key = Object.keys(at).sort().join(',');
    if (!at.position || !at.normal) continue;
    // 絵の無い木の色（木・黒木）は、頂点の色で一つの材質にまとめる
    const mt = m.material, plain = mt.isMeshStandardMaterial && !mt.map && mt.roughness === 0.9 && !mt.metalness && mt.side === THREE.FrontSide && !mt.transparent && !mt.vertexColors;
    const k = (plain ? 'plain' : mt.uuid) + '|' + key;
    (groups.get(k) || groups.set(k, []).get(k)).push(m);
  }
  for (const [k, list] of groups) {
    const plain = k.startsWith('plain|');
    if (list.length < 2) continue;
    // 同じ並びの舟（小早・関船）は形を一つだけ作って使い回す
    const sig = list.map((m) => { m.updateMatrix(); return m.geometry.uuid + m.material.uuid + m.matrix.elements.map((v) => v.toFixed(3)).join(','); }).join('|');
    let geo = SHIP_MERGED.get(sig);
    if (!geo) {
      geo = mergeGeometries(list.map((m) => {
        const q = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
        if (plain) { const c = m.material.color, n = q.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } q.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
        return q;
      }));
      if (!geo) continue;
      SHIP_MERGED.set(sig, geo);
    }
    if (plain && !SHIP_PLAIN) SHIP_PLAIN = shipHaze(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    const one = new THREE.Mesh(geo, plain ? SHIP_PLAIN : list[0].material);
    one.castShadow = list.some((m) => m.castShadow); one.receiveShadow = list.some((m) => m.receiveShadow);
    for (const m of list) g.remove(m);
    g.add(one);
  }
  shipSeaHaze(g);
  g.userData.statics = g.children.filter((m) => m.isMesh && !m.isInstancedMesh && !keep.has(m) && !m.children.length);
}
function shipFarCut(g, cut) {
  if (!!g.userData.farCut === cut) return;
  g.userData.farCut = cut;
  const parts = [g.userData.rowing?.mesh, g.userData.crew, g.userData.flag, ...(g.userData.wakes || []), ...(g.userData.statics || [])];
  for (const m of parts) if (m) m.layers.mask = cut ? 0 : 1;
}
// 沖の舟（遠い形にした舟）の船体と木の部品は、舟の形ごとに一つの束で描く（一艘ずつ二、三回描いていた）。
// 舟の位置・揺れ・向きは毎コマの舟の入れ物の行列を写すので、動きは元のまま
const _shipM = new THREE.Matrix4();
function shipInstBegin(F) { for (const e of (F.shipInst || (F.shipInst = new Map())).values()) e.n = 0; }
function shipInstPut(rt, F, g) {
  if (!g.userData.farCut || !g.userData.statics) return;
  g.updateMatrixWorld();
  for (const m of g.userData.statics) {
    const k = m.geometry.uuid + m.material.uuid;
    let e = F.shipInst.get(k);
    if (!e) {
      const im = new THREE.InstancedMesh(m.geometry, m.material, 40);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.count = 0; im.castShadow = m.castShadow;
      rt.scene.add(im); e = { im, n: 0 }; F.shipInst.set(k, e);
    }
    if (e.n >= 40) { m.layers.mask = 1; continue; }
    _shipM.multiplyMatrices(g.matrixWorld, m.matrix); e.im.setMatrixAt(e.n++, _shipM);
  }
}
function shipInstEnd(F) { for (const e of F.shipInst.values()) { e.im.count = e.n; if (e.n) e.im.instanceMatrix.needsUpdate = true; } }
// 火の壺と煙は三か所分を先に用意し、飛ぶ時と消火後にも使い回す。
function prepareHouroku(rt) {
  const R = rigParts(), D = R.dummy;
  // 球の輪郭を空へ並べず、縁がほどける煙を三か所で共有する。
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d'), haze = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  haze.addColorStop(0, 'rgba(255,255,255,0.9)');
  haze.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  haze.addColorStop(0.7, 'rgba(255,255,255,0.18)');
  haze.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = haze; ctx.fillRect(0, 0, 64, 64);
  const smokeMap = new THREE.CanvasTexture(canvas);
  const smokeMat = new THREE.MeshBasicMaterial({ map: smokeMap, color: 0x716b62, transparent: true, opacity: 0.36, depthWrite: false });
  const steamMat = new THREE.MeshBasicMaterial({ map: smokeMap, color: 0xd5d9d2, transparent: true, opacity: 0.3, depthWrite: false });
  const smokeGeo = new THREE.PlaneGeometry(2, 2), potGeo = new THREE.SphereGeometry(0.28, 8, 5);
  const potMat = new THREE.MeshStandardMaterial({ color: 0x8c4d2f, roughness: 1 });
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb43a }), flameGeo = new THREE.ConeGeometry(0.15, 0.65, 5);
  rt.flags.houroku = [];
  for (let i = 0; i < 3; i++) {
    const pot = new THREE.Group(); pot.add(new THREE.Mesh(potGeo, potMat));
    const flame = new THREE.Mesh(flameGeo, flameMat); flame.position.y = 0.4; pot.add(flame);
    const smoke = new THREE.InstancedMesh(smokeGeo, smokeMat, 6), steam = new THREE.InstancedMesh(smokeGeo, steamMat, 6);
    smoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage); steam.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    smoke.frustumCulled = steam.frustumCulled = false;
    for (let j = 0; j < 6; j++) { D.position.set(0, -100, 0); D.rotation.set(0, 0, 0); D.scale.setScalar(0); D.updateMatrix(); smoke.setMatrixAt(j, D.matrix); steam.setMatrixAt(j, D.matrix); }
    pot.visible = smoke.visible = steam.visible = false; rt.scene.add(pot, smoke, steam);
    rt.flags.houroku.push({ pot, smoke, steam, start: -1, dousedAt: -1 });
  }
  const dispose = rt.dispose;
  rt.dispose = function () {
    smokeMap.dispose(); smokeGeo.dispose(); smokeMat.dispose(); steamMat.dispose();
    for (const h of this.flags.houroku) { h.smoke.dispose(); h.steam.dispose(); }
    dispose.call(this);
  };
}
function updateHouroku(rt, t) {
  const F = rt.flags, D = rigParts().dummy;
  for (let i = 0; i < F.houroku.length; i++) {
    const h = F.houroku[i]; if (h.start < 0) continue;
    const q = F.fl[i], age = rt.t - h.start, u = Math.min(1, age / 1.2);
    h.pot.visible = u < 1 && !S.reduceMotion;
    h.pot.position.set(q.x + (h.fromX - q.x) * (1 - u), DECK.y + 0.3 + 12 * Math.sin(Math.PI * u), q.z + (h.fromZ - q.z) * (1 - u));
    h.pot.rotation.z = t * 3;
    const steamAge = h.dousedAt < 0 ? -1 : rt.t - h.dousedAt;
    h.smoke.visible = age >= 1.2 && !q.doused; h.steam.visible = steamAge >= 0 && steamAge < 4;
    for (let j = 0; j < 6; j++) {
      const f = S.reduceMotion ? j / 6 : (t * 0.18 + j / 6) % 1;
      // 視点へ向ける板の行列も、既存の入れ物で更新する。
      D.quaternion.copy(rt.camera.quaternion); D.position.set(q.x + f * 3.8, DECK.y + 1 + f * 6, q.z + f * 1.5);
      D.scale.setScalar((0.3 + f * 1.5) * Math.sin(Math.PI * f)); D.updateMatrix(); h.smoke.setMatrixAt(j, D.matrix);
      D.position.set(q.x + j * 0.16, DECK.y + 0.3 + (S.reduceMotion ? 0 : Math.max(0, steamAge) * 0.7) + j * 0.15, q.z);
      D.scale.setScalar(Math.max(0, 1 - Math.max(0, steamAge) / 4) * (0.45 + j * 0.1)); D.updateMatrix(); h.steam.setMatrixAt(j, D.matrix);
    }
    h.smoke.instanceMatrix.needsUpdate = h.steam.instanceMatrix.needsUpdate = true;
  }
}

// 沖の撃ち合い（見せるだけ。手柄・当たり・兵には触れない）。開戦から、毛利の関船が大筒・大鉄砲を放つ白煙と火、
// 小早が投げる焙烙の火の玉が、自船の西の水面へ落ちて燃える（10/29 採点：25秒の画面に大筒の煙も焙烙の火も無かった）。
// 形と材質は開戦時に一度だけ作り、玉と閃光は三つずつ使い回す。間合いと数は推定。
function seaAmbientInit(rt) {
  const F = rt.flags;
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd08a, transparent: true, opacity: 0.9, depthWrite: false, fog: false });
  const ballMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, fog: false });
  const flashGeo = new THREE.SphereGeometry(1, 8, 5), ballGeo = new THREE.SphereGeometry(0.28, 8, 6);
  const mk = (g, m) => { const o = new THREE.Mesh(g, m); o.visible = false; o.renderOrder = 3; rt.scene.add(o); return o; };
  F.seaAmb = { gunAt: rt.t + 3, potAt: rt.t + 5, k: 0, flashes: [0, 1, 2].map(() => ({ m: mk(flashGeo, flashMat), at: -9 })),
    pots: [0, 1, 2].map(() => ({ m: mk(ballGeo, ballMat), start: -9, from: { x: 0, z: 0 }, to: { x: 0, z: 0 }, trailAt: 0 })) };
}
function seaAmbient(rt, dt) {
  const F = rt.flags, A = F.seaAmb; if (!A) return;
  const on = F.step >= 1 && F.step <= 4 && !F.bigSunk && !F.ending && !rt.over;
  const P = rt.player.u.pos;
  // 大筒・大鉄砲：沖の関船か小早の舷から白煙と閃光。二・三秒おきに、自船から四十〜二百歩の船だけ。
  if (on && rt.t >= A.gunAt) {
    A.gunAt = rt.t + 1.3 + Math.random() * 0.9;
    // 近い敵船（二十〜九十歩）と沖の船を交互に。近い船の煙ほど大きく写る。
    const near = F.boats.filter((b) => b.alive && !b.supply && Math.hypot(b.x - P.x, b.z - P.z) > 20 && Math.hypot(b.x - P.x, b.z - P.z) < 90);
    const pool = A.k % 2 === 0 && near.length ? near.map((b) => ({ x: b.x, z: b.z }))
      : F.far.filter((m) => { const d = Math.hypot(m.position.x - P.x, m.position.z - P.z); return d > 40 && d < 200 && !m.userData.departed; }).map((m) => ({ x: m.position.x, z: m.position.z }));
    const m = pool[(A.k++ * 7) % Math.max(1, pool.length)];
    if (m) {
      const dx = P.x - m.x, dz = P.z - m.z, L = Math.hypot(dx, dz) || 1;
      const x = m.x + dx / L * 3, z = m.z + dz / L * 3;
      rt.army.smoke(x, 2.2, z, dx / L, dz / L, 2);
      rt.army.smoke(x + dz / L * 2, 2.6, z - dx / L * 2, dx / L, dz / L, 2);
      rt.army.smoke(x - dz / L * 2, 3.2, z + dx / L * 2, dx / L, dz / L, 2);
      const f = A.flashes[A.k % 3]; f.at = rt.t; f.m.position.set(x, 2.3, z);
      if (L < 120) rt.army.play('volley', { x, y: 2, z }, 0.5);
    }
  }
  for (const f of A.flashes) { const a = rt.t - f.at; f.m.visible = !S.reduceMotion && a >= 0 && a < 0.18; if (f.m.visible) f.m.scale.setScalar(0.9 + a * 6); }
  // 焙烙：近い小早から火の玉が弧を描き、自船の西の水面へ落ちて燃える（数秒で消える）。
  if (on && rt.t >= A.potAt) {
    A.potAt = rt.t + 2.8 + Math.random() * 1.4;
    const src = F.boats.find((b) => b.alive && !b.big && !b.supply && Math.hypot(b.x - P.x, b.z - P.z) < 90) || F.far.map((m) => ({ x: m.position.x, z: m.position.z }))
      .find((b) => Math.hypot(b.x - P.x, b.z - P.z) < 120);
    const h = A.pots.find((q) => rt.t - q.start > 2.4);
    if (src && h) {
      h.start = rt.t; h.from.x = src.x; h.from.z = src.z;
      h.to.x = DECK.x0 - 4 - Math.random() * 7; h.to.z = P.z + 2 + Math.random() * 10;   // 屋形の西の通路から見える沖寄りの水面
      h.landed = false;
    }
  }
  for (const h of A.pots) {
    const age = rt.t - h.start, u = age / 1.6;
    h.m.visible = u >= 0 && u < 1;
    if (h.m.visible) {
      h.m.position.set(h.from.x + (h.to.x - h.from.x) * u, 1.5 + 14 * Math.sin(Math.PI * u), h.from.z + (h.to.z - h.from.z) * u);
      if (rt.t >= h.trailAt) { h.trailAt = rt.t + 0.12; rt.army.smoke(h.m.position.x, h.m.position.y, h.m.position.z, 0, 0, 0.3); }
    } else if (u >= 1 && !h.landed && h.start > 0) {
      h.landed = true;
      rt.army.play('houroku', { x: h.to.x, y: 0.5, z: h.to.z }, 0.6);
      rt.army.smoke(h.to.x, 0.6, h.to.z, 0, 0, 2);
      const fire = rt.world.addFire(h.to.x, h.to.z, { h: 0.25 - rt.world.heightAt(h.to.x, h.to.z), size: 2, smoke: false });   // 海底の高さでなく水面に浮かべる
      rt.after(4.5, () => rt.world.removeFire(fire));
    }
  }
}
// 大筒：青銅色の筒（尾栓の玉・帯・筒口の張り出し）を、木の台に載せる。筒は -x（西の舷の外）を向く
let GUNG = null;
function taihou(M) {
  if (!GUNG) {
    const prof = [[0, -1.7], [0.22, -1.72], [0.3, -1.6], [0.38, -1.45], [0.4, -1.3], [0.36, -1.2], [0.36, 0.9], [0.33, 1.0], [0.3, 1.1], [0.3, 1.45], [0.36, 1.55], [0.37, 1.68], [0.2, 1.7], [0.16, 1.4], [0.15, -1.0]];
    GUNG = { barrel: new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 14), band: new THREE.TorusGeometry(0.39, 0.065, 5, 14), bed: new THREE.BoxGeometry(2.6, 0.5, 1.1), cheek: new THREE.BoxGeometry(1.4, 0.7, 0.18), soot: new THREE.TorusGeometry(0.26, 0.09, 5, 14), fuse: new THREE.CylinderGeometry(0.025, 0.025, 0.25, 4) };
  }
  const g = new THREE.Group();
  const b = new THREE.Mesh(GUNG.barrel, M.copper); b.rotation.z = Math.PI / 2; g.add(b);
  for (const y of [-0.9, 0, 0.8]) { const r = new THREE.Mesh(GUNG.band, M.iron); r.rotation.y = Math.PI / 2; r.position.x = -y; g.add(r); }
  const soot = new THREE.Mesh(GUNG.soot, M.black); soot.rotation.y = Math.PI / 2; soot.position.x = -1.68; g.add(soot);
  const vent = new THREE.Mesh(rigParts().box, M.iron); vent.scale.set(0.18, 0.08, 0.18); vent.position.set(1.15, 0.34, 0); g.add(vent);
  const hole = new THREE.Mesh(rigParts().box, M.black); hole.scale.set(0.055, 0.012, 0.055); hole.position.set(1.15, 0.385, 0); g.add(hole);
  for (const x of [-0.65, 1.15]) { const brace = new THREE.Mesh(rigParts().box, M.wood); brace.scale.set(0.22, 0.24, 1.25); brace.position.set(x, -0.75, 0); g.add(brace); }
  const fuse = new THREE.Mesh(GUNG.fuse, M.rope); fuse.position.set(1.2, 0.4, 0); fuse.rotation.z = -0.3; g.add(fuse);
  const bed = new THREE.Mesh(GUNG.bed, M.dark); bed.position.set(0.3, -0.7, 0); g.add(bed);
  for (const sd of [-1, 1]) { const c = new THREE.Mesh(GUNG.cheek, M.wood); c.position.set(0.5, -0.3, sd * 0.45); g.add(c); }
  for (const m of g.children) m.castShadow = m.material !== RIG?.foamMat;
  return g;
}

// 信長公記巻十一・多聞院日記・九鬼御伝記。六艘を三艘ずつ二手に分ける。
// 将船は九鬼。弥五助・右馬之丞の担当する船の細かな順、毛利の各手の将は不明。
// 兵数は船数から置いた遊びの目安。南西から来る六百余艘を四手の影で表す。
const JIN = [
  rosterPlan('三艘ずつ二手', 0, { x: 0, z: 0 }, -Math.PI / 4, [
    ['kuki', '大将船', '九鬼嘉隆', 120, 1, 4, 'oda', 'oda', 0, { ships: 1, bind: 'kuki' }],
    ['yagosukeA', '一の手の供船', '弥五助', 120, 38, -42, 'oda', 'oda', 0, { ships: 1, bind: 'escorts.0' }],
    ['yagosukeB', '一の手の供船', '弥五助の配下（名は不明）', 120, 76, -84, 'oda', 'oda', 0, { ships: 1, bind: 'escorts.1' }],
    ['umanojoA', '二の手の将船', '右馬之丞', 120, -40, 56, 'oda', 'oda', 0, { ships: 1, bind: 'escorts.2' }],
    ['umanojoB', '二の手の供船', '右馬之丞の配下（名は不明）', 120, -2, 98, 'oda', 'oda', 0, { ships: 1, bind: 'escorts.3' }],
    ['umanojoC', '二の手の供船', '右馬之丞の配下（名は不明）', 120, 36, 140, 'oda', 'oda', 0, { ships: 1, bind: 'escorts.4' }],
  ], '九鬼御伝記の二手。九鬼の自船を含めた並びと兵数は推定、織田の旗は既存の代用'),
  rosterPlan('川口へ寄せる船団', 1, { x: -220, z: 150 }, Math.PI * 3 / 4, [
    ['front', '先手の関船・小早', '毛利・村上の将（名は不明）', 1200, -130, 65, 'mori', 'mori', 0, { ships: 150, bind: 'far.0' }],
    ['west', '西から包む手', '毛利・村上の将（名は不明）', 1200, -226, 35, 'mori', 'mori', 0, { ships: 150, bind: 'far.6' }],
    ['south', '南から包む手', '毛利・村上の将（名は不明）', 1200, -70, 149, 'mori', 'mori', 0, { ships: 150, bind: 'far.27' }],
    ['supply', '兵糧船と後備え', '毛利方の将（名は不明）', 1200, -226, 149, 'mori', 'mori', 0, { ships: 150, bind: 'far.33' }],
  ], '信長公記巻十一の六百余艘。各手の船数・兵数・将・家紋は不明、毛利の旗で代表する'),
];
const kizugawa = {
  pauseRetry: true, // 深手で戻る所を選ぶ間は甲板の戦闘を止める。札の期限は共通側で進む。
  // 稲生の型。兵数と海戦の仕組みを保ち、任務と印だけをそろえる。
  missionSingleLine: true,
  hideMissionDots: true,
  enemyTriangleSigns: true,
  nearbyAllySignLimit: 0,
  noDodgeCard: true,
  noPlayerFoot: true,
  quietMiss: true,
  missionPinCaption: '',
  missionDetail: () => '',
  missionStatus: () => '',
  bannerAllowed: (rt) => rt.over || !!rt.flags.ending,
  missions: ['大筒へ', '敵船を撃て', 'ここを守れ', '水桶を取れ', '火を消せ', '▼の敵を倒せ', '大将船を撃て', '敵船を待て'],
  missionOf(rt) {
    const F = rt.flags;
    if (F.ending || rt.over) return 2;
    if (F.step === 2) return F.doused >= 3 ? 2 : F.water ? 4 : 3;
    const enemy = nearestDeckObjective(rt);
    const distance = enemy ? Math.hypot(enemy.pos.x - rt.player.u.pos.x, enemy.pos.z - rt.player.u.pos.z) : Infinity;
    if (enemy && (F.step === 3 || F.step === 5 || F.bigSunk || distance < (F.step === 4 ? 4.5 : 8) || F.kukiDanger)) return 5;
    if (F.kukiDanger || F.step === 3 || F.step === 5 || F.bigSunk) return 2;
    const c = F.cannonPost || F.guns?.[1];
    if (!c) return 0;
    if (rt.t < c.cd) return 2;
    if (deckRouteDistance(rt.player.u, c.post) > 2.6) return 0;
    const boat = cannonTarget(F, c);
    if (!boat || !cannonFacing(boat, c) || Math.hypot(boat.x - c.x, boat.z - c.z) > 55) return 7;
    return F.step === 4 ? 6 : 1;
  },
  missionHeading(rt) { return this.missions[this.missionOf(rt)]; },
  // 主の実名は伝わらない。大将船の既存の乗員を使い、兵は増やさない。
  commanderSignTarget(rt) {
    const F = rt.flags, u = F.bigCommander;
    return F.step === 4 && !F.bigSunk && !F.ending && !rt.over && u?.alive &&
      !u.gone && !u.dying && !u.fleeing && !u.woundOut ? u : null;
  },
  commanderTarget(rt) { return this.missionOf(rt) === 6 ? this.commanderSignTarget(rt) : null; },
  namedGuideTarget(rt) { return this.commanderSignTarget(rt); },
  missionSignTarget(rt) { return this.missionOf(rt) === 5 ? nearestDeckObjective(rt) : null; },
  missionPin(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive) return null;
    const stage = this.missionOf(rt), me = rt.player.u;
    const q = F.deckPin || (F.deckPin = { x: 0, y: DECK.y, z: 0 });
    q.unit = null; q.enemy = false; q.waiting = false; q.defend = false; q.arrived = false;
    q.route = false; q.fire = false; q.marker = null; q.always = true; q.silent = true;
    q.arrow = false; q.approach = false; q.r = 2; q.hide = 0; q.y = DECK.y;
    let goal = null;
    if (stage === 3 || stage === 4) {
      let distance = Infinity;
      for (const it of rt.interacts) {
        if (!(stage === 3 ? /^water[0-3]$/.test(it.id) : /^f[0-2]$/.test(it.id)) || it.r <= 0) continue;
        const d = deckRouteDistance(me, it.pos);
        if (d < distance) { distance = d; goal = it.pos; q.r = it.r; }
      }
    } else if (stage === 5) {
      const enemy = nearestDeckObjective(rt);
      if (!enemy) return null;
      goal = enemy.pos; q.unit = enemy; q.enemy = true; q.approach = true; q.r = q.hide = .2;
      q.y = enemy.pos.y;
    } else if (stage === 2 && (F.kukiDanger || F.step === 3 || F.step === 5 || F.bigSunk)) {
      goal = F.kukiDanger ? F.roofDanger ? F.roofPost : F.kukiU.pos : F.guardPost;
      q.defend = q.waiting = true;
    } else {
      goal = (F.cannonPost || F.guns?.[1])?.post;
      q.r = 2.6; q.waiting = stage !== 0; q.defend = stage === 2;
    }
    if (!goal) return null;
    const way = me.pos.y > DECK.y + .5 ? goal : deckWay(me, goal);
    q.route = Math.hypot(way.x - goal.x, way.z - goal.z) > .1;
    q.x = way.x; q.z = way.z;
    if (q.route) { q.unit = null; q.enemy = false; q.waiting = q.defend = false; q.r = .5; q.y = DECK.y; }
    q.arrived = Math.hypot(me.pos.x - goal.x, me.pos.z - goal.z) <= q.r && !q.route;
    return q;
  },
  // 「敵を退け」を自軍の撤退命令と取り違えない。海戦固有の声と合図は保つ。
  armySignals: false,
  arrivalLabel: '持ち場に着いた',
  // 敵船の射程と、甲板を歩く距離を同じ数字だけで並べない。
  distanceText: () => '',
  // 守備への切り替えを携帯にもすぐ示す。共通の十秒の表示待ちを使わない。
  immediateTaskChanges: true,
  // 船を守る任務を、近い一人の討取り札で上書きしない。
  keepTaskLabel: true,
  // 船には退避用の旗はない。画面外でも歩数で下知を消さず、甲板の印へ案内する。
  hideGuideSteps: true,
  keepDestinationTask: true,
  namedGuideMarkers: true,
  edgeDestinationLabel(rt) {
    const id = rt.missionGuide?.marker?.id || '';
    return /^g[0-2]$/.test(id) ? '大筒へ' : id === 'kuki' ? '守りへ' : id === 'guard' ? '乗り口へ' : '印へ';
  },
  travelGuideLabel(rt) {
    const id = rt.missionGuide?.marker?.id || '';
    return /^g[0-2]$/.test(id) ? '大筒へ進め' : id === 'guard' ? '乗り口を守れ' :
      /^water/.test(id) ? '水桶を取れ' : /^f[0-2]$/.test(id) ? '火を消せ' : '甲板の印へ';
  },
  // 近い味方への一般的な救援札で、屋形へ戻る下知を消さない。
  keepRescueTaskLabel: true,
  // 一般の味方の盾と輪で持ち場の下知を隠さない。屋形の救援時だけ示す。
  guardGuideAllowed(rt) {
    const F = rt.flags;
    return !!F.kukiDanger && F.step !== 2 && F.step !== 5 && !F.bigSunk;
  },
  compactGuardGuide: true,
  // 止血後も残る手足の傷だけで、船を守る下知を退避へ替え続けない。
  // 出血・瀕死・包囲の退避と手当ては共通の判定を残す。
  retreatForLimbWounds: false,
  woundEffectMin: 0.05,
  // 狭い甲板では任務と直近の声を優先し、三枚目の下知を重ねない。
  noticeLimit: 2,
  // 狭い甲板では回避先を小さな隅で示し、迫る敵と通り道を隠さない。
  compactFieldGuides: true,
  // 逃げ先は実物の旗と区別し、甲板の小さなひし形で示す。
  compactDodgeGuide: true,
  // この船だけ、回避先を旗竿のない小さなひし形にする。
  dodgeDiamondSign: true,
  // 振り向く手の絵を居座らせず、甲板と迫る敵を空ける。
  dodgeTurnDuration: 3,
  // 砲撃の回避説明で船団と戦の時計を止めない。見回しの練習は稽古場へ任せる。
  pauseTurnPractice: false,
  dodgeAvoidNotices: true,
  // 横持ちの出血札と、歩く側の手当て釦に間を空ける。
  treatmentControlLift: 40,
  // 手当て先の言葉と印を合わせる。大きな旗で大筒と敵を隠さない。
  treatmentDestinationCross: true,
  treatmentApproachLabel: '十字の印へ下がる',
  // 移動だけでは止血しない。十字まで退く案内と、その後の長押しを分ける。
  treatmentMoveCaption: '傷を縛る。十字へ下がれ',
  treatmentGuideLabel(rt, cue) {
    const p = rt.player;
    // 自分の止血と九鬼の救援を一枚へ混ぜない。止血後は元の守備の任務へ戻る。
    return p.treatmentReady ? p.treating ? '手当てを押し続けよ' : '「手当て」を三秒長押し' :
      !cue?.valid ? '傷を縛るため、味方の後ろへ' :
      Math.hypot(cue.x - p.u.pos.x, cue.z - p.u.pos.z) >= cue.radius ? '十字へ下がり、傷を縛れ' :
      p.treatmentNext > rt.t ? 'ここで構え、少し待て' : '足を止め、支度を待て';
  },
  compactCombatGuides: true,
  // 接近した視点でも、移動先の大きな楕円を足元の小さな印に置き換える。
  groundCombatMarkers: true,
  softGuideRings: true,
  // 近い持ち場と回避先は細い小印にそろえ、船板を白黒の縁で覆わない。
  compactGroundGoalRing: true,
  subtleGroundGuides: true,
  // 近い甲板を光の帯や太い囲みで覆わず、槍先と相手の姿を見せる。
  hideWeaponTrail: true,
  subtleTargetFrames: true,
  // 骨の描画更新と現在地を混ぜて、海や空の甲板を囲まない。
  positionPersonGuide: true,
  bodyHeightGuides: true,
  // 描画側が読む指定で、相手を太い箱ではなく細い四隅で示す。
  cornerEnemyGuide: true,
  sightBlocked(rt, from, to, ay, by) {
    return cabinSightBlocked(from, to, ay, by);
  },
  // 低い小舟や屋形の上の兵へ、同じ床を歩く接近案内を出さない。
  meleeThreatHeight: 0.9,
  meleeGuide(rt, enemy) {
    return this.enemyGuideAllowed(rt, enemy);
  },
  enemyGuideAllowed(rt, enemy) {
    return !!enemy && deckEnemy(enemy) &&
      Math.abs(enemy.pos.y - rt.player.u.pos.y) < 0.9 &&
      !cabinDeckBlocked(rt.player.u.pos, enemy.pos);
  },
  // 待機範囲を甲板いっぱいに描かず、持ち場の小さな印で示す。
  compactHoldGuide: true,
  // 持ち場へ着いたら進む矢印を畳み、敵船を待つ札と小さな足元印を残す。
  hideArrivedDestination: true,
  // 大筒の待機範囲も、近景で甲板を横切る輪は省き、任務札と道筋で案内する。
  compactDestinationArea: true,
  // 強調した退避先も足元の小さな輪にそろえる。到着の判定は変えない。
  smallTaskAreas: true,
  smallRetreatAreas: true,
  taskAreaFootRing: true,
  compactGuardArea: true,
  compactRetreatArea: true,
  compactRetreatSign: true,
  // 甲板を横切る点線の列は、足元の短い矢印一本へまとめる。
  singleRetreatArrow: true,
  compactFloorGuides: true,
  // 退く時の旗印も小さくし、目の前の兵と甲板を空ける。
  compactDestinationSign: true,
  // 待つ持ち場も縮め、頭上の旗と結ぶ線を足元の小印へまとめる。
  groundFlagGuides: true,
  footFlagGuides: true,
  goalFlagScale: 0.4,
  // 自分の姿は見えている。足元の太い白黒の輪で船板を覆わない。
  hidePlayerSign: true,
  // 見回しの案内が別に描く本人の縦枠も抑え、具足と足元を見せる。
  playerFootSignOnly: true,
  // 通常は人の姿と頭上の印で見分ける。白い人型は見やすさを強めた設定だけに残す。
  teamSignsOnly: true,
  // 姿勢に追従しない人型を本人へ重ねず、実際の具足を見せる。
  noUnitContrast: true,
  compactIntro: true,
  // 構え・回避の練習中も、守る場所と九鬼嘉隆の危険を読めるようにする。
  keepCombatTask: true,
  // 接敵しても「刀の印へ」だけに替えず、乗り口や屋形を守る下知を残す。
  keepCombatTaskHeading: true,
  keepTaskWithGuard: true,
  keepTaskWithDodge: true,
  // 携帯でも行き先と退く理由を残し、「ここ」「この中」だけにしない。
  keepOpeningTaskLabel: true,
  keepRetreatReason: true,
  keepWoundRetreatReason: true,
  // 指の向きだけの札で、負傷の理由と十字の行き先を消さない。
  keepRetreatGestureReason: true,
  // 敵船を待つ時も、実物にない旗をなぞる案内へ替えない。
  keepWaitFacingLabel: true,
  meleeControlGuide: true,
  meleeTurnText: '敵へ槍を向けよう',
  meleeApproachText(rt) { return this.meleeApproachLabel(rt); },
  meleeApproachLabel(rt) {
    if (rt.flags.roofDanger) return '近い敵を退け、屋形を守れ';
    if (rt.flags.kukiDanger) return '近い敵を退け、九鬼嘉隆を守れ';
    const enemy = rt.hud.approachGuideEnemy;
    if (!enemy || !deckEnemy(enemy)) return '乗り口で、上がる敵を防げ';
    return enemy.pos.z >= 9 ? '南の乗り口の敵へ進め' :
      enemy.pos.z >= 2 ? '屋形の前の敵へ進め' :
      enemy.pos.x <= -2 ? '西の船べりの敵へ進め' : '近い敵へ進み、槍で防げ';
  },
  guardStartText: '「構え」を長押し',
  guardWaitText: '敵へ槍を向けて防げ',
  // 横持ちの回避釦で、語尾一字だけを次の行へ送らない。
  dodgeActionText: 'ここを長押し',
  guardLabel: (rt, u) => rt.flags.kukiDanger || u && u === rt.flags.kukiU ? rescueTask(rt) : '近い味方を守れ',
  openingMoveLabel: '大筒へ。上へなぞる',
  introText: 'まず印をたどり、西の船べりの大筒へ。敵を防ぎ、合図で撃とう。',
  // 横持ちでは待つ理由と、撃てる時の操作を短い一文で示す。
  // 横持ちの短い札でも「待て」の一字だけを次の行へ送らない。
  taskText(_rt, text) {
    return text
      .replace(/^西の大筒へ。敵船を待て$/, '西の大筒で待て')
      .replace(/^西の大筒へ。船が近寄るのを待て$/, '敵船が遠い。大筒で待て')
      .replace(/^西の大筒へ。船の横腹を待て$/, '西の大筒で横腹を待て')
      .replace(/^西の大筒で敵船を迎えよ$/, '船べりの大筒へ進め')
      .replace(/^西の大筒で(?:大船の横腹|迫る敵船)を撃て$/, '「大筒を撃つ」を長押し')
      .replace(/^西の大筒で敵船の横腹を撃て$/, '大筒で敵船の横腹を撃て')
      .replace(/^弾込め中。西の船べりを見張れ$/, '弾込め中。西を見張れ')
      .replace(/^目の前の敵へ向き、構えて防げ$/, '敵へ向き、構えよ')
      .replace(/^敵の法螺貝と退き太鼓。甲板を守り、残る敵を押し返せ$/, '甲板に残る敵を退けよ')
      .replace(/^甲板を守り、退く(?:敵)?船を見張れ$/, '敵船を見張り、船を守れ');
  },
  // 見張る下知は見出しにある。補足には砲手の残り時間だけを置く。
  taskDetail(_rt, title, progress) {
    return /^弾込め中。/.test(title) ?
      progress.replace(/^弾込めあと(\d+)秒。西の船べりを見張れ$/, '砲手の弾込め あと$1秒') : progress;
  },
  // ひし形の意味を、回避する理由と一緒に示す。画面外の方向は保つ。
  dodgeLabel(_rt, direction, rain) {
    return direction ? direction.replace('の印へ', 'へよけよう') : rain ? '矢をよけよう' : '横へよけよう';
  },
  // 甲板に旗で囲った避難所はない。既存の回避先を指す言葉にそろえる。
  dodgeGuideLabel(_rt, arrived, rain) {
    return rain ? arrived ? 'ここで矢をよけよう' : '矢が来る。印へよけよう' :
      arrived ? 'ここで敵を防げ' : '印の方へよけよう';
  },
  // 矢の回避札も、描かない輪ではなく甲板の印へ案内する。
  rainDodgeGuideLabel(rt, arrived) { return this.dodgeGuideLabel(rt, arrived, true); },
  dodgeMoveLabel(_rt, direction, rain) {
    return `${rain ? '矢をよける。' : '敵から離れる。'}${S.touchSwap ? '右' : '左'}側を${direction}へなぞる`;
  },
  dodgeTurnLabel(_rt, right, touch) {
    const reason = _rt.army.rainEscape ? '矢が来る。' : '横へよける。';
    return touch ? `${reason}${S.touchSwap ? '左' : '右'}側を${right ? '右' : '左'}へなぞる` :
      `${reason}手元の操作器を${right ? '右' : '左'}へ動かす`;
  },
  // 回避も退避も、屋形の中や船べりの外へ案内しない。
  dodgePointAllowed(rt, point) {
    return this.retreatPointAllowed(rt, point);
  },
  // 負傷時の退避は回避とは別の案内。陸戦の「旗の囲み」を探させない。
  retreatGuideLabel(rt, arrived) {
    const cue = rt.hud.retreatGuide, p = rt.player, u = p.u;
    // 安全な手当て先がまだなくても、出血による退避の目的は消さない。
    if (u.wounds?.bleed > 0.0001 || cue?.active && cue.treatment) return this.treatmentGuideLabel(rt, cue);
    if (arrived) return 'ここで敵へ向き、構えよ';
    // 九鬼の危険を退避の理由にすると、救援の印と取り違える。
    const reason = u.hp < u.maxHp * 0.3 ? '深手だ。' : u.mobbed ? '囲まれる。' :
      p.sta < 20 ? '息切れだ。' : '敵が近い。';
    return reason + (cue?.valid ? '矢印へ下がれ' : '味方の後ろへ下がれ');
  },
  retreatPointAllowed(rt, point) {
    // 船べりの外の海底や屋形の壁の中を、安全な退き先に選ばない。
    if (point.x < DECK.x0 + 0.7 || point.x > DECK.x1 - 0.7 ||
        point.z < DECK.z0 + 0.7 || point.z > DECK.z1 - 0.7) return false;
    if (rt.player.u.pos.y > DECK.y + 0.5) return true;
    return point.x < CABIN.x0 - 0.4 || point.x > CABIN.x1 + 0.4 ||
      point.z < CABIN.z0 - 0.4 || point.z > CABIN.z1 + 0.4;
  },
  headBlocked: boardingThreat,
  jinkei: JIN,
  battleVoices: { lines: { ally: {
    // 敵の一手が退いても、海へ追わせず自船の守りを続ける。
    rout: ['乗り込んだ敵が退く！　船べりを守れ！', '敵の一手を退けた！　次の小舟に備えよ！'],
    regroup: ['敵が下がった。船べりで構え、次の寄せに備えよ！'],
    reload: ['敵の鉄砲が弾込めじゃ！　船べりの陰で構え直せ！'],
  }, enemy: {
    ambient: ['櫓をそろえよ。船べりへ寄せるぞ', '毛利の旗を見失うな', '鉤縄を掛けるぞ'],
    nanori: ['毛利の水軍ぞ！', '兵糧の道を開け！'],
  } } },
  noHorse: true,   // 海上の戦。騎馬の組も徒の槍に替え、乗馬の検査から外す
  // 飾りの伝令は軍の乗馬禁止を通らない。陸路のない船には置かない。
  noCouriers: true,
  noControlsHelp: true, // 操作の字（なぞって動く・つく）は出さない（操作は尾張の戦で覚える。kaito 10/20）
  // 通路の幅いっぱいに笠が迫る前に、視点へ入る味方を既存の全身回避へ渡す。
  nearAllyFadeRadius: 2,
  nearAllySolidBody: true,
  // 味方が自分を隠す時も全身を一緒に避け、顔や首布だけを宙へ残さない。
  nearAllyWholeOcclusion: true,
  // 笠だけ透かして首布を浮かせず、視点へ入る時は既存の全身回避へ任せる。
  nearHatFadeRadius: 0,
  nearFlagFadeRadius: 4.5,
  // 肩のすぐ後ろから入る槍と隊旗の竿も、既存の描画時の処理で避ける。
  nearLongWeaponRadius: 4.5,
  nearSpearFade: true,
  prelude: false,   // 船団は既に包囲へ寄せている。陸戦の開戦待ちを重ねない。
  softOpen: 90,   // 最初の乗り込みは傷を半分にし、大筒と構えを覚える間を残す。
  // 狭い甲板で重なる槍に、構え直して退く間を作る。矢玉・火傷と難しい戦は従来どおり。
  meleeGrace: { rate: 0.025, burst: 0.08, interval: 0.85 },
  // 肩越しの視点が甲板の外へ出て、楯板越しに自分を透かさないようにする。
  // 上甲板と一人称の視点には手を加えない。床や兵の位置は動かさない。
  clampCamera(rt, pos) {
    if (rt.player.fpK >= 0.5 || rt.player.u.pos.y > DECK.y + 0.5) return;
    pos.x = Math.max(DECK.x0 + 0.4, Math.min(DECK.x1 - 0.4, pos.x));
    pos.z = Math.max(DECK.z0 + 0.4, Math.min(DECK.z1 - 0.4, pos.z));
    pos.y = Math.max(DECK.y + 0.9, pos.y);
    // 舷で止めた視点も屋形へめり込ませない。軒の余白を含めて通路側へ戻す。
    if (pos.z > 4.45 && pos.z < 13.55 && Math.abs(pos.x) < 3.55) {
      if (rt.player.u.pos.z <= 4.45) pos.z = 4.45;
      else pos.x = rt.player.u.pos.x < 0 ? -3.55 : 3.55;
    }
  },
  // 東の船べりから離し、最初の持ち場へ向く。肩越しの視点を引く余地を残す。
  playerTaken: 0.3, // 10/28 旗艦の乗り込みで囲まれて倒れる事が五戦に二度あった（0.4→0.3）。// 狭い甲板で乗り込みの足軽に囲まれ、守り切る前に倒れていた（bot 10/26 に四度）。傷を半分に
  playerRegen: 0.03, // 打ち合いの合間（四秒当たらない間）はゆっくり命が戻る
  spawn: { x: 0, z: -4, heading: -Math.atan2(3, 4) },
  // 総矢倉（x±2.5・z5.5〜12.5）の脇を歩く間、肩越しの視点を船べり側へ離し、視線も外へ少し振る。
  // 黒い壁が画面の半分をふさがず、狭間と鉄板の継ぎ目が斜めに読める。甲板の外の時は何もしない。
  // 上の寄せた視点を、壁よけの後ろ引き（四歩・三歩）が総矢倉の脇へ戻さないようにする。
  cameraBodyClear(rt, c) {
    const p = rt.player.u.pos, ship = rt.flags.deckShip;
    if (!ship || p.y < DECK.y - 0.5 || p.y > DECK.y + 1.2) return true;
    const sx = p.x - ship.position.x, sz = p.z - ship.position.z;
    if (Math.abs(sx) < 2.6 || Math.abs(sx) > 5.6 || sz < 2 || sz >= 9.5) return true;
    return rt.flags.wallFrameAt !== rt.t; // 寄せた視点のある間は、壁よけの別の候補へ移さない。
  },
  // 沖を肩越しに見る間だけ、体を収めるための広角を抑える。広げると総矢倉の前の面が左の三割を占める。
  get maxFramedFov() { return this.seaFrameRt && this.seaFrameAt === this.seaFrameRt.t ? 48 : undefined; },
  frameCamera(rt, pos, look) {
    const p = rt.player.u.pos, ship = rt.flags.deckShip;
    if (!ship || p.y < DECK.y - 0.5 || p.y > DECK.y + 1.2) return;
    const sx = p.x - ship.position.x, sz = p.z - ship.position.z;
    if (Math.abs(sx) < 2.6 || Math.abs(sx) > 5.6 || sz < 2 || sz > 15) return;
    // 10/28 採点：まだ右半分が黒い壁。視点をもう少し船べりへ、視線を外の海と小舟の列へ振る。
    const sg = Math.sign(sx), out = ship.position.x + sg * Math.min(5.5, Math.abs(sx) + 2);
    if (sg * (pos.x - out) < 0) pos.x = out;
    look.x += sg * 2.6;
    // 10/29 採点：まだ右の四割が壁。最後の構図は視点から本人へ向くので、船べりの外から見ると視線が壁へ向く。
    // 総矢倉の前の端（z5.5）の近くでは、視点を壁ぎわ（本人より内）へ寄せて本人の後ろ二歩に縮め、
    // 視線を船の外寄りの舳先へ向ける。壁は視点の脇から後ろへ回り、画面の右の端の角だけになる。
    // 10/29 夜（二度目）：毛利の船団は西の沖から艫の側（-x・+z）に並ぶ。舳先を向くと船団は左の外、総矢倉が右の四割。
    // 西の舷で総矢倉より前に居る間は、視点を本人の内側・舳先寄りに置き、肩越しに西南西の沖を見る。
    // 総矢倉は視点の後ろへ回り、船団（大将の関船・小早の群れ・先手）が正面から右に並ぶ。
    if (sg < 0 && sz < 6.3) {
      pos.x = p.x + KZ_SEA_BACK.x; pos.z = p.z + KZ_SEA_BACK.z;
      rt.flags.wallFrameAt = rt.t;
      this.seaFrameRt = rt; this.seaFrameAt = rt.t;
      return;
    }
    if (sz < 9.5) {
      const back = Math.sign(pos.z - p.z) || 1;
      // 10/29 夜：3.56 では一段上の矢倉の床柱と梁（茶の箱）が視点の一歩先に来て、右の三割を暗い板でふさいでいた。
      // 船べりの楯板の内まで外へ出し、少し引く。総矢倉の前の面は二歩より遠くなり、鉄板の継ぎ目と狭間が読める。
      pos.x = ship.position.x + sg * 4.3;
      pos.z = p.z + back * 2.2; // 一歩より近いと体よけで外の肩へ逃げ、また壁を向く。二歩より近いと頭上へ上がり本人が画面の外へ出る。
      rt.flags.wallFrameAt = rt.t;
    }
  },
  world: {
    // 兵を作る側もこの印を見る。戦の表側の印だけでは武将の馬が残る。
    noHorse: true,
    // 舷と屋形の旗・旗持ちは保ち、無名の長柄兵の背旗だけを間引く。
    ordinaryFlagStride: 3,
    seaSound: 0.8, // 独自の水面でも、船べりに寄せて引く波を鳴らす。
    // 狭い船の弓兵数に合わせる。数十本の追加の矢と黒い着弾の影で甲板を覆わない。
    arrowRainPerBow: 1,
    // 立体の縞が甲板と海底をまたぐと床の破れに見える。矢と着弾の影は保つ。
    arrowRainGroundCue: false,
    // 味方の矢は本人に当たらないため、回避の警告も敵の斉射に限る。
    enemyArrowWarnings: true,
    naturalArrowRain: true,
    // 舷をまたぐ白黒の大輪で甲板を覆わない。矢・影・声と退き先の印は残す。
    arrowRainGroundCue: false,
    // 味方の斉射で大筒の持ち場から退かせない。敵の矢には従来の警告を使う。
    enemyArrowWarnings: true,
    // 一斉射の飾りの矢も床へ残さない。飛ぶ矢と人・船具へ刺さる矢は保つ。
    noGroundArrows: true,
    // 刺さった後も親の縮尺の変化を追い、抜け落ちる時まで矢の実寸を保つ。
    keepPinnedArrowSize: true,
    pinnedArrowAxisScale: true, // 斜めの矢も親の縦横の倍率を測り、長槍のように伸ばさない。
    // 描く直前に兵の体格が切り替わっても、刺さった矢の長さを保つ。
    pinnedArrowRenderScale: true,
    infantryWeight: true,
    lowHumanDetail: 16, // 目の前の兵を保ち、遠い兵の甲冑と骨の細部だけ軽くする。
    seed: 15786,
    // 舟の出発点と退き先（東へ430m・西へ350m）も場の内へ。
    // 舟上の兵だけが陸戦の端（176m）へ押し戻されるのを防ぐ。
    moveLim: 500,
    time: 'day', // 辰から午へ、共通の戦の時計で朝の光から続けて移ろう。
    fogFar: 360,
    // 陸戦の既定の八十メートルでは、迎える大船まで真っ白になる。
    // 船団の形を残す距離だけ延ばす。船や乗員の数・細かさは増やさない。
    battleViewDistance: 240,
    // 海風のある甲板を、鉄砲の硝煙だけで十八メートルの白い壁にしない。
    smokeFogFloor: 140,
    // 河口の沖を山で囲まない。遠い稜線だけを低く残す（位置と高さは推定）。
    mountainScale: 0.18,
    mountainHaze: 0.6,
    muddy: 0,
    contactFalls: true,
    settleSideFalls: true,
    settleFallenBody: true, // 軽い姿の亡骸も腰と胸を船板へ下ろし、胴だけを宙に残さない。
    noticeRepeatGap: 30,
    height,
    // 歩く高さの格子は保つ。描く地面だけ海底へ戻し、粗い三角形が
    // 船べりから斜めの崖となってはみ出すのを防ぐ。甲板は船自身の板で描く。
    prepareTerrain(W) {
      const geo = W.terrain.geometry, pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        if (Math.abs(pos.getX(i)) < 16 && Math.abs(pos.getZ(i)) < 24) pos.setY(i, -3);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals(); geo.computeBoundingBox(); geo.computeBoundingSphere();
    },
    blockedHint: () => '船べりで止まったら横へ進め。一歩内側へ戻り、屋形の前を回れ',
    playerVelocity(rt, vx, vz) {
      const u = rt.player.u, p = u.pos, q = rt.flags.deckVelocity;
      q.x = vx; q.z = vz;
      if (p.y > DECK.y + 0.5) return q;
      const goal = rt.missionGuide?.marker;
      const at = goal ? (typeof goal.pos === 'function' ? goal.pos() : goal.pos) : null;
      // 横へ滑れていても、前へ進めない理由をその場で知らせる。
      if ((Math.abs(p.x) > 4.5 && vx * p.x > 0 || Math.abs(p.z) > 11.8 && vz * p.z > 0) && !(rt.flags.railHintAt > rt.t)) {
        rt.flags.railHintAt = rt.t + 8;
        rt.hud.flash('船べりに当たった。横へ進め。一歩内側へ戻れば通れる', 'dim');
      }
      // 外向きに押し続けた時だけ、欄干に沿って通り道へすべらせる。
      if (Math.abs(p.x) > 4.5 && vx * p.x > 0) {
        q.x = -Math.sign(p.x) * Math.min(Math.abs(vx), 0.8);
        if (Math.abs(vz) < 0.2) q.z = Math.sign((at?.z ?? 0) - p.z || 1) * Math.abs(vx) * 0.65;
      }
      if (Math.abs(p.z) > 11.8 && vz * p.z > 0) {
        q.z = -Math.sign(p.z) * Math.min(Math.abs(vz), 0.8);
        if (Math.abs(vx) < 0.2) q.x = Math.sign((at?.x ?? 3.8) - p.x || 1) * Math.abs(vz) * 0.65;
      }
      return q;
    },
    clear: () => true,
    trees: 0,
    tufts: 0,
    // 甲板の地面は木の色、甲板の縁から海の底へ落ちる所は鉄の舷の色（前は芝の色のまま、船の縁から緑の崖がはみ出して見えた）
    tint(x, z, h, c) {
      if (x > 180 && h > 0) { const k = Math.min(1, (x - 180) / 280); c.setRGB(0.22 + k * 0.13, 0.29 + k * 0.14, 0.24 + k * 0.18); }
      else if (h > DECK.y - 0.05) c.setRGB(0.37, 0.3, 0.23);
      else c.setRGB(0.15, 0.145, 0.13);
    },
    // 逃げる兵も自分が乗って来た舟へ戻る。海へ出た瞬間の退場をしない。
    fleeOut: () => false,
    guideMarkerWay: true,   // 画面の端の案内も、屋形を避ける地面の矢印と同じ向きにする
    guideWay(u, want) { return u.pos.y > DECK.y + 0.5 ? want : deckWay(u, want); },
    moveWay(army, u, want) {
      if (u.shipPost) return u.shipBoat || u.shipTransit?.active ? u.shipPost : deckWay(u, u.shipPost);
      if ((u.fleeing || u.group?.boat?.withdrawing) && u.group?.boat?.exit) return deckWay(u, u.group.boat.landing);
      const q = deckWay(u, want);
      // 待機する鉄砲衆は筒の台と砲手の持ち場を空ける。敵を迎える時は従来どおり。
      if (u.team === 0 && u.type === 'gun' && !u.target?.alive && q.x < -3.3) {
        for (const c of CANNONS) if (Math.abs(q.z - c.z) < 1.35) {
          q.z = c.z + (q.z < c.z ? -1.35 : 1.35);
          break;
        }
      }
      return q;
    },
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    // 長い負傷の文が格子の最小幅を押し広げ、命の棒まで枠外へ出るのを防ぐ。
    // 木津川の札だけに適用し、次の戦へ移る時に外す。
    const hud = rt.hud.root, deckStyle = document.createElement('style');
    hud.classList.add('kizugawa-deck');
    deckStyle.textContent = `
html body #hud.kizugawa-deck .bl #h-hp.hp {
 width:100% !important; max-width:100%; min-width:0;
 grid-template-columns:minmax(0,1fr) auto !important;
}
html body #hud.kizugawa-deck .bl #h-hp.hp i { width:100%; min-width:0; }
html body #hud.kizugawa-deck .bl #h-hp.hp em,
html body #hud.kizugawa-deck .bl #h-hp.hp:is(.blood-loss,.deep) em {
 min-width:0; max-width:100%; justify-self:stretch;
 font-size:max(16px,calc(16px * var(--text-scale,1))) !important;
 white-space:normal; word-break:normal; overflow-wrap:anywhere;
}
@media (min-height:501px) {
 html body #hud.kizugawa-deck #battle-notices:not(.choosing),
 html body #hud.kizugawa-deck.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
  left:auto !important; right:calc(208px + env(safe-area-inset-right, 0px)) !important;
  top:104px !important; width:min(320px, calc(100vw - 248px)) !important;
  gap:8px; max-height:calc(100% - 304px) !important;
 }
 html body #hud.kizugawa-deck #battle-notices:not(.choosing) > :is(#objectives,#battle-message),
 html body #hud.kizugawa-deck.combat-instruction #battle-notices:not(.choosing) #objectives:not(.expand) {
  position:relative !important; inset:auto !important; transform:none !important;
  width:100% !important; max-width:100% !important; min-width:0; height:auto !important; flex:0 0 auto;
 }
 html body #hud.kizugawa-deck #battle-notices #objectives:not(.expand) :is(li.cur,.obj-text,.obj-now,.battle-action),
 html body #hud.kizugawa-deck #battle-notices :is(#subtitle,.battle-notice) {
  min-width:0 !important; max-width:100% !important; height:auto !important; max-height:none !important;
  white-space:normal !important; overflow-wrap:anywhere; overflow:visible !important;
  line-height:1.5 !important; -webkit-line-clamp:unset; line-clamp:unset;
 }
}
`;
    document.head.appendChild(deckStyle);
    const dispose = rt.dispose;
    rt.dispose = function () {
      hud.classList.remove('kizugawa-deck'); deckStyle.remove();
      dispose.call(this);
    };
    W.cameraBlockFraction = (from, to) => {
      if (rt.player.fpK >= 0.5) return null;
      const cabin = rt.player.u.pos.y > DECK.y + 0.5 ? null : cabinCameraFraction(from, to);
      const mast = mastCameraFraction(from, to);
      return cabin === null ? mast : mast === null ? cabin : Math.min(cabin, mast);
    };
    // 近接写真などで視点を直接置いた時も、追従中と同じ船べり・屋形を避ける。
    // 描く前にだけ呼び、他の戦には補正を登録しない。目の入れ物も使い回す。
    const cameraEye = new THREE.Vector3(), cameraLook = new THREE.Vector3(), cameraProbe = new THREE.Vector3();
    W.clampDrawCamera = (camera) => {
      if (rt.player.fpK >= 0.5) return;
      camera.getWorldDirection(cameraLook).multiplyScalar(6).add(camera.position);
      const oldX = camera.position.x, oldY = camera.position.y, oldZ = camera.position.z;
      kizugawa.clampCamera(rt, camera.position);
      cameraEye.copy(rt.player.u.pos);
      cameraEye.y += 1.58 * (rt.player.u.mesh?.scale.y || 1);
      const hit = W.cameraBlockFraction(cameraEye, camera.position);
      if (hit !== null) {
        const distance = cameraEye.distanceTo(camera.position);
        camera.position.lerpVectors(cameraEye, camera.position, Math.max(0, hit - 0.25 / Math.max(0.25, distance)));
      }
      // 舷や屋形で肩まで寄った時は、通路に沿って引ける側を探す。
      const u = rt.player.u, p = camera.position;
      if (u.alive && !rt.player.aiming && u.pos.y <= DECK.y + 0.5) {
        // 位置だけ戻して元の注視点を残すと、壁や足元へ向いたままになる。
        // 補正した時と目の前が屋形の時だけ、見通せる本人へ向け直す。
        const corrected = Math.hypot(p.x - oldX, p.y - oldY, p.z - oldZ) > 0.05;
        const blocked = cabinSightBlocked(p, cameraLook, p.y, cameraLook.y);
        if (corrected || blocked) cameraLook.copy(cameraEye);
        const shoulder = deckShoulderCamera(rt, p, cameraEye, cameraProbe);
        if (shoulder) cameraLook.copy(cameraEye);
        const distance = Math.hypot(p.x - u.pos.x, p.z - u.pos.z);
        const k = Math.max(0, Math.min(1, (2.2 - distance) / 0.7));
        // 本人を隠す共通判定（足元から2.3m未満）より常に上へ逃がす。
        // 中間の距離だけ肩の高さへ戻ると、人型の案内だけが床に残っていた。
        const height = u.pos.y + 2.4 + 0.25 * k;
        if (k > 0 && p.y < height) {
          p.y = height;
          cameraLook.lerp(cameraEye, k * 0.65);
        }
        if (corrected || blocked || shoulder || k > 0) camera.lookAt(cameraLook);
        // 屋形の南西の角の手前（西の通路の入口）では、肩越しを通路の側へ一歩半寄せる。屋形の黒い板壁の角を
        // 画面の左に大きく入れず、沖の船と煙を見通す（10/29 採点：手前の黒い柱が左をふさいだ）。向きはそのまま。
        if (u.pos.x < CABIN.x0 && u.pos.z > CABIN.z0 - 4 && u.pos.z < CABIN.z1 && p.z < CABIN.z0 + 0.5 && p.x > CABIN.x0 - 0.6) {
          camera.getWorldDirection(cameraProbe).multiplyScalar(6).add(p);
          p.x = Math.max(DECK.x0 + 0.5, Math.min(p.x, CABIN.x0 - 0.9));
          camera.lookAt(cameraProbe);
        }
      }
    };
    // 共通の判定を包むのはこの戦の軍だけ。他の戦の壁には影響させない。
    const wallBetween = rt.army.wallBetween;
    rt.army.wallBetween = function (from, team, to, over, clear) {
      // 高さの違う舟と甲板の間では、船べり越しの槍の突き（over）を通さない。
      // 舟の乗員が甲板の本人を一方的に突き続け、本人からは届かなかった（bot 10/28）。乗り込んでから斬り合う。
      if (over && Math.abs((from.y ?? DECK.y) - (to.y ?? DECK.y)) > 0.6) over = false;
      return cabinDeckBlocked(from, to) || wallBetween.call(this, from, team, to, over, clear);
    };
    F.deckFallPoint = { x: 0, y: DECK.y, z: 0 };
    // 船板と海には陸の土煙・泥の足跡を出さない。東の岸では元の表現を使う。
    const puff = W.puff, dustCloud = W.dustCloud, footprint = W.footprint;
    W.puff = function (x, z, n) { if (x > 180 && this.heightAt(x, z) > 0) return puff.call(this, x, z, n); };
    W.dustCloud = function (x, z, big, environment) {
      if (x > 180 && this.heightAt(x, z) > 0) return dustCloud.call(this, x, z, big, environment);
    };
    W.footprint = function (x, z, hoof, rot) {
      if (x > 180 && this.heightAt(x, z) > 0) return footprint.call(this, x, z, hoof, rot);
    };
    // 警告も既存の知らせ枠へ入れる。任務に中央の札を重ねず、目線も動かさない。
    rt.army.hooks.onArrowRain = (volley, under) => {
      if (!under || volley.team === rt.player.u.team || rt.t < 5 || rt.over || rt.ended || !rt.player.u.alive) return;
      rt.hud.notices.push('▲ 矢が来る。甲板の印へよけよ', 110, Math.max(3, volley.T + 0.4), 'warn',
        () => !rt.over && !rt.ended && rt.player.u.alive);
    };
    // 刺さった矢へ甲冑の拡大率を重ねず、飛んでいた時の長さを保つ。
    // 甲冑は遠近で骨へ付け替わるので、兵の縮尺が変わらない根へ留める。
    const pinArrow = rt.army.pinArrow;
    rt.army.pinArrow = function (a, life, parent, support = null) {
      if (parent && !support) for (const u of this.units) {
        if (u.armorWear?.root === parent) { parent = u.mesh; break; }
      }
      return pinArrow.call(this, a, life, parent, support);
    };
    // 床の矢を永続の束へ移すと、下の本数・寿命の制限から外れてしまう。
    // この甲板だけは一本ずつの寿命で片付け、人や舷に刺さる矢は従来どおり。
    const bakeArrow = rt.army.bakeArrow;
    rt.army.bakeArrow = function(a) {
      if (a.groundPinned && Math.abs(a.pos.y - DECK.y) < 0.3 &&
          a.pos.x >= DECK.x0 && a.pos.x <= DECK.x1 && a.pos.z >= DECK.z0 && a.pos.z <= DECK.z1) return;
      bakeArrow.call(this, a);
    };
    // 最後の姿勢で止まる前に床を決める。深手で倒れる兵にも同じ補正を通す。
    const animDeath = rt.army.animDeath;
    rt.army.animDeath = function (u, dt, near) {
      shipFall(u, rt.t);
      deckFall(rt, u);
      const impact = u.death?.deckPlaced && u.death.impactPending;
      animDeath.call(this, u, dt, near);
      // 胴が板に触れた瞬間だけ、甲冑の音へ船板の響きを重ねる。
      if (impact && !u.death.impactPending) this.play('stepWood', u.mesh.position, 0.55);
    };
    const ringGeo = new THREE.RingGeometry(0.8, 0.84, 20);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xc0d5d7, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
    const boardGeo = new THREE.BoxGeometry(0.3, 0.055, 1.1);
    F.seaRemainsNext = 0;
    F.seaRemains = Array.from({ length: 24 }, () => {
      const ring = new THREE.Mesh(ringGeo, ringMat), board = new THREE.Mesh(boardGeo, shipMats().wood);
      ring.rotation.x = -Math.PI / 2; ring.visible = board.visible = false; rt.scene.add(ring, board);
      return { ring, board, flag: null, u: null, age: 0, x: 0, z: 0, bodyX: 0, bodyZ: 0 };
    });
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    F.hist = { ships: 'HIST_A', atakebune: 'HIST_B', supply: 'HIST_A', deckFight: 'GAME_C', bay: 'HIST_B', windTide: 'GAME_C', flooding: 'GAME_C' };
    F.noticeTimes = Object.create(null); F.nextBoardAt = 0;
    F.guardPost = { x: 3.8, z: 10.8 };
    F.guardWest = false;
    // 検索用の関数は準備時に一つだけ作り、毎コマ作らない。
    F.deckThreatFilter = (enemy) => {
      const from = F.deckThreatFrom;
      return !enemy.noTarget && !enemy.invuln && !enemy.isStruct && deckMeleeThreat(enemy) &&
        !rt.army.wallBetween(from.pos, -1, enemy.pos);
    };
    // この戦だけ、同じ供船への使番は最初の一度にする。
    const bark = rt.bark.bind(rt);
    rt.bark = (text, warn) => {
      if (text === '使番が供船の兵へ走った') {
        if (F.escortRunnerSeen) return;
        F.escortRunnerSeen = true;
      }
      bark(text, warn);
    };
    rt.onFlankHit = (g) => {
      if (g.flankAwarded) return;
      const hits = Math.min(6, g.flankHits);
      if (hits <= (F.flankHintHits || 0) || hits !== 1 && hits !== 3 && hits !== 6) return;
      F.flankHintHits = hits;
      rt.bark(`横槍の手柄：同じ隊へ横から${hits}回命中。六回で達成`);
    };
    F.small = []; F.boarders = []; F.seaShips = []; F.deckVelocity = { x: 0, z: 0 }; F.botDeckGoal = { x: 0, z: 0 };
    // 海に共通の遠景処理が陸戦の兵を立てないよう、この戦の水面を伝える。
    W.inWaterAt = (x, z) => W.heightAt(x, z) < 0;
    W.def.fleeWay = (army, u, goal) => u.group?.boat?.alive && u.group.boat.exit ? deckWay(u, u.group.boat.landing) : goal;
    F.step = 0; F.ek = 0; F.ak = 0; F.deckRepelled = 0; F.sunk = 0; F.doused = 0; F.supplyPassed = 0; F.supplyStopped = 0; F.cannonHits = 0;
    // 船の上では馬に乗らない
    const P = rt.player;
    if (P.mounted) { rt.army.setMounted(P.u, false); P.mounted = false; }
    P.canRide = false; P.u.pos.y = DECK.y;
    // ---- 海（world の川面は岸の線で歩ける所を切るので使わず、ここで海の面だけを張る） ----
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000, 64, 64), seaMaterial(rt));
    sea.rotation.x = -Math.PI / 2; sea.position.y = 0; sea.receiveShadow = true;
    rt.scene.add(sea);
    F.sea = sea; F.waveAt = -1;
    // 山の視程は元が共有。層ごとに分け、掛け算で全層の値を変えない。
    for (const m of W.mountains.children) {
      const u = m.material.uniforms, layer = u.layer.value;
      u.vis = { value: W.mountU.vis.value };
      u.color.value.setHex([0x293f38, 0x465a56, 0x637471][layer]);
    }
    // 波がしらと舷の飛沫は一つの描画にまとめ、準備した形を使い回す。
    const foam = new THREE.InstancedMesh(rigParts().foam, new THREE.MeshBasicMaterial({ map: rigParts().foamMat.map, color: 0xc2d4d0, transparent: true, opacity: 0.24, depthWrite: false }), 220); // 航跡を描いた白い帯にしない（手本の屏風・写真の淡い泡）
    foam.instanceMatrix.setUsage(THREE.DynamicDrawUsage); foam.frustumCulled = false;
    foam.count = 0; F.foam = foam; rt.scene.add(foam);
    const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 5), new THREE.MeshBasicMaterial({ color: 0xffcc66 }));
    const splash = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 7), new THREE.MeshBasicMaterial({ color: 0xc5e1df }));
    flash.visible = splash.visible = false; rt.scene.add(flash, splash);
    F.salvo = { flash, splash, at: -100, next: 12, shot: 0, muzzle: { x: 0, y: 0, z: 0 }, hit: { x: 0, y: 0, z: 0 } };
    seaAmbientInit(rt);
    // 自船の外れ弾も海へ落とす。供船の水柱と形・材質を共有し、一発ずつ使い回す。
    const cannonSplash = splash.clone(); rt.scene.add(cannonSplash);
    F.cannonSplash = { mesh: cannonSplash, at: -100 };
    prepareHouroku(rt);
    // 船の上に草は生えない（足もとの草の群れを隠す）
    if (W.nearGrass) W.nearGrass.visible = false;
    // 自船と、三艘ずつ二手をなす五艘の供船（並びは推定）。船を板で繋がない。
    F.deckShip = hull(W, 0, DECK.z0, DECK.z1, 11, true); addWake(F.deckShip, 5.5, 26); rt.scene.add(F.deckShip);
    addDeck({ ...DECK, name: '大船の甲板' });
    // 屋形の床下へ兵が入り込まない。梯子で上甲板へ登った後は通せる。
    solidRect(0, 9, CABIN.x1 - CABIN.x0, CABIN.z1 - CABIN.z0, 0, YAG_Y);
    // 床下の板囲いは通れず、槍も届かない。視点だけの壁にすると、
    // 壁越しの敵へ構えの札が出る。上甲板と手前の梯子は通せる高さに限る。
    const cabinHalf = 11 * 0.45 / 2 - 0.1;
    for (const [ax, az, bx, bz] of [
      [-cabinHalf, 5.5, cabinHalf, 5.5], [-cabinHalf, 12.5, cabinHalf, 12.5],
      [-cabinHalf, 5.5, -cabinHalf, 12.5], [cabinHalf, 5.5, cabinHalf, 12.5],
    ]) {
      const wall = solidSeg(ax, az, bx, bz, 0.06);
      wall.naka = -1; wall.yBot = DECK.y; wall.yTop = YAG_Y - 0.15;
      INTERIOR_WALLS.push(wall);
    }
    // 見える船べりで止める。接舷口の低い留めだけは、小舟が着くと開けて乗り込みを通す。
    const rail = (ax, az, bx, bz) => { const s = solidSeg(ax, az, bx, bz, 0.12); s.yBot = DECK.y - 0.2; s.yTop = DECK.y + 1.25; return s; };
    rail(DECK.x1, DECK.z0, DECK.x1, DECK.z1);
    rail(DECK.x0, DECK.z0, DECK.x1, DECK.z0);
    rail(DECK.x0, DECK.z1, SOUTH_X - 1.1, DECK.z1); rail(SOUTH_X + 1.1, DECK.z1, DECK.x1, DECK.z1);
    let railZ = DECK.z0;
    F.shipMouths = [];
    for (const c of CANNONS) {
      rail(DECK.x0, railZ, DECK.x0, c.z - 1.1); railZ = c.z + 1.1;
      const s = rail(DECK.x0, c.z - 1.1, DECK.x0, c.z + 1.1);
      s.struct = { alive: true, opened: false };
      F.shipMouths.push({ from: 'w', z: c.z, solid: s });
    }
    rail(DECK.x0, railZ, DECK.x0, DECK.z1);
    const stern = rail(SOUTH_X - 1.1, DECK.z1, SOUTH_X + 1.1, DECK.z1); stern.struct = { alive: true, opened: false };
    F.shipMouths.push({ from: 's', z: DECK.z1, solid: stern });
    // ---- 東の低い砂州と川口。岸壁状の箱と尖った丘を、緩い岸へ替える。 ----
    { const coast = new THREE.MeshStandardMaterial({ color: 0x3a4838, roughness: 1 });
      const bank = new THREE.PlaneGeometry(480, 800, 24, 40);
      bank.rotateX(-Math.PI / 2); bank.translate(420, 0, 0);
      const p = bank.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, height(p.getX(i), p.getZ(i)));
      bank.computeVertexNormals();
      const shore = new THREE.Mesh(bank, coast); shore.receiveShadow = true; rt.scene.add(shore);
    }
    addEstuaryReeds(rt.scene);
    // ---- 供の大安宅船（自船と合わせて九鬼の大船六艘。形と動きだけの軽い船） ----
    F.escorts = [[38, -42], [76, -84], [-40, 56], [-2, 98], [36, 140]].map(([x, z]) => {
      const m = atakeLite(W); addCrew(m, ATK_TOP + 0.1, 18, true); m.position.set(x, 0, z); m.rotation.y = -Math.PI / 4; rt.scene.add(m);
      return { m, x, z, homeX: x, homeZ: z, deckY: ATK_TOP + 0.1, alive: true, t: { x, z }, sortie: false };
    });
    // 低画質も船首・船尾に布の旗を立てる。中央の通り道へ平らな大旗を置かない。
    rt.scene.add(tawara(W, 3, 9, 0.2, 2));
    // 大筒（西の舷）
    F.guns = CANNONS.map((c) => {
      const m = taihou(shipMats());
      compactShip(m);   // 帯・台・支えを材質ごとに一つの形へ（一門で十二回描いていた）
      m.scale.setScalar(0.75); m.position.set(c.x - 0.8, DECK.y + 0.72, c.z);
      // 視点に近い台や支えも薄くする。筒だけ薄くして木の塊が残るのを防ぐ。
      // 大筒だけ専用の材質にし、他の船具へ波及させない。
      for (let i = 0; i < m.children.length; i++) {
        const part = m.children[i]; part.material = part.material.clone(); part.material.transparent = true;
        part.onBeforeRender = (_renderer, _scene, camera) => {
          const p = camera.position, x = Math.max(m.position.x - 1.28, Math.min(m.position.x + 1.28, p.x));
          const u = rt.player.u.pos, dx = u.x - p.x, dy = u.y + 1 - p.y, dz = u.z - p.z;
          // 筒の中心だけでは、長い筒尾や台が体を隠す時に取りこぼす。
          // 筒と台を囲う箱へ視線を通し、全部品を一緒に避ける。
          let enter = 0, exit = 1;
          for (let axis = 0; axis < 3; axis++) {
            const origin = axis === 0 ? p.x : axis === 1 ? p.y : p.z;
            const direction = axis === 0 ? dx : axis === 1 ? dy : dz;
            const center = axis === 0 ? m.position.x : axis === 1 ? m.position.y - 0.25 : m.position.z;
            const radius = axis === 0 ? 1.4 : axis === 1 ? 0.65 : 0.6;
            if (Math.abs(direction) < 0.00001) {
              if (Math.abs(origin - center) > radius) { exit = -1; break; }
            } else {
              const a = (center - radius - origin) / direction, b = (center + radius - origin) / direction;
              enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
              if (enter > exit) break;
            }
          }
          // 目が筒へ入り込む時と、自分の体を隠す時だけ避ける。
          // 見ているだけで四歩先の筒まで透かし、台を幽霊のように残さない。
          const near = Math.hypot(p.x - x, p.y - m.position.y, p.z - m.position.z) < 0.85 ||
            enter <= exit;
          part.material.opacity = near ? 0.18 : 1; part.material.depthWrite = !near; part.castShadow = !near;
        };
        part.onAfterRender = () => { part.material.opacity = 1; part.material.depthWrite = true; part.castShadow = true; };
      }
      rt.scene.add(m);
      return { ...c, m, cd: 0, post: { x: c.x + 1.6, z: c.z } };
    });
    // ---- 九鬼嘉隆の手（自分の持ち場）と、鉄砲衆 ----
    F.kuki = allyGroup(rt, { name: '九鬼嘉隆の手', fixed: true, fullStrength: true, anchor: { x: 1, z: 4 }, facing: Math.PI, formation: 'ring', spacing: 1, aggro: 4 },
      dress([{ type: 'samurai', n: 1, o: { name: '九鬼嘉隆', invuln: true, keepInvuln: true, horse: false, hat: 'kabuto_m', haori: 0 } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }], ODA));
    F.kukiU = F.kuki.units[0];
    F.postGuards = F.kuki.units.filter((u) => u.type === 'ashigaru').slice(0, 3);
    for (const u of F.postGuards) u.shipPost = { x: u.pos.x, y: DECK.y, z: u.pos.z };
    F.teppo = allyGroup(rt, { name: '船の鉄砲衆', fixed: true, fullStrength: true, anchor: { x: -4, z: -1 }, facing: -Math.PI / 2, formation: 'line', ranks: 1, width: 15, spacing: 1.1, aggro: 16 },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 14 }], ODA));
    F.teppo.ranks = 1;
    // 等間隔の列では、大筒の台をよけた兵が同じ場所へ集まる。
    // 屋形脇は二人にし、三人を広い前甲板の控え列へ分ける。
    // 人数と西向きの守りを保ち、大筒三門の後ろと屋形への通路を空ける。
    const gunPosts = [-11.2, -9.8, -6.6, -5.4, -4.2, -3, -1.8, 1.8, 3, 4.2, 9.4, 11.8]
      .map((z) => ({ x: -4, z }));
    for (const z of [-10.5, -6, -2.4]) gunPosts.push({ x: -2, z });
    F.teppo.slotPos = (i) => gunPosts[i];
    for (const u of F.teppo.units) {
      const q = gunPosts[u.slot];
      u.pos.set(q.x, DECK.y, q.z);
    }
    // 艫（屋形の脇から後ろ）の甲板にも、鉄砲衆と水夫の群れ。屋形の脇の通り道と大筒の後ろは空ける（10/29 採点：甲板の味方が一人に見えた）。人数と持ち場は推定。
    const sternPosts = [{ x: -3.1, z: 6.3 }, { x: -2.9, z: 10.2 }, { x: -4.5, z: 10.9 }, { x: -3.2, z: 12.4 }, { x: 3.4, z: 7.2 }, { x: 4.4, z: 9.2 }, { x: 3.2, z: 11.2 }, { x: 4.6, z: 12.3 }];
    F.stern = allyGroup(rt, { name: '艫の鉄砲衆と水夫', fixed: true, fullStrength: true, anchor: { x: 0, z: 10 }, facing: -Math.PI / 2, formation: 'line', ranks: 1, width: 8, spacing: 1, aggro: 0.5 },
      dress([{ type: 'ashigaru', n: 8 }], ODA));
    F.stern.slotPos = (i) => sternPosts[i % sternPosts.length];
    for (const u of F.stern.units) {
      const q = sternPosts[u.slot % sternPosts.length];
      u.pos.set(q.x, DECK.y, q.z); u.shipPost = { x: q.x, y: DECK.y, z: q.z };
    }
    F.oda = [F.kuki, F.teppo];
    for (const g of F.oda) for (const u of g.units) { const q = deckWay(u, u.pos); u.pos.set(q.x, DECK.y, q.z); }
    F.kukiU.pos.set(1, DECK.y, 4); F.kukiU.shipPost = { x: 1, z: 4 }; F.kukiU.allyOk = true;
    // 大将は屋形の手前で下知を出し、槍の守りが前、鉄砲衆が西の舷。
    F.deckLost = 0; F.fireDanger = 0; F.roofPost = { x: 1, y: DECK.y, z: 4 };
    const n = RANKS[rt.G.rank].squad;
    if (n) {
      rt.makeSquad({ x: 2, z: 0 }, 0, [{ kind: 'spear', n: Math.min(n, 15) }]);
      for (const g of rt.squadGroups) {
        g.formation = 'column'; g.colW = 3; g.width = 3; g.spacing = 0.8;
        for (const u of g.units) { const q = deckWay(u, g.slotPos(u.slot, g.initial)); u.pos.set(q.x, DECK.y, q.z); }
      }
    }
    // ---- 遠くの毛利の船団（小早を並べた影） ----
    F.boats = [];
    F.far = [];
    for (let i = 0; i < 36; i++) {
      const b = i % 6 === 0 ? sekibune(true) : kobaya();
      // 小早の先手は既に包囲へ寄せている。大将船だけは後ろで待つ。
      // 先頭の小早は既に西の舷へ寄せている。大筒を待つ間にも槍で乗り込みを防げる。
      const vanguard = i >= 3 && i <= 9 && i % 6 !== 0;
      b.position.set(i === 0 ? -85 : vanguard ? -28 - (i > 6 ? 14 : 0) : -70 - (i % 9) * 26, 0, i === 0 ? 26 : vanguard ? (i % 3 - 1) * 10 : 35 + Math.floor(i / 9) * 38);
      b.rotation.y = Math.PI * 3 / 4;
      rt.scene.add(b);
      addCrew(b, i % 6 === 0 ? 1.3 : 0.65, 8);
      compactShip(b);
      F.far.push(b);
    }
    for (const e of F.escorts) { shipCrew(rt, e, 0, 12, true, true); F.seaShips.push(e); }
    for (let i = 0; i < 2; i++) {
      const m = F.far[1 + i]; m.userData.departed = true;
      const b = { m, x: m.position.x, z: m.position.z, t: { x: -45 - i * 15, z: -28 + i * 64 },
        alive: true, ranged: true, deckY: 0.65, landed: false };
      b.x = -52 - i * 12; b.z = -16 + i * 36; m.position.set(b.x, 0, b.z);
      shipCrew(rt, b, 1, 8, false, true); F.boats.push(b); F.seaShips.push(b);
      const e = F.escorts[2 + i], small = kobaya();
      // 小型供船の数と位置は補完。六艘の大安宅船には含めない。
      const R = rigParts();
      if (!R.odaFlagMat) R.odaFlagMat = new THREE.MeshStandardMaterial({ map: flagTexture('oda'), side: THREE.DoubleSide, roughness: 0.9 });
      small.userData.flag.material = R.odaFlagMat;
      small.position.set(e.x - 18, 0, e.z + 24); small.rotation.y = -Math.PI / 4; rt.scene.add(small);
      const a = { m: small, x: small.position.x, z: small.position.z, homeX: small.position.x, homeZ: small.position.z,
        t: { x: small.position.x, z: small.position.z }, deckY: 0.65, alive: true, support: true };
      shipCrew(rt, a, 0, 8, false, true); F.seaShips.push(a);
    }
    F.waterShips = [...new Set([F.deckShip, ...F.escorts.map(b => b.m), ...F.far, ...F.seaShips.map(b => b.m)])];
    // 六百余艘のうち六百艘を表す。遠い船は一つにまとめ、兵の判断を動かさない。
    F.distantFleet = new THREE.Group();
    const R = rigParts(), M = shipMats(), D = R.dummy;
    const distant = new THREE.InstancedMesh(KOB.body, M.board, 564);
    // 遠い船の漕ぎ手は一艘に四人（百メートルより先の豆粒。八人では九万面になっていた）
    const crews = new THREE.InstancedMesh(CREW.body, CREW.mat, 564 * 4);
    const flags = new THREE.InstancedMesh(KOB.flag, R.flagMat, 564);
    const poles = new THREE.InstancedMesh(KOB.mast, M.dark, 564);
    const angle = Math.PI * 3 / 4, sn = Math.sin(angle), cs = Math.cos(angle);
    for (let i = 0; i < 564; i++) {
      // 先手は霧の手前へ。船団の奥まで同じ形・材質を使い、兵の判断は動かさない。
      const x = -130 - (i % 24) * 18, z = 115 + Math.floor(i / 24) * 20;
      D.position.set(x, 0, z);
      D.rotation.set(0, angle, 0); D.scale.set(1, 1, 1); D.updateMatrix(); distant.setMatrixAt(i, D.matrix);
      for (let j = 0; j < 4; j++) {
        const lx = (j % 2 ? 1 : -1) * 0.6, lz = -3 + Math.floor(j / 2) * 3;
        D.position.set(x + lx * cs + lz * sn, 1.25, z - lx * sn + lz * cs);
        D.updateMatrix(); crews.setMatrixAt(i * 4 + j, D.matrix);
      }
      D.position.set(x - 3.8 * sn, 2.3, z - 3.8 * cs);
      D.updateMatrix(); poles.setMatrixAt(i, D.matrix);
      D.position.set(x - 3.8 * sn, 2.9, z - 3.8 * cs);
      D.rotation.y = angle + Math.PI / 2; D.updateMatrix(); flags.setMatrixAt(i, D.matrix);
    }
    F.distantFleet.add(distant, crews, flags, poles); shipSeaHaze(F.distantFleet); rt.scene.add(F.distantFleet);
    // 沖の奥に毛利方の大船（安宅）の列。霧に半ば溶ける影として並べ、兵の判断も毎コマの処理も足さない。
    { const R = rigParts(), M = shipMats(), D = R.dummy, N = 11, sc = 1.7, line = new THREE.Group();
      if (!R.flagMat) R.flagMat = new THREE.MeshStandardMaterial({ map: flagTexture('mori'), side: THREE.DoubleSide, roughness: 0.9 });
      if (!R.flagGeo) R.flagGeo = shipFlagGeometry(0.6, 1.6);
      const hulls = new THREE.InstancedMesh(SEK, M.board, N), huts = new THREE.InstancedMesh(R.box, M.board, N * 2);
      const roofs = new THREE.InstancedMesh(R.box, M.dark, N * 2), masts = new THREE.InstancedMesh(R.pole, M.dark, N * 2);
      const flags = new THREE.InstancedMesh(R.flagGeo, R.flagMat, N * 2);
      const head = Math.PI * 0.6, sn = Math.sin(head), cs = Math.cos(head);
      const at = (x, z, lx, y, lz) => D.position.set(x + lx * cs + lz * sn, y, z - lx * sn + lz * cs);
      for (let i = 0; i < N; i++) {
        // 北の沖に斜めの一列。始めの向き（北北西）の見える距離（二百四十メートル）の内に置き、
        // 小早の群れ（手前百五十メートルまで）より奥へ。間を少しずつ崩し、同じ間隔の柵に見せない。
        const x = -125 + i * 17 + (i * 7) % 5, z = 162 + i - (i % 3) * 5;
        D.rotation.set(0, head, 0); D.scale.setScalar(sc); D.position.set(x, 0, z); D.updateMatrix(); hulls.setMatrixAt(i, D.matrix);
        for (const [k, w, h, d, y] of [[0, 6.4, 2.8, 7.6, 3.6], [1, 4.2, 2.0, 5.0, 6.0]]) {
          at(x, z, 0, y, -10); D.scale.set(w, h, d); D.updateMatrix(); huts.setMatrixAt(i * 2 + k, D.matrix);
          at(x, z, 0, y + h / 2 + 0.25, -10); D.scale.set(w + 1.4, 0.5, d + 1.4); D.updateMatrix(); roofs.setMatrixAt(i * 2 + k, D.matrix);
        }
        for (const [k, lz, mh] of [[0, 2, 13], [1, -16, 9]]) {
          at(x, z, 0, mh / 2 + 1.5, lz); D.scale.set(4, mh, 4); D.updateMatrix(); masts.setMatrixAt(i * 2 + k, D.matrix);
          at(x, z, 0, mh + 0.2, lz); D.rotation.set(0, head + Math.PI / 2, 0); D.scale.setScalar(2.2); D.updateMatrix(); flags.setMatrixAt(i * 2 + k, D.matrix);
          D.rotation.set(0, head, 0);
        }
      }
      line.add(hulls, huts, roofs, masts, flags); shipSeaHaze(line); rt.scene.add(line);
    }
    // 石山と堺を数百メートルの中に並べた箱の町は外す。
    // 古い河道・町の位置を確定できる資料が揃うまで、縮めた代用品で補わない。
    // 堺沖の別の織田船団。三艘の影は所在を示すだけで、史料の船数や九鬼の六艘には数えない。
    // 関船の形・旗を共有し、戦う兵や毎コマの処理を増やさない。船の寸法も縮めない。
    { const R = rigParts(), D = R.dummy;
      const ships = new THREE.InstancedMesh(SEK, shipMats().board, 3);
      const flags = new THREE.InstancedMesh(R.flagGeo, new THREE.MeshStandardMaterial({ map: flagTexture('oda'), side: THREE.DoubleSide, roughness: 0.9 }), 3);
      const poles = new THREE.InstancedMesh(R.pole, shipMats().dark, 3);
      for (let i = 0; i < 3; i++) {
        D.position.set(120 + i * 24, 0, 260 + i * 32); D.rotation.set(0, -Math.PI / 4, 0); D.scale.set(1, 1, 1); D.updateMatrix(); ships.setMatrixAt(i, D.matrix);
        D.position.y = 3.6; D.updateMatrix(); flags.setMatrixAt(i, D.matrix);
        D.position.y = 2.25; D.scale.y = 4.5; D.updateMatrix(); poles.setMatrixAt(i, D.matrix);
      }
      shipSeaHaze(ships); shipSeaHaze(flags); shipSeaHaze(poles);
      rt.scene.add(ships, flags, poles);
    }

    // 十六世紀の大坂湾：浅い水域と砂州、淀川・大和川の河口の濁り（今の埋立地や港の岸壁は無い）
    const shoal = new THREE.MeshStandardMaterial({ color: 0x6a7a72, roughness: 0.4, transparent: true, opacity: 0.55 });
    const sand = new THREE.MeshStandardMaterial({ color: 0x9a9070, roughness: 1 });
    const silt = new THREE.MeshStandardMaterial({ color: 0x6e6a52, roughness: 0.6, transparent: true, opacity: 0.6 });
    for (const [x, z, r] of [[170, -20, 70], [200, 80, 60]]) { const sh = new THREE.Mesh(new THREE.CircleGeometry(r, 20), shoal); sh.rotation.x = -Math.PI / 2; sh.position.set(x, 0.05, z); rt.scene.add(sh); }
    for (const [x, z, r] of [[150, -60, 14], [185, 40, 10]]) { const sb = new THREE.Mesh(new THREE.CircleGeometry(r, 14), sand); sb.rotation.x = -Math.PI / 2; sb.position.set(x, 0.12, z); rt.scene.add(sb); }
    { const sl = new THREE.Mesh(new THREE.CircleGeometry(90, 20), silt); sl.rotation.x = -Math.PI / 2; sl.position.set(240, 0.08, -70); rt.scene.add(sl); }
    // この海戦の山だけ、手前の山肌を霞の一色へ埋めない。奥の山ほど従来の霞へ近づける。
    for (const m of W.mountains.children) m.material.uniforms.vis = { value: W.mountU.vis.value };
    F.noticeAt = 0;
    // 大筒へ向かう遊び手から見える左舷へ先手を寄せる。十八メートルを九秒で寄せ、
    // 鉤縄の二秒と乗り移りの一・八秒を経て、開戦十三秒ほどで斬り合う。
    const first = this.launch(rt, 'w');
    if (first) {
      first.sp = 2;
      first.x = first.t.x - 18; first.z = first.t.z;
      first.m.position.set(first.x, 0, first.z); first.m.rotation.y = Math.PI / 2;
      syncShipCrew(rt, first);
    }
    rt.world.setTime('day');
    batchFleet(rt);
    rt.setPhase('brief'); rt.objProgress('main', '');
    rt.obj('main', HI(rt) ? '西の大筒へ。鉄砲衆を預かれ' : '西の大筒で敵船を迎えよ', 'main');
    rt.banner('六艘の大船、囲まれる', '毛利の船が迫る。西の大筒へ');
    rt.say('九鬼嘉隆', `${nm(rt)}、この船を守れ。まず西の大筒につけ！`, 4);
    rt.after(5, () => { if (F.step === 0 && !F.ending) rt.say('物見', '西国の船は六百余艘！　後ろにも小舟が寄せて来るぞ！', 3); });
    rt.marker('g1', F.guns[1].post, '西の大筒へ', { h: 2, guidePriority: 150, guideAlways: true, hideNear: 2.6, hideOnArrival: true,
      routeDistance: () => deckRouteDistance(rt.player.u, F.guns[1].post) });
    // 入口の守りと大将の救援を分ける。大将が脇へ退いたら、その持ち場へ案内する。
    rt.marker('kuki', () => F.roofDanger ? F.roofPost : F.kukiU.pos, () => F.kukiDanger ? rescuePlace(rt) : '九鬼嘉隆', {
      noGuide: true, guidePriority: 250, guideAlways: true,
      routeDistance: () => deckRouteDistance(rt.player.u, F.roofDanger ? F.roofPost : F.kukiU.pos),
    });
    rt.after(9, () => { if (F.step === 0) this.cannons(rt); });
  },

  // 小早を一艘出す（南西から、甲板の西と南の縁へ向かう）
  launch(rt, from) {
    const F = rt.flags;
    // 一番近い小早から寄せる。遠い配列順では最初の接舷が遅れる。
    let m = null, nearest = Infinity;
    for (let i = 0; i < F.far.length; i++) {
      const ship = F.far[i];
      if (i % 6 === 0 || ship.userData.departed) continue;
      const d = Math.hypot(ship.position.x - DECK.x0, ship.position.z);
      if (d < nearest) { nearest = d; m = ship; }
    }
    if (!m || F.ending || F.step > 4 || F.bigSunk) return null;
    let real = 0; for (const u of rt.army.units) if (u.alive) real++;
    // 荷駄船二艘と大将船の乗員二十四人分を先に空け、総数二百人以内に保つ。
    if (real + 8 > 176) return null;
    let dockZ = null;
    for (const z of (from === 's' ? [0] : [-8, 0, 8])) {
      if (!F.boats.some((b) => b.alive && !b.damageStage && !b.withdrawing && !b.big && !b.supply && !b.ranged && b.from === from && (from === 's' || b.exit.z === z))) { dockZ = z; break; }
    }
    if (dockZ === null) return null;
    m.userData.departed = true;
    const s = { x: m.position.x, z: m.position.z };
    const t = from === 's' ? { x: SOUTH_X, z: DECK.z1 + 6 } : { x: DECK.x0 - 6, z: dockZ };
    const exit = { x: from === 's' ? t.x : DECK.x0 + 0.7, z: from === 's' ? DECK.z1 - 0.7 : t.z };
    const landing = from === 's' ? exit : { x: -3.5, z: exit.z + 1.4 };
    const b = { m, x: s.x, z: s.z, t, exit, landing, alive: true, landed: false, from, sp: 3.5, deckY: 0.65, remaining: 8, nextBoard: 0, approach: from === 's' ? { x: -25, z: 24 } : null };
    if (b.approach) { b.dock = t; b.t = b.approach; }
    b.m.rotation.y = Math.atan2(b.t.x - b.x, b.t.z - b.z);
    shipCrew(rt, b, 1, 8); F.small.push(b.group); F.seaShips.push(b);
    F.boats.push(b);
    return b;
  },

  // 毛利の荷駄船（石山本願寺へ兵糧を運ぶ）：西から来て、織田船団の脇を通り東（石山の方）へ抜けようとする
  launchSupply(rt) {
    const F = rt.flags;
    // 近い関船から寄せ、消火に移る前に二艘とも大筒で狙えるようにする。
    let m = null, nearest = Infinity;
    for (let i = 6; i < F.far.length; i += 6) {
      const ship = F.far[i];
      if (ship.userData.departed) continue;
      const d = Math.hypot(ship.position.x + 70, ship.position.z);
      if (d < nearest) { nearest = d; m = ship; }
    }
    if (!m || F.ending) return null;
    m.userData.departed = true;
    if (!SUPPLY_BALE) { SUPPLY_BALE = new THREE.CylinderGeometry(0.5, 0.5, 1.1, 8); SUPPLY_MAT = new THREE.MeshStandardMaterial({ color: 0xc9a66b, roughness: 0.9 }); }
    for (let i = 0; i < 3; i++) { const tw = new THREE.Mesh(SUPPLY_BALE, SUPPLY_MAT); tw.rotation.z = Math.PI / 2; tw.position.set(-0.7 + i * 0.7, 0.9, -1.5 + i * 1.4); m.add(tw); }
    const s = { x: m.position.x, z: m.position.z };
    const t = { x: -70, z: 0 };
    m.position.set(s.x, 0, s.z);
    rt.scene.add(m);
    const b = { m, x: s.x, z: s.z, t, alive: true, landed: false, supply: true, deckY: 1.3, sp: 3.2, approach: t, dock: { x: 230, z: -35 } };
    shipCrew(rt, b, 1, 8); F.seaShips.push(b);
    F.boats.push(b);
    return b;
  },

  // ① 大筒を撃つ
  cannons(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('cannon'); rt.objProgress('main', '');
    // 大将の場所は残し、危ない時だけ持ち場への案内に切り替える。
    sfx('horagai', 0.9);
    rt.banner('毛利の船団', '南西から来た船が、両脇へ広がる');
    rt.obj('main', HI(rt) ? '法螺貝の合図。鉄砲衆を率い、西の大筒で敵船を払え' : '法螺貝の合図。西の大筒で寄せる船を払え', 'main');
    rt.obj('supply', '俵を積んだ兵糧船二艘を止めよ', 'side');
    for (let i = 0; i < 3; i++) {
      const c = F.guns[i];
      const post = c.post;
      rt.marker('g' + i, post, () => cannonLabel(rt, c), { h: 2, guideNearest: true, guidePriority: () => cannonPriority(rt, c), hideNear: 2.6, hideOnArrival: true,
        routeDistance: () => deckRouteDistance(rt.player.u, post) });
      rt.addInteract('g' + i, { x: c.x + 1.6, z: c.z }, '大筒を撃つ', () => this.fire(rt, i), { r: cannonReady(rt, c) ? 2.6 : 0, hold: 1.2 });
      c.interact = rt.interacts[rt.interacts.length - 1];
    }
    this.launch(rt, 'w'); rt.after(14, () => { if (F.step < 4 && !F.ending) this.launch(rt, 'w'); }); rt.after(28, () => { if (F.step < 4 && !F.ending) this.launch(rt, 's'); });
    rt.say('砲手', '合図じゃ！　乗り込む敵を防げ。敵が離れたら西の大筒を撃て！', 4);
    F.nextBoat = rt.t + 42;
    this.launchSupply(rt);
    rt.after(24, () => { if (!F.ending && F.step <= 3) this.launchSupply(rt); });
  },
  fire(rt, i) {
    const F = rt.flags;
    const c = F.guns[i];
    if (F.step === 2 || F.step === 3) { rt.bark('今は甲板の持ち場を守れ'); return; }
    if (F.ending || rt.over || !rt.player.u.alive || (F.step !== 1 && F.step !== 4)) return;
    if (rt.t < c.cd) { rt.bark('弾込め中'); return; }
    // 狙い札と同じ射界で、近い船から狙う。
    const best = cannonTarget(F, c);
    let bd;
    if (!best) { rt.bark(F.step === 4 ? '西へ寄る大船を待て。横腹を狙え' : '筒先に敵船が見えぬ。寄るのを待て'); return; }
    bd = Math.hypot(best.x - c.x, best.z - c.z);
    // 長押しの間に船が向きを変えたり、甲板へ敵が来たりした時は弾を使わない。
    if (!cannonReady(rt, c)) {
      rt.bark(F.cannonGuard || F.kukiDanger ? '先に甲板の敵を防げ' : bd > 55 ? '近寄るのを待て' : '船の横腹を待て');
      return;
    }
    const word = aimWord(best, c);
    if (noticeReady(rt, word)) rt.say('砲手', word, 2.5);
    c.cd = rt.t + 30;
    if (c.interact) c.interact.r = 0;
    if (rt.missionGuide) rt.missionGuide.scan = 0;
    rt.army.play('volley', { x: c.x, z: c.z }, 1.6);
    rt.army.smoke(c.x - 2, DECK.y + 1.2, c.z, -1, 0, 2.5);
    // 命中も限られる：遠いほど外れやすい（大きな弾は狙いを付け直しにくい）
    bd = Math.hypot(best.x - c.x, best.z - c.z);
    const missChance = bd <= 40 && broadside(best, c) >= 0.4 ? 0 : Math.max(0.05, Math.min(0.55, (bd - 15) / 110 + (1 - broadside(best, c)) * 0.1));
    if (Math.random() < missChance) {
      F.cannonSplash.at = rt.t;
      F.cannonSplash.mesh.position.set(best.x + 5, 0.5, best.z + 4);
      rt.bark('弾が海へ落ちた。次はもっと近い横腹を狙え');
      return;
    }
    rt.after(0.6, () => {
      if (!best.alive || F.ending) return;
      F.cannonHits++;
      // 大将船への命中を合図に、ほかの大船も一斉に放つ。
      if (best.big) { this.breakFlagship(rt, true); return; }
      best.damageStage = 1; best.hitAt = rt.t; best.leak = true; best.rudderLost = true;
      if (best.supply) {
        rt.army.smoke(best.x, 1, best.z, 0, 0, 3);
        rt.army.play('wood', { x: best.x, z: best.z }, 1.2);
        best.stopping = true;
        rt.bark('兵糧船に命中！　止まるまで見届けよ', true);
        return;
      }
      rt.army.smoke(best.x, 1, best.z, 0, 0, 3);
      rt.army.play('wood', { x: best.x, z: best.z }, 1.2);
      best.stopped = true;
      F.sunk++;
      if (F.sunk === 1) rt.say('九鬼嘉隆', 'よし、寄せる一艘を止めた！　槍の衆、空いた船べりを固めよ！', 3);
      rt.award((t) => { t.special = { label: '大筒で小早を打ち払った', pts: 3 * Math.min(6, F.sunk) }; }, noticeReady(rt, '小早を打ち払った') ? '小早を打ち払った' : null);
      if (F.step === 1) rt.objProgress('main', '小舟を打ち払った。次の船を迎えよ');
    });
  },

  // ② 焙烙火矢の火を消す
  fires(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('fire'); rt.objProgress('main', '');
    for (let i = 0; i < 3; i++) { rt.unmark('g' + i); rt.uninteract('g' + i); }
    rt.objDone('main');
    rt.banner('焙烙火矢', '焙烙が甲板で割れ、火が広がる');
    rt.obj('main', '水桶を取り、甲板の火を消せ', 'main');
    F.water = false;
    for (let i = 0; i < 4; i++) {
      const q = WATER[i];
      rt.marker('water' + i, q, '水桶', { guidePriority: () => F.water ? -200 : 150, guideNearest: true, alwaysDistance: true, guideAlways: true });
      rt.addInteract('water' + i, q, '水桶を取る', () => { if (F.step === 2 && !F.ending && !rt.over && rt.player.u.alive && !F.water) { F.water = true; fireTask(rt); rt.bark('桶の水を火へ掛けよ'); } }, { r: 2.2, hold: 1 });
    }
    rt.say('九鬼嘉隆', '水夫ども、水を掛けよ！　屋形へ火を回すな！', 4);
    battleEvent(rt, EVENT_FIRE_START, { x: -2, z: -8 }, null, 1, true, '甲板に火が上がった');
    F.fl = [{ x: -2, z: -8 }, { x: 2, z: -2 }, { x: -3.8, z: 7 }].map((q, i) => {
      const h = F.houroku[i]; h.start = rt.t;
      const source = F.boats.find((b) => b.alive && b.landed && !b.big && !b.supply && !b.ranged);
      h.fromX = source?.x ?? DECK.x0 - 6; h.fromZ = source?.z ?? q.z;
      const fire = { ...q, f: null };
      rt.after(1.2, () => {
        if (!fire.doused && !F.ending && !rt.over) {
          rt.army.play('houroku', fire, 0.8);
          fire.f = rt.world.addFire(q.x, q.z, { h: 0.3, size: 1.5 });
        }
      });
      rt.marker('f' + i, q, '火を消す', { h: 2, guidePriority: () => F.water ? 150 : -200, guideNearest: true, alwaysDistance: true, guideAlways: true });
      rt.addInteract('f' + i, q, '水を掛けて火を消す', () => this.douse(rt, i), { r: 2.8, hold: 1.6 });
      return fire;
    });
    fireTask(rt);
  },
  douse(rt, i) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.step !== 2 || !F.fl[i] || F.fl[i].doused || rt.t - F.houroku[i].start < 1.2) return;
    if (!F.water) { rt.bark('船べりの水桶を取れ'); return; }
    F.water = false;
    F.fl[i].doused = true;
    F.houroku[i].dousedAt = rt.t;
    rt.uninteract('f' + i); rt.unmark('f' + i);
    rt.world.removeFire(F.fl[i].f);
    rt.army.play('douse', F.fl[i], 0.8);
    F.doused++;
    F.playerDoused = (F.playerDoused || 0) + 1;
    if (F.doused < 3) fireTask(rt);
    rt.award((t) => { if (!t.side.includes('焙烙の火を消した')) t.side.push('焙烙の火を消した'); }, '火を消した');
    rt.objProgress('main', F.doused < 3 ? '水桶を取り、残る火へ掛けよ' : '火は消えた。南の船べりを守れ');
    if (F.doused >= 3) this.board(rt);
  },

  // 大将の船と思われる大船（主と細かな姿は特定しない）
  launchBig(rt) {
    const F = rt.flags;
    const m = F.far[0];
    if (!m || m.userData.departed) return null;
    m.userData.departed = true;
    const s = { x: m.position.x, z: m.position.z }, t = { x: DECK.x0 - 28, z: 0 };
    m.position.set(s.x, 0, s.z);
    rt.scene.add(m);
    const b = { m, x: s.x, z: s.z, t, alive: true, landed: false, from: 'w', big: true, deckY: 1.3 };
    F.boats.push(b);
    shipCrew(rt, b, 1, 8, false, true); F.seaShips.push(b);
    F.big = b; F.bigCommander = b.group.units[0];
    return b;
  },

  // ③ 乗り移ってきた毛利勢
  board(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t; F.boardRepelledStart = F.deckRepelled;
    rt.setPhase('board'); rt.objProgress('main', '');
    rt.objDone('main'); rt.unmark('guard');
    for (let i = 0; i < 3; i++) { rt.uninteract('f' + i); rt.unmark('f' + i); }
    for (let i = 0; i < 4; i++) { rt.uninteract('water' + i); rt.unmark('water' + i); }
    rt.banner('船べりを守れ', '寄せる小早が、鉤縄を掛けようとしている');
    rt.obj('main', HI(rt) ? '敵の陣太鼓が早打ち。組を南と西へ寄せ、乗り口を守れ' : '敵の陣太鼓が早打ち。南と西の乗り口を守れ', 'main');
    rt.say('九鬼嘉隆', F.playerDoused ? '火を消したな！　敵の陣太鼓が早打ちじゃ。乗り口の敵を押し返せ！' : '水夫が火を抑えた！　敵の陣太鼓が早打ちじゃ。槍の衆、乗り口を守れ！', 4);
    rt.marker('guard', () => F.guardPost, () => F.guardWest ? '西の乗り口' : '南の乗り口', {
      guidePriority: 100, hideNear: 3, hideOnArrival: true,
      routeDistance: () => deckRouteDistance(rt.player.u, F.guardPost),
    });
    // 新手は既に沖にいる小早が接舷してから上がる。
    const incoming = this.launch(rt, 'w') || nextBoardingBoat(rt); this.launch(rt, 's');
    if (incoming) {
      rt.army.playFar('sig_kakari', incoming, 0.9);
      rt.after(2.4, () => { if (!F.ending && !rt.over && F.step === 3 && incoming.alive && !incoming.withdrawing && !incoming.damageStage) rt.army.playFar('toki', incoming, 0.8); });
    }
    rt.after(38, () => { if (!F.ending && F.step === 3) { this.launch(rt, 'w'); this.launch(rt, 's'); } });
  },

  // 史実の決め手。大将の船と思われる一艘を近くへ寄せる。
  decisive(rt) {
    const F = rt.flags;
    F.step = 4; F.stepT = rt.t; F.cannonPost = F.guns[1];
    rt.setPhase('flagship'); rt.objProgress('main', ''); rt.objDone('main'); rt.unmark('guard');
    for (let k = 1; k <= 4; k++) rt.unmark('b' + k);
    if (!this.launchBig(rt)) { this.lose(rt, '敵の大船を見失った。持ち場を立て直せ！'); return; }
    rt.banner('敵の大船を引き付けよ', '大将の船と見える。西の大筒で待て');
    rt.obj('main', '西の大筒で近い大船の横腹を撃て', 'main');
    rt.say('九鬼嘉隆', '乗り口を守ったな！　あの大船を間近へ寄せ、横腹を撃て！', 4);
    rt.marker('big', () => F.big.m.position, '敵の大船', { red: true, h: 6, noGuide: true });
    const c = F.guns[1];
    const post = c.post;
    rt.marker('g1', post, () => cannonLabel(rt, c), { h: 2, guidePriority: 150, guideAlways: true, hideNear: 2.6, hideOnArrival: true,
      routeDistance: () => deckRouteDistance(rt.player.u, post) });
    rt.addInteract('g1', { x: c.x + 1.6, z: c.z }, '大筒を撃つ', () => this.fire(rt, 1), { r: cannonReady(rt, c) ? 2.6 : 0, hold: 1.2 });
    c.interact = rt.interacts[rt.interacts.length - 1];
  },
  breakFlagship(rt, playerShot) {
    const F = rt.flags;
    if (F.bigSunk || !F.big) return;
    F.bigSunk = true; F.big.damageStage = 1; F.big.hitAt = rt.t; F.big.leak = true; F.big.rudderLost = true; F.big.stopped = true;
    rt.unmark('big'); rt.unmark('g1'); rt.uninteract('g1'); rt.objDone('main');
    rt.obj('main', '甲板を守り、退く船を見張れ', 'main');
    rt.banner('大鉄砲の轟き', '敵の大船が崩れ、周りの小舟が止まる');
    rt.say('九鬼嘉隆', playerShot ? `${nm(rt)}、見事じゃ！　おぬしの一発に続け、全船、放て！` : '大船が崩れたぞ！　全船、甲板を固めよ！', 4);
    for (const c of F.guns) rt.army.smoke(c.x - 2, DECK.y + 1.2, c.z, -1, 0, 2.5);
    for (const e of F.escorts) {
      const dx = F.big.x - e.x, dz = F.big.z - e.z, d = Math.hypot(dx, dz) || 1;
      rt.army.smoke(e.x + dx / d * 5, 3, e.z + dz / d * 5, dx / d, dz / d, 2.5);
    }
    rt.army.play('volley', CANNONS[1], 1.6);
    rt.army.smoke(F.big.x, 2, F.big.z, 0, 0, 3);
    battleEvent(rt, EVENT_VOLLEY, CANNONS[1], F.teppo, 0, true, '大船の大鉄砲が火を吹く');
    battleEvent(rt, EVENT_UNIT_BREAK, F.big, null, 1, true, '敵の大船が崩れ、船団がひるむ');
    // 既存の士気処理へ渡す。討ち取りや作りの一騎打ちにはしない。
    for (const groups of [F.boarders, F.small]) for (const g of groups || []) {
      // 大船に近く、遮られずに崩壊を見た隊から動揺する。甲板の敵を一律に敗走させない。
      const c = g.center(), b = F.big;
      if (Math.hypot(c.x - b.x, c.z - b.z) < 75 && !rt.army.wallBetween(c, -1, b)) { g.flagshipHeard = true; g.morale = Math.max(0, g.morale - 20); }
    }
    F.flagshipHitAt = rt.t;
    if (playerShot) rt.award((t) => t.side.push('引き付けた敵の大船に大鉄砲を当てた'), '敵の大船を打ち崩した');
    for (const b of F.boats) if (b.alive && (!b.supply || !b.passed && !b.damageStage)) {
      // 乗り込みの兵が戻るまでは接舷した舟を動かさない。
      b.remaining = 0;
      if (b.group) b.group.reserveCount = 0;
      b.withdrawing = true;
      b.approach = null;
      // 信長公記の「木津浦へ追上」に合わせる。まず南の沖へ回り、甲板を横切らず川口へ。
      if (b.supply) { b.approach = null; b.landed = false; b.t.x = -45; b.t.z = 180; continue; }
      if (!b.group || !b.group.units.some((u) => u.alive && (!u.shipBoat || u.shipTransit?.active))) { b.landed = false; b.t.x = -45; b.t.z = 180; }
    }
  },
  retreat(rt) {
    const F = rt.flags;
    F.step = 5; F.stepT = rt.t;
    rt.setPhase('withdraw'); rt.objProgress('main', ''); rt.objDone('main');
    for (let i = 0; i < 3; i++) { rt.uninteract('g' + i); rt.unmark('g' + i); }
    rt.banner('船団が川口へ離れる', '船べりを守り、残る敵を退けよ');
    // 「敵を退けよ」を味方の退却合図に拾わせない。退き太鼓は敵船から。
    rt.obj('main', '敵の法螺貝と退き太鼓。甲板を守り、残る敵を押し返せ', 'main');
    rt.army.playFar('sig_nobiki', F.big, 0.9);
    rt.say('九鬼嘉隆', '敵の法螺貝と退き太鼓じゃ。深追い無用！　甲板を固めよ。物見は兵糧船を見張れ', 4);
    battleEvent(rt, EVENT_RETREAT, CANNONS[1], null, 1, true, '毛利の船団が木津浦へ離れる');
    rt.world.setTime('day');
    // 戦闘中に寄せた荷駄船の動きを引き続き見張る。新しい船を勝手に沈めない。
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.unmark('kuki');
    rt.setPhase('end'); rt.objProgress('main', '');
    for (let i = 1; i <= 4; i++) rt.unmark('b' + i);
    for (const groups of [F.boarders, F.small]) for (const q of groups || []) if (!gone(q)) { q.noRout = false; q.morale = 0; }
    for (let i = 0; i < 3; i++) { rt.uninteract('g' + i); rt.unmark('g' + i); }
    rt.objDone('main');
    if (F.supplyStopped === 2 && !F.supplyPassed) rt.objDone('supply'); else rt.objFail('supply');
    rt.tracker.main = true;
    const passed = F.supplyPassed || 0;
    rt.award((t) => { t.main = true; t.special = { label: '九鬼の船の持ち場を守り、寄せる敵船を退けた', pts: Math.max(6, 20 - passed * 4) }; }, '任務達成・船の持ち場を守った');
    sfx('horagai', 0.8); rt.after(1, () => sfx('toki', 0.8));
    rt.banner('毛利の船団、退く', `自船で止めた兵糧船：${F.supplyStopped}艘。持ち場を抜けた船：${passed}艘`);
    rt.say('九鬼嘉隆', passed === 0 ? `よう働いた、${nm(rt)}！　船を守り通したぞ。川口の警固を続けよ` : `${nm(rt)}、船は守り通した。抜けた兵糧船の行方は、物見に追わせよう`, 4);
    // 勝敗確定後は戦の時計が止まるので、余韻の語りは字幕へ直接渡す。
    rt.after(5, () => rt.hud.say('', '九鬼の大船は、近寄る敵船を大鉄砲で退けた。石山本願寺との戦いは、なお続く。', 4));
    rt.after(9, () => rt.hud.say('', '沖の守りは続く。陸では秀吉が三木の城を囲んでいる。', 3));
    // 海戦はここで閉じる。甲板の外へ歩く共通の追撃では、近い舟の兵を待ち続けてしまう。
    rt.finish({ scriptedEnd: true }, 12);
  },

  update(rt, dt) {
    const F = rt.flags;
    const motionT = S.reduceMotion ? 0 : rt.t;
    // 大船の上下だけをごく小さく揺らす。歩く床を傾けず、舷と水際に波を見せる。
    const heave = Math.sin(motionT * 0.8) * 0.025;
    F.deckShip.position.y = heave;
    animateRig(F.deckShip, motionT, !S.reduceMotion);
    for (const c of F.guns) {
      c.m.position.y = DECK.y + 0.72 + heave;
      // 任務が守備・消火へ切り替わったら、近い大筒の操作札も止める。
      if (c.interact) c.interact.r = cannonReady(rt, c) ? 2.6 : 0;
    }
    seaRemains(rt, dt, motionT);
    for (const u of F.teppo.units) {
      if (!u.alive || u.fleeing || u.woundOut) { u._crouch = false; continue; }
      const close = u.target?.alive && Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) < 7;
      u._crouch = !close && u.moving < 0.15 && !u.atk && !u.swing && !u.hit && (u.reload > 0 || !u.target);
    }
    updateHouroku(rt, motionT);
    seaAmbient(rt, dt);
    // 波の頂点と法線は毎秒十回だけ。自船の床は固定したまま。
    if (rt.t >= F.waveAt) {
      F.waveAt = rt.t + 0.1;
      for (const m of rt.world.mountains.children) m.material.uniforms.vis.value = rt.world.mountU.vis.value * (1.45 - m.material.uniforms.layer.value * 0.15);
      const p = F.sea.geometry.attributes.position, n = F.sea.geometry.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = -p.getY(i), a = x * 0.075 + z * 0.045 + motionT * 0.9, b = z * 0.12 + .6 * Math.sin(x * .041) - motionT * 1.2, c = x * .19 - z * .093 + motionT * 1.5;
        p.setZ(i, 0.14 * Math.sin(a) + 0.065 * Math.sin(b) + .035 * Math.sin(c));
        const nx = -0.0105 * Math.cos(a) - .001599 * Math.cos(x * .041) * Math.cos(b) - .00665 * Math.cos(c), ny = 0.0063 * Math.cos(a) + 0.0078 * Math.cos(b) - .003255 * Math.cos(c), inv = 1 / Math.hypot(nx, ny, 1);
        n.setXYZ(i, nx * inv, ny * inv, inv);
      }
      p.needsUpdate = n.needsUpdate = true;
      F.waterU.waterTime.value = motionT;
      F.waterU.waterWind.value.set(WIND_STATE.dirX, WIND_STATE.dirZ);
      updateSeaFoam(rt, motionT);
    }
    // 崩れた隊の印は消す
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    // 舷の守りで両軍を船内に留める。敗走兵は接舷口で小舟へ戻る。
    for (const mouth of F.shipMouths) if (!mouth.solid.struct.opened) {
      for (const b of F.boats) if (b.exit && b.landed && b.damageStage && b.from === mouth.from && (b.from === 's' || Math.abs(b.exit.z - mouth.z) < 1)) { mouth.solid.struct.opened = true; break; }
    }
    F.deckAttackers = 0;
    let alive = 0;
    for (const u of rt.army.units) {
      if (u.alive) alive++;
      if (!u.alive) continue;
      if (deckEnemy(u) || u.team === 1 && !u.fleeing && !u.woundOut && u.shipTransit?.active) F.deckAttackers++;
      if (u.shipBoat || u.shipTransit?.active) {
        if (u.pos.y <= 0 && !u.shipTransit?.active) rt.army.damage(u, u.maxHp * dt / 5, null);
        continue;
      }
      const boat = u.group?.boat;
      if (u.team === 1 && (u.fleeing || boat?.withdrawing) && boat?.exit && boat.alive && !boat.damageStage && Math.hypot(u.pos.x - boat.landing.x, u.pos.z - boat.landing.z) < 1) {
        const tr = u.shipTransit;
        if (tr) {
          tr.active = true; tr.returning = true; tr.start = rt.t; tr.x = u.pos.x; tr.y = u.pos.y; tr.z = u.pos.z;
          tr.heading = u.heading; tr.stepped = false;
          u.shipPost = u.perch = u.shipHold;
          u.shipPost.x = u.pos.x; u.shipPost.y = u.pos.y; u.shipPost.z = u.pos.z;
        }
        continue;
      }
      if (u.pos.x < DECK.x0 || u.pos.x > DECK.x1 || u.pos.z < DECK.z0 || u.pos.z > DECK.z1) {
        // 足を水面に置くと海の上を歩いて見える。肩まで沈め、傷と退場は元のまま。
        u.pos.y = -1.1; u.mesh.position.y = u.pos.y;
        rt.army.damage(u, u.maxHp * dt / 5, null);
      }
    }
    // 矢や落水で直接倒れた時も、共通の重傷・やり直し・結果へ渡す。
    // 札の待ち時間は共通側が進める。倒れたまま任務だけ残る時間を作らない。
    if (!rt.player.u.alive && !rt.over && !rt.retryOpen) rt.playerDown();
    if (F.ending || rt.over || !rt.player.u.alive) return;
    // 大筒だけを案内したまま、見えない屋形の大将が深手になるのを防ぐ。
    if (rt.t >= (F.kukiCheckAt || 0)) {
      F.kukiCheckAt = rt.t + 0.5;
      // 大将船を撃つ段では、離れた敵は護衛へ任せる。屋形への圧力と深手は別に監視する。
      const kukiThreat = F.step !== 2 && nearestDeckThreat(rt, F.kukiU,
        F.step === 4 && !F.bigSunk ? F.kukiDanger ? 4.5 : 3.5 : F.kukiDanger ? 8 : 6);
      const wasRoofDanger = !!F.roofDanger;
      F.roofDanger = F.step !== 2 && F.deckLost > 2;
      const kukiDanger = F.roofDanger || !!kukiThreat;
      if (kukiDanger !== !!F.kukiDanger || F.roofDanger !== wasRoofDanger) {
        F.kukiDanger = kukiDanger;
        // 救援の印を出すかは、下の目の前の敵と合わせた判定へ任せる。
        if (!kukiDanger) for (const m of rt.markers) if (m.id === 'kuki') m.noGuide = true;
        F.cannonGuardStep = -1;
        if (rt.missionGuide) rt.missionGuide.scan = 0;
        const word = F.roofDanger ? '屋形の前が敵に押されている！　戻って槍で押し返せ！' : F.kukiRetired ? '九鬼殿に敵が迫る！　屋形の脇へ回り、槍で押し返せ！' : '九鬼殿に敵が迫る！　屋形の前へ戻り、槍で押し返せ！';
        if (kukiDanger && noticeReady(rt, word)) rt.say('船頭', word, 4);
      }
    }
    if (F.kukiU.alive && F.kukiU.hp <= F.kukiU.maxHp * 0.75 && !F.kukiWarn) {
      F.kukiWarn = true; rt.say('船頭', '九鬼殿が手負いじゃ！　屋形を固めよ。敵を近づけるな！', 5);
    }
    // 消火の段の勝敗は下の火の判定に任せる。ほかの失敗条件で水運びを打ち切らない。
    const fireProtected = F.step === 2;
    // 九鬼は四割より下へは削らせない（周りの旗本が庇う）。乗り口で戦い続けた者を、大将の傷だけで負けにしない（bot 10/26）。
    if (F.kukiU.alive && !F.kukiU.woundOut && F.kukiU.hp < F.kukiU.maxHp * 0.6) { F.kukiU.hp = Math.max(F.kukiU.hp, F.kukiU.maxHp * 0.4); F.kukiU.invuln = true; }
    if (!fireProtected && !F.kukiU.alive) { this.lose(rt, '九鬼嘉隆が深手を負った。持ち場を退け！'); return; }
    let guards = 0;
    for (const u of F.kuki.units) if (u !== F.kukiU && u.alive && !u.fleeing && !u.woundOut) guards++;
    if (!F.kukiRetired && (F.kukiWarn || guards < Math.max(3, (F.kuki.initial - 1) / 2) || F.deckLost > 3)) {
      // 南の乗り口は (3.8, 10)。傷ついた大将をその一歩前へ退かせない。
      // 屋形の東脇でも前の護衛に近い所へ下げ、戻る通路を残す。
      F.kukiRetired = true; F.kukiU.shipPost.x = 3.8; F.kukiU.shipPost.z = 6;
      rt.say('船頭', '屋形の守りが危うい！　九鬼殿を奥へ。乗り口の敵を押し返せ', 4);
    }
    let pressure = 0; F.roofEnemy = null;
    // 上甲板や屋形の壁の向こうにいる兵は、入口の取り合いに数えない。
    for (const u of rt.army.units) if (u.alive && !u.noTarget && deckMeleeThreat(u) &&
        Math.hypot(u.pos.x - F.roofPost.x, u.pos.z - F.roofPost.z) < 4 &&
        !rt.army.wallBetween(F.roofPost, -1, u.pos)) {
      pressure += u.team === 1 ? 1 : -1;
      if (u.team === 1 && !F.roofEnemy) F.roofEnemy = u;
    }
    F.deckLost = pressure > 0 ? F.deckLost + dt : 0;
    // 兵糧船の取り逃しは脇の手柄だけ。大将船を崩す本筋を打ち切らない。
    if (F.deckLost > 0 && rt.t >= (F.deckWarnAt || 0)) {
      F.deckWarnAt = rt.t + 8;
      if (noticeReady(rt, '屋形に敵が入った！　押し返せ')) rt.bark('屋形に敵が入った！　押し返せ', true);
    }
    // 西の大筒から屋形の角を回って戻り、構えて押し返す時間を残す。
    if (!fireProtected && F.deckLost >= 20) { this.lose(rt, '屋形を敵に奪われた。船を離せ！'); return; }
    // 供船の大筒が十四秒ごとに沖を撃つ。自分の砲撃の手柄や命中判定には加えない。
    const salvo = F.salvo;
    if (F.step >= 1 && F.step <= 4 && !F.bigSunk && rt.t >= salvo.next) {
      salvo.next = rt.t + 14;
      const e = F.escorts[2], target = F.boats.find(b => b.alive && !b.damageStage && !b.withdrawing);
      if (!e.group.routed && target) {
        const z = (salvo.shot++ % 3 - 1) * 8, sn = Math.sin(e.m.rotation.y), cs = Math.cos(e.m.rotation.y);
        salvo.muzzle.x = e.x - 5.4 * cs + z * sn; salvo.muzzle.y = 3.4; salvo.muzzle.z = e.z + 5.4 * sn + z * cs;
        salvo.hit.x = target.x + 4; salvo.hit.y = 0.5; salvo.hit.z = target.z + 3; salvo.at = rt.t;
        rt.army.play('volley', salvo.muzzle, 1.2);
        rt.army.smoke(salvo.muzzle.x, salvo.muzzle.y, salvo.muzzle.z, -cs, sn, 2);
      }
    }
    const shotAge = rt.t - salvo.at;
    salvo.flash.visible = !S.reduceMotion && shotAge >= 0 && shotAge < 0.16;
    salvo.flash.position.set(salvo.muzzle.x, salvo.muzzle.y, salvo.muzzle.z); salvo.flash.scale.setScalar(0.7);
    salvo.splash.visible = shotAge >= 0.5 && shotAge < 1.5;
    salvo.splash.position.set(salvo.hit.x, salvo.hit.y, salvo.hit.z);
    salvo.splash.scale.set(1.2, S.reduceMotion ? 1.8 : Math.max(0.1, 3 * Math.sin((shotAge - 0.5) * Math.PI)), 1.2);
    const cannonSplash = F.cannonSplash, splashAge = rt.t - cannonSplash.at;
    cannonSplash.mesh.visible = splashAge >= 0.5 && splashAge < 1.5;
    cannonSplash.mesh.scale.set(1.2, S.reduceMotion ? 1.8 : Math.max(0.1, 3 * Math.sin((splashAge - 0.5) * Math.PI)), 1.2);
    // 小早を動かす・沈める
    for (const b of F.boats) {
      if (!b.alive) {
        if (b.sinkT !== undefined) {
          b.sinkT += dt;
          const small = !b.big && !b.supply;
          b.m.position.y = -Math.min(small ? 4.2 : 1.2, b.sinkT * (small ? 0.08 : 0.025));
          b.m.rotation.z = Math.min(0.28, b.sinkT * (small ? 0.008 : 0.005));
        }
        continue;
      }
      if (b.damageStage) {
        const age = rt.t - b.hitAt;
        b.damageStage = age < 8 ? 1 : 2;
        if (b.supply && age >= 8 && !b.stopped) {
          b.stopped = true; F.supplyStopped++;
          rt.objProgress('supply', `自船で止めた船：${F.supplyStopped}艘／二艘。抜けた船：${F.supplyPassed}艘`);
          if (F.supplyStopped === 2 && !F.supplyPassed) rt.objDone('supply');
          rt.award((t) => { if (!t.side.includes('毛利の荷駄船を打ち止めた')) t.side.push('毛利の荷駄船を打ち止めた'); }, `兵糧船一艘を止めた。合計${F.supplyStopped}艘`);
        }
        // 小早は旗竿の先まで沈める。船体が沈んだ後に旗だけ海上へ残さない。
        // 退場後も同じ速さ・深さへつなぎ、途中で船体が浮き上がらないようにする。
        const small = !b.big && !b.supply;
        b.m.position.y = -Math.min(small ? 4.2 : 0.65, age * (small ? 0.08 : 0.03));
        b.m.rotation.z = Math.min(small ? 0.28 : 0.18, age * 0.008);
        if (b.m.userData.crew) b.m.userData.crew.position.z = -Math.min(2.5, Math.max(0, age - 4) * 0.2);
        if (age >= (b.big || b.supply ? 90 : 45)) { b.alive = false; b.sinkT = age; continue; }
      } else floatShip(b.m, motionT, !b.landed && !S.reduceMotion, !!b.big);
      if (b.landed) {
        // 寄せた大将船は横腹を向ける。狭い船首を狙って撃ち続ける待ち合いにしない。
        if (b.big && !b.damageStage) {
          const turn = Math.atan2(Math.sin(-b.m.rotation.y), Math.cos(-b.m.rotation.y));
          b.m.rotation.y += Math.max(-dt * 0.35, Math.min(dt * 0.35, turn));
          continue;
        }
        if (b.supply) continue;
        if (b.ranged) { if (!b.withdrawing) continue; b.landed = false; }
        if (b.group?.routed) { b.remaining = 0; b.group.reserveCount = 0; b.withdrawing = true; }
        if (!b.remaining && b.group && !b.group.units.some((u) => u.alive && (!u.shipBoat || u.shipTransit?.active))) b.withdrawing = true;
        if (b.withdrawing && (!b.group || !b.group.units.some((u) => u.alive && (!u.shipBoat || u.shipTransit?.active)))) { b.landed = false; b.t.x = F.bigSunk ? -45 : -350; b.t.z = F.bigSunk ? 180 : 220; }
        else { alive += this.boardFromBoat(rt, b, alive); continue; }
      }
      const dx = b.t.x - b.x, dz = b.t.z - b.z, d = Math.hypot(dx, dz);
      // 風と潮：追い風・満ち潮で速く、向かい風・引き潮で遅い（ゆっくり変わる）。浸水した船は遅く、舵の壊れた船は流される
      const wt = 1; // 短い戦闘中に潮を何度も満ち引きさせない。風向・潮位の史料は未確定。
      const sp = (b.sp || 2.5) * wt * (b.damageStage ? Math.max(0, 1 - (rt.t - b.hitAt) / 8) : b.leak ? 0.72 : 1);
      if (b.rudderLost) b.z += Math.sin(rt.t * 0.7 + b.x) * 2.2 * dt;
      // 乗り口へ着く前に舳先をそろえる。位置だけで接舷を終えると、
      // 横を向いた舟から長い板が海を斜めに渡り、兵が宙を歩いて見える。
      const mooring = b.exit && !b.approach && !b.withdrawing && !b.damageStage && d < 12;
      const dockHeading = b.from === 's' ? Math.PI : Math.PI / 2;
      const dockTurn = mooring ? Math.atan2(Math.sin(dockHeading - b.m.rotation.y), Math.cos(dockHeading - b.m.rotation.y)) : 0;
      if (d > 0.5) {
        const want = mooring ? dockHeading : Math.atan2(dx, dz), turn = Math.atan2(Math.sin(want - b.m.rotation.y), Math.cos(want - b.m.rotation.y));
        b.m.rotation.y += Math.max(-dt * 0.35, Math.min(dt * 0.35, turn));
        // 接舷の最後は櫓で横へ寄せる。旋回半径より近い所で回り続けない。
        const docking = d < 12;
        const advance = Math.min(d, sp * dt) * (docking ? 1 : Math.max(0, Math.cos(turn)));
        b.x += (docking ? dx / d : Math.sin(b.m.rotation.y)) * advance; b.z += (docking ? dz / d : Math.cos(b.m.rotation.y)) * advance; b.m.position.x = b.x; b.m.position.z = b.z;
      }
      else if (mooring && Math.abs(dockTurn) > 0.02) {
        b.m.rotation.y += Math.max(-dt * 0.35, Math.min(dt * 0.35, dockTurn));
      }
      else if (b.approach) { b.approach = null; b.t = b.dock; }
      else if (b.withdrawing && F.bigSunk && !b.passed && !b.damageStage) { b.t.x = 430; b.t.z = 0; }
      else if (b.supply) {
        if (b.withdrawing) { b.landed = true; continue; }
        if (b.stopped || b.stopping) continue;
        if (!b.passed) {
          b.passed = true; F.supplyPassed++;
          // 川口の奥へ見送る。自船の任務失敗だけを記録し、搬入の成否は断定しない。
          b.withdrawing = true; b.t.x = 430; b.t.z = 0;
          rt.objFail('supply');
          rt.say('物見', `兵糧船が持ち場を抜けた！　川口の奥へ向かうぞ。抜けた船は${F.supplyPassed}艘じゃ`, 4);
        }
      }
      else {
        if (b.damageStage) continue;
        if (b.withdrawing) continue;
        b.landed = true;
        if (b.exit) for (const mouth of F.shipMouths) if (mouth.from === b.from && (b.from === 's' || Math.abs(mouth.z - b.exit.z) < 1)) mouth.solid.struct.opened = true;
        if (!b.ranged && !b.supply && !b.big && !b.withdrawing) {
          grapple(rt, b.exit.x, b.exit.z); b.nextBoard = rt.t + 2;
          const notice = b.from === 's' ? 'southHookSeen' : 'westHookSeen';
          if (!F[notice]) { F[notice] = true; rt.say('物見', b.from === 's' ? '艫に鉤縄！　後ろから来るぞ！' : '西の舷に鉤縄！　乗り込んで来るぞ！', 3); }
        }

      }
    }
    // 毛利の船は、大筒・消火・甲板防衛の間は途切れず寄せてくる
    if (F.step >= 1 && F.step <= 4 && !F.bigSunk && rt.t > (F.nextBoat || 1e9)) {
      F.nextBoat = rt.t + 14;
      // 空いている乗り口を先に使う。南が塞がっていても西の接舷を待たせない。
      if (!this.launch(rt, 'w')) this.launch(rt, 's');
    }
    // 遠くの船団がゆれる
    shipInstBegin(F);
    for (let i = 0; i < F.far.length; i++) {
      const b = F.far[i];
      if (b.userData.departed) { if (b.userData.farCut) shipFarCut(b, false); continue; }
      floatShip(b, motionT, !S.reduceMotion);
      // 画質「低」：50m より先の沖の舟は、櫂・乗員・旗・波を描かない（数画素の細部。船体と帆は残す）
      shipFarCut(b, false && rt.camera && Math.hypot(b.position.x - rt.camera.position.x, b.position.z - rt.camera.position.z) > 50);
      if (F.bigSunk) {
        if (b.position.z >= 180) b.userData.mouthLeg = true;
        const dx = (b.userData.mouthLeg ? 430 : -45) - b.position.x;
        const dz = (b.userData.mouthLeg ? 0 : 180) - b.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.5) {
          const move = Math.min(d, dt * 2);
          b.position.x += dx / d * move; b.position.z += dz / d * move;
          b.rotation.y = Math.atan2(dx, dz);
        } else b.userData.mouthLeg = true;
      }
      else if (F.step >= 1 && i % 6 !== 0) {
        // 後続も沖で止めず、接舷待ちの位置へ櫓で寄せる。船・兵を増やさない。
        const dx = -38 - Math.floor(i / 9) * 12 - (i % 3) * 6 - b.position.x;
        const dz = (Math.floor(i / 3) % 3 - 1) * 18 - b.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.5) {
          const move = Math.min(d, dt * 4);
          b.position.x += dx / d * move; b.position.z += dz / d * move;
          b.rotation.y = Math.atan2(dx, dz);
        }
      }
      shipInstPut(rt, F, b);
    }
    shipInstEnd(F);
    for (let i = 0; i < F.escorts.length; i++) {
      const e = F.escorts[i];
      if (i === 2 && !e.group.routed && F.step >= 1 && F.step <= 4 && !F.bigSunk) {
        if (!e.sortie && rt.t >= (e.nextSortie || 35)) { e.sortie = true; e.t.x = e.homeX - 55; e.t.z = e.homeZ + 28; }
        if (e.sortie && shipMove(e, dt, 1.4)) {
          if (e.t.x !== e.homeX) { e.t.x = e.homeX; e.t.z = e.homeZ; }
          else { e.sortie = false; e.nextSortie = rt.t + 12; }
        }
      } else if (e.sortie) { e.t.x = e.homeX; e.t.z = e.homeZ; if (shipMove(e, dt, 1.4)) e.sortie = false; }
      floatShip(e.m, motionT, e.sortie && !S.reduceMotion, true);
    }
    for (const b of F.seaShips) {
      if (b.support) floatShip(b.m, motionT, false);
      if (b.ranged && (b.group.routed || F.bigSunk) && !b.withdrawing) { b.withdrawing = true; b.landed = false; b.t.x = F.bigSunk ? -45 : -150; b.t.z = F.bigSunk ? 180 : 130; }
      syncShipCrew(rt, b);
    }
    if (F.bigSunk) { F.distantFleet.position.x += dt * 2; F.distantFleet.position.z -= dt; }
    if (F.step === 0 && deckRouteDistance(rt.player.u, F.guns[1].post) <= 2.6) { this.cannons(rt); return; }
    const elapsed = rt.t - F.stepT;
    if (rt.t >= F.noticeAt) {
      F.noticeAt = rt.t + 1;
      // 狭い甲板に矢の林を残さない。飛ぶ矢と人・船べりに刺さる矢はそのまま。
      let deckArrows = 0;
      for (let i = rt.army.arrows.length - 1; i >= 0; i--) {
        const a = rt.army.arrows[i];
        if (!a.stuck || !a.groundPinned || a.parent || a.support || Math.abs(a.pos.y - DECK.y) > 0.3 ||
            a.pos.x < DECK.x0 || a.pos.x > DECK.x1 || a.pos.z < DECK.z0 || a.pos.z > DECK.z1) continue;
        a.life = Math.min(a.life, ++deckArrows > 12 ? 0 : 18);
      }
      // 深手になる前に教える。既存の一秒の確認と字幕枠を使い、兵も札も増やさない。
      const p = rt.player, u = p.u;
      // 自動の遊び手が敵を迎える距離でも、札だけ大筒へ向かわせない。
      // 一斉射の機会に、甲板の反対側の敵まで追わせない。届く敵への構えは保つ。
      const nearbyThreat = nearestDeckThreat(rt, u,
        F.step === 4 && !F.bigSunk ? F.cannonGuard ? 4.5 : 3.5 : F.cannonGuard ? 8 : 6);
      // 槍の届く敵を迎える間は、屋形の裏への救援案内を畳む。
      // 屋形が危ない間は槍の届く敵だけ先に迎え、救援の印を早く戻す。
      const closeThreat = nearbyThreat && Math.hypot(nearbyThreat.pos.x - u.pos.x, nearbyThreat.pos.z - u.pos.z) < (F.roofDanger ? 2.4 : 3.5);
      for (const m of rt.markers) if (m.id === 'kuki') {
        const noGuide = !F.kukiDanger || F.step === 2 || F.step === 5 || !!F.bigSunk;
        if (m.noGuide !== noGuide) { m.noGuide = noGuide; if (rt.missionGuide) rt.missionGuide.scan = 0; }
      }
      if (!rt.over && !F.ending && F.step !== 2 && u.alive && !p.guard &&
          !(u.wounds?.bleed > 0.0001) && !p.treatmentReady && !p.treating &&
          (!F.guardTipShown || u.hp <= u.maxHp * 0.6) && rt.t >= (F.guardTipAt || 0) &&
          nearbyThreat && Math.hypot(nearbyThreat.pos.x - u.pos.x, nearbyThreat.pos.z - u.pos.z) <= 4.5) {
        const word = '敵が振り終えたら、構えを解いて突け';
        if (noticeReady(rt, word) && rt.hud.say('', word, 4, true)) {
          F.guardTipShown = true; F.guardTipAt = rt.t + 30;
        }
      }
      if (F.bigSunk) for (const groups of [F.boarders, F.small]) for (const g of groups || []) {
        if (g.flagshipHeard) continue;
        const c = g.center(), b = F.big;
        if (Math.hypot(c.x - b.x, c.z - b.z) < 75 && !rt.army.wallBetween(c, -1, b)) { g.flagshipHeard = true; g.morale = Math.max(0, g.morale - 20); }
      }
      if (F.step === 1 || F.step === 4 && !F.bigSunk) for (const c of F.guns) { const b = cannonTarget(F, c); c.aimHint = b ? aimWord(b, c) : '筒の向く先へ船が寄るのを待て'; }
      if (F.step === 1 || F.step === 4 && !F.bigSunk) {
        // 迎撃では六〜八メートル、一斉射では三・五〜四・五メートルで切り替える。
        // 戻す距離に余白を持たせ、任務の札の行き来を抑える。
        const guarding = !!nearbyThreat;
        F.cannonGuard = guarding;
        // 行き先の距離は大筒まで。射撃の目安は敵船までと明記する。
        let c = F.guns[1], score = -Infinity;
        if (F.step === 1) for (const gun of F.guns) {
          const d = deckRouteDistance(u, gun.post);
          const s = cannonPriority(rt, gun) - d * 0.1;
          if (s > score) { score = s; c = gun; }
        }
        // 同じ射撃条件なら直前の筒を保つ。半歩の移動で隣の筒へ案内を替えない。
        if (F.step === 1 && F.cannonPost) {
          const previous = F.cannonPost;
          const s = cannonPriority(rt, previous) - deckRouteDistance(u, previous.post) * 0.1;
          if (s >= score - 0.3) c = previous;
        }
        F.cannonPost = c;
        const b = cannonTarget(F, c);
        // 弾込め中の守備札へ、大筒までの行き先を添えない。
        const guideBlocked = guarding || !!F.kukiDanger || rt.t < c.cd;
        for (const m of rt.markers) if (/^g[0-2]$/.test(m.id)) m.noGuide = guideBlocked;
        for (const gun of F.guns) if (gun.interact) gun.interact.r = cannonReady(rt, gun) ? 2.6 : 0;
        if (F.cannonGuideBlocked !== guideBlocked) {
          F.cannonGuideBlocked = guideBlocked;
          if (rt.missionGuide) rt.missionGuide.scan = 0;
        }
        // 屋形の脇にいる時は移動を先に示す。持ち場へ着いてから待機の札にする。
        const task = closeThreat ? closeGuardTask(F) : F.kukiDanger ? rescueTask(rt) : guarding ?
          deckGuardTask(nearbyThreat) : rt.t < c.cd ? '弾込め中。西の船べりを見張れ' :
          deckRouteDistance(u, c.post) > 2.6 ? cannonApproachTask(rt, c) : !b ? '西の大筒へ。敵船を待て' :
          Math.hypot(b.x - c.x, b.z - c.z) > 55 ? '西の大筒へ。船が近寄るのを待て' : !cannonFacing(b, c) ?
            '西の大筒へ。船の横腹を待て' : F.step === 4 ? '西の大筒で大船の横腹を撃て' : '西の大筒で迫る敵船を撃て';
        if (F.cannonTask !== task || F.cannonGuardStep !== F.step) {
          F.cannonTask = task; F.cannonGuardStep = F.step;
          rt.obj('main', task, 'main');
          if (!guarding && !F.kukiDanger && rt.t < c.cd) {
            const word = '弾込めは砲手に任せよ。西を見張り、乗り込む敵を防げ';
            if (noticeReady(rt, word)) rt.say('砲手', word, 3);
          }
        }
        rt.objProgress('main', closeThreat ? F.kukiDanger ? '敵が振った後に槍で突け。退けたら九鬼嘉隆の守りへ' : '敵が振った後に槍で突け。離れたら大筒へ' : F.kukiDanger ? F.roofDanger ? '屋形の脇から前へ回れ。残る敵を押し返せ' : '屋形の脇を通って戻れ。九鬼嘉隆のそばで敵を防げ' : guarding ? '敵が振った後に槍で突け。離れたら大筒へ' : rt.t < c.cd ? `弾込めあと${Math.ceil(c.cd - rt.t)}秒。西の船べりを見張れ` : b ?
          deckRouteDistance(u, c.post) > 2.6 ? '甲板の印をたどり、大筒の持ち場へ' :
          `敵船まで約${Math.round(Math.hypot(b.x - c.x, b.z - c.z))}歩。${aimWord(b, c)}` : '敵船を待て。乗り込む敵を防げ');
      }
      if (F.step === 3) {
        // 乗り口の段も、大将の危険と目の前の戦いを任務の一行へ反映する。
        // 下の補足は携帯では畳まれるため、そこだけで戻れと命じない。
        const boat = nextBoardingBoat(rt);
        if (boat) {
          F.guardWest = boat.from !== 's';
          F.guardPost.x = boat.exit.x + (F.guardWest ? 2 : 0);
          F.guardPost.z = boat.exit.z - (F.guardWest ? 0 : 2);
        }
        const mode = closeThreat ? 'close' : F.kukiDanger ? F.roofDanger ? 'roof' : 'kuki' : nearbyThreat ? 'fight' : boat ? F.guardWest ? 'west' : 'south' : 'watch';
        const post = F.guardWest ? '西' : '南';
        const task = mode === 'close' ? closeGuardTask(F) : mode === 'roof' || mode === 'kuki' ? rescueTask(rt) : mode === 'fight' ? deckGuardTask(nearbyThreat) :
          mode === 'watch' ? '甲板を守り、次の敵船を見張れ' : boardingApproachTask(rt, post);
        if (F.boardGuideMode !== mode || F.boardTask !== task) {
          F.boardGuideMode = mode;
          F.boardTask = task;
          rt.obj('main', task, 'main');
          if (mode === 'west' || mode === 'south') {
            const word = `${post}へ小舟が寄るぞ。乗り口で迎えよ`;
            if (noticeReady(rt, word)) rt.say('物見', word, 3);
          }
        }
        for (const m of rt.markers) if (m.id === 'guard') m.noGuide = !!nearbyThreat || F.kukiDanger;
        if (rt.missionGuide) rt.missionGuide.scan = 0;
        rt.objProgress('main', closeThreat ? '敵が振った後に槍で突け。退けたら屋形の守りへ' : F.kukiDanger ? F.roofDanger ? '屋形の脇から前へ回れ。残る敵を押し返せ' : '屋形の脇を通って戻れ。九鬼嘉隆のそばで敵を防げ' : nearbyThreat ?
          '敵が振った後に槍で突け。乗り口からの新手にも気を配れ' : `乗り込む敵を${F.deckRepelled - F.boardRepelledStart}人退けた。南と西を守れ`);
      }
      // 命中直後の八秒も、待機の下知で目の前の残敵を見落とさせない。
      if (F.step === 4 && F.bigSunk || F.step === 5) {
        let remaining = 0;
        for (const u of rt.army.units) if (deckEnemy(u)) remaining++;
        // 音の説明は九鬼の声に残し、横持ちの札には今する事を短く載せる。
        const task = remaining ? '甲板に残る敵を退けよ' : '甲板を守り、退く敵船を見張れ';
        if (F.withdrawTask !== task || F.withdrawStep !== F.step) {
          F.withdrawTask = task; F.withdrawStep = F.step; rt.obj('main', task, 'main');
        }
        rt.objProgress('main', remaining ? `残る敵は${remaining}人。海へ追うな` :
          F.step === 4 ? '大船に命中。深追いせず、船を守れ' : '深追いせず、船べりで構えよ');
      }
    }
    if ((F.step === 3 || F.step === 5 || F.bigSunk) && rt.t >= (F.postGuardAt || 0)) {
      F.postGuardAt = rt.t + 1;
      for (let i = 0; i < F.postGuards.length; i++) {
        const u = F.postGuards[i];
        if (!u.alive) continue;
        u.shipPost.x = F.guardPost.x;
        u.shipPost.z = Math.max(-11.8, Math.min(11.8, F.guardPost.z - i * .9));
      }
    }
    // 迎撃・消火・乗り口防衛・一斉射を四〜七分へ。人数と新手は減らさない。
    if (!F.ending && !rt.over && rt.t >= 420) { this.lose(rt, '船の守りを立て直せ。船を離せ！'); return; }
    if (F.step === 1) {
      if (elapsed >= 90 && F.cannonHits >= 1) { this.fires(rt); return; }
      // 大筒を当てられなくても負けにしない（必ず戦い続けられる。稲生の標準）。百秒で砲手が代わりに当て、次の段へ。
      if (elapsed >= 100) { F.cannonHits = Math.max(1, F.cannonHits); rt.army.play('volley', CANNONS[1], 1.6); rt.say('砲手', '当たったぞ！　寄せる船が止まった', 3); this.fires(rt); return; }
    }
    if (F.step === 2) {
      if (F.doused < 3) F.fireDanger += dt;
      if (rt.t >= (F.fireNoticeT || 0) && F.doused < 3) {
        F.fireNoticeT = rt.t + 1;
        rt.objProgress('main', `残る火は${3 - F.doused}か所。${F.fireDanger >= 60 ? '屋形に火が迫る。急げ' : F.water ? '水を掛けたら、桶へ戻れ' : '水桶を取り、火へ運べ'}`);
      }
      // 九鬼の水夫も手桶で火に掛かる（三十五秒・六十秒に一つずつ）。主人公一人に船の火を任せきりにしない
      const crewAt = [35, 55, 70][F.crewDoused || 0];   // 三つ目も七十秒で水夫が消す。甲板で戦い続けた者を火で負けにしない（bot 10/26）
      if (F.doused < 3 && crewAt !== undefined && F.fireDanger >= crewAt) {
        const k = F.fl.findIndex((f) => f && !f.doused);
        F.crewDoused = (F.crewDoused || 0) + 1;
        if (k >= 0) {
          F.fl[k].doused = true; F.houroku[k].dousedAt = rt.t;
          rt.uninteract('f' + k); rt.unmark('f' + k); rt.world.removeFire(F.fl[k].f);
          F.doused++;
          rt.say('水夫', F.doused < 3 ? 'ここの火は消えたぞ！　そちらはどうじゃ！' : 'よし、火はみな消えたぞ！', 3);
          if (F.doused >= 3) { this.board(rt); return; }
        }
      }
      if (F.doused < 3 && F.fireDanger >= 75) { this.lose(rt, '火が屋形へ回った。船を離せ！'); return; }
      if (F.doused >= 3) { this.board(rt); return; }
    }
    if (F.step === 3) {
      // 迎撃と消火の間に退けた敵も守りの働きに数える。
      // 早く守り切って新手が尽きても、架空の四人を待たせない。
      // 決め手は開始二百二十秒以降。崩壊八秒と退き十二秒を含め四分以上。
      let contested = false;
      for (const u of rt.army.units) if (deckEnemy(u)) { contested = true; break; }
      if (elapsed >= 105 && rt.t >= 220 && F.deckRepelled >= 4 && (F.deckRepelled - F.boardRepelledStart >= 4 || !contested)) {
        rt.award((t) => { if (!t.side.includes('甲板へ乗り込む敵を退けた')) t.side.push('甲板へ乗り込む敵を退けた'); }, '甲板の持ち場を守った');
        this.decisive(rt); return;
      }
      if (elapsed >= 130) { this.decisive(rt); return; }   // 乗り口で戦い続けた者を負けにせず、決め手の段へ（bot 10/26）
    }
    if (F.step === 4) {
      if (!F.bigSunk && elapsed >= 60) { this.breakFlagship(rt, false); return; }   // 当てられなくても味方の大船が崩す（負けにしない）
      // 命中後の崩れを見せたら退きへ進む。砲撃が早く決まっても待たせない。
      if (F.bigSunk && rt.t - F.flagshipHitAt >= 8) { this.retreat(rt); return; }
    }
    if (F.step === 5 && elapsed >= 12) {
      let contested = false;
      for (const u of rt.army.units) if (deckEnemy(u)) { contested = true; break; }
      if (!contested && F.bigSunk && F.doused >= 3 && F.cannonHits >= 1 && rt.player.u.alive) this.win(rt);
      else if (elapsed >= 60 && rt.player.u.alive) this.win(rt);   // 甲板に敵が残っても、大船を崩した後は守り通した事にする
    }

  },

  boardFromBoat(rt, b, alive) {
    const F = rt.flags;
    // 大将船を狙う間も、既に寄せた小早の兵は乗り込む。
    // 乗り込みを止めるのは、一斉射で敵船が退き始めた時。
    if (F.deckAttackers >= (F.step === 1 ? 6 : 8) || rt.t < F.nextBoardAt) return 0;
    if (F.step < 1 || F.step > 4 || F.bigSunk || b.damageStage || b.withdrawing || !b.remaining || rt.t < b.nextBoard) return 0;
    const u = b.group?.units.find(u => u.alive && !u.fleeing && !u.woundOut && u.shipBoat === b && !u.shipTransit.active);
    if (!u) { b.remaining = 0; return 0; }
    const tr = u.shipTransit;
    tr.active = true; tr.returning = false; tr.start = rt.t; tr.x = u.pos.x; tr.y = u.pos.y; tr.z = u.pos.z;
    tr.heading = u.heading; tr.stepped = false;
    b.remaining--; b.nextBoard = rt.t + 6;
    F.nextBoardAt = rt.t + 3; F.deckAttackers++;
    b.boarded = (b.boarded || 0) + 1;
    b.group.order = 'attack';
    return 0; // 兵は舟にいる時から本物なので人数を増やさない。

  },

  lose(rt, line) {
    const F = rt.flags;
    if (rt.flags.step === 2 && rt.flags.doused < 3 && rt.flags.fireDanger < 75) return;
    if (!rt.canFailMission()) return;
    if (rt.flags.ending || rt.over) return;
    rt.flags.ending = true; rt.tracker.main = false;
    rt.setPhase('end'); rt.objFail('main'); rt.objProgress('main', '');
    rt.unmark('big'); rt.unmark('guard'); rt.unmark('kuki');
    for (let i = 1; i <= 4; i++) rt.unmark('b' + i);
    for (let i = 0; i < 3; i++) { rt.unmark('g' + i); rt.unmark('f' + i); }
    rt.objProgress('main', `法螺貝と退き太鼓。${line}`);
    rt.army.playFar('sig_nobiki', F.kukiU.pos, 0.9);
    rt.banner('法螺貝と退き太鼓・持ち場を退く', line);
    rt.say('九鬼嘉隆', `法螺貝と退き太鼓じゃ！　${line}`, 4);
    for (let i = 0; i < 3; i++) { rt.uninteract('g' + i); rt.uninteract('f' + i); }
    for (let i = 0; i < 4; i++) { rt.uninteract('water' + i); rt.unmark('water' + i); }
    // やり直しの札にも、今回起きた失敗条件を渡す。
    rt.finish({ failureReason: line, scriptedEnd: true }, 8);
  },

  onKill(rt, v) {
    const F = rt.flags;
    deckFall(rt, v);
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    if (v.team === 1 && v.group?.boat?.boarded && !v.shipBoat && !v.deckRepelled) { v.deckRepelled = true; F.deckRepelled++; }
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g.team === 1 && g.boat?.boarded) {
      for (const u of g.units) if (u.alive && !u.shipBoat && !u.deckRepelled) { u.deckRepelled = true; F.deckRepelled++; }
    }
    if (g.team !== 1 || !g.boat?.boarded || F.routSeen || F.ending) return;
    F.routSeen = true;
    rt.say('足軽', '敵が小舟へ逃げるで！　乗り口を守ろまい！', 2.5);
  },
};

// 備え表と一致する推定兵数。局地の一人の損害を全軍の十人・二十人へ水増ししない。
kizugawa.force = (rt) => {
  const F = rt.flags;
  return { a: Math.max(0, 720 - (F.ak || 0)), a0: 720, b: Math.max(0, 4800 - (F.ek || 0)), b0: 4800 };
};
kizugawa.sides = { a: { name: '織田水軍（九鬼）', mon: 'oda' }, b: { name: '毛利水軍', mon: 'mori' } };
// 敵の大将船の主は史料で特定されない。名のある将を自船へ乗り込ませない。
kizugawa.famous = [];
kizugawa.date = () => '天正六年十一月六日　冬・辰から午';
kizugawa.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
kizugawa.skip = (rt) => { if (rt.phase === 'brief' && !rt.flags.ending && !rt.over && rt.player.u.alive) kizugawa.cannons(rt); };
kizugawa.history = '『信長公記』巻十一によると、天正六年十一月六日、西国の船六百余艘が木津へ出た。九鬼嘉隆の船団は囲まれ、朝から昼まで海上で戦った。六艘の大船は敵を間近へ寄せ、大将の船と思われる船を大鉄砲で崩し、敵は近寄れなくなったと記す。鉄張りは『多聞院日記』に見えるが、覆った範囲には諸説がある。大きさは『信長公記』別本の長さ十八間・幅六間（約三十二歩・十一歩）を遠景に採った。『九鬼御伝記』では三艘ずつ二手に分かれ、敵船を二十四艘取ったともいう。毛利方の文書には木津への着岸が見え、この一戦で海の道が完全に断たれたかには異論もある。自船も同じ船幅に直した。消火・乗り込み・個々の荷駄船の阻止は遊びの補完である。総兵数は味方七百二十・敵四千八百の仮置きで、史料の点呼数ではない。細かな配置と天候も推定である。戦場全体の封鎖成功ではなく、自分の船の持ち場を守る任務として扱う。';
// 確認した史料の翻刻・現代語表記：
// https://kininaruart.com/artist/shincho/n11.html
// https://proto.harisen.jp/koramu/koramu-tekkousen2.htm
// 辰から午・木津浦への追い上げ：
// https://ja.wikisource.org/wiki/信長公記/我自刊我書
// 近い岸を低湿地・砂州とする地形の根拠（川筋の座標は推定）：
// https://www.oml.city.osaka.lg.jp/page/1146.html
// https://www.city.osaka.lg.jp/keizaisenryaku/cmsfiles/contents/0000626/626612/2syou.pdf


// 素直な遊び手：大筒を撃ち、火を消し、乗り込んだ毛利勢と戦う
// 船の持ち場と受けてからの反撃を、性格の突進で上書きしない。
kizugawa.botOrders = true;
kizugawa.botBrain = (b, inp, { goTo, patientStrike }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  // 深手の退避と手当ては共通の頭に任せる。手当ては体力の四分の三までなので、
  // 自然回復を待つと甲板の隅から二度と戦いへ戻れない。
  // 小舟で待つ兵へ向かうと、船べりへ押し続けて甲板の敵に背を向ける。
  // 守りの札と同じ、甲板へ上がり終えた敵だけを迎える。
  const nearby = nearestDeckThreat(b, u, 10);
  const guardEnemy = F.kukiDanger && F.step !== 2 ? F.roofEnemy?.alive ? F.roofEnemy : nearestDeckThreat(b, F.kukiU, 8) : null;
  const nearDistance = nearby ? Math.hypot(nearby.pos.x - u.pos.x, nearby.pos.z - u.pos.z) : Infinity;
  // 屋形が押されている時、離れた乗り口での追い掛けを続けない。
  // 槍の届く相手には構え、間が空いたら入口の守りへ戻る。
  const e = nearby && nearDistance < (F.roofDanger ? 2.4 : 3.5) ? nearby : guardEnemy || nearby;
  const pre = F.step === 1 || F.step === 4 && !F.bigSunk ? 'g' : F.step === 2 ? (F.water ? 'f' : 'water') : null;
  if (e && (!pre || guardEnemy || pre === 'g' && F.cannonGuard || Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) < 3.5)) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 大将側で見つけた敵は、遊び手からは屋形の裏にいる事がある。
    // 近さだけで壁へ槍を振らず、入口を回ってから迎える。
    if (b.army.wallBetween(u.pos, -1, e.pos)) {
      inp.guardHold = false;
      goDeckTo(b, inp, e.pos.x, e.pos.z, 0.8, goTo);
      return;
    }
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.6 : 2.4;
    if (d > reach) goDeckTo(b, inp, e.pos.x, e.pos.z, reach, goTo);
    // 構えたままの連打は払いになり、気力を失う。敵の隙に構えを解いて突く。
    patientStrike(p, inp, e, d);
    return;
  }
  inp.guardHold = false;
  // 救援の札と同じ持ち場へ向かう。退いた大将を入口で待ち続けない。
  if (F.kukiDanger && F.step !== 2) {
    const post = F.roofDanger ? F.roofPost : F.kukiU.pos;
    goDeckTo(b, inp, post.x, post.z, 0.8, goTo);
    return;
  }
  if (pre) {
    let it = null, bd = Infinity, bestScore = -Infinity;
    for (const x of b.interacts) if (x.id.startsWith(pre)) {
      if (pre === 'g') { const gi = +x.id.slice(1); if (b.t < F.guns[gi].cd || !cannonTarget(F, F.guns[gi])) continue; }
      const d = deckRouteDistance(u, x.pos);
      // 任務の印と同じく、横腹を撃てる筒を選び、屋形を回る道のりも数える。
      const score = (pre === 'g' ? cannonPriority(b, F.guns[+x.id.slice(1)]) : 0) - d * 0.1;
      if (score > bestScore) { bestScore = score; bd = d; it = x; }
    }
    if (it) { if (bd > 1.2) goDeckTo(b, inp, it.pos.x, it.pos.z, 0.8, goTo); else inp.k.add('KeyE'); }
    return;
  }
  if (F.step === 3 || F.step === 4 && F.bigSunk || F.step === 5) {
    // 一斉射の後も甲板を守る。十歩より遠い残敵を見落として立ち止まらない。
    const q = nearestDeckThreat(b, u, 80);
    if (q) { goDeckTo(b, inp, q.pos.x, q.pos.z, 2, goTo); return; }
    // 敵が甲板へ上がるまで南だけで待つと、西の乗り口は鉄砲衆だけが戦う。
    // 次に接舷する小早の乗り口へ寄り、上がる敵を味方と迎える。
    // 舟は南西の曲がり口を通るので、残る二つの道の長さも数える。
    if (F.step === 3) {
      const next = nextBoardingBoat(b);
      if (next) {
        goDeckTo(b, inp, next.exit.x + (next.from === 's' ? 0 : 2), next.exit.z - (next.from === 's' ? 2 : 0), 1, goTo);
        return;
      }
    }
    goDeckTo(b, inp, 3.8, 10, 2, goTo);
  }
};


export { kizugawa };
