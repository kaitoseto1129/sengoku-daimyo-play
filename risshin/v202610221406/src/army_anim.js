// Army の手法：体の動き（歩き・構え・槍・刀・鉄砲・弓・倒れ方）
// （units.js から分けた。中身は元のまま。外の係は今までどおり units.js から import してよい）
import { animateHorse, flexSpear, seatLegs, RIDE, poseArms, GUN_MUZ, GUN_BORE, GUN_RAM, setBowDraw, aimArm } from './units_model.js';
import { YUMI } from './yumi.js';
import { angleDiff, DEATH_END, thrustOut, clamp01, SW_POSE, SW_HASSO, SW_JODAN, RELOAD, GUN_POSE, BOW_POSE, _nk, _dUp, _dN, _dQ, _dI } from './units.js';
import { IDLE, muddyFlag } from './units_flags.js';
import { TYPES } from './units_data.js';
import * as THREE from 'three';
import { S as SET, reduceMotion } from './settings.js';
import { markArmor, syncArmorWear } from './armor_wear.js';
import { groundAt } from './floors.js';

// 姿は一人ずつ計算して手へ写すので、一時の目当ては全員で使い回せる。
// 残心で同じ配列を入力と出力にしても、各成分を独立に計算する。
const ramArmPoint = new THREE.Vector3();
const swordPose = [0, 0, 0, 0, 0, 0], bowPose = [0, 0, 0, 0, 0];
// 判定が返った振りの時刻を攻め手・受け手で共用する。技の予定打点と実際の接触を混同しない。
function contactAfter(swing) {
  if (swing.res !== 'block' && swing.res !== 'armor') return -1;
  if (swing.poseContactAt === undefined) swing.poseContactAt = swing.t;
  return swing.t - swing.poseContactAt;
}
// 同じ刻みで動く兵の減衰係数は共用する。姿勢を間引いた兵の刻みにも正確に合わせる。
let contactDt = -1, contactFast = 0, contactSlow = 0, contactParry = 0;
// 肩避けは二人まで分かれば構えが決まる。全兵で同じ関数を使い、探す間だけ兵を渡す。
function spearLaneVisit(other, u) {
  const lane = u._spearLane;
  if (other === u || other === u.target || other === u.poseTarget ||
      !other.alive || other.isStruct || Math.abs(other.pos.y - u.pos.y) > (other.mounted ? 1.5 : .85)) return;
  const dx = other.pos.x - u.pos.x, dz = other.pos.z - u.pos.z;
  const ahead = dx * lane.sin + dz * lane.cos;
  // 横に並ぶ肩も柄に触れる。本人は上で除外済みなので、手元の帯を空白にしない。
  // 馬は中心だけでなく、首から尻までの長さを含めて柄を避ける。
  const bodyLength = other.mounted ? 1.45 : .3;
  if (ahead + bodyLength <= -lane.back || ahead - bodyLength >= lane.length) return;
  const side = Math.abs(dx * lane.cos - dz * lane.sin - lane.handX);
  if (side < (other.mounted ? 1.15 : .6)) {
    if (ahead - bodyLength < .25) lane.rearBlocked = true;
    // 敵の肩は脅威であって味方の背ではない。接敵線で全員が槍を立てるのを防ぐ。
    if (ahead + bodyLength >= .25 && other.team === u.team) { lane.blocked = true; lane.obstacles = Math.min(2, lane.obstacles + 1); }
  }
}
// 回した長方形が触れる升だけを調べる。前の二人と背後が分かれば残りは同じ構えになる。
function scanSpearLane(army, u, center, half, width) {
  const lane = u._spearLane, cell = army.cell;
  const x = u.pos.x + lane.sin * center, z = u.pos.z + lane.cos * center;
  const sn = Math.abs(lane.sin), cs = Math.abs(lane.cos);
  const rx = sn * half + cs * width, rz = cs * half + sn * width;
  const x0 = Math.max(army.gridX0, Math.floor((x - rx) / cell));
  const x1 = Math.min(army.gridX1, Math.floor((x + rx) / cell));
  const z0 = Math.max(army.gridZ0, Math.floor((z - rz) / cell));
  const z1 = Math.min(army.gridZ1, Math.floor((z + rz) / cell));
  for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
    const units = army.grid.get((i + 20000) * 40000 + j + 20000);
    if (!units) continue;
    for (let k = 0; k < units.length; k++) {
      spearLaneVisit(units[k], u);
      if (lane.obstacles >= 2 && lane.rearBlocked) return;
    }
  }
}
// 隊列の参照がない乱戦でも、目の前の味方の受けを後ろの姿へ渡す。
// 近い兵だけ短く覚える。探索の関数と作業場所は全員で共用する。
let braceArmy, braceUnit, braceBest, braceSin, braceCos;
function braceVisit(o) {
  const u = braceUnit, t = o.swing?.target || o.atk?.target || o.target || o.poseTarget;
  if (o === u || !o.alive || o.dying || o.fleeing || o.mounted || o.isPlayer || o.team !== u.team
    || Math.abs(o.pos.y - u.pos.y) > 0.6 || !t?.alive || t.isStruct || t.team === u.team) return;
  const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z, d2 = dx * dx + dz * dz;
  if (d2 >= braceBest || dx * braceSin + dz * braceCos < Math.sqrt(d2) * 0.35
    || braceArmy.distTo(o, t) > Math.min(5.4, (o.reach || 2) + 1)
    || braceArmy.wallBetween(u.pos, -1, o.pos)) return;
  braceBest = d2; u._poseFront = o;
}
function braceFront(army, u) {
  if (!army.world.def.livingSpearHedge || u.isPlayer || u.mounted || u.fleeing || u.downed
    || u.camD > 28 || u.moving > 1.2) return null;
  if (!(u._poseFrontAt > army.time)) {
    u._poseFrontAt = army.time + 0.35 + u.id % 4 * 0.03; u._poseFront = null;
    braceArmy = army; braceUnit = u; braceBest = 3.24;
    braceSin = Math.sin(u.heading); braceCos = Math.cos(u.heading);
    army.forNear(u.pos.x, u.pos.z, 1.8, braceVisit);
    braceArmy = braceUnit = null;
  }
  const f = u._poseFront;
  return f?.alive && !f.fleeing && army.distTo(u, f) < 1.8 ? f : null;
}
// 斬撃の見た目だけを三種追加する。怯む時間・押される位置・当たりは変えない。
export function cutReaction(H, id) {
  if (!H || H.res === 'armor' || H.res === 'block' || H.kind === 'kneel' || H.kind === 'flinch' ||
      !(H.wkind === 'kesa' || H.wkind === 'gyaku' || H.wkind === 'yoko' || H.wkind === 'sweep')) return 0;
  return H.cutPose ?? (H.cutPose = (id + Math.round((H.amp ?? 1) * 100)) % 4);
}
function lerpPose(a, b, k, out) {
  for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * k;
  return out;
}
function swordKind(u, k) {
  return u.mounted && (k === 'kesa' || k === 'gyaku' || k === 'yoko') ? 'uma' : k;
}

// 形のならし：目当ての値へ、速さを持ったばねで寄せる（臨界の減衰。行き過ぎず、速さが一コマで跳ばない）。
//   一次のならし（x += (目当て − x)·k）は目当てが変わった瞬間に速さが跳ぶので、技のつなぎで手がカクつく。ばねは速さも続く
//   s[k] が値、s['v' + k] が速さ。w が大きいほど速く追う（w=40 で 0.1 秒ほど）。どんな dt でも崩れない解き方
export function spr2(s, k, to, w, dt) {
  const vk = 'v' + k, y = s[k] - to, v = s[vk] || 0, e = Math.exp(-w * dt), c = (v + w * y) * dt;
  s[k] = to + (y + c) * e; s[vk] = (v - w * c) * e;
}

// Army の手法（units.js の class Army に足す）
export const ArmyAnim = {

  animate(u, dt, near) {
    // 中景の姿勢は毎秒12回。根元だけ毎コマ進め、歩みと戦闘の時計はためる。
    if (u.alive && !u.dying && u.qualityTier > 0 && (!u.mounted || u.qualityTier === 2)) {
      u.qualityAnimDt = (u.qualityAnimDt || 0) + dt;
      u.mesh.position.copy(u.pos); u.mesh.rotation.y = u.heading;
      const every = u.qualityTier === 1 ? 1 / 12 : 0.6;
      if (u.qualityAnimDt < every) return;
      dt = u.qualityAnimDt; u.qualityAnimDt = 0;
    } else if (u.qualityAnimDt) { dt += u.qualityAnimDt; u.qualityAnimDt = 0; }
    // 画面外から向き直った時も、直前の姿勢と時計を保つ。
    u.animDt = (u.animDt || 0) + dt;
    dt = u.animDt; u.animDt = 0; u.animFrame = 0;
    const m = u.mesh;
    syncArmorWear(u, this.hideBlood);
    if (!u.alive || u.dying) {
      // 馬上で討たれた：馬が崩れて倒れ、乗り手は鞍ごと地面へ（馬の倒れ方に任せる）
      if (u.mounted && u.horse && u.horse.userData.horse && u.deadT < 4) {
        u.deadT += dt;
        const H = u.horse.userData.horse;
        H.dead = true;
        if (u.horse.visible !== false) animateHorse(u.horse, dt, 0);
        if (u.seat) { u.seat.matrix.copy(H.seat); if (!u.isPlayer) u.seat.matrix.multiply(RIDE.fit); u.seat.matrixWorldNeedsUpdate = true; }
        return;
      }
      if (u.death && !u.mounted) { if (u.death.t < DEATH_END || u.death.aid) this.animDeath(u, dt, near); else u.deadT += dt; return; }
      if (u.deadT < 1 && !u.mounted) {
        u.deadT += dt;
        const k = Math.min(1, u.deadT / 0.55);
        // 倒れる向きはさまざま（前後・左右）
        if (u.fallAxis === 'z') m.rotation.z = Math.PI / 2 * k * u.fall * (k * k);
        else m.rotation.x = -Math.PI / 2 * k * u.fall * (k * k);
        m.position.y = u.pos.y - 0.1 * k;
      }
      return;
    }
    // 突かれた半歩を短く刻む。柵・崖・川へは押し出さない。
    if (u.hit && u.hit.stepX !== undefined) {
      const H = u.hit, k = Math.min(1, H.t / 0.28), e = k * k * (3 - 2 * k), d = e - H.step;
      const x = u.pos.x + H.stepX * d, z = u.pos.z + H.stepZ * d;
      if (this.aidWalkable(u, x, z)) { u.pos.x = x; u.pos.z = z; u.pos.y = groundAt(this.world, x, z, u.pos.y); }
      H.step = e;
    }
    m.position.set(u.pos.x, u.pos.y, u.pos.z);
    m.rotation.y = u.heading;
    // 急な坂を走る徒歩の者は、坂に合わせて体を前へ（下り）・後ろへ（上り）傾け、足が坂から浮かないようにする（B060）
    if (u.camD < 45 && u.moving > 0.6 && !u.isPlayer && !u.mounted && u.type !== 'cavalry' && !u.isStruct && this.world && this.world.heightAt) {
      const sx = Math.sin(u.heading) * 0.7, sz = Math.cos(u.heading) * 0.7, W0 = this.world;
      const sl = (groundAt(W0, u.pos.x + sx, u.pos.z + sz, u.pos.y) - groundAt(W0, u.pos.x - sx, u.pos.z - sz, u.pos.y)) / 1.4;
      if (Math.abs(sl) > 0.2) { m.rotation.order = 'YXZ'; m.rotation.x = -Math.atan(sl) * 0.55; u._slopeT = true; }
      else if (u._slopeT) { u._slopeT = false; m.rotation.x = 0; }
    } else if (u._slopeT) { u._slopeT = false; m.rotation.x = 0; }
    // 梯子を登っている間（siege_ladder.js。docs C3）：登る形だけ出し、歩き・構えは出さない
    if (u.climb) { this.poseClimb(u, dt); return; }
    // 鞍から引き落とされた者（army_combat の pullOff）：鞍の高さから横へずり落ちて地に伏せ、最後の 0.9 秒で起き上がる
    if (u.downed) {
      const D = u.downed; D.t += dt;
      const e = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
      const tt = Math.min(D.t, 0.62), sl = 1 - e(D.t / 0.55);
      const b = e(D.t / 0.5) * (1 - e((D.t - D.dur + 0.9) / 0.9));
      m.rotation.order = 'YXZ'; m.rotation.set(0, u.heading, -D.side * Math.PI / 2 * 0.92 * b);
      m.position.set(u.pos.x + D.ox * sl, u.pos.y + Math.max(0, RIDE.y + 0.2 + 0.6 * tt - 4.9 * tt * tt) * (D.t < 0.62 ? 1 : 0) + 0.11 * Math.sin(b * Math.PI / 2), u.pos.z + D.oz * sl);
      u.stagger = Math.max(u.stagger || 0, D.dur - D.t); u.mv && (u.mv.x = u.mv.z = 0);
      if (D.t >= D.dur) { u.downed = null; m.rotation.order = 'XYZ'; m.rotation.set(0, u.heading, 0); }
    }
    if (u.fireT > 0) u.fireT -= dt;
    // 自分（プレイヤー）の振りと崩れの時計（兵は act で進める）
    if (u.isPlayer) { if (u.swing) { u.swing.t += dt; if (u.swing.t > u.swing.dur + 0.3) u.swing = null; } if (u.hit) { u.hit.t += dt; if (u.hit.t > u.hit.dur) u.hit = null; } }
    if ((!near && !u.jinchu) || u.offscreen || (u.imp && !u.isPlayer)) {
      if (u.wpn && u.wpn.userData.loadPowder) {
        u.wpn.userData.loadPowder.visible = u.wpn.userData.loadBall.visible = false;
      }
      // まとめて描いている遠い兵（体を隠してある）は、体の揺れも得物のしなりも見えないので計算しない
      if (u.offscreen || u.imp && !u.isPlayer) return;
      if (u.wpn) flexSpear(u.wpn, dt, false, 0);
      // 遠くの兵（手足は省く）：体だけ小さく揺らし、ゆっくり見回す（安い動き。一人ずつ時をずらす）
      if (IDLE.on && !u.offscreen && !u.isPlayer && !u.mounted && u.body && u.moving < 0.1) {
        const p = u.id * 0.618;
        u.body.rotation.z = Math.sin(this.time * (0.9 + (p % 1) * 0.6) + p * 40) * 0.06;
        u.body.rotation.y = Math.sin(this.time * (0.4 + (p * 7 % 1) * 0.3) + p * 17) * 0.4;
        u.body.rotation.x = Math.sin(this.time * 0.7 + p * 9) * 0.04;
        u.body.position.y = Math.sin(this.time * 1.8 + u.id) * 0.015;
      }
      return;
    }
    // 被弾でのけぞる／混乱してふらつく
    if (u.recoil > 0) u.recoil -= dt;
    // 打たれた崩れ（u.hit）：素早く崩れて、ゆっくり戻る
    const H = u.hit;
    let hx = 0, hz = 0, hy = 0;
    if (H) {
      const k = H.t / H.dur, e = (k < 0.18 ? k / 0.18 : Math.max(0, (1 - k) / 0.82)) * (H.amp ?? 1);
      if (H.kind === 'recoil') hx = -0.32 * e;
      else if (H.kind === 'flinch') { hx = -0.1 * e; hz = H.side * 0.05 * e; }
      else if (H.kind === 'side') { hx = -0.08 * e; hz = H.side * 0.3 * e; }
      else if (H.kind === 'stumble') hx = 0.32 * e;
      // 泥・坂で転んだ者：前へ深く崩れて手をつき、ゆっくり起き上がる
      else if (H.kind === 'kneel' && H.tumble) hx = 0.6 * Math.min(1, k / 0.12) * Math.min(1, (1 - k) / 0.45);
      // 刃に引かれる肩、穂先に押される胸を、今ある怯みの時計で動かす。
      if (H.res !== 'block' && H.res !== 'armor') {
        if (H.wkind === 'kesa' || H.wkind === 'gyaku' || H.wkind === 'yoko' || H.wkind === 'sweep') hy = (H.side || 1) * 0.2 * e;
        else if ((H.wkind === 'thrust' || H.wkind === 'tsuki') && H.kind === 'recoil') hx -= 0.06 * e;
      }
      const cut = !u.mounted && !u.isPlayer ? cutReaction(H, u.id) : 0;
      if (cut === 1) { hx += 0.3 * e; hy += (H.side || 1) * 0.22 * e; }
      else if (cut === 2) { hx -= 0.2 * e; hz += (H.side || 1) * 0.22 * e; }
      else if (cut === 3) { hx += 0.16 * e; hz -= (H.side || 1) * 0.25 * e; }
    }
    // のけぞり・突きの踏み込み・走りの前傾
    u.body.rotation.x = u.recoil > 0 ? -0.28 * (u.recoil / 0.22) : u.strikeT > 0 ? 0.2 * Math.sin((1 - u.strikeT / 0.2) * Math.PI) : u.moving > 1.1 ? 0.12 : 0;
    u.body.rotation.x += hx;
    // 崩れかけの兵は、ちらちらと後ろを振り返る
    const scared = u.group && u.group.morale < 32 && !u.isPlayer && !u.fleeing;
    // 薙ぎのひねり、立ち止まったときの見回し
    u.body.rotation.y = scared && Math.sin(this.time * 0.9 + u.id) > 0.55 ? Math.sign(Math.sin(u.id)) * 0.9 : u.sweepT > 0 ? Math.sin((1 - u.sweepT / 0.35) * Math.PI * 2) * 0.35 : (u.moving < 0.1 && !u.target && !u.isPlayer ? Math.sin(this.time * 0.35 + u.id * 1.7) * 0.22 : 0);
    u.body.rotation.y += hy;
    // 勝鬨・鼓舞で槍を掲げる
    if (u.cheer > 0) u.cheer -= dt;
    u.body.rotation.z = (u.confused > 0 ? Math.sin(this.time * 7 + u.id) * 0.12 : 0) + hz;
    // 打たれた手応え：のけぞり、大きく崩れたら膝をつく（吹き飛ばしはしない）
    if (u.flinchT > 0) u.flinchT -= dt;
    // 泥地を歩いた分だけ泥はねが付く。本人も敵味方も同じで、一度付けば部品を作り直さない。
    if (!u.mounted && u.moving > 0.15 && !u.armorWear?.mud && (this.world.def.muddy || this.rain > 0.3)) {
      u.mudWalk = (u.mudWalk || 0) + dt * u.moving;
      if (u.mudWalk > 3) markArmor(u, 'mud', null, this.hideBlood);
    }
    // 伏兵（bhelp.js enemyGroup の o.ambush）：動き出す・敵を見つけるまで、しゃがんで旗を倒した姿のまま（合図で立ち上がる）
    if (u._crouch && !u._nest && (u.moving > 0.15 || u.target)) u._crouch = false;
    // 深手でも動く・戦う時は立つ。安全に立ち止まる間だけ、片膝と柄で体を支える。
    const rest = u.hp > 0 && u.hp < u.maxHp * 0.3 && u.moving < 0.1 && !u.atk && !u.swing && !u.hit && !u.fleeing && !u.dragging && !u.dodging && !u._crouch && !(u.target?.alive && this.distTo(u, u.target) < 3.5) && !u.mounted && !u.isPlayer;
    u.woundRest = (u.woundRest || 0) + ((rest ? 1 : 0) - (u.woundRest || 0)) * Math.min(1, dt * (rest ? 3 : 8));
    if (rest && !u.armorWear?.mud) markArmor(u, 'mud', null, this.hideBlood);
    // 馬防柵の内の塹壕：柵のすぐ後ろで立ち止まった鉄砲は、膝をついて柵の間から撃つ（『甲冑と戦国の攻城兵器』の図）
    if (u.type === 'gun' && !u.mounted && !u.isPlayer && ((u._trenchT = (u._trenchT || 0) - dt) <= 0)) { u._trenchT = 0.9 + (u.id % 5) * 0.1; u._trench = inTrench(this, u); }
    const trench = !!u._trench && u.type === 'gun' && u.moving < 0.15 && !u.fleeing && !u.mounted && !u.isPlayer;
    const kneel = ((u.stagger > 0.7 && u.hit?.res !== 'block') || u._crouch || trench) && !u.mounted && !u.isPlayer;
    // 相手の間合いへ入った徒歩は腰を落として受ける。攻撃・移動・当たりの値は変えない。
    const front = u._contactFront?.alive ? u._contactFront : u._lineFront?.alive ? u._lineFront : u.pressBack?.alive ? u.pressBack : braceFront(this, u);
    const contactWeapon = u.wpnKind || u.lookWeapon || TYPES[u.type].weapon;
    const frontTarget = front?.swing?.target || front?.atk?.target || front?.target || front?.poseTarget;
    const frontWeapon = front && (front.wpnKind || front.lookWeapon || TYPES[front.type].weapon);
    // 列が崩れても、実際に斬り結ぶ前の味方へ肩を寄せた時は踏ん張る。
    const closeFront = front && frontTarget?.alive && !frontTarget.isStruct
      && (frontWeapon === 'spear' || frontWeapon === 'sword') && frontTarget.team !== u.team
      && this.distTo(front, frontTarget) < Math.min(5.4, (front.reach || 2) + 1)
      && u.moving < 1.2 && Math.abs(front.pos.y - u.pos.y) < 0.6;
    // 共通の後列も前の味方の攻防へつなぐ。既にある前列の参照だけを使い、兵を探し直さない。
    const rearPress = front && front.team === u.team && !front.fleeing && !front.dying && !front.mounted
      && (closeFront || ((front.target?.alive || front.contactBrace > 0.2) && u.moving < 0.8))
      && (contactWeapon === 'spear' || contactWeapon === 'sword')
      ? clamp01(((closeFront ? 2.2 : 2.0) - this.distTo(u, front)) / 1.1) * (closeFront ? 0.95 : 0.8) : 0;
    // 近接の溜め・振り・戻しでも踏ん張りを保つ。攻撃のたびに腰と両膝が伸び切るのを防ぐ。
    // 前列が応戦している間も、見張っている近い敵へ槍を構える。
    // 既存の見張り先だけを使う描画用の間合い。狙い・移動・攻撃の判断は変えない。
    u.poseTarget = null;
    if ((contactWeapon === 'spear' || contactWeapon === 'sword') && !u.isPlayer && !u.mounted
      && !u.fleeing && !u.dropped && !u.downed && !u.dragging && !kneel
      && !u.target && u.watch?.alive && !u.watch.isStruct && u.watch.team !== u.team) {
      const dx = u.watch.pos.x - u.pos.x, dz = u.watch.pos.z - u.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < (contactWeapon === 'spear' ? 6.2 : 3.2) && Math.abs(u.watch.pos.y - u.pos.y) < 2
        && dx * Math.sin(u.heading) + dz * Math.cos(u.heading) > d * 0.65) u.poseTarget = u.watch;
    }
    // 二列目は前列の敵へ備える。攻撃先にはせず、既存の前列の参照だけを借りる。
    const supportFoe = closeFront && rearPress > 0.1 ? frontTarget : null;
    if (supportFoe && contactWeapon === 'spear' && !u.target && !u.isPlayer && !u.mounted
      && !u.fleeing && !u.dropped && !u.dragging && !u.downed && !kneel && u.camD < 32) {
      const dx = supportFoe.pos.x - u.pos.x, dz = supportFoe.pos.z - u.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 6.2 && dx * Math.sin(u.heading) + dz * Math.cos(u.heading) > d * 0.85) u.poseTarget = supportFoe;
    }
    // 頭越しの構えの高さは槍の処理で前列との段差から一度だけ決める。
    // 前列のすぐ後ろでは、その相手へ構える。独自の見回しで槍列をばらばらにしない。
    // 既存の接触相手だけを読む。標的・位置・攻撃の判断には使わない。
    if (!u.poseTarget && !u.target && !u.atk && !u.swing && rearPress > 0.1
      && !u.isPlayer && !u.mounted && !u.fleeing && !u.dropped && !u.downed
      && !u.dragging && !kneel
      // 接敵した前列への槍は、上で確かめた向きと近景の条件を守る。
      && (contactWeapon !== 'spear' || (!closeFront && u.camD < 32))
      && frontTarget?.alive && !frontTarget.isStruct && frontTarget.team !== u.team) {
      const dx = frontTarget.pos.x - u.pos.x, dz = frontTarget.pos.z - u.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 6.2 && dx * Math.sin(u.heading) + dz * Math.cos(u.heading) > d * 0.65) u.poseTarget = frontTarget;
    }
    const meleeAction = (contactWeapon === 'spear' || contactWeapon === 'sword')
      && ((u.atk && !u.atk.ranged && !u.atk.bow) ? u.atk : u.swing);
    // 位置を持たない相手は人体の構えに使わない。
    const contactCandidate = meleeAction?.target || u.target || u.poseTarget;
    const contactTarget = contactCandidate?.pos ? contactCandidate : null;
    const contact = !u.mounted && !u.isPlayer && !u.fleeing && !u.downed && !kneel && !u.hit
      && (!(u.atk || u.swing) || meleeAction)
      ? Math.max(rearPress,
        contactTarget?.alive && !contactTarget.isStruct && contactTarget.team !== u.team && u.moving < 1.8
          ? (1 - clamp01((u.moving - 0.6) / 1.2) * 0.65) * clamp01(((contactWeapon === 'spear' ? 5.4 : 3.2) - this.distTo(u, contactTarget)) / 2.2) * (meleeAction ? 0.75 : 1) : 0) : 0;
    u.contactBrace = (u.contactBrace || 0) + (contact - (u.contactBrace || 0)) * Math.min(1, dt * 7);
    const braceSide = u.id % 2 ? 1 : -1;
    const braceWeight = 0.65 + ((u.id * 0.618) % 1) * 0.7;
    const braceSway = reduceMotion() ? 0 : Math.sin(this.time * (1.6 + (u.id % 5) * 0.17) + u.id * 2.399) * 0.04;
    // 相手の一撃に合わせて後ろ足へ重さを預け、振り終わると前へ戻す。
    // 待つ兵の同じ周期の揺れを避ける。敵の探索や当たりの変更はせず、今の相手の時計だけを読む。
    const foe = contactTarget, wind = foe?.atk, strike = foe?.swing;
    const weapon = u.wpnKind || u.lookWeapon || TYPES[u.type].weapon;
    let load = 0;
    if (contact > 0 && !reduceMotion() && !u.atk && !u.swing && !u.hit && !u.dodging
      && (weapon === 'spear' || weapon === 'sword') && foe?.alive
      && Math.abs(angleDiff(u.heading, this.faceTo(u, foe))) < 1.1) {
      // 後列も、前の味方へ来た一撃を見て身構える。独立した周期の演技にしない。
      const receiving = rearPress > 0.1 && frontTarget === foe ? front : u;
      if ((wind?.target === u || wind?.target === receiving) && !wind.ranged && !wind.bow) {
        const p = clamp01(1 - wind.t / Math.max(0.05, wind.dur || foe.windup));
        load = 0.65 * p * p * (3 - 2 * p);
      } else if (strike?.target === u || strike?.target === receiving) {
        // 命中する拍子まで受けを強め、振り終わりから手と腰を戻す。
        // 見た目の受けだけ。防御の成否・攻撃の時計・当たりは変えない。
        const at = strike.dur * (strike.at ?? 0.5);
        const into = clamp01(strike.t / Math.max(0.05, at));
        const out = clamp01((strike.t - at) / Math.max(0.12, strike.dur - at + 0.18));
        load = (0.65 + 0.35 * into) * (1 - out * out * (3 - 2 * out));
        // 実際に柄や鎧で止めた拍子を、受け手の後ろ膝にも返す。
        // 攻め手の contactStop と同じ打点を使い、無関係な周期で揺らさない。
        const after = contactAfter(strike);
        if (after >= 0 && after < 0.24)
          load = Math.max(load, Math.sin(after / 0.24 * Math.PI));
      }
      if (load > 0) {
        const incoming = wind?.target === u || wind?.target === receiving ? wind : strike;
        u.contactHigh = incoming.kind === 'slam' || incoming.kind === 'kesa' || incoming.kind === 'gyaku' ? 1 : 0;
        u.contactSide = incoming.side || incoming.dir || braceSide;
      }
    }
    if (contact > 0 && rearPress > 0 && !reduceMotion()) {
      // 前の胸が押し返された分を一拍遅れて受ける。全員を同じ周期で揺らさない。
      const hit = front.hit, swing = front.swing;
      const recoil = hit ? Math.sin(clamp01(hit.t / Math.max(0.05, hit.dur)) * Math.PI) * (hit.amp ?? 1) : 0;
      // 前列の突き戻しも後列へ渡し、受けから押し返しまで腰・膝・槍をつなぐ。
      const recover = swing && !swing.ranged && !swing.bow
        ? Math.sin(clamp01(swing.t / Math.max(0.05, swing.dur)) * Math.PI) * 0.45 : 0;
      load = Math.max(load, Math.min(1, Math.max(front.contactLoad || 0, front.contactStop || 0, recoil, recover)) * rearPress);
    }
    if (contactDt !== dt) {
      contactDt = dt;
      contactFast = 1 - Math.exp(-dt * 22);
      contactSlow = 1 - Math.exp(-dt * 7);
      contactParry = 1 - Math.exp(-dt * 18);
    }
    u.contactLoad = (u.contactLoad || 0) + (load - (u.contactLoad || 0)) * (load > (u.contactLoad || 0) ? contactFast : contactSlow);
    // 自分の突きの出入りを腰と膝へ渡す。判定・移動は触らず、柄だけが往復する姿を避ける。
    const ownStrike = meleeAction && u.swing;
    const strikePhase = ownStrike ? clamp01(ownStrike.t / Math.max(0.05, ownStrike.dur)) : 0;
    const drive = contact > 0 && !reduceMotion() && ownStrike
      ? (ownStrike.kind === 'thrust' || ownStrike.kind === 'charge'
        ? thrustOut(strikePhase, ownStrike.dur)
        // 薙刀の払い・刀の斬り下ろしも、実際の打点へ前膝を沈めて戻す。
        : Math.sin(Math.PI * 0.5 * clamp01(strikePhase / Math.max(0.1, ownStrike.at ?? 0.5)))
          * (1 - clamp01((strikePhase - (ownStrike.at ?? 0.5)) / Math.max(0.1, 1 - (ownStrike.at ?? 0.5))))) : 0;
    u.contactDrive = (u.contactDrive || 0) + (drive - (u.contactDrive || 0)) * contactFast;
    // 実際に柄や鎧へ止められた拍子だけ肩と後ろ膝へ返す。空振りでは揺らさない。
    // 攻撃の結果と時計を読むだけで、判定や移動は変えない。
    let stopped = 0;
    if (contact > 0 && ownStrike && !reduceMotion() && !u.hit && !u.dodging
      && (ownStrike.res === 'block' || ownStrike.res === 'armor')) {
      const after = contactAfter(ownStrike);
      if (after > 0 && after < 0.3) stopped = Math.sin(after / 0.3 * Math.PI) * (ownStrike.res === 'block' ? 1 : 0.6);
    }
    u.contactStop = (u.contactStop || 0) + (stopped - (u.contactStop || 0)) * Math.min(1, dt * 18);
    // 一律に穂先を揺らすだけでなく、目前の敵の打ち筋へ柄を差し入れる。
    // 見た目だけの受け替え。防御の成否・当たり・兵の位置には使わない。
    const incoming = wind?.target === u && !wind.ranged && !wind.bow ? wind : strike?.target === u ? strike : null;
    const parry = incoming && foe.alive && !foe.dying && u.camD < 36 && !u.isPlayer && !u.mounted
      && !u.atk && !u.swing && !u.hit && !u.dodging && !u.downed && !(u.stagger > 0)
      && !(u.cheer > 0) && !u._spearCrowded && !reduceMotion()
      && Math.abs(angleDiff(u.heading, foe.heading + Math.PI)) < 1.1 ? load * contact : 0;
    const high = incoming && (incoming.kind === 'slam' || incoming.kind === 'kesa' || incoming.kind === 'gyaku');
    const parrySide = incoming ? -(incoming.dir || incoming.side || (foe.id % 2 ? 1 : -1)) : 1;
    const parryK = parry > (u.contactParry || 0) ? contactParry : contactSlow;
    u.contactParry = (u.contactParry || 0) + (parry - (u.contactParry || 0)) * parryK;
    u.contactParryHigh = (u.contactParryHigh || 0) + ((high ? parry : 0) - (u.contactParryHigh || 0)) * parryK;
    u.contactParrySide = (u.contactParrySide || 0) + (parrySide * parry - (u.contactParrySide || 0)) * parryK;
    const braceRecover = reduceMotion() || u.atk || u.swing || u.hit ? 0 : u.contactLoad;
    // 突く前列の踏み込みを後列の腰へ渡す。位置・間合い・攻撃の時計には触れない。
    const pushSwing = u.swing || (rearPress > 0 ? front.swing : null);
    const pushWant = contact > 0 && !reduceMotion() && pushSwing
      && (pushSwing.kind === 'thrust' || pushSwing.kind === 'charge')
      ? thrustOut(pushSwing.t / Math.max(0.05, pushSwing.dur), pushSwing.dur) : 0;
    u.contactPush = (u.contactPush || 0) + (pushWant - (u.contactPush || 0)) * Math.min(1, dt * (u.swing ? 14 : 6));
    const bracePush = !u.hit && !kneel && !u.dodging && !reduceMotion() ? u.contactPush * u.contactBrace : 0;
    // 相手の振りに手元も応じる。防御の判定は作らず、攻撃前の備えだけを見せる。
    // 遠い兵・背後の敵・自分の攻撃中は省き、既存の相手だけを見る。
    const coverAngle = near && !u.offscreen && contact > 0 && braceRecover > 0.01 && foe?.alive && !foe.isStruct && foe.pos
      ? angleDiff(u.heading, Math.atan2(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z)) : Math.PI;
    u.contactCover = near && !u.offscreen && contact > 0 && !u.dropped && !u.dragging && !u.climb
      && !u.perch && !(u.stagger > 0) && !(u.cheer > 0) && Math.abs(coverAngle) < 1.1
      ? braceRecover * u.contactBrace * (1 - Math.abs(coverAngle) / 1.4) : 0;
    if (!u.hit && !kneel) {
      u.body.rotation.x += u.contactBrace * (0.14 * braceWeight + braceSway);
      u.body.rotation.y += u.contactBrace * braceSide * 0.12;
      u.body.rotation.z += u.contactBrace * (braceSide * 0.05 + braceSway);
      u.body.rotation.x -= u.contactBrace * braceRecover * 0.2 + (u.contactStop || 0) * 0.16;
      u.body.rotation.y += u.contactBrace * braceRecover * braceSide * 0.13;
      // 後列へ伝わる押しと本人の突きを残し、同じ踏み込みの前傾は重ねない。
      u.body.rotation.x += Math.max(bracePush * 0.16, u.contactBrace * u.contactDrive * 0.18);
      u.body.rotation.y -= u.contactBrace * u.contactDrive * braceSide * 0.08;
      // 待つ胸は接敵相手へ先に向ける。脚の向き・移動・攻撃判定は変えない。
      if (contactTarget?.alive && !contactTarget.isStruct && contactTarget.team !== u.team
        && !u.atk && !u.swing && !u.isPlayer && !u.fleeing && u.contactBrace > 0.01) {
        const face = Math.atan2(contactTarget.pos.x - u.pos.x, contactTarget.pos.z - u.pos.z);
        // 呼吸や受け流しの捻りを足し続けず、実際の相手へ胸を戻す。
        // 見た目の胸だけを合わせ、攻撃方向・足の位置・移動速度は変えない。
        const aim = Math.max(-0.65, Math.min(0.65, angleDiff(u.heading, face)));
        // 相手へ向き直す補正で、受けた肩のひねりまで消さない。
        u.body.rotation.y += aim * u.contactBrace;
      }
    }
    // 近い押し合いの踏み込み。全軍で毎秒四回まで、既存の粒を使う。
    const W = this.world;
    if (W.def.contactDust && !reduceMotion() && u.contactBrace > 0.3 && u.camD < 28
      && u.moving > 0.1 && !(this._contactDustAt > this.time)
      && Math.abs(u.pos.y - W.heightAt(u.pos.x, u.pos.z)) < 0.18) {
      // 板床・回廊の上から下の庭へ砂埃を落とさない。
      this._contactDustAt = this.time + 0.25;
      const wet = W.def.muddy > 0.35 || W.rainLevel > 0.2 || W.wetness > 0.5;
      if (W.waterFootDepthAt(u.pos.x, u.pos.z, u.pos.y) > 0.02) {
        W.spray(u.pos.x, u.pos.z, 5);
      } else if (wet) {
        W.kick(u.pos.x, u.pos.z, Math.sin(u.heading), Math.cos(u.heading), 3, 4);
        // 飛沫の薄い霞は描画だけに使い、見通しと命中には影響させない。
        const mist = W.dustCloud(u.pos.x, u.pos.z, false, true, true);
        if (mist) { mist.s0 = 0.45; mist.s1 = 1.5; mist.life = 1.5; mist.a = 0.1; mist.fin = 3; }
      } else {
        W.dustCloud(u.pos.x, u.pos.z, false, true, true);
      }
    }
    if (u.flinchT > 0) u.body.rotation.x = -Math.sin(u.flinchT / 0.32 * Math.PI) * 0.28;
    else if (kneel) u.body.rotation.x = trench && !u._crouch && !(u.stagger > 0.7) ? 0.04 : 0.32;
    if (u.flag) u.flag.rotation.x = u._crouch ? 1.15 : 0;
    u.anim += dt * (3 + u.moving * 6);
    // 横隊も行軍も隊の同じ拍子へ寄せる。地形や押し合いで歩調が乱れる。
    const mg = u.group;
    if (mg && !mg.routed && (mg.marching || mg.formation === 'line' || mg.formation === 'yari' || mg.formation === 'column') && mg.anchorSpeed > 0.3 && u.moving > 0.2 && !u.target && !u.atk && !u.swing && !u.fleeing && !u.confused && !(u.stagger > 0) && !u.mounted && !u.isPlayer) {
      const want = (mg._ph || 0) + (this.world.def.variedMarch ? (u.id * 2.39996) % (Math.PI * 2) : 0);
      let df = (want - u.anim) % (Math.PI * 2);
      if (df > Math.PI) df -= Math.PI * 2; else if (df < -Math.PI) df += Math.PI * 2;
      const disorder = Math.min(0.85, (mg._terrainLoose || 0) * 0.6 + (mg._wob || 0) * 0.25);
      u.anim += df * Math.min(1, dt * 6 * (1 - disorder));
    }
    if (u._lineFront && !u.atk && !u.swing && !kneel && !u.fleeing) u.body.rotation.x += 0.1 + Math.min(0.12, (u._lineRecoil || 0) * 0.15);
    if (u.mounted) {
      // 馬上：脚は鞍をはさみ、馬は速さに合わせて駆ける
      seatLegs(u);
      const Hh = u.horse && u.horse.userData.horse;
      // 打たれて大きく崩れたら、馬も驚いて跳ねる（竿立ちの最中でなければ）
      if (Hh && u.stagger > 0.5 && !(Hh.rear > 0) && (Hh.spookT || 0) <= 0) { Hh.spook = 1; Hh.spookT = 4; }
      if (Hh) Hh.spookT = (Hh.spookT || 0) - dt;
      if (u.horse && u.horse.visible !== false) animateHorse(u.horse, dt, Math.hypot(u.vel.x, u.vel.z));
      if (u.seat && Hh) { u.seat.matrix.copy(Hh.seat); if (!u.isPlayer) u.seat.matrix.multiply(RIDE.fit); u.seat.matrixWorldNeedsUpdate = true; }
      // 止まって交戦する乗り手は鞍へ腰を沈め、手綱側へ体重を戻す。
      if (!u.isPlayer && !u.hit && !u.atk && !u.swing && u.target?.alive && u.moving < 0.8) {
        const k = clamp01((5 - this.distTo(u, u.target)) / 3);
        u.body.rotation.x += k * 0.07;
        u.body.rotation.z += k * (u.id % 2 ? 0.035 : -0.035);
      }
    } else {
      // 指定した戦だけ歩幅を抑える。移動速度を脚の角度へ無制限に掛け、腿を頭まで上げない。
      const stride = Math.min(u.moving, this.world.def.strideLimit ?? Infinity);
      const sw = Math.sin(u.anim) * 0.65 * stride;
      u.legL.rotation.x = sw;
      u.legR.rotation.x = -sw;
      // 前へ振り出す脚は膝を折る。走るほど深く
      // 歩幅を抑えた戦では膝も同じ幅へそろえ、腿だけ小さくして足を蹴り上げない。
      const mv = Math.min(1.4, stride);
      const kneeK = (0.35 + mv * 0.5) * Math.min(1, mv * 2);
      if (u.shinL) { u.shinL.rotation.x = Math.max(0, -Math.cos(u.anim)) * kneeK; u.shinR.rotation.x = Math.max(0, Math.cos(u.anim)) * kneeK; }
      // 崩れて膝をつく
      if (kneel && u.shinL) { u.legL.rotation.x = -0.9; u.shinL.rotation.x = 1.5; u.legR.rotation.x = 0.2; u.shinR.rotation.x = 1.2; }
      // 前へよろける・のけぞる時は、片足を一歩出して踏みとどまる
      else if (H && (H.kind === 'stumble' || H.kind === 'recoil') && u.moving < 0.3) { const e = Math.sin(Math.min(1, H.t / H.dur) * Math.PI); u.legL.rotation.x = (H.kind === 'stumble' ? -0.45 : 0.3) * e; }
      if (!kneel && u.woundRest > 0.01 && u.shinL) {
        const k = u.woundRest;
        u.legL.rotation.x -= 0.85 * k; u.shinL.rotation.x += 1.35 * k;
        u.legR.rotation.x += 0.12 * k; u.shinR.rotation.x += 1.45 * k;
      }
      if (u.contactBrace > 0.01 && !kneel && !u.hit && u.shinL) {
        const k = u.contactBrace * braceWeight;
        u.legL.rotation.x -= 0.36 * k; u.shinL.rotation.x += 0.58 * k;
        u.legR.rotation.x += 0.2 * k; u.shinR.rotation.x += 0.3 * k;
        u.legL.rotation.x += 0.18 * k * braceRecover;
        u.legR.rotation.x -= 0.2 * k * braceRecover;
        u.shinR.rotation.x += 0.18 * k * braceRecover;
        u.legL.rotation.x -= bracePush * 0.16; u.shinL.rotation.x += bracePush * 0.2;
        u.legR.rotation.x += bracePush * 0.12;
      }
    }
    // 馬上の弾みは鞍の入れ物（u.seat）が馬の背から受けるので、ここでは乗り手の小さな腰の動きだけ
    const bob = u.mounted ? u.moving : Math.min(u.moving, this.world.def.strideLimit ?? Infinity);
    u.body.position.y = (u.mounted ? RIDE.y : 0) + Math.abs(Math.sin(u.anim)) * (u.mounted ? 0.02 : 0.05) * bob;
    if (u.dodging) u.body.position.y -= 0.28;
    u.body.position.y -= (u.contactBrace || 0) * (0.13 + braceRecover * 0.055);
    u.body.position.y -= bracePush * 0.035;
    if (kneel) u.body.position.y -= 0.25;
    else if (u.woundRest > 0.01) { u.body.position.y -= 0.3 * u.woundRest; u.body.rotation.x += 0.22 * u.woundRest; }
    // 近い乱戦は手先だけで打たず、後ろ膝へ溜めて前膝で受け止める。
    // 本人の技の時計で動かし、隣同士の突き・斬り・戻しが別々に重なるようにする。
    // 兵の座標・武器の出入り・攻撃の時計には触れず、既存の脚と胴だけを使う。
    if (!u.isPlayer && !u.mounted && u.camD < 36 && !kneel && !H && !u.downed
      && !u.dodging && !u.fleeing && !(u.stagger > 0) && !reduceMotion()
      && (contactWeapon === 'spear' || contactWeapon === 'sword')) {
      const a = u.atk && !u.atk.ranged && !u.atk.bow ? u.atk : null, s = u.swing;
      let coil = 0, drive = 0, turn = 0;
      const action = a || s;
      if (action && (action.kind === 'thrust' || action.kind === 'charge' || action.kind === 'tsuki'
        || action.kind === 'kesa' || action.kind === 'gyaku' || action.kind === 'yoko'
        || action.kind === 'slam' || action.kind === 'sweep')) {
        const side = action.kind === 'gyaku' ? -1 : action.dir || 1;
        if (a) {
          const p = clamp01(1 - a.t / Math.max(0.05, a.dur || u.windup));
          coil = p * p * (3 - 2 * p);
        } else {
          const p = s.t / Math.max(0.05, s.dur);
          const r = clamp01((s.t - s.dur) / 0.3), back = 1 - r * r * (3 - 2 * r);
          coil = 1 - clamp01(p / 0.45);
          drive = thrustOut(p, s.dur) * back;
          // 受けられた一撃は腰まで振り抜かず、後ろ足へ戻す。
          drive *= s.res === 'block' ? 0.45 : s.res === 'armor' ? 0.7 : 1;
        }
        turn = side * (coil * 0.12 - drive * (contactWeapon === 'sword' ? 0.22 : 0.1));
      }
      const weight = 1 - clamp01((u.moving - 0.3) / 1.2);
      const k = Math.min(1, dt * 16);
      u.meleeCoil = (u.meleeCoil || 0) + (coil * weight - (u.meleeCoil || 0)) * k;
      u.meleeDrive = (u.meleeDrive || 0) + (drive * weight - (u.meleeDrive || 0)) * k;
      u.meleeTurn = (u.meleeTurn || 0) + (turn * weight - (u.meleeTurn || 0)) * k;
      const c = u.meleeCoil, d = u.meleeDrive;
      // 身長や利き足の違いを腰と膝に渡す。攻防の拍子は相手と本人の技に従う。
      const stance = 0.78 + ((u.id * 0.381966) % 1) * 0.44;
      u.body.rotation.x += (-0.1 * c + 0.18 * d) * stance;
      u.body.rotation.y += u.meleeTurn;
      u.body.position.y -= (0.04 * c + 0.055 * d) * stance;
      if (u.shinL && u.shinR) {
        u.legL.rotation.x -= 0.08 * c + 0.2 * d;
        u.shinL.rotation.x += (0.12 * c + 0.34 * d) * stance;
        u.legR.rotation.x -= 0.16 * c - 0.06 * d;
        u.shinR.rotation.x += (0.3 * c + 0.1 * d) * stance;
      }
    } else { u.meleeCoil = 0; u.meleeDrive = 0; u.meleeTurn = 0; }
    // 馬に押し倒された兵：横に倒れ、脚をたたんでからゆっくり立つ。
    if (H && H.kind === 'trample' && !u.mounted && !u.isPlayer) {
      const k = Math.min(1, H.t / H.dur);
      const down = Math.min(1, k / 0.14) * Math.min(1, (1 - k) / 0.4);
      u.body.rotation.x = -0.25 * down; u.body.rotation.z = H.side * 1.25 * down;
      u.body.position.y = -0.65 * down;
      u.legL.rotation.x = -0.65 * down; u.legR.rotation.x = -0.35 * down;
      if (u.shinL) { u.shinL.rotation.x = 1.2 * down; u.shinR.rotation.x = 0.9 * down; }
    }
    // 軽い形でも、手負いと疲れが息に出る。骨のある人の肩は vitals で動かす。
    const hurt = u.maxHp > 0 ? clamp01((1 - u.hp / u.maxHp) / 0.75) : 0;
    const breathWant = Math.max(hurt, u.fat || 0);
    u.breathHeavy = (u.breathHeavy || 0) + (breathWant - (u.breathHeavy || 0)) * Math.min(1, dt * 1.5);
    u.breathPhase = (u.breathPhase ?? u.id) + dt * (1.8 + u.breathHeavy * 4.5);
    if (!reduceMotion() && (u.moving < 0.1 || u.breathHeavy > 0.15)) {
      u.body.position.y += Math.sin(u.breathPhase) * (0.012 + u.breathHeavy * 0.022) * (1 - Math.min(0.8, u.moving * 0.4));
    }
    // 待つ間の小さな動き（重心・踏みかえ・見回し・話す・持ち替え・手入れ・膝つき・身構え）
    const idl = (IDLE.on || u.jinchu || u.idl?.sit > 0.01) && !u.isPlayer && !u.mounted && !kneel ? this.idleFx(u, dt) : null;
    // 矢の雨の下：陣笠を前へ傾けてうつむき、身を低くする
    const dk = u.duckT > this.time ? 1 : 0;
    u.duck = (u.duck || 0) + (dk - (u.duck || 0)) * Math.min(1, dt * 6);
    if (u.duck > 0.01 && !u.isPlayer) { u.body.rotation.x += 0.3 * u.duck; if (u.head && idl) u.head.rotation.x += 0.25 * u.duck; }
    // 前のコマで下げた手の高さを戻す（膝つき・身構えの分）
    if (u.idl && u.idl.hOff) { u.hand.position.y += u.idl.hOff; u.idl.hOff = 0; }
    // 武器の構え（敵が近くて身構えている時も、穂先・筒先を前へ）
    const wType = u.wpnKind || u.lookWeapon || TYPES[u.type].weapon;
    const engaged = !!(u.target || u.atk || u.isPlayer || u.poseTarget) || !!(idl && idl.low > 0.5);
    u.lh = null;
    if (wType === 'spear') this.poseSpear(u, dt, engaged);
    else if (wType === 'gun') this.poseGun(u, dt, engaged);
    else if (wType === 'sword') this.poseSword(u, dt, engaged);
    else if (wType === 'bow') this.poseBow(u, dt);
    if (idl && idl.drop > 0.005) { u.hand.position.y -= idl.drop; idl.hOff = idl.drop; }
    if (wType === 'spear' && u.woundRest > 0.01 && u.wpn) {
      // 石突きの長さに合わせて拳を置く。地面へ柄を突き通さず、体の右前で杖にする。
      const k = u.woundRest, butt = Math.abs(u.wpn.userData.butt || -1.25);
      u.hand.rotation.x += (-1.42 - u.hand.rotation.x) * k;
      u.hand.rotation.y *= 1 - k;
      u.hand.position.set(0.3, 1.08 - 0.33 * k, 0.18 + 0.25 * k);
      const slide = butt + (0.03 - u.hand.position.y) / Math.max(0.3, Math.sin(-u.hand.rotation.x));
      u.wpn.position.z += (slide - u.wpn.position.z) * k;
    }
    if (near && !u.offscreen) {
      poseArms(u, u.anim);
      if (u.ramGrip && u.armR && u.armL) {
        u.body.updateWorldMatrix(true, false);
        ramArmPoint.copy(u.ramGrip.right); u.body.worldToLocal(ramArmPoint);
        aimArm(u.armR, ramArmPoint.x, ramArmPoint.y, ramArmPoint.z);
        ramArmPoint.copy(u.ramGrip.left); u.body.worldToLocal(ramArmPoint);
        aimArm(u.armL, ramArmPoint.x, ramArmPoint.y, ramArmPoint.z);
      }
    }
    if (u.guardFlash > 0) u.guardFlash -= dt;
    if (u.strikeT > 0) u.strikeT -= dt;
    if (u.slamT > 0) u.slamT -= dt;
    if (u.sweepT > 0) u.sweepT -= dt;
    // 隣の討死へ短く目を向け、終われば普段の見回しへ戻す（軽い兵の首）
    if (u.head && !u.isPlayer && !u.atk && !u.swing) {
      const looking = u.fallenLookLeft > 0 && !u.fleeing && !(u.target && u.target.alive && this.distTo(u, u.target) < 2.5);
      let yaw = looking ? Math.atan2(u.fallenLookX - u.pos.x, u.fallenLookZ - u.pos.z) - u.heading - u.body.rotation.y : 0;
      while (yaw > Math.PI) yaw -= Math.PI * 2; while (yaw < -Math.PI) yaw += Math.PI * 2;
      yaw = Math.max(-0.9, Math.min(0.9, yaw));
      u.fallenLookYaw = (u.fallenLookYaw || 0) + (yaw - (u.fallenLookYaw || 0)) * Math.min(1, dt * 8);
      u.head.rotation.y = (idl ? u.head.rotation.y : 0) + u.fallenLookYaw;
      if (looking) u.head.rotation.x = (idl ? u.head.rotation.x : 0) + 0.12;
    }
    if (u.dragging && u.dragging.death?.mercyT == null) {
      u.body.rotation.set(u.dragging.death?.carry > 0 ? 0.18 : 0.42, 0, 0); u.body.position.y -= 0.08;
      const carrying = u.dragging.death?.carry > 0;
      if (u.hand) u.hand.position.set(0.22, carrying ? 1.25 : 0.65, 0.4);
      if (u.armR) { aimArm(u.armR, 0.22, carrying ? 1.25 : 0.65, 0.4); aimArm(u.armL, -0.22, carrying ? 1.25 : 0.65, 0.4); }
      if (u.wpn) u.wpn.visible = false;
    }
    // 指物は風下へなびく
    if (u.flag) u.flag.rotation.y = (this.wind || 0) - u.heading - Math.PI / 2 + Math.sin(this.time * 2.2 + u.id) * 0.25;
  },

  // 梯子を登る形（siege_ladder.js の u.climb）：体を梯子へ傾け、手足を交互に掛け替える
  poseClimb(u, dt) {
    const frac = u.climb ? u.climb.frac : 0;
    const ph = frac * 16 + u.id * 0.618;
    const sw = Math.sin(ph * Math.PI);
    if (u.climb.falling) {
      u.mesh.rotation.x = reduceMotion() ? -0.34 : -0.34 - Math.min(1, u.climb.t / u.climb.fallDur) * 1.1;
      u.body.rotation.set(0, 0, 0);
      if (u.armL) aimArm(u.armL, -0.8, 0.7, 0.3);
      if (u.armR) aimArm(u.armR, 0.8, 0.7, 0.3);
      return;
    }
    u.mesh.rotation.x = -0.34;
    u.body.rotation.set(0.08, 0, 0);
    if (u.legL) { u.legL.rotation.x = -0.75 + 0.5 * sw; u.legR.rotation.x = -0.75 - 0.5 * sw; }
    if (u.shinL) { u.shinL.rotation.x = 1.05 - 0.4 * sw; u.shinR.rotation.x = 1.05 + 0.4 * sw; }
    if (u.armL) aimArm(u.armL, -0.24, 1.35 - 0.25 * sw, 0.3);
    if (u.armR) aimArm(u.armR, 0.24, 1.35 + 0.25 * sw, 0.3);
    if (u.head) u.head.rotation.set(-0.25, 0, 0);
  },

  // 槍：構え・突き（まっすぐ出して引く）・叩き（長柄を振り上げて打ち下ろす）・払い。
  // 相手が近すぎれば柄を手元へ繰り込み、それでも余れば穂先を上げる（穂先が相手の体を突き抜けない）
  poseSpear(u, dt, engaged) {
    const h = u.hand, w = u.wpn, g = u.group;
    const close = !u.mounted && (u.isPlayer || u.focusD <= 15);
    let rx = engaged ? -0.06 : -0.55, ry = 0, ext = 0, slide = 0, lift = 0;
    // 呼吸で構えを揺らしても、斜面の相手へ狙いを合わせる条件を失わない。
    // 近い敵を見張る後列も、敵の胸へ穂先を向ける。探索と攻撃の判断は変えない。
    const watching = !!(this.world.def.livingSpearHedge && u.poseTarget?.alive && !u.isPlayer && !u.fleeing);
    let middleGuard = engaged || watching;
    if (watching) rx = -.06;
    // 待つ間の長柄は人ごとに ±4° ほど傾きが違う（槍の林が揃いすぎない）。槍衾に構えると一斉に揃う
    if (!engaged && !watching && !u.isPlayer) { rx += ((u.id * 0.3719) % 1 - 0.5) * 0.14; ry += ((u.id * 0.5813) % 1 - 0.5) * 0.08; }
    const hedge = g && g.formation === 'yari' && !g.marching && !g.routed && !u.isPlayer && !u.mounted && !u.fleeing && (g.order === 'yari' || g.order === 'hold');
    // 槍衾は各段で穂先の高さと向きをそろえる。見回しの胴の回りを槍へ伝えない。
    if (hedge && !engaged && !(u.contactBrace > 0.1) && !u.atk && !u.swing && !(u.stagger > 0)) u.body.rotation.y = 0;
    if (hedge && !engaged) { const row = Math.floor(u.slot / Math.max(1, g._stepCols || 1)); rx = row === 0 ? 0.07 - (g.yariKneel && u.idl ? 0.12 * u.idl.sit : 0) : row === 1 ? -0.1 : -0.45; ry = Math.max(-0.5, Math.min(0.5, angleDiff(u.heading + u.body.rotation.y, g._face ?? g.facing))); }   // 膝をついた前の段は、穂先を少し上げて胸の高さに
    // 前の者の背について押す後ろの段は、槍を立て気味にして（前の者に当てないよう）穂先を林のように揃える
    else if ((u._lineFront?.alive || u.pressBack?.alive) && !engaged && !u.isPlayer) { rx = -1.05 + ((u.id * 0.3719) % 1 - 0.5) * 0.1; ry = 0; }
    // 座って待つ槍は石突を下に、穂先を真上へ。合図で通常の構えへ戻す。
    if (u.jinchu && !u.jinchu.standing) { rx = -Math.PI / 2; ry = 0; middleGuard = false; }
    // 接敵して待つ間は穂先を小さく受け替える。突き・払いの軌道は元のまま。
    if (u.contactBrace > 0.01 && !u.atk && !u.swing && !u.isPlayer) {
      const k = u.contactBrace;
      rx += (((u.id * 0.3719) % 1 - 0.5) * 0.18 + (reduceMotion() ? 0 : Math.sin(this.time * 2.1 + u.id) * 0.045)) * k;
      ry += ((u.id * 0.5813) % 1 - 0.5) * 0.16 * k;
      if (!reduceMotion()) {
        const recover = u.contactLoad || 0;
        // 上からの打ちには柄を上げ、突きには左右へ穂先を外して受ける。
        // 後ろ足へ重さを戻す拍子と、両手の引きを揃える。
        rx -= recover * k * (u.contactHigh ? 0.62 : 0.18);
        ext -= recover * k * 0.2;
        ry += recover * k * (u.contactSide || 1) * (u.contactHigh ? 0.16 : 0.34);
      }
    }
    const tip = (w && w.userData.tip) || 2;
    // 相手までの前への遠さ（dT）
    const sw = u.swing;
    const tg = (sw && sw.target) || (u.atk && u.atk.target) || u.target || u.poseTarget || u.fitT;
    let dT = 99, sideT = 0;
    if (tg && tg.alive !== false) {
      if (tg.isStruct) dT = this.distTo(u, tg) + 0.2;
      else if (tg.pos) {
        const dx = tg.pos.x - u.pos.x, dz = tg.pos.z - u.pos.z;
        // 胸の向きで前後と左右を測る。突きの伸びは前への距離、横の狙いは手元から求める。
        const face = u.heading + u.body.rotation.y;
        const along = dx * Math.sin(face) + dz * Math.cos(face), lat = dx * Math.cos(face) - dz * Math.sin(face);
        if (along > 0.3 && Math.abs(lat) < 1.3 + along * 0.35) { dT = along; sideT = lat; }
      }
    }
    const reach0 = 0.18 + tip;
    // 列の高さは保ち、各兵の呼吸と押し返しだけをずらす。攻撃の間と当たりは変えない。
    if (this.world.def.livingSpearHedge && hedge && !u.atk && !sw && !(u.stagger > 0) && !reduceMotion()) {
      const ph = this.time * (1.6 + (u.id % 7) * 0.09) + u.id * 2.39996;
      const pressure = u._lineFront?.alive || u.pressBack?.alive || engaged;
      rx += Math.sin(ph) * (pressure ? 0.018 : 0.01);
      ry += Math.sin(ph * 0.73) * 0.012;
      ext -= pressure ? 0.025 * (1 + Math.sin(ph * 1.17)) : 0;
    }
    // 中段の構え：穂先は相手の喉を向く（相手が馬上なら胸、自分が馬上なら徒歩の相手の胸へ見下ろす）。槍衾・後ろの段の形はそのまま
    if (middleGuard && dT < 99 && tg.pos && !tg.isStruct) {
      const hy = u.pos.y + (u.mounted ? RIDE.y + 0.9 : 1.08), ty = tg.pos.y + (tg.mounted ? RIDE.y + 1.2 : u.mounted ? 1.2 : 1.42);
      // 山道の高低差にも胸へ穂先を向ける。受け替えのずれは狙いに重ねて残す。
      const slopeLimit = !u.isPlayer && !u.mounted ? 0.65 : 0.35;
      rx += Math.max(-slopeLimit, Math.min(u.isPlayer || u.mounted ? 0.45 : 0.65, -Math.atan2(ty - hy, Math.max(1.2, dT)))) + 0.06;
    }
    // 狙う相手が横・背後にいる乱戦では、向き直るまで長柄を立てる。
    if (engaged && dT === 99 && !u.isPlayer && !u.atk && !sw) rx = -1.05;
    // 止まって押し合う者も味方の背を調べる。移動時だけの印では、門前の後列の槍が寝たままになる。
    // 近景だけ約四分の一秒おき。探す関数と値の入れ物は兵ごとに使い回す。
    if (this.world.def.livingSpearHedge && !u.isPlayer && !u.mounted && u.camD < 32) {
      const lane = u._spearLane || (u._spearLane = { next: this.time + (u.id % 8) * .025,
        blocked: false, rearBlocked: false, obstacles: 0, sin: 0, cos: 1, length: 0, back: 0, handX: 0 });
      if (this.time >= lane.next) {
        lane.next = this.time + .24 + (u.id % 5) * .017; lane.blocked = lane.rearBlocked = false; lane.obstacles = 0;
        const face = u.heading + u.body.rotation.y + ry;
        lane.sin = Math.sin(face); lane.cos = Math.cos(face);
        lane.length = Math.min(7, tip + .8); // 突き出す分と長柄の穂先まで肩を調べる。
        lane.handX = u.hand.position.x;
        // 繰り込んだ柄は後ろへ長く出る。短く握る予定の分も含め、戻す前に背後を測る。
        const drawBack = dT < 99 ? Math.min(Math.max(0, tip - .95), Math.max(0, reach0 - dT + .55)) : 0;
        lane.back = Math.min(6.5, Math.abs(w?.userData.butt || -1.25) + Math.max(drawBack, -(w?.position.z || 0), 0));
        // 前後の柄と馬の幅を含め、横長の余分な升は探さない。
        const half = (lane.length + lane.back) * .5, center = (lane.length - lane.back) * .5;
        scanSpearLane(this, u, center, half + 1.45, 1.15 + Math.abs(lane.handX));
      }
      if (lane.blocked && !u.atk && !sw) {
        // 味方の肩へ柄を寝かせず、脇で立てて短く持つ。兵の位置と攻撃は保つ。
        rx = Math.min(rx, -1.36 - ((u.id * 0.618) % 1) * 0.12);
        ry = (u.id % 2 ? 1 : -1) * 0.06; slide = Math.min(slide, -0.35);
      }
    }
    // 混雑の印は移動中の履歴。近景では今そこにいる肩を使い、前列へ出た兵は槍を戻す。
    const crowded = this.world.def.livingSpearHedge && u.camD < 32 && !u.isPlayer && !u.mounted
      ? !!u._spearLane?.blocked : u._spearCrowded;
    // 後列は前の味方の肩越しへ柄を立てる。待機中の槍衾と攻撃中は元の軌道を保つ。
    if (crowded && !u.isPlayer && (!hedge || engaged) && !u.atk && !sw) {
      // 背のすぐ後ろでは斜めの棒を交差させず、石突を体の脇へ引き、ほぼ直立させる。
      rx = Math.min(rx, -1.48); ry = 0; slide = Math.min(slide, -0.3);
    }
    const rxAim = rx;   // 穂先を上げる前の狙い（近すぎて上げた槍は、突く時にここへ突き下ろす）
    if ((engaged || watching) && dT < 99) {
      // 構えた穂先は相手の 0.55m 手前。近すぎれば柄を繰り込み、余る分だけ穂先を上げる。
      const over = reach0 - (dT - 0.55);
      if (over > 0) {
        // 徒歩の乱戦は長柄ほど深く短く持つ。一律 1.4m では長槍が皆直立してしまう。
        // 前の手と穂の根元の間を残す。味方が前にいる後列・馬上・本人は従来の持ち方。
        // 同じ握りのばねで溜め・突き・戻しまでつなぎ、攻撃の時刻や当たりは変えない。
        const shortGrip = !u.isPlayer && !u.mounted && !u.fleeing && !crowded
          && !tg.isStruct && tg.team !== u.team;
        const gripLimit = shortGrip ? Math.max(1.4, tip - Math.max(0.95, (w?.userData.spec?.hoL || 0.2) + 0.7)) : 1.4;
        slide = -Math.min(gripLimit, over);
        const rest = over + slide;
        if (rest > 0) rx = Math.min(rx, -Math.acos(Math.max(0.35, (reach0 + slide - rest) / (reach0 + slide))));
      }
    }
    const rxK = rx;   // 構えの傾き（振り抜いた後はここへ戻す）
    if (!sw && !(u.atk && !u.atk.ranged) && !u.pAtk) u.spW = 0;
    const a = u.atk && !u.atk.ranged ? u.atk : u.pAtk;
    if (a) {
      const k0 = Math.min(1, 1 - Math.max(0, a.t) / (a.dur || u.windup)), k = k0 * k0 * (3 - 2 * k0);
      // 振り上げて溜める（叩き）／引いて溜める（突き）／横へ振りかぶる（払い）
      // 本人を狙う一撃は、振りかぶりを大きく見せる（朱の弧に頼らず、構えの形で読めるように）
      const big = a.target && a.target.isPlayer ? 1.35 : 1;
      if (a.kind === 'slam') { rx = Math.min(rx, -0.1) - 1.0 * k * big; ext = -0.15 * k * big; }
      else if (a.kind === 'sweep') { ry = 0.8 * k * big * (a.dir || 1); rx = -0.1; }
      // 振り回しの溜め：槍の中ほどを握り直し、頭の上へ差し上げて水平に寝かせる
      else if (a.kind === 'spinW') { lift = 0.55 * k; rx = rx * (1 - k) - 0.08 * k; slide = Math.min(slide, -1.1 * k); ext = -0.2 * k; }
      // 石突きの溜め：柄を前へ滑らせ、手元を体の前へ引き寄せる
      else if (a.kind === 'butt') { ext = 0.15 * k; slide = Math.min(slide, 0.5 * k); }
      else { ext = -0.35 * k * big; u.spW = k * big; }
      // 馬上の突きは片手：拳を肩の上へ引き上げ、穂先を下へ向けて溜める（上から突き下ろす）
      if (u.mounted && a.kind !== 'slam' && a.kind !== 'sweep' && a.kind !== 'spinW' && a.kind !== 'butt') { lift = 0.3 * k; rx += 0.18 * k; ext = -0.25 * k; }
    }
    if (sw && (sw.kind === 'thrust' || sw.kind === 'charge') && sw.t < sw.dur + 0.3) {
      // 突き：まっすぐ出して、引く。当たれば穂先は相手の所で止まり、外れれば体の脇を抜ける
      const p = sw.t / sw.dur;
      const out = thrustOut(p, sw.dur, close ? 0.14 : 0.26);
      let e = 0.62 * out;
      const cur = (reach0 + slide) * Math.cos(rx);
      if (sw.res === 'hit') e = Math.min(e, sw.d - 0.1 - cur);
      // 近すぎて穂先を上げていた槍は、突きで相手の胸へ突き下ろす（手元は少しでも前へ押し込む。引くだけの突きにしない）
      if (rx < rxAim - 0.08) { rx += (rxAim + 0.1 - rx) * 0.45 * out; e = Math.max(e, 0.18 * out); }
      else if (sw.res === 'armor' || sw.res === 'block') e = Math.min(e, sw.d - 0.3 - cur + (sw.res === 'block' ? -0.15 : 0));
      else if (sw.res === 'miss') ry = sw.side * 0.22 * out;
      // 溜めて引いた所から突き出す（溜めの引きを突きの出と入れ替える。手元が一コマで前へ跳ばない）
      ext = Math.max(-0.4, e - 0.35 * (u.spW || 0) * (1 - Math.min(1, p / 0.5)));
      if (p >= 0.5) u.spW = 0;
      // 馬上は鐙に立ち、肩の上に引き上げた拳を斜め下へ突き下ろす
      if (u.mounted) { rx += 0.18 * (1 - out) * (p < 0.4 ? 1 : 0) + 0.12 * out; lift = 0.3 * (1 - Math.min(1, p / 0.4)) * (p < 0.4 ? 1 : 0) - 0.05 * out; }
      if (sw.res === 'block' && p > 0.5) rx -= 0.25 * out;   // 受けられて穂先が上へ逸れる
    } else if (sw && sw.kind === 'slam' && sw.t < sw.dur + 0.3) {
      // 叩き：振り上げた長柄を、しなりを利かせて打ち下ろす
      const p = Math.min(1, sw.t / (sw.dur * sw.at));
      // 柄を受けられた叩きは胸前の槍で止まり、反発で跳ね返る。
      const end = -Math.atan2(sw.res === 'block' ? 0.12 : 0.55, Math.max(1, (sw.d || dT) - 0.1));
      const hi = -1.1;
      // 打ち下ろした後は、跳ね返りを受けて中くらいの速さで中段へ構え直す
      const r = clamp01((sw.t - sw.dur) / 0.3), back = r * r * (3 - 2 * r);
      rx = p < 1 ? hi + (end - hi) * p * p : end + Math.min(0.5, (sw.t - sw.dur * sw.at) * 0.6) * (sw.res === 'miss' ? 1 : 0.2);
      if (p >= 1) rx = rx * (1 - back) + rxK * back;
      if (sw.res === 'block' && p >= 1) rx -= 0.2 * Math.sin(clamp01((sw.t - sw.dur * sw.at) / 0.3) * Math.PI);
      ext = -0.1 * (1 - back);
    } else if (sw && sw.kind === 'spin' && sw.t < sw.dur + 0.35) {
      // 振り回し：頭の上で槍を水平に一回り半…ではなく、ちょうど一回り（二度目の構えで向きが跳ねない）。振り終えたら中段へ下ろす
      const q0 = Math.min(1, sw.t / sw.dur), q = q0 * q0 * (3 - 2 * q0), d = sw.dir || 1;
      const r = clamp01((sw.t - sw.dur) / 0.35), back = r * r * (3 - 2 * r);
      if (q0 >= 1 && !sw.wrapped && u.spr) { u.spr.ry -= d * Math.PI * 2; sw.wrapped = true; }
      ry = q0 < 1 ? d * q * Math.PI * 2 : 0;
      rx = -0.08 * (1 - back) + rxK * back; lift = 0.55 * (1 - back); slide = Math.min(slide, -1.1 * (1 - back)); ext = -0.2 * (1 - back);
    } else if (sw && sw.kind === 'butt' && sw.t < sw.dur + 0.3) {
      // 石突き：柄を握ったまま、尻を前（背後の敵なら後ろ）へ鋭く突き出す。前へは柄を手前へ滑らせて穂先を肩の上へ立て、後ろへは両手で引き抜くように
      const p = sw.t / sw.dur, out = thrustOut(Math.min(1, p), sw.dur);
      if (sw.rear) { ext = -0.55 * out; slide = Math.min(slide, -0.9 * out); rx = rx * (1 - out) - 0.25 * out; }
      else { rx = rx * (1 - out) - 1.25 * out; ext = 0.1 * out; slide = Math.max(slide, 1.0 * out); }
    } else if (sw && sw.kind === 'hook' && sw.t < sw.dur + 0.3) {
      // 十文字槍の引き倒し：まっすぐ突き出し（前の三割半）、鎌刃を掛けたまま穂先を下げて手前へ強く引き込み、腰へ引き付けてから中段へ戻す
      const p = sw.t / sw.dur;
      const x = clamp01(p / 0.35), out = x * x * (3 - 2 * x);
      const y = clamp01((p - 0.4) / 0.45), pull = y * y * (3 - 2 * y);
      const r = clamp01((sw.t - sw.dur) / 0.3), back = r * r * (3 - 2 * r);
      let e = 0.55 * out;
      const cur = (reach0 + slide) * Math.cos(rx);
      if (sw.res === 'hit' || sw.res === 'armor') e = Math.min(e, sw.d - 0.05 - cur);
      ext = (e * (1 - pull) - 0.42 * pull) * (1 - back);
      rx = rxK + 0.32 * pull * (1 - back); ry = -0.14 * pull * (1 - back) * (sw.side || 1);
      u.spW = 0;
    } else if (sw && sw.kind === 'sweep' && sw.t < sw.dur + 0.3) {
      // 払い：振りかぶった側から逆の側まで、腰で長柄を横に払い抜け、中くらいの速さで中段へ戻す
      const d = sw.dir || 1;
      if (sw.t < sw.dur) { const q0 = sw.t / sw.dur, q = q0 * q0 * (3 - 2 * q0); ry = d * (0.8 - 1.8 * q); rx = -0.1; }
      else { const r = Math.min(1, (sw.t - sw.dur) / 0.28), e = 1 - r * r * (3 - 2 * r); ry = ry * (1 - e) - d * 1.0 * e; rx = rxK * (1 - e) - 0.1 * e; }
    } else if (u.sweepT > 0) {
      const p = 1 - u.sweepT / 0.35;
      ry = Math.sin(p * Math.PI * 2) * 0.9;
      if (!u.isPlayer && sw && sw.kind === 'sweep') { const q0 = Math.min(1, sw.t / sw.dur), q = q0 * q0 * (3 - 2 * q0); ry = 0.8 - 1.8 * q; rx = -0.1; }
    } else if (u.slamT > 0 && u.isPlayer) { rx = -1.05 + (1 - u.slamT / 0.26) * 1.35; }
    else if (u.strikeT > 0 && u.isPlayer && !sw) ext = Math.sin((1 - u.strikeT / 0.2) * Math.PI) * 0.6;
    // 右手から相手の胸へ向ける。体が向き直る途中も左右のずれを追い、空いた所へ突かない。
    // 払いなどの横の軌道には元の内向きだけを足し、突きと中段だけ相手を追う。
    if (engaged && dT < 99 && !u.mounted) {
      const tracking = !u.isPlayer && tg.pos && !tg.isStruct
        && (!(crowded || u._spearLane?.blocked) || a || sw)
        && (!a || a.kind === 'thrust') && (!sw || sw.kind === 'thrust' || sw.kind === 'charge');
      ry += tracking ? Math.max(-0.45, Math.min(0.45, Math.atan2(sideT - h.position.x, Math.max(0.6, dT - 0.18))))
        : -Math.atan2(0.28, Math.max(1, dT));
    }
    // 構えたまま出した自分の技（叩き下ろし・払い）は、振り終えるまで構えの形で上書きしない（刀の受けと同じ）
    if ((u.guard || u.guardFlash > 0 || u.guarding > 0) && !(u.isPlayer && (u.pAtk || (sw && sw.t < sw.dur + 0.2)))) { rx = -0.9; ry = -0.25; }
    else if (u.contactCover > 0.01 && !a && !sw && !(u.planted > this.time) && !(u.yariOpenUntil > this.time)) {
      // 柄を斜めに起こして胸の前へ引く。穂先を上げ切らず、次の突きへ戻れる形。
      const k = u.contactCover;
      rx += (-0.72 - rx) * k; ry += ((u.id % 2 ? -0.3 : 0.18) - ry) * k;
      ext -= 0.13 * k;
    }
    // 払った柄を横へ送り、胸の高さへ戻す。防御と反撃の時計をそのまま使う。
    if (close && u.yariParryUntil > this.time && !a && !sw) {
      const q = clamp01(1 - (u.yariParryUntil - this.time) / 0.3);
      const beat = Math.sin(q * Math.PI);
      rx = -0.28 - 0.12 * beat; ry = -0.25 + 0.65 * beat; ext -= 0.1 * beat;
    }
    // 歩みと呼吸で穂先だけが小さく遅れる。遠景の更新は増やさない。
    if (close && !a && !sw && !u.hit && !reduceMotion()) {
      const ph = this.time * 2.3 + u.id * 2.39996;
      rx += Math.sin(ph) * 0.008 + Math.sin(this.time * 8.2 + u.id) * Math.min(0.016, (u.moving || 0) * 0.008);
      ry += Math.sin(ph * 0.71) * 0.009;
    }
    // 騎馬を受け止めた槍衾の者（checkYari）：石突を地に着け、穂先を馬の胸へ斜めに上げ、柄を手元へ引き寄せて踏ん張る
    if (u.planted > this.time && !u.isPlayer) { const k = Math.min(1, (u.planted - this.time) / 0.3); rx = rx * (1 - k) - 0.42 * k; ry = 0; ext = -0.25 * k; slide = Math.min(slide, -0.35 * k); }
    if (u.cheer > 0) { rx = -1.35; ext = 0.1 + Math.abs(Math.sin(this.time * 6)) * 0.15; }
    // 馬上で駆ける時は、槍を脇に抱えて穂先を前へ倒す（駆け込みの構え）。並足へ落とすと立て直す
    if (u.mounted && !engaged && !a && !sw) {
      const v = u.isPlayer ? u.vel : u.mv, cs = v ? clamp01((Math.hypot(v.x, v.z) - 7) / 3) : 0;
      if (cs > 0) { rx += (-0.22 - rx) * cs; ry += (-0.1 - ry) * cs; ext += 0.12 * cs; }
    }
    // 崩れた時は穂先が下がる
    if (u.hit && u.hit.kind !== 'flinch') rx += 0.12 * Math.sin(Math.min(1, u.hit.t / u.hit.dur) * Math.PI);
    // 士気が落ちると、槍先が揃わず揺れる
    const gm = g ? g.morale : 100;
    if (gm < 40 && !u.isPlayer) rx += Math.sin(this.time * 1.7 + u.id * 2.3) * (40 - gm) * 0.012;
    // 崩れかけ（士気 32 未満）の隊は、構えていない者から槍先が下がる（腕に力が入らない）
    if (gm < 32 && !u.isPlayer && !engaged && !u.fleeing) rx += (32 - gm) * 0.012;
    // 待つ間の持ち替え・手入れ（idleFx）
    if (u.idl && u.idl.rx && !u.atk && !u.swing && !hedge) rx += u.idl.rx;
    // 押し下げられた柄はすぐには持ち上がらない。立て直すまで穂先を下げ、隙を姿で示す。
    if (u.yariOpenUntil > this.time && !u.mounted && !a && !sw) {
      const k = clamp01((u.yariOpenUntil - this.time) / 1.2);
      rx += (0.35 - rx) * k; ry *= 1 - k; ext = -0.15 * k;
    }
    // 谷の後列は待機中だけ立て気味に持つ。狙い・突き・受けの向きは保つ。
    if (this.world.def.allySpearSpread && u.team === 0 && !u.isPlayer && !u.mounted && !engaged && !a && !sw && !u.fleeing && !(u.stagger > 0) && !u.guard && !(u.guardFlash > 0) && !(u.guarding > 0) && !(u.planted > this.time) && !(u.cheer > 0) && !(u.yariOpenUntil > this.time) && !(u.jinchu && !u.jinchu.standing)) {
      rx = -0.9 - ((u.id * 0.3719) % 1) * 0.45;
      ry += ((u.id * 0.5813) % 1 - 0.5) * 0.24;
    }
    // 敵を見つけただけでは後列の槍を寝かせない。前の味方を越すまでは立てて運ぶ。
    // 攻撃中の軌道・間合い・当たりは保ち、構えの絵だけを整える。
    let front = u.spearFront?.alive ? u.spearFront : u._lineFront?.alive ? u._lineFront : u.pressBack?.alive ? u.pressBack : u._poseFront?.alive ? u._poseFront : null;
    // 前列が離れた後も古い印だけで立て続けない。実際に柄が触れる肩幅だけを避ける。
    if (front) {
      const dx = front.pos.x - u.pos.x, dz = front.pos.z - u.pos.z;
      const ahead = dx * Math.sin(u.heading) + dz * Math.cos(u.heading);
      const side = Math.abs(dx * Math.cos(u.heading) - dz * Math.sin(u.heading));
      if (front.team !== u.team || ahead <= .2 || ahead > 2.6 || side > .48 || Math.abs(front.pos.y - u.pos.y) > .85) front = null;
    }
    // 近景の槍衾でも二列目を認め、下の頭越しの支えへ渡す。
    // 従来は近景でこの印が消え、前列の攻防へ連なる姿が遠景にしか出なかった。
    u.spearRear = !!(front && (!(this.world.def.livingSpearHedge && u.camD < 32) || crowded || this.world.def.rearSpearSupport) && !u.isPlayer && !u.mounted && !a && !sw && !u.fleeing && !(u.stagger > 0) && !(u.cheer > 0) && !(u.yariOpenUntil > this.time));
    if (u.spearRear) {
      rx = -1.12 - ((u.id * 0.381966) % 1) * 0.2;
      ry = Math.max(-0.12, Math.min(0.12, ry)); slide = 0; ext = -0.28;
    } else if (engaged && dT < 99 && !u.isPlayer && !u.mounted && !a && !sw) {
      // 胴の見回しで槍が敵から外れないよう、手元で向きを戻す。
      ry = Math.max(-0.45, Math.min(0.45, Math.atan2(sideT - h.position.x, Math.max(0.6, dT - 0.18)) - u.body.rotation.y));
    }
    // 攻撃中も味方の背へ柄を通さない。既存の近傍調べの印だけで手元を引き、穂先を立てる。
    if (!u.isPlayer && !u.mounted && (crowded || u.spearRear)) {
      // 肩の上へ穂先を逃がしつつ、全員が垂直の棒にならない角度で支える。
      // 現在の肩の位置を使い、前列へ出た兵は通常の構えへ戻す。
      // 攻撃・受けの間は深く引き起こし、攻撃の時計と当たりは保つ。
      const carry = -1.12 - ((u.id * 0.381966) % 1) * 0.2 - (u.contactLoad || 0) * .1;
      const holding = !a && !sw && !u.guard && !(u.guardFlash > 0) && !(u.guarding > 0)
        && !(u.planted > this.time) && !(u.cheer > 0) && !(u.stagger > 0)
        && !(u.yariOpenUntil > this.time) && !(u.jinchu && !u.jinchu.standing);
      rx = holding ? carry : Math.min(rx, -1.38, carry);
      ry = 0; ext = Math.min(ext, -0.28);
      // 立てた石突きを土へ埋めない。拳を引き、柄は握りの中で上へ送る。
      const gripY = h.position.y - (u.spLift || 0) + u.body.position.y;
      slide = Math.max(0, Math.abs(w?.userData.butt || -1.25) - Math.max(0.15, gripY - 0.06) / Math.max(0.5, Math.sin(-rx)));
    }
    // 乱戦で待つ長柄を一律の水平へ戻さない。間合いを詰められたら穂先を起こし、
    // 相手が引くと中段へ戻す。肩口・胸前・低い構えを分け、同じ高さの棒の列を避ける。
    // 既存の相手と手元のばねだけを使う。技の軌道・当たり・移動・攻撃の時計は保つ。
    if (engaged && dT < 99 && tg?.alive && !tg.isStruct && tg.team !== u.team && u.camD < 32
      && !u.isPlayer && !u.mounted && !u.fleeing && !u.dropped && !u.dragging && !u.climb && !u.perch
      && !u.spearRear && !crowded && !u._spearLane?.blocked && !a && !sw
      && !u.hit && !u.dodging && !u.downed && !(u.stagger > 0) && !(u.cheer > 0)
      && !(u.guard || u.guardFlash > 0 || u.guarding > 0) && !(u.planted > this.time)
      && !(u.yariOpenUntil > this.time) && !(u.jinchu && !u.jinchu.standing)) {
      const close = clamp01((reach0 + 1.6 - dT) / 3.2);
      const level = u.id % 3;
      // 相手の突き戻しに合わせて柄を引き、次の溜めでは受けの構えへ渡す。
      const receive = reduceMotion() ? 0 : u.contactLoad || 0;
      const ready = close * (0.65 + 0.35 * (u.contactBrace || 0));
      // 古い混雑の印で前列の構え直しを止めない。敵の溜めには脇へ払い、手元を引く。
      const threat = tg.atk && !tg.atk.ranged && tg.atk.target === u
        ? clamp01(1 - Math.max(0, tg.atk.t) / Math.max(.1, tg.atk.dur || tg.windup || .6)) : 0;
      rx = Math.min(rx, rxAim - ready * (0.24 + level * 0.24) - threat * .16);
      ry += (u.id % 2 ? 1 : -1) * threat * .18;
      ext -= ready * (0.08 + level * 0.045) + receive * 0.08;
      ext -= threat * .12;
      lift += ready * level * 0.055;
    }
    // 突きには横から柄を寄せ、振り下ろしには穂先と拳を上げる。既存のばねで構えへ戻す。
    // 後列は味方の背へ柄を倒さず、前列だけ目前の打ち筋へ応じる。
    if (!u.spearRear && !crowded && !a && !sw && !u.isPlayer && !u.mounted && !u.hit && !u.dodging && !u.downed
      && !(u.cheer > 0) && !(u.planted > this.time) && !(u.yariOpenUntil > this.time) && !reduceMotion()) {
      const p = u.contactParry || 0, high = u.contactParryHigh || 0;
      rx += (-0.2 - rx) * p - 0.6 * high;
      ry += (u.contactParrySide || 0) * 0.42;
      ext -= 0.16 * p; lift += 0.16 * high;
    }
    // 応戦する味方の後ろでは、頭上を通せる時だけ肩口へ構える。
    // 密着・段差・行軍では立て槍を保つ。既存の前列と攻防の時計だけを使う描画処理。
    u.spearSupport = false;
    const frontFoe = front?.swing?.target || front?.atk?.target || front?.target || front?.poseTarget;
    if (u.spearRear && u.camD < 26 && !u._spearLane?.rearBlocked && !(u._spearLane?.obstacles > 1) && (!hedge || this.world.def.rearSpearSupport) && !u.hit && !u.downed && !u.dropped && !u.climb
      && !u.dodging && !u.guard && !(u.guardFlash > 0) && !(u.guarding > 0)
      && !(u.planted > this.time) && u.moving < 1.6 && front.team === u.team
      && !front.mounted && !front.fleeing && frontFoe?.alive && !frontFoe.isStruct
      && frontFoe.team !== u.team && Math.cos(u.heading - front.heading) > 0.7
      && Math.abs(front.pos.y - u.pos.y) < 0.5
      && this.distTo(front, frontFoe) < Math.min(6, (front.reach || 2) + 1)) {
      const dx = front.pos.x - u.pos.x, dz = front.pos.z - u.pos.z;
      const ahead = dx * Math.sin(u.heading) + dz * Math.cos(u.heading);
      const side = Math.abs(dx * Math.cos(u.heading) - dz * Math.sin(u.heading));
      if (ahead > 0.8 && ahead < 2.2 && side < 0.65) {
        u.spearSupport = true;
        const load = reduceMotion() ? 0 : u.contactLoad || 0;
        const push = reduceMotion() ? 0 : u.contactPush || 0;
        // 後列の段ごとに拳と穂先をずらし、頭上に水平な柄を重ねない。
        lift = 0.34 + (u.id % 3) * 0.08 + 0.06 * (u.contactBrace || 0);
        const gripY = h.position.y - (u.spLift || 0) + u.body.position.y + lift;
        // 笠の上に余白を残す。受けで引き、前列の押し返しで手元を送る。
        // 前列の笠の頂点より高く通す。頭上へ水平に寝かせ、笠と柄を交差させない。
        rx = Math.min(-0.38 - (u.id % 3) * 0.08,
          -Math.atan2(Math.max(0.3, front.pos.y - u.pos.y + 2.25 - gripY), ahead - 0.1)) - load * 0.06;
        // 後列の胸のひねりを柄へ重ねない。前列の向きへそろえ、隣の槍との交差を抑える。
        ry = Math.max(-0.18, Math.min(0.18, angleDiff(u.heading, front.heading))) - u.body.rotation.y;
        ext = -0.22 - 0.1 * load + 0.09 * push;
        slide = Math.max(0, Math.abs(w?.userData.butt || -1.25) - (gripY - 0.1) / Math.max(0.3, Math.sin(-rx)));
      }
    }
    // 後の受け・支えの処理でも、密集した肩へ柄を寝かせ直さない。
    // 前列一人の頭上を支える姿は保ち、混み合う後列は石突を上へ送って立てる。
    if (crowded && !u.spearSupport && !u.isPlayer && !u.mounted) {
      rx = Math.min(rx, -1.43 - (u.id % 4) * 0.025);
      ry = -u.body.rotation.y;
      ext = Math.min(ext, -0.22);
      const gripY = h.position.y - (u.spLift || 0) + u.body.position.y + lift;
      slide = Math.max(0, Math.abs(w?.userData.butt || -1.25)
        - Math.max(0.15, gripY - 0.06) / Math.max(0.5, Math.sin(-rx)));
    }
    // 短く握った長槍の石突きも後ろの人へ通さない。溜め・突きの時刻は保ち、
    // 背後が詰まる時だけ柄を肩の上へ逃がす。近傍調べの結果を使い回す。
    if (u._spearLane?.rearBlocked && this.world.def.livingSpearHedge && u.camD < 32
      && !u.isPlayer && !u.mounted && !u.fleeing && !u.downed && !u.dropped && !u.climb) {
      rx = Math.min(rx, -1.18 - (u.id % 4) * .055);
      ry = -u.body.rotation.y; ext = Math.min(ext, -.18);
      const gripY = h.position.y - (u.spLift || 0) + u.body.position.y + lift;
      slide = Math.max(0, Math.abs(w?.userData.butt || -1.25)
        - Math.max(.15, gripY - .06) / Math.max(.5, Math.sin(-rx)));
    }
    // 戦っていない徒歩の長柄は立てて運び、通り道を横切る長い線を減らす。
    // 人数・武器の長さ・攻撃と当たりは変えず、構えのばねだけへ渡す。
    if (!u.isPlayer && !u.mounted && !engaged && !watching && !hedge && !a && !sw
      && !u.hit && !u.downed && !u.dropped && !u.climb && !u.fleeing
      && !(u.cheer > 0) && !(u.stagger > 0) && !(u.contactBrace > .1)
      && !(u.jinchu && !u.jinchu.standing) && (w?.userData.spec?.L || 0) >= 4.5) {
      rx = Math.min(rx, -1.42 - (u.id % 3) * .035);
      ry = -u.body.rotation.y;
      const gripY = h.position.y - (u.spLift || 0) + u.body.position.y + lift;
      slide = Math.max(0, Math.abs(w.userData.butt || -1.25)
        - Math.max(.15, gripY - .06) / Math.max(.5, Math.sin(-rx)));
    }
    // なめらかに（突きの速さは残す）
    const s = u.spr || (u.spr = { rx, ry, sl: slide });
    // 打つ間は速く、振り抜いた後の戻りは中くらい（止まった形へ一コマで跳ばない）
    const hot = a || (sw && sw.t < sw.dur);
    // 速さを持ったばねで寄せる：溜め→突き→戻り→次の突きが、止まらず・跳ばずに一続きの動きになる
    const wk = hot ? 46 : sw ? 26 : 16;
    spr2(s, 'rx', rx, wk, dt); spr2(s, 'ry', ry, wk, dt); spr2(s, 'sl', slide, hot ? 26 : 14, dt);
    // 手の前後も同じばねで（引いて溜めた所から突き出す時に、手が一コマで跳ばない。突きの速さは残す）
    if (s.ex === undefined) s.ex = ext; else spr2(s, 'ex', ext, hot ? 48 : 26, dt);
    h.rotation.x = s.rx; h.rotation.y = s.ry; h.position.z = 0.18 + s.ex;
    // 馬上の片手突き：拳の上げ下げ（前のコマの分を戻してから置く）
    s.lf = u.mounted || lift || s.lf ? (s.lf || 0) + (lift - (s.lf || 0)) * Math.min(1, dt * (hot ? 24 : 12)) : 0;
    if (!u.mounted && Math.abs(s.lf) < 0.002 && !lift) s.lf = 0;
    h.position.y += s.lf - (u.spLift || 0); u.spLift = s.lf;
    if (w) w.position.z = s.sl;
    // しなり：近くの兵だけ。柄が水平に近いほど先が垂れる
    // 押し合いで柄へ掛かる重さも同じばねへ渡す。新しい形や物理の計算枠は増やさない。
    const pressure = this.world.def.livingSpearHedge && !hot && !u.isPlayer && !reduceMotion()
      ? (u.contactBrace || 0) * Math.sin(this.time * (1.1 + u.id % 4 * 0.13) + u.id * 2.399) * 1.4 : 0;
    if (w) flexSpear(w, dt, u.camD < 26, Math.cos(s.rx) + pressure);
  },

  // 打刀：構え（中段）・袈裟（右上から左下）・逆袈裟（左下から右上）・横に薙ぐ・突き・受け（刃を横にして受ける）
  poseSword(u, dt, engaged) {
    const h = u.hand, oy = u.mounted ? RIDE.y : 0;
    // [x, y, z, 上下, 左右, 刃の向き]
    // 構えは人ごとに：中段が多く、八相（右肩の上に立てる）・上段も混ぜる
    const C = u.isPlayer ? SW_POSE.chudan : u.id % 4 === 2 ? SW_HASSO : u.id % 4 === 3 ? SW_JODAN : SW_POSE.chudan;
    let P = engaged ? C : SW_POSE.sage;
    const a = u.atk && !u.atk.ranged ? u.atk : u.pAtk, sw = u.swing;
    // 馬上の斬りは、すれ違う徒歩の相手へ右の脇へ斬り下ろす（袈裟・逆袈裟・横はどれも馬の右の低い所へ）
    if (a && SW_POSE[swordKind(u, a.kind) + '0']) {
      // 溜め：ゆっくり振りかぶり、振りかぶり切った所で一瞬ためる。
      //   前の太刀の残心・戻りの途中から振りかぶる時は、構え（中段）へ戻らず、今の刀の所から次の振りかぶりへ流れる（切り返し）
      const k0 = Math.min(1, 1 - Math.max(0, a.t) / (a.dur || u.windup)), k = k0 * k0 * (3 - 2 * k0);
      if (!u.swFrom || u.swAk !== a.kind || k0 < (u.swK0 ?? 1) - 0.02) { u.swFrom = (u.swp || C).slice(); u.swAk = a.kind; }
      u.swK0 = k0;
      P = lerpPose(u.swFrom, SW_POSE[swordKind(u, a.kind) + '0'], k, swordPose);
    } else if (sw && SW_POSE[swordKind(u, sw.kind) + '0'] && sw.t < sw.dur + 0.3) {
      // 振り：振りかぶりから加速して一気に斬り抜き（出の 0.85 で振り切る）、当たった所で止まる（受けられれば途中で弾かれ、甲冑なら浅く止まる）
      const p = Math.min(1, sw.t / (sw.dur * 0.85));
      let q = p * p * (3.4 - 2.4 * p);
      const stop = sw.res === 'block' ? 0.45 : sw.res === 'armor' ? 0.65 : 1;
      q = Math.min(q, stop);
      const kd = swordKind(u, sw.kind);
      P = lerpPose(SW_POSE[kd + '0'], SW_POSE[kd + '1'], q, swordPose);
      // 刀は肩を中心に弧を描いて振られる：途中では手が体の前へ張り出す（二つの形をまっすぐ結ぶと、手が胸に寄って縮こまる）
      const arc = Math.sin(Math.min(1, q) * Math.PI);
      P[2] += arc * 0.24; P[1] += arc * 0.05;
      // 残心：振り抜いた形のまま一呼吸とどめ（0.08 秒）、中くらいの速さで構えへ戻る
      if (sw.t > sw.dur) { const r = clamp01((sw.t - sw.dur - 0.08) / 0.22); P = lerpPose(P, C, r * r * (3 - 2 * r), swordPose); }
    } else if (u.strikeT > 0 && u.isPlayer) {
      P = lerpPose(SW_POSE.kesa0, SW_POSE.kesa1, 1 - u.strikeT / 0.2, swordPose);
    }
    if (!a) u.swFrom = null;
    // 打ち手の振りに合わせて刀を胸の前へ引き上げる。足・腰と同じ受けの時計を使う。
    if (!a && !sw && !u.isPlayer && !u.mounted && !u.hit && !u.dodging && !u.downed && !reduceMotion()) {
      // 腰と連動する受けを残し、近くでは敵の打つ高さと左右へ手元を合わせる。
      const k = Math.max((u.contactLoad || 0) * (u.contactBrace || 0), u.contactParry || 0);
      if (k > 0.001) {
        P = lerpPose(P, SW_POSE.uke, k, swordPose);
        P[1] += 0.12 * (u.contactParryHigh || 0);
        P[4] += 0.3 * (u.contactParrySide || 0);
      }
    }
    if (u.guard || u.guardFlash > 0 || u.guarding > 0) P = SW_POSE.uke;
    else if (u.contactCover > 0.01 && !a && !sw) {
      // 棒立ちで順番を待たず、相手の振りかぶりに刀を胸元へ運んで備える。
      P = lerpPose(P, SW_POSE.uke, u.contactCover * 0.85, swordPose);
      P[5] += (u.id % 2 ? 0.12 : -0.12) * u.contactCover;
    }
    if (u.cheer > 0) P = SW_POSE.cheer;
    const s = u.swp || (u.swp = P.slice());
    // 打つ間は速く、残心からの戻りは中くらい、構えの移りはゆっくり
    // 速さを持ったばねで寄せる（袈裟から逆袈裟への切り返しで、刀が一コマで向きを変えない）
    const wk = a || (sw && sw.t < sw.dur) ? 50 : sw ? 26 : 16;
    for (let i = 0; i < 6; i++) spr2(s, i, P[i], wk, dt);
    h.position.set(s[0], s[1] + oy, s[2]);
    h.rotation.set(s[3], s[4], s[5]);
  },

  // 鉄砲：担ぐ・構える・火蓋を切る・頬付けで狙う・放つ（反動）・込め直し（筒を立て、火薬・弾・込め矢・口薬・火縄）
  poseGun(u, dt, engaged) {
    const h = u.hand, w = u.wpn, oy = u.mounted ? RIDE.y : 0;
    let ph = engaged ? 'ready' : 'carry', k = 0;
    const a = u.atk && u.atk.ranged ? u.atk : null;
    if (a) { const e = a.dur - a.t; if (e < 0.45) { ph = 'kiri'; k = e / 0.45; } else { ph = 'aim'; k = Math.min(1, (e - 0.45) / 0.5); } }
    else if (u.fireT > 0) { ph = 'fire'; k = 1 - u.fireT / 0.45; }
    // 本人（問屋で火縄銃を持った時）も込め直しの姿を見せる（歩く程度なら込めながら歩く）
    else if (u.reload) {
      ph = 'lower';
      if (u.isPlayer || u.moving < 0.5) {
        let f = u.reload.t / u.reload.dur;
        for (const [nm, len] of RELOAD) { if (f < len) { ph = nm; k = f / len; break; } f -= len; }
      }
    }
    // 待機中は火縄へ火を移し、火挟みに掛ける。装填や発射の時計は動かさない。
    const jc = u.jinchu, matchT = jc ? jc.t - (0.6 + (u.id % 5) * 0.35) : -1;
    if (jc && !jc.standing && !a && !u.reload && matchT >= 0 && matchT < 2.4) { ph = 'match'; k = matchT / 2.4; }
    // 雨の中で待つ時は、敵を見ていても火縄を胸元へ寄せて袖で庇う。
    const rain = Math.max(this.rain || 0, this.world?.rainLevel || 0);
    if (rain > 0.1 && !u.mounted && !u.fleeing && !a && !u.reload && !(u.fireT > 0) && ph !== 'match') ph = 'cover';
    // 号令への「応」・勝鬨：鉄砲を高く掲げる
    if (u.cheer > 0 && !a) { ph = 'cheer'; k = 0; }
    u.gunPh = ph; u.gunK = k;
    const P = GUN_POSE[ph] || GUN_POSE.ready;
    let [x, y, z, rx] = P;
    if (ph === 'cover') { x = 0.13; y = 1.04; z = 0.13; rx = -0.22; }
    if (ph === 'cheer') { x = 0.3; y = 1.62 + Math.abs(Math.sin(this.time * 6)) * 0.08; z = 0.12; rx = -1.35; }
    // 待つ間の持ち替え・手入れ（idleFx）
    if (ph === 'carry' && u.idl && u.idl.rx) rx += u.idl.rx * 0.6;
    if (ph === 'fire') { const e = Math.sin(Math.min(1, k * 4) * Math.PI / 2) * (1 - k); z -= 0.08 * e; rx -= 0.16 * e; }
    // 込め矢で突き固める間は、筒を少し揺らす
    if (ph === 'ram') y += Math.max(0, Math.sin(k * Math.PI * 7)) * 0.02;
    const s = u.gpr || (u.gpr = [x, y, z, rx]);
    const kk = Math.min(1, dt * (ph === 'fire' ? 40 : 7));
    s[0] += (x - s[0]) * kk; s[1] += (y - s[1]) * kk; s[2] += (z - s[2]) * kk; s[3] += (rx - s[3]) * kk;
    h.position.set(s[0], s[1] + oy, s[2]);
    h.rotation.set(s[3], 0, 0);
    // 左手：腰から火薬入れ・弾を取り、筒口へ運び、注いだら腰へ戻す。
    const bx = Math.sin(s[3]), bc = Math.cos(s[3]);
    const lh = u.gunLeft || (u.gunLeft = [0, 0, 0]);
    if (ph === 'powder' || ph === 'ball') {
      const reach = clamp01(k / 0.3) * (1 - clamp01((k - 0.8) / 0.2));
      const q = reach * reach * (3 - 2 * reach);
      lh[0] = -0.2 + (s[0] + 0.2) * q;
      lh[1] = 0.82 + oy + (s[1] - bx * GUN_MUZ + 0.04 - 0.82) * q;
      lh[2] = 0.1 + (s[2] + bc * GUN_MUZ - 0.1) * q; u.lh = lh;
    } else if (ph === 'prime' || ph === 'kiri' || ph === 'match' || ph === 'cover' || ph === 'lower') {
      // 口薬を注ぐ、火蓋を閉じる、火縄を挟む動きをそれぞれ分ける。
      const lift = ph === 'prime' ? Math.sin(k * Math.PI) * 0.08 : ph === 'match' ? Math.sin(k * Math.PI * 2) * 0.025 : 0;
      lh[0] = s[0] + 0.035; lh[1] = s[1] + oy - bx * 0.06 + (ph === 'cover' ? 0.12 : 0.05) + lift;
      lh[2] = s[2] + bc * 0.06; u.lh = lh;
    }
    // 込め矢：台の下から抜き、筒先から入れて三度ほど突き、戻す
    const R = w && w.userData.ram;
    if (R) {
      if (ph === 'ram') {
        if (k < 0.15) { const q = k / 0.15; R.position.set(0, GUN_RAM[0] + (GUN_BORE - GUN_RAM[0]) * q, GUN_RAM[1] + (1.05 - GUN_RAM[1]) * q); }
        else if (k < 0.85) {
          const q = (k - 0.15) / 0.7, edge = Math.min(1, q / 0.12, (1 - q) / 0.12);
          const stroke = Math.sin(q * Math.PI * 3), depth = edge * (0.52 + 0.3 * stroke * stroke);
          R.position.set(0, GUN_BORE, 1.05 - depth);
        }
        else { const q = (k - 0.85) / 0.15; R.position.set(0, GUN_BORE - (GUN_BORE - GUN_RAM[0]) * q, 1.05 - (1.05 - GUN_RAM[1]) * q); }
      } else R.position.set(0, GUN_RAM[0], GUN_RAM[1]);
      // 骨の入った人が自分の槊杖を出している間は、二本にならないよう隠す
      R.visible = !(u.human && u.human.rod && u.human.rod.visible);
      if (ph === 'ram') {
        // 手は筒口に留めず、抜き差しする棒の頭を握って動かす。
        const rz = R.position.z + 0.9, ry = R.position.y;
        lh[0] = s[0]; lh[1] = s[1] + oy + bc * ry - bx * rz;
        lh[2] = s[2] + bx * ry + bc * rz; u.lh = lh;
      }
    }
    const powder = w && w.userData.loadPowder, ball = w && w.userData.loadBall;
    if (powder && ball) {
      powder.visible = !u.isPlayer && u.camD < 35 && (ph === 'powder' || (ph === 'prime' && k < 0.65));
      ball.visible = !u.isPlayer && u.camD < 35 && ph === 'ball' && k < 0.55;
      if (powder.visible || ball.visible) {
        const tool = ball.visible ? ball : powder, dy = lh[1] - s[1] - oy, dz = lh[2] - s[2];
        tool.position.set(lh[0] - s[0], bc * dy + bx * dz, -bx * dy + bc * dz);
        tool.rotation.x = -s[3];
        if (powder.visible) {
          const tilt = ph === 'prime' ? clamp01(k / 0.35) : clamp01((k - 0.3) / 0.2) * (1 - clamp01((k - 0.7) / 0.1));
          tool.rotation.z = Math.PI * tilt;
          tool.position.y += bc * 0.025; tool.position.z -= bx * 0.025;
        }
      }
    }
    // 火縄の火（雨では消えがち）
    const E = w && w.userData.ember;
    //   夕暮れと朝は火縄の赤い点が遠くからも見え、鉄砲の隊の居場所が伝わる（遠いほど点を大きくして、画面の上で一つの点に保つ）
    if (E) {
      const tk = this.world && this.world.timeKey, dim = tk === 'dusk' || tk === 'morning';
      E.visible = (!jc || jc.standing || matchT >= 1.2) && (this.rain || 0) < 0.5 && u.camD < (dim ? 150 : 60);
      if (E.visible) E.scale.setScalar((SET.reduceMotion ? 1 : 1 + Math.sin(this.time * 2.4 + u.id) * 0.12) * Math.min(dim ? 7 : 3, Math.max(1, u.camD / (dim ? 18 : 24))));
    }
  },

  // 弓：番える → 打ち起こし（弓を頭の上へ）→ 引き分け（押し開いて下ろす）→ 会（狙う）→ 離れ（弦音）→ 残心
  poseBow(u, dt) {
    const h = u.hand, w = u.wpn, oy = u.mounted ? RIDE.y : 0;
    const a = u.atk && u.atk.bow ? u.atk : null;
    let ph = 'rest', k = 0;
    if (a) {
      const e = a.dur - a.t;
      if (e < 0.8) { ph = 'nock'; k = e / 0.8; } else if (e < 1.3) { ph = 'raise'; k = (e - 0.8) / 0.5; } else if (e < 2.0) { ph = 'draw'; k = (e - 1.3) / 0.7; } else { ph = 'kai'; k = 1; }
    } else if (u.relT > 0) { ph = 'zanshin'; k = 1 - u.relT / 0.55; }
    const Q = BOW_POSE;
    let P, draw = 0;
    if (ph === 'nock') P = lerpPose(Q.rest, Q.nock, Math.min(1, k * 1.5), bowPose);
    else if (ph === 'raise') { P = lerpPose(Q.nock, Q.raise, k * (2 - k), bowPose); draw = 0.08 * k; }
    else if (ph === 'draw') { const e = k * k * (3 - 2 * k); P = lerpPose(Q.raise, Q.kai, e, bowPose); draw = 0.08 + 0.92 * e; }
    else if (ph === 'kai') { P = lerpPose(Q.kai, Q.kai, 0, bowPose); draw = 1; P[1] += Math.sin(this.time * 9 + u.id) * 0.002; }
    else if (ph === 'zanshin') P = lerpPose(Q.kai, Q.rest, Math.max(0, k - 0.5) * 2, bowPose);
    else if (u.cheer > 0) { ph = 'cheer'; P = bowPose; P[0] = -0.12; P[1] = 1.86 + Math.abs(Math.sin(this.time * 6)) * 0.08; P[2] = 0.2; P[3] = 0.15; P[4] = 0; }   // 号令への「応」・勝鬨：弓を高く掲げる
    else P = Q.rest;
    // 遠い的へは弓を上へ傾けて射上げる
    const elev = ph === 'draw' || ph === 'kai' ? (u.bowElev || 0) * (ph === 'kai' ? 1 : k) : 0;
    const s = u.bpr || (u.bpr = P.slice());
    const kk = Math.min(1, dt * 14);
    for (let i = 0; i < 5; i++) s[i] += (P[i] - s[i]) * kk;
    h.position.set(s[0], s[1] + oy, s[2]);
    h.rotation.set(s[3] - elev, s[4], 0);
    // 左の肩を的へ向けるように、上体を右へひねる
    if (ph === 'raise' || ph === 'draw' || ph === 'kai') u.body.rotation.y = 0.45 * (ph === 'raise' ? k : 1);
    // 弦を引く所（弓の手の座標）と、右手の置き所（体の外の座標）
    const B = w && w.userData.bow;
    u.bowPh = ph; u.bowDraw = draw;
    if (!B) return;
    B.near = u.camD < YUMI.near;
    const nock = _nk.set(0.02, 0.015, -0.16 - 0.72 * draw);
    const strung = ph === 'nock' ? k > 0.55 : ph === 'raise' || ph === 'draw' || ph === 'kai';
    setBowDraw(w, draw, ph === 'rest' || ph === 'zanshin' || (ph === 'nock' && k < 0.55) ? null : nock);
    B.ar.visible = strung;
    if (strung) { B.ar.position.set(nock.x, nock.y, nock.z + 0.9); B.ar.rotation.set(0, 0, 0); }
    // 右手：番える時は弦に、引く時は引いた弦と一緒に、離れでは後ろへ開く、ふだんは腰の横
    h.updateMatrix();
    const R = u.bowR || (u.bowR = new THREE.Vector3());
    if (ph === 'zanshin') R.set(0.42, 1.45 + oy, -0.18);
    else if (ph === 'rest' || (ph === 'nock' && k < 0.35)) R.set(0.28, 0.95 + oy, 0.12);
    else R.copy(nock).applyMatrix4(h.matrix);
  },

  // 救助は既存の二人だけで進める。障害物に触れたら止まり、時間が来たら静かな亡骸へ戻す。
  aidWalkable(u, x, z) {
    const W = this.world, lim = W.def.moveLim || 176;
    if (Math.abs(x) > lim || Math.abs(z) > lim || !W.walkable(x, z) || (W.inWaterAt && W.inWaterAt(x, z))) return false;
    if (Math.abs(W.heightAt(x, z) - u.pos.y) > 0.35) return false;
    for (const s of this.structs) {
      if (!s.seg || s.alive === false || s.passable) continue;
      const [ax, az, bx, bz] = s.seg, dx = bx - ax, dz = bz - az;
      const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      if ((x - ax - dx * k) ** 2 + (z - az - dz * k) ** 2 < 0.36) return false;
    }
    return true;
  },

  endAid(u) {
    const D = u.death, h = D.helper;
    if (h && h.dragging === u) {
      h.dragging = null; h.vel.x = h.vel.z = 0; h.moving = 0; h.aiT = 0;
      if (h.wpn) h.wpn.visible = true;
      if (D.mercyT != null) h.swing = null;
    }
    D.mercyT = null;
    if (D.helper) { D.dx = Math.sin(u.heading); D.dz = Math.cos(u.heading); }
    D.helper = null; D.aid = false; D.crawl = 0; D.carry = 0;
  },

  seekAid(u) {
    const D = u.death;
    if (!u.group || u.group.routed) return;
    let pairs = 0;
    for (const d of this.dead) if (d.death?.aid && d.death.helper) pairs++;
    if (pairs >= 2) return;
    let helper = null, best = 8;
    for (const o of u.group.units) {
      if (o === u || !o.alive || o.gone || o.isPlayer || (o.name && !o.isSub) || o.stdHeld || o.stdPickup || o.mounted || o.farSim || o.fleeing || o.atk || o.swing || o.reload || o.dragging || o.cover || o.escort || o.climb || o.perch || o.downed || o.woundOut || o.rearWound || o.noTarget || o.type === 'dummy' || o.type === 'porter' || o.hp < o.maxHp * 0.5 || o.stagger > 0 || o.confused > 0 || o.lastHitT < 1 || (o.target?.alive && this.distTo(o, o.target) < 5)) continue;
      const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
      if (d < best && Math.abs(o.pos.y - u.pos.y) < 0.35 && !this.wallBetween(o.pos, -1, u.pos)) { best = d; helper = o; }
    }
    if (helper) { D.helper = helper; D.liftT = 0; D.carry = 0; helper.dragging = u; helper.target = null; helper.vel.x = helper.vel.z = 0; }
  },

  finishAid(u, saved) {
    const D = u.death;
    this.endAid(u); D.carry = 0; u.dying = false;
    if (saved) {
      // 搬送された者は生存したままこの戦を離れ、討死や首取りには数えない。
      u.evacuatedWound = true; u.gone = true;
      this.corpseAt(u, -1); this.scene.remove(u.mesh);
      const i = this.dead.indexOf(u); if (i >= 0) this.dead.splice(i, 1);
    } else {
      u.alive = false; u.hp = 0; u.woundOut = null;
      // 担がれた姿から地へ下ろして、もう一度崩れる途中を描く。
      D.t = Math.min(D.t, 0.55); D.kind = 'crumple'; D.fwd = true;
      if (u.human) u.human.still = false;
      if (this.hooks.onKill) this.hooks.onKill(u, D.source);
    }
  },

  moveAid(u, dt) {
    const D = u.death;
    D.aidT += dt;
    let h = D.helper;
    if (h && (!h.alive || h.gone || h.dragging !== u || h.fleeing || h.group?.routed || h.stagger > 0 || h.lastHitT < 0.6)) {
      this.endAid(u); D.aid = true; D.carry = 0; D.liftT = 0; h = null;
    }
    if (D.aidT >= D.aidDur || u.gone) { this.finishAid(u, false); return; }
    if (!h && D.aidT >= D.seekAt) { D.seekAt = D.aidT + 2; this.seekAid(u); h = D.helper; }
    D.crawl = h ? 0 : Math.min(1, D.aidT / 2) * Math.max(0, 1 - D.aidT / 12);
    if (h) {
      const dx = u.pos.x - h.pos.x, dz = u.pos.z - h.pos.z, distance = Math.hypot(dx, dz);
      if (distance > 0.75 && !D.carry) {
        const step = Math.min(distance - 0.65, 1.1 * dt), x = h.pos.x + dx / distance * step, z = h.pos.z + dz / distance * step;
        if (!this.aidWalkable(h, x, z) || this.wallBetween(h.pos, -1, u.pos)) { this.endAid(u); D.aid = true; return; }
        h.heading = Math.atan2(dx, dz); h.pos.set(x, this.world.heightAt(x, z), z); h.moving = 1.1;
        h.mesh.position.copy(h.pos); return;
      }
      // 救い出せぬまま息が尽きる間際、刀を持つ仲間だけが介錯する。
      // 敵が迫る時は助け手も退き、離れた所から一方的に殺す処理にはしない。
      if (D.mercyT != null) {
        D.mercyT += dt; h.moving = 0; h.heading = Math.atan2(dx, dz);
        h.swing.t = D.mercyT;
        if (D.mercyT >= 0.9) { D.mercy = true; this.finishAid(u, false); }
        return;
      }
      if (!D.carry && D.aidT >= 25 && D.aidDur - D.aidT < 5 && (h.wpnKind || h.lookWeapon) === 'sword' && !this.nearestEnemy(h, 5) && !this.aidWalkable(h, h.pos.x + D.dx * 0.7, h.pos.z + D.dz * 0.7)) {
        D.mercyT = 0; D.crawl = 0; h.moving = 0;
        h.swing = { kind: 'kesa', t: 0, dur: 1.1, res: 'hit', hit: true, dir: 1, at: 0.85 };
        if (h.wpn) h.wpn.visible = true;
        return;
      }
      D.liftT += dt; D.carry = Math.min(1, D.liftT / 1.5);
      h.heading = Math.atan2(D.dx, D.dz);
      h.moving = D.carry >= 1 ? 0.7 : 0;
      const step = h.moving * dt, x = h.pos.x + D.dx * step, z = h.pos.z + D.dz * step;
      if (!this.aidWalkable(h, x, z)) { this.endAid(u); D.aid = true; D.carry = 0; D.seekAt = D.aidT + 4; return; }
      h.vel.x = D.dx * h.moving; h.vel.z = D.dz * h.moving;
      h.pos.set(x, this.world.heightAt(x, z), z); h.mesh.position.copy(h.pos);
      this.corpseAt(u, -1); u.pos.copy(h.pos); this.corpseAt(u, 1);
      if (D.carry >= 1 && Math.hypot(x - D.startX, z - D.startZ) >= 10 && !this.nearestEnemy(h, 9)) { this.finishAid(u, true); return; }
    } else if (D.crawl > 0) {
      const step = 0.12 * Math.max(0, Math.sin(D.aidT * 3 + u.id)) * D.crawl * dt;
      const x = u.pos.x + D.dx * step, z = u.pos.z + D.dz * step;
      if (this.aidWalkable(u, x, z)) { this.corpseAt(u, -1); u.pos.set(x, this.world.heightAt(x, z), z); this.corpseAt(u, 1); }
    }
  },

  // 死：膝から力が抜けて崩れる・後ろへ倒れる・前へ倒れる・横へ倒れる・馬から落ちる
  animDeath(u, dt, near) {
    const m = u.mesh, D = u.death;
    // 最後のコマは DEATH_END ちょうどの姿勢にして、その後は動かさない（humans.js も同じ時に骨を固める）
    D.t = Math.min(DEATH_END, D.t + dt); u.deadT += dt;
    if (D.aid) this.moveAid(u, dt);
    if (u.gone) return;
    const paceK = Math.max(0, 1 - D.t / DEATH_END);
    const t = D.t / (1 + ((D.pace || 1) - 1) * paceK);
    const ease = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
    const fall = (x) => { x = Math.min(1, Math.max(0, x)); return x * x; };   // 重さで倒れる（だんだん速く）
    const lie = Math.PI / 2 * 0.96;
    let rx = 0, rz = 0, dy = 0, bodyY = 0, bodyX = 0, bodyTw = 0, kneel = 0, ox = 0, oz = 0, b = 0;
    if (D.kind === 'crumple') {
      const a = ease(t / 0.4); b = fall((t - 0.3) / 0.55);
      kneel = a * (1 - b); bodyY = -0.42 * a * (1 - b); bodyX = 0.45 * a * (1 - b);
      if (D.fwd) rx = lie * b; else rz = -D.side * lie * b;
    } else if (D.kind === 'back') {
      const a = ease(t / 0.22); b = fall((t - 0.16) / 0.6);
      rx = -0.18 * a * (1 - b) - lie * b; kneel = 0.35 * a * (1 - b); bodyX = -0.2 * a * (1 - b);
    } else if (D.kind === 'forward') {
      const a = ease(t / 0.2); b = fall((t - 0.12) / 0.55);
      kneel = 0.6 * a * (1 - b); bodyY = -0.2 * a * (1 - b); rx = lie * b; bodyX = 0.3 * a * (1 - b);
    } else if (D.kind === 'side' && !D.cutTw) {
      const a = ease(t / 0.25); b = fall((t - 0.15) / 0.6);
      kneel = 0.5 * a * (1 - b); bodyY = -0.25 * a * (1 - b); rz = -D.side * lie * b;
    } else if (D.kind === 'side' && D.cutTw) {
      // 横の斬り・払い：肩が回り、片膝から斜めに崩れる。
      const a = ease(t / 0.18); b = fall((t - 0.24) / 0.62);
      kneel = 0.7 * a * (1 - b); bodyY = -0.3 * a * (1 - b);
      bodyTw = D.side * 0.5 * a * (1 - b); bodyX = 0.2 * a * (1 - b);
      // 肩のひねりは倒れる途中だけ。二軸の傾きを途中で固定すると胴が宙に残る。
      // 全ての戦で、最後は肩から地へ横向きに寝かせる。
      rx = lie * 0.45 * b * (1 - b); rz = -D.side * lie * b;
    } else if (D.kind === 'unhorse') {
      // 鞍の高さから、横へずり落ちる
      const tt = Math.min(t, 0.62);
      dy = Math.max(0, RIDE.y + 0.2 + 0.6 * tt - 4.9 * tt * tt);
      b = ease(t / 0.55);
      rz = -D.side * lie * b; kneel = 0.4 * (1 - b);
      const s = Math.min(t, 0.6) * (0.9 + (D.vx || 0) * 0.2);
      ox = Math.cos(u.heading) * D.side * s; oz = -Math.sin(u.heading) * D.side * s;
      // 弾・矢で駆ける馬から落ちた者は、前へ投げ出される（馬の首の先へ 2m ほど、うつ伏せに）
      if (D.throwF) { const f = Math.min(t, 0.62) * 3.4; ox = Math.sin(u.heading) * f + ox * 0.3; oz = Math.cos(u.heading) * f + oz * 0.3; rx = lie * b; rz *= 0.25; }
    }
    // 倒れながら体がひねれ、半歩よろめく（人ごとに違う向き・所に倒れる）
    let tw = 0;
    if (D.tw !== undefined && D.kind !== 'unhorse') { const k = ease(t / 0.7); tw = D.tw * k; ox += D.sx * k; oz += D.sz * k; }
    // 急な坂では、倒れ切る頃から坂の下へずり落ちる（体も少し回る）
    if (D.roll) { const k = ease((t - 0.5) / 1.6); ox += D.roll.x * k; oz += D.roll.z * k; tw += 0.5 * k * (D.side || 1); }
    // 倒れ切った時の小さな弾み
    if (b >= 1 && D.kind !== 'unhorse') { const tb = D.tb ?? (D.tb = t); const e = Math.exp(-(t - tb) * 9) * Math.sin((t - tb) * 22) * 0.04; if (rx) rx -= Math.sign(rx) * e; if (rz) rz -= Math.sign(rz) * e; }
    m.rotation.order = 'YXZ';
    m.rotation.set(rx, u.heading + tw, rz);
    // 寝るほど地面の傾きに沿わせる（坂で頭がめり込んだり、足が浮いたりしないよう）。傾きは体の真ん中の下で測る
    const lk = Math.max(Math.abs(Math.sin(rx)), Math.abs(Math.sin(rz)));
    const W = this.world;
    // 中の階でも、倒れた体と本物の人の根元は同じ板床に置く。
    let gx = u.pos.x + ox, gz = u.pos.z + oz, gy = ox || oz ? groundAt(W, gx, gz, u.pos.y) : u.pos.y;
    // 足元が下がる途中で討たれても、元の高さのまま宙に寝かせない。
    // 志賀の地面だけを対象にし、よろめきの無い倒れ方も接地させる。
    if (W.def.terrainContactFalls && !D.floor) {
      const contact = groundAt(W, gx, gz, u.pos.y);
      gy = u.pos.y + (contact - u.pos.y) * ease(t / 0.6);
    }
    // よろめきで床の端・階段の穴を越えても、亡骸だけを下の階へ落とさない。
    if (D.floor && Math.abs(gy - u.pos.y) > .9) { gx = u.pos.x; gz = u.pos.z; gy = u.pos.y; }
    if (lk > 0.01) {
      _dUp.set(0, 1, 0).applyQuaternion(m.quaternion);
      const cx = gx + _dUp.x * 0.85, cz = gz + _dUp.z * 0.85, e = 0.6;
      // 板床の端から下の地面を測ると、寝た体が立つほど傾いてしまう。
      if (D.floor) _dN.set(0, 1, 0);
      else if (true) {
        // 胴の下が20cm動くまでは法線を使い回す。止まった亡骸は再計算しない。
        if (!D.groundNormal || Math.abs(cx - D.groundCX) + Math.abs(cz - D.groundCZ) > 0.2) {
          if (!D.groundNormal) D.groundNormal = new THREE.Vector3();
          D.groundNormal.set(groundAt(W, cx - e, cz, gy) - groundAt(W, cx + e, cz, gy), 2 * e,
            groundAt(W, cx, cz - e, gy) - groundAt(W, cx, cz + e, gy)).normalize();
          D.groundCX = cx; D.groundCZ = cz;
        }
        _dN.copy(D.groundNormal);
      } else _dN.set(groundAt(W, cx - e, cz, gy) - groundAt(W, cx + e, cz, gy), 2 * e, groundAt(W, cx, cz - e, gy) - groundAt(W, cx, cz + e, gy)).normalize();
      _dQ.setFromUnitVectors(_dUp.set(0, 1, 0), _dN);
      _dQ.slerp(_dI, 1 - lk);
      m.quaternion.premultiply(_dQ);
      // 高画質は全戦で腰と胸を支える。骨の人もこの根元の回転と高さを共有する。
      if ((true || W.def.slopeContactFalls) && !D.floor && !D.carry) {
        // 胴の厚みだけでなく、体格を掛けた腰と胸の二点を実際の足場へ合わせる。
        // 一点だけの接線では、段の縁で胴が浮いたり肩が土へ沈んだりする。
        let support = -Infinity;
        for (let j = 0; j < 2; j++) {
          _dUp.set(0, (.55 + j * .6) * m.scale.y, 0).applyQuaternion(m.quaternion);
          support = Math.max(support, groundAt(W, gx + _dUp.x, gz + _dUp.z, gy) - _dUp.y);
        }
        gy += (support - gy) * lk;
      }
    }
    // 寝た体が地面に沈まないよう、倒れた分だけ持ち上げる（地面の向きに）
    // 三木の横倒しは胴の横幅ぶんも支え、土へ埋まって板のように見えるのを防ぐ。
    // 他の戦の厚みと、床・船上で指定した高さは保つ。
    const lift = u.corpseLift !== undefined ? u.corpseLift * lk
      : W.def.groundedFalls ? Math.max(0.24 * lk, 0.28 * Math.abs(Math.sin(rz))) : 0.24 * lk;
    m.position.set(gx + (lk > 0.01 ? _dN.x * lift : 0), gy + dy + (lk > 0.01 ? _dN.y * lift : lift), gz + (lk > 0.01 ? _dN.z * lift : 0));
    // 接地の一度だけ鳴らす。戦ごとの接地音と泥粒を保ち、箕作では胴の下へ低い埃を添える。
    if (D.impactPending && b >= (W.def.contactFalls ? 1 : 0.98)) {
      D.impactPending = false;
      _dUp.set(0, 0.8, 0).applyQuaternion(m.quaternion).add(m.position);
      this.play(W.def.contactFalls ? 'bodyLand' : 'bodyFall', W.def.contactFalls ? _dUp : m.position, 0.8);
      if (near && !D.floor && W.def.wetEarthBursts) this.burst(gx, gy + 0.08, gz, 5, 'dust', 0, 0, gy);
      else if (W.def.contactFalls && !D.floor && u.camD < 35 && !(this.rain > 0.1) && !(W.rainLevel > 0.1) &&
        !(W.wetness > 0.5) && !(W.def.muddy > 0.35) && !W.inWaterAt(_dUp.x, _dUp.z) && W.dustP) {
        if (this.time >= (this._fallDustReset || 0)) { this._fallDustReset = this.time + 0.1; this._fallDustN = 0; }
        const P = W.dustP, n = Math.min(reduceMotion() || W.def.muddy ? 1 : 2, 6 - (this._fallDustN || 0));
        this._fallDustN = (this._fallDustN || 0) + n;
        const y = groundAt(W, _dUp.x, _dUp.z, gy) + 0.08;
        for (let j = 0; j < n; j++) {
          const i = P.i = (P.i + 1) % P.life.length, k = i * 3;
          P.pos[k] = _dUp.x; P.pos[k + 1] = y; P.pos[k + 2] = _dUp.z;
          P.vel[k] = (Math.random() - 0.5) * 0.5; P.vel[k + 1] = 0.15; P.vel[k + 2] = (Math.random() - 0.5) * 0.5;
          P.life[i] = P.max[i] = 0.55 + Math.random() * 0.2;
        }
      }
    }
    u.body.position.y = bodyY; u.body.rotation.set(bodyX, bodyTw, 0);
    if (u.legL) { u.legL.rotation.x = -1.3 * kneel; u.legR.rotation.x = -0.9 * kneel; }
    if (u.shinL) { u.shinL.rotation.x = 2.0 * kneel; u.shinR.rotation.x = 1.8 * kneel; }
    // 骨の入った人（humans.js）は u.deathKneel の量で膝を折る（有り無しで切り替えると体が跳ぶ）
    u.stagger = 0; u.deathKneel = kneel;
    // 力が抜けた手から武器が落ちる
    if (t > 0.35 && !D.dropped) { D.dropped = true; this.dropWeapon(u); u.wpnKind = 'none'; }
    if (near && u.armR) poseArms(u, 0);
    // 寝た体は棒のようにしない：脚を曲げて開き、腕を投げ出す（人ごとに違う形）
    if (b > 0 && u.armR && u.legL) {
      const r = (u.id * 0.618) % 1;
      // 横向きに寝る時は脚を重ね、腕を体の前へ（開くと下の脚・腕が地面にめり込み、上の腕が宙に立つ）。humans.js の骨の体も同じ形
      const sideLie = D.kind === 'side' || D.kind === 'unhorse' || (D.kind === 'crumple' && !D.fwd);
      u.legL.rotation.x = -1.3 * kneel - (0.3 + 0.6 * r) * b; u.legL.rotation.z = sideLie ? 0 : (0.1 + 0.25 * (1 - r)) * b; u.legR.rotation.z = sideLie ? 0 : -(0.08 + 0.2 * r) * b; u.legR.rotation.x = -0.9 * kneel - (0.18 + 0.35 * (1 - r)) * b;
      if (u.shinL) { u.shinL.rotation.x = 2.0 * kneel + (0.5 + 0.9 * r) * b; u.shinR.rotation.x = 1.8 * kneel + (0.4 + 0.7 * (1 - r)) * b; }
      if (sideLie) { aimArm(u.armR, 0.22, 1.37 - 0.55, 0.32 * b); aimArm(u.armL, -0.22, 1.37 - 0.5, 0.38 * b); }
      else { aimArm(u.armR, 0.27 + (0.3 + 0.2 * r) * b, 1.37 - 0.5 + 0.35 * r * b, 0.15 * b); aimArm(u.armL, -0.27 - (0.25 + 0.25 * (1 - r)) * b, 1.37 - 0.5 + 0.4 * (1 - r) * b, 0.2 * r * b); }
    }
    // うつ伏せの深手は肘と片膝で地を押す。終わり際はゆっくり力を抜く。
    if (D.crawl > 0 && u.armR && u.legL) {
      const c = D.crawl, ph = D.aidT * 4.8 + u.id, a = Math.sin(ph);
      aimArm(u.armR, 0.28, 1.0 + 0.12 * a * c, 0.28 * c);
      aimArm(u.armL, -0.28, 1.0 - 0.12 * a * c, 0.28 * c);
      u.legR.rotation.x -= 0.25 * (1 - a) * c;
      if (u.shinR) u.shinR.rotation.x += 0.45 * (1 - a) * c;
      u.body.rotation.x -= 0.08 * c;
    }
    // 肩へ担ぎ上げる。横向きに腹を肩へ預け、手足は下へ垂らす。
    if (D.carry > 0 && D.helper) {
      const c = D.carry, h = D.helper;
      m.rotation.set(Math.PI / 2 * c + rx * (1 - c), h.heading + Math.PI / 2 * c, rz * (1 - c));
      m.position.set(u.pos.x, u.pos.y + 1.1 * c + lift * (1 - c), u.pos.z);
      u.body.rotation.set(0.35 * c, 0, 0);
      u.legL.rotation.x = -0.65 * c; u.legR.rotation.x = -0.8 * c;
      if (u.shinL) { u.shinL.rotation.x = 1.25 * c; u.shinR.rotation.x = 1.4 * c; }
    }
    // 倒れた体の下に、ゆっくり広がる血だまり
    // 陣笠は倒れた拍子に頭から落ち、頭の先の地面に転がる（付けたままだと寝た体の笠の縁が地面にめり込む）
    if (t > 0.9 && !D.hat) { D.hat = true; this.dropHat(u); if (u.flag) { u.flag.material = muddyFlag(u.flagMat || u.flag.material); } }   // 地に落ちた指物は泥で汚れて沈んだ色に
    if (t > 0.9 && !D.pool && !D.aid) {
      D.pool = true;
      const f = D.kind === 'side' || (D.kind === 'crumple' && !D.fwd) || D.kind === 'unhorse' ? 0 : rx > 0 ? 0.85 : -0.85;
      const sd = f ? 0 : D.side * 0.85;
      const hh = u.heading + tw;
      const px = m.position.x + Math.sin(hh) * f + Math.cos(hh) * sd, pz = m.position.z + Math.cos(hh) * f - Math.sin(hh) * sd;
      u.stain = this.stain(px, pz, 0.6 + Math.random() * 0.3, 150, 1);
    }
  }
};

// 味方の馬防柵（noCharge・horse の区画）の内の側 0.3〜1.7m（塹壕の中）に立っているか。区画は少ないので、時々だけ調べる
function inTrench(army, u) {
  for (const s of army.structs || []) {
    if (!s.alive || !(s.noCharge || s.horse) || !s.seg || s.team !== u.team) continue;
    const [ax, az, bx, bz] = s.seg, dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const t = ((u.pos.x - ax) * dx + (u.pos.z - az) * dz) / L2;
    if (t < -0.05 || t > 1.05) continue;
    const nl = Math.hypot(s.nx || 0, s.nz || 0) || 1, d = ((u.pos.x - ax) * (s.nx || 0) + (u.pos.z - az) * (s.nz || 0)) / nl;
    if (d < -0.3 && d > -1.7) return true;
  }
  return false;
}
