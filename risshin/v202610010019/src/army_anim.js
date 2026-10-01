// Army の手法：体の動き（歩き・構え・槍・刀・鉄砲・弓・倒れ方）
// （units.js から分けた。中身は元のまま。外の係は今までどおり units.js から import してよい）
import { animateHorse, flexSpear, seatLegs, RIDE, poseArms, GUN_MUZ, GUN_BORE, GUN_RAM, setBowDraw, aimArm } from './units_model.js';
import { DEATH_END, thrustOut, clamp01, SW_POSE, SW_HASSO, SW_JODAN, lerpPose, RELOAD, GUN_POSE, BOW_POSE, _nk, _dUp, _dN, _dQ, _dI } from './units.js';
import { IDLE, muddyFlag } from './units_flags.js';
import { TYPES } from './units_data.js';
import * as THREE from 'three';

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
    const m = u.mesh;
    if (!u.alive) {
      // 馬上で討たれた：馬が崩れて倒れ、乗り手は鞍ごと地面へ（馬の倒れ方に任せる）
      if (u.mounted && u.horse && u.horse.userData.horse && u.deadT < 4) {
        u.deadT += dt;
        const H = u.horse.userData.horse;
        H.dead = true;
        if (u.horse.visible !== false) animateHorse(u.horse, dt, 0);
        if (u.seat) { u.seat.matrix.copy(H.seat); u.seat.matrixWorldNeedsUpdate = true; }
        return;
      }
      if (u.death && !u.mounted) { if (u.death.t < DEATH_END) this.animDeath(u, dt, near); else u.deadT += dt; return; }
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
    m.position.set(u.pos.x, u.pos.y, u.pos.z);
    m.rotation.y = u.heading;
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
    if (!near || u.offscreen) {
      // まとめて描いている遠い兵（体を隠してある）は、体の揺れも得物のしなりも見えないので計算しない
      if (u.imp && !u.isPlayer) return;
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
    let hx = 0, hz = 0;
    if (H) {
      const k = H.t / H.dur, e = k < 0.18 ? k / 0.18 : Math.max(0, (1 - k) / 0.82);
      if (H.kind === 'recoil') hx = -0.32 * e;
      else if (H.kind === 'flinch') { hx = -0.1 * e; hz = H.side * 0.05 * e; }
      else if (H.kind === 'side') { hx = -0.08 * e; hz = H.side * 0.3 * e; }
      else if (H.kind === 'stumble') hx = 0.32 * e;
      // 泥・坂で転んだ者：前へ深く崩れて手をつき、ゆっくり起き上がる
      else if (H.kind === 'kneel' && H.tumble) hx = 0.6 * Math.min(1, k / 0.12) * Math.min(1, (1 - k) / 0.45);
    }
    // のけぞり・突きの踏み込み・走りの前傾
    u.body.rotation.x = u.recoil > 0 ? -0.28 * (u.recoil / 0.22) : u.strikeT > 0 ? 0.2 * Math.sin((1 - u.strikeT / 0.2) * Math.PI) : u.moving > 1.1 ? 0.12 : 0;
    u.body.rotation.x += hx;
    // 崩れかけの兵は、ちらちらと後ろを振り返る
    const scared = u.group && u.group.morale < 32 && !u.isPlayer && !u.fleeing;
    // 薙ぎのひねり、立ち止まったときの見回し
    u.body.rotation.y = scared && Math.sin(this.time * 0.9 + u.id) > 0.55 ? Math.sign(Math.sin(u.id)) * 0.9 : u.sweepT > 0 ? Math.sin((1 - u.sweepT / 0.35) * Math.PI * 2) * 0.35 : (u.moving < 0.1 && !u.target && !u.isPlayer ? Math.sin(this.time * 0.35 + u.id * 1.7) * 0.22 : 0);
    // 勝鬨・鼓舞で槍を掲げる
    if (u.cheer > 0) u.cheer -= dt;
    u.body.rotation.z = (u.confused > 0 ? Math.sin(this.time * 7 + u.id) * 0.12 : 0) + hz;
    // 打たれた手応え：のけぞり、大きく崩れたら膝をつく（吹き飛ばしはしない）
    if (u.flinchT > 0) u.flinchT -= dt;
    const kneel = u.stagger > 0.7 && !u.mounted && !u.isPlayer;
    if (u.flinchT > 0) u.body.rotation.x = -Math.sin(u.flinchT / 0.32 * Math.PI) * 0.28;
    else if (kneel) u.body.rotation.x = 0.32;
    u.anim += dt * (3 + u.moving * 6);
    // 行軍中は隊で足並みをそろえる（隊の拍子へ少しずつ寄せる。一人おきに逆の足）
    const mg = u.group;
    if (mg && mg.marching && u.moving > 0.3 && !u.mounted && !u.isPlayer) {
      if (mg._phT !== this.time) { mg._phT = this.time; mg._ph = (mg._ph || 0) + dt * (3 + 0.8 * 6); }
      const want = mg._ph + (u.slot % 2 ? Math.PI : 0);
      let df = (want - u.anim) % (Math.PI * 2);
      if (df > Math.PI) df -= Math.PI * 2; else if (df < -Math.PI) df += Math.PI * 2;
      u.anim += df * Math.min(1, dt * 2);
    }
    if (u.mounted) {
      // 馬上：脚は鞍をはさみ、馬は速さに合わせて駆ける
      seatLegs(u);
      const Hh = u.horse && u.horse.userData.horse;
      // 打たれて大きく崩れたら、馬も驚いて跳ねる（竿立ちの最中でなければ）
      if (Hh && u.stagger > 0.5 && !(Hh.rear > 0) && (Hh.spookT || 0) <= 0) { Hh.spook = 1; Hh.spookT = 4; }
      if (Hh) Hh.spookT = (Hh.spookT || 0) - dt;
      if (u.horse && u.horse.visible !== false) animateHorse(u.horse, dt, Math.hypot(u.vel.x, u.vel.z));
      if (u.seat && Hh) { u.seat.matrix.copy(Hh.seat); u.seat.matrixWorldNeedsUpdate = true; }
    } else {
      const sw = Math.sin(u.anim) * 0.65 * u.moving;
      u.legL.rotation.x = sw;
      u.legR.rotation.x = -sw;
      // 前へ振り出す脚は膝を折る。走るほど深く
      const mv = Math.min(1.4, u.moving);
      const kneeK = (0.35 + mv * 0.5) * Math.min(1, mv * 2);
      if (u.shinL) { u.shinL.rotation.x = Math.max(0, -Math.cos(u.anim)) * kneeK; u.shinR.rotation.x = Math.max(0, Math.cos(u.anim)) * kneeK; }
      // 崩れて膝をつく
      if (kneel && u.shinL) { u.legL.rotation.x = -0.9; u.shinL.rotation.x = 1.5; u.legR.rotation.x = 0.2; u.shinR.rotation.x = 1.2; }
      // 前へよろける・のけぞる時は、片足を一歩出して踏みとどまる
      else if (H && (H.kind === 'stumble' || H.kind === 'recoil') && u.moving < 0.3) { const e = Math.sin(Math.min(1, H.t / H.dur) * Math.PI); u.legL.rotation.x = (H.kind === 'stumble' ? -0.45 : 0.3) * e; }
    }
    // 馬上の弾みは鞍の入れ物（u.seat）が馬の背から受けるので、ここでは乗り手の小さな腰の動きだけ
    u.body.position.y = (u.mounted ? RIDE.y : 0) + Math.abs(Math.sin(u.anim)) * (u.mounted ? 0.02 : 0.05) * u.moving;
    if (u.dodging) u.body.position.y -= 0.28;
    if (kneel) u.body.position.y -= 0.25;
    // 立ち止まっているときの息づかい
    if (u.moving < 0.1) u.body.position.y += Math.sin(this.time * 1.8 + u.id) * 0.012;
    // 待つ間の小さな動き（重心・踏みかえ・見回し・話す・持ち替え・手入れ・膝つき・身構え）
    const idl = IDLE.on && !u.isPlayer && !u.mounted && !kneel ? this.idleFx(u, dt) : null;
    // 矢の雨の下：陣笠を前へ傾けてうつむき、身を低くする
    const dk = u.duckT > this.time ? 1 : 0;
    u.duck = (u.duck || 0) + (dk - (u.duck || 0)) * Math.min(1, dt * 6);
    if (u.duck > 0.01 && !u.isPlayer) { u.body.rotation.x += 0.3 * u.duck; if (u.head && idl) u.head.rotation.x += 0.25 * u.duck; }
    // 前のコマで下げた手の高さを戻す（膝つき・身構えの分）
    if (u.idl && u.idl.hOff) { u.hand.position.y += u.idl.hOff; u.idl.hOff = 0; }
    // 武器の構え（敵が近くて身構えている時も、穂先・筒先を前へ）
    const wType = u.wpnKind || u.lookWeapon || TYPES[u.type].weapon;
    const engaged = !!(u.target || u.atk || u.isPlayer) || !!(idl && idl.low > 0.5);
    u.lh = null;
    if (wType === 'spear') this.poseSpear(u, dt, engaged);
    else if (wType === 'gun') this.poseGun(u, dt, engaged);
    else if (wType === 'sword') this.poseSword(u, dt, engaged);
    else if (wType === 'bow') this.poseBow(u, dt);
    if (idl && idl.drop > 0.005) { u.hand.position.y -= idl.drop; idl.hOff = idl.drop; }
    if (near && !u.offscreen) poseArms(u, u.anim);
    if (u.guardFlash > 0) u.guardFlash -= dt;
    if (u.strikeT > 0) u.strikeT -= dt;
    if (u.slamT > 0) u.slamT -= dt;
    if (u.sweepT > 0) u.sweepT -= dt;
    // 指物は風下へなびく
    if (u.flag) u.flag.rotation.y = (this.wind || 0) - u.heading - Math.PI / 2 + Math.sin(this.time * 2.2 + u.id) * 0.25;
  },

  // 梯子を登る形（siege_ladder.js の u.climb）：体を梯子へ傾け、手足を交互に掛け替える
  poseClimb(u, dt) {
    const frac = u.climb ? u.climb.frac : 0;
    const ph = frac * 16 + u.id * 0.618;
    const sw = Math.sin(ph * Math.PI);
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
    let rx = engaged ? -0.06 : -0.55, ry = 0, ext = 0, slide = 0, lift = 0;
    // 待つ間の長柄は人ごとに ±4° ほど傾きが違う（槍の林が揃いすぎない）。槍衾に構えると一斉に揃う
    if (!engaged && !u.isPlayer) { rx += ((u.id * 0.3719) % 1 - 0.5) * 0.14; ry += ((u.id * 0.5813) % 1 - 0.5) * 0.08; }
    // 槍衾：前の列は槍を下げて穂先を揃え、後ろの列は前の者の肩越しに斜めに構える
    if (g && g.formation === 'yari' && !u.isPlayer && !u.mounted && (g.order === 'yari' || g.order === 'hold') && !u.fleeing) { rx = u.row === 0 ? 0.07 - (g.yariKneel && u.idl ? 0.12 * u.idl.sit : 0) : u.row === 1 ? -0.1 : -0.45; ry = 0; }   // 膝をついた前の段は、穂先を少し上げて胸の高さに
    // 前の者の背について押す後ろの段は、槍を立て気味にして（前の者に当てないよう）穂先を林のように揃える
    else if (u.pressBack && !engaged && !u.isPlayer && u.pressBack.alive) { rx = -1.05 + ((u.id * 0.3719) % 1 - 0.5) * 0.1; ry = 0; }
    const tip = (w && w.userData.tip) || 2;
    // 相手までの前への遠さ（dT）
    const sw = u.swing;
    const tg = (sw && sw.target) || (u.atk && u.atk.target) || u.target || u.fitT;
    let dT = 99;
    if (tg && tg.alive !== false) {
      if (tg.isStruct) dT = this.distTo(u, tg) + 0.2;
      else if (tg.pos) {
        const dx = tg.pos.x - u.pos.x, dz = tg.pos.z - u.pos.z;
        const along = dx * Math.sin(u.heading) + dz * Math.cos(u.heading), lat = Math.abs(dx * Math.cos(u.heading) - dz * Math.sin(u.heading));
        if (along > 0.3 && lat < 1.3) dT = along;
      }
    }
    const reach0 = 0.18 + tip;
    // 中段の構え：穂先は相手の喉を向く（相手が馬上なら胸、自分が馬上なら徒歩の相手の胸へ見下ろす）。槍衾・後ろの段の形はそのまま
    if (engaged && dT < 99 && tg.pos && !tg.isStruct && rx === -0.06) {
      const hy = u.pos.y + (u.mounted ? RIDE.y + 0.9 : 1.08), ty = tg.pos.y + (tg.mounted ? RIDE.y + 1.2 : u.mounted ? 1.2 : 1.42);
      rx = Math.max(-0.35, Math.min(0.45, -Math.atan2(ty - hy, Math.max(1.2, dT))));
    }
    const rxAim = rx;   // 穂先を上げる前の狙い（近すぎて上げた槍は、突く時にここへ突き下ろす）
    if (engaged && dT < 99) {
      // 構えた穂先は相手の 0.55m 手前。近すぎれば、まず柄を手の中で繰り込み（石突を後ろへ長く余らせる）、それでも余る分だけ穂先を上げる
      const over = reach0 - (dT - 0.55);
      if (over > 0) {
        slide = -Math.min(1.4, over);
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
      const out = thrustOut(p, sw.dur);
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
      const end = -Math.atan2(0.55, Math.max(1, (sw.d || dT) - 0.1));   // 柄が相手の頭の高さを打つ
      const hi = -1.1;
      // 打ち下ろした後は、跳ね返りを受けて中くらいの速さで中段へ構え直す
      const r = clamp01((sw.t - sw.dur) / 0.3), back = r * r * (3 - 2 * r);
      rx = p < 1 ? hi + (end - hi) * p * p : end + Math.min(0.5, (sw.t - sw.dur * sw.at) * 0.6) * (sw.res === 'miss' ? 1 : 0.2);
      if (p >= 1) rx = rx * (1 - back) + rxK * back;
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
    // 右手の握りは体の右にあるので、穂先を相手の真ん中へ少し内へ向ける
    if (engaged && dT < 99 && !u.mounted) ry -= Math.atan2(0.28, Math.max(1, dT));
    // 構えたまま出した自分の技（叩き下ろし・払い）は、振り終えるまで構えの形で上書きしない（刀の受けと同じ）
    if ((u.guard || u.guardFlash > 0 || u.guarding > 0) && !(u.isPlayer && (u.pAtk || (sw && sw.t < sw.dur + 0.2)))) { rx = -0.9; ry = -0.25; }
    // 騎馬を受け止めた槍衾の者（checkYari）：石突を地に着け、穂先を馬の胸へ斜めに上げ、柄を手元へ引き寄せて踏ん張る
    if (u.planted > this.time && !u.isPlayer) { const k = Math.min(1, (u.planted - this.time) / 0.3); rx = rx * (1 - k) - 0.42 * k; ry = 0; ext = -0.25 * k; slide = Math.min(slide, -0.35 * k); }
    if (u.cheer > 0) { rx = -1.35; ext = 0.1 + Math.abs(Math.sin(this.time * 6)) * 0.15; }
    // 崩れた時は穂先が下がる
    if (u.hit && u.hit.kind !== 'flinch') rx += 0.12 * Math.sin(Math.min(1, u.hit.t / u.hit.dur) * Math.PI);
    // 士気が落ちると、槍先が揃わず揺れる
    const gm = g ? g.morale : 100;
    if (gm < 40 && !u.isPlayer) rx += Math.sin(this.time * 1.7 + u.id * 2.3) * (40 - gm) * 0.012;
    // 崩れかけ（士気 32 未満）の隊は、構えていない者から槍先が下がる（腕に力が入らない）
    if (gm < 32 && !u.isPlayer && !engaged && !u.fleeing) rx += (32 - gm) * 0.012;
    // 待つ間の持ち替え・手入れ（idleFx）
    if (u.idl && u.idl.rx && !u.atk && !u.swing) rx += u.idl.rx;
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
    if (w) flexSpear(w, dt, u.camD < 26, Math.cos(s.rx));
  },

  // 打刀：構え（中段）・袈裟（右上から左下）・逆袈裟（左下から右上）・横に薙ぐ・突き・受け（刃を横にして受ける）
  poseSword(u, dt, engaged) {
    const h = u.hand, oy = u.mounted ? RIDE.y : 0;
    // [x, y, z, 上下, 左右, 刃の向き]
    // 構えは人ごとに：中段が多く、八相（右肩の上に立てる）・上段も混ぜる
    const C = u.isPlayer ? SW_POSE.chudan : [SW_POSE.chudan, SW_POSE.chudan, SW_HASSO, SW_JODAN][u.id % 4];
    let P = engaged ? C : SW_POSE.sage;
    const a = u.atk && !u.atk.ranged ? u.atk : u.pAtk, sw = u.swing;
    // 馬上の斬りは、すれ違う徒歩の相手へ右の脇へ斬り下ろす（袈裟・逆袈裟・横はどれも馬の右の低い所へ）
    const K = (k) => (u.mounted && (k === 'kesa' || k === 'gyaku' || k === 'yoko') ? 'uma' : k);
    if (a && SW_POSE[K(a.kind) + '0']) {
      // 溜め：ゆっくり振りかぶり、振りかぶり切った所で一瞬ためる。
      //   前の太刀の残心・戻りの途中から振りかぶる時は、構え（中段）へ戻らず、今の刀の所から次の振りかぶりへ流れる（切り返し）
      const k0 = Math.min(1, 1 - Math.max(0, a.t) / (a.dur || u.windup)), k = k0 * k0 * (3 - 2 * k0);
      if (!u.swFrom || u.swAk !== a.kind || k0 < (u.swK0 ?? 1) - 0.02) { u.swFrom = (u.swp || C).slice(); u.swAk = a.kind; }
      u.swK0 = k0;
      P = lerpPose(u.swFrom, SW_POSE[K(a.kind) + '0'], k);
    } else if (sw && SW_POSE[K(sw.kind) + '0'] && sw.t < sw.dur + 0.3) {
      // 振り：振りかぶりから加速して一気に斬り抜き（出の 0.85 で振り切る）、当たった所で止まる（受けられれば途中で弾かれ、甲冑なら浅く止まる）
      const p = Math.min(1, sw.t / (sw.dur * 0.85));
      let q = p * p * (3.4 - 2.4 * p);
      const stop = sw.res === 'block' ? 0.45 : sw.res === 'armor' ? 0.65 : 1;
      q = Math.min(q, stop);
      const kd = K(sw.kind);
      P = lerpPose(SW_POSE[kd + '0'], SW_POSE[kd + '1'], q);
      // 刀は肩を中心に弧を描いて振られる：途中では手が体の前へ張り出す（二つの形をまっすぐ結ぶと、手が胸に寄って縮こまる）
      const arc = Math.sin(Math.min(1, q) * Math.PI);
      P[2] += arc * 0.24; P[1] += arc * 0.05;
      // 残心：振り抜いた形のまま一呼吸とどめ（0.08 秒）、中くらいの速さで構えへ戻る
      if (sw.t > sw.dur) { const r = clamp01((sw.t - sw.dur - 0.08) / 0.22); P = lerpPose(P, C, r * r * (3 - 2 * r)); }
    } else if (u.strikeT > 0 && u.isPlayer) {
      P = lerpPose(SW_POSE.kesa0, SW_POSE.kesa1, 1 - u.strikeT / 0.2);
    }
    if (!a) u.swFrom = null;
    if (u.guard || u.guardFlash > 0 || u.guarding > 0) P = SW_POSE.uke;
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
    else if (u.reload && (u.isPlayer || u.moving < 0.5)) {
      let f = u.reload.t / u.reload.dur;
      for (const [nm, len] of RELOAD) { if (f < len) { ph = nm; k = f / len; break; } f -= len; }
    }
    // 号令への「応」・勝鬨：鉄砲を高く掲げる
    if (u.cheer > 0 && !a) { ph = 'cheer'; k = 0; }
    u.gunPh = ph; u.gunK = k;
    const P = ph === 'cheer' ? [0.3, 1.62 + Math.abs(Math.sin(this.time * 6)) * 0.08, 0.12, -1.35] : GUN_POSE[ph] || GUN_POSE.ready;
    let [x, y, z, rx] = P;
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
    // 左手：込め直しでは筒先（火薬・弾・込め矢）、火皿（口薬・火蓋）へ
    const bx = Math.sin(s[3]), bc = Math.cos(s[3]);
    const muz = [s[0], s[1] + oy - bx * GUN_MUZ + 0.03, s[2] + bc * GUN_MUZ];
    if (ph === 'powder' || ph === 'ball' || ph === 'ram') u.lh = muz;
    else if (ph === 'prime' || ph === 'kiri' || ph === 'match') u.lh = [s[0] + 0.03, s[1] + oy - bx * 0.06 + 0.05, s[2] + bc * 0.06];
    // 込め矢：台の下から抜き、筒先から入れて三度ほど突き、戻す
    const R = w && w.userData.ram;
    if (R) {
      if (ph === 'ram') {
        if (k < 0.15) { const q = k / 0.15; R.position.set(0, GUN_RAM[0] + (GUN_BORE - GUN_RAM[0]) * q, GUN_RAM[1] + (1.05 - GUN_RAM[1]) * q); }
        else if (k < 0.85) { const q = (k - 0.15) / 0.7, depth = 0.5 + 0.32 * Math.abs(Math.sin(q * Math.PI * 3)); R.position.set(0, GUN_BORE, GUN_MUZ + 0.01 - depth); }
        else { const q = (k - 0.85) / 0.15; R.position.set(0, GUN_BORE - (GUN_BORE - GUN_RAM[0]) * q, 1.05 - (1.05 - GUN_RAM[1]) * q); }
      } else R.position.set(0, GUN_RAM[0], GUN_RAM[1]);
      // 骨の入った人が自分の槊杖を出している間は、二本にならないよう隠す
      R.visible = !(u.human && u.human.rod && u.human.rod.visible);
    }
    // 火縄の火（雨では消えがち）
    const E = w && w.userData.ember;
    //   夕暮れと朝は火縄の赤い点が遠くからも見え、鉄砲の隊の居場所が伝わる（遠いほど点を大きくして、画面の上で一つの点に保つ）
    if (E) {
      const tk = this.world && this.world.timeKey, dim = tk === 'dusk' || tk === 'morning';
      E.visible = (this.rain || 0) < 0.5 && u.camD < (dim ? 150 : 40);
      if (E.visible) E.scale.setScalar((0.8 + Math.sin(this.time * 13 + u.id) * 0.2) * (dim ? Math.max(1, u.camD / 12) : 1));
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
    if (ph === 'nock') P = lerpPose(Q.rest, Q.nock, Math.min(1, k * 1.5));
    else if (ph === 'raise') { P = lerpPose(Q.nock, Q.raise, k * (2 - k)); draw = 0.08 * k; }
    else if (ph === 'draw') { const e = k * k * (3 - 2 * k); P = lerpPose(Q.raise, Q.kai, e); draw = 0.08 + 0.92 * e; }
    else if (ph === 'kai') { P = Q.kai.slice(); draw = 1; P[1] += Math.sin(this.time * 9 + u.id) * 0.002; }
    else if (ph === 'zanshin') P = lerpPose(Q.kai, Q.rest, Math.max(0, k - 0.5) * 2);
    else if (u.cheer > 0) { ph = 'cheer'; P = [-0.12, 1.86 + Math.abs(Math.sin(this.time * 6)) * 0.08, 0.2, 0.15, 0]; }   // 号令への「応」・勝鬨：弓を高く掲げる
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

  // 死：膝から力が抜けて崩れる・後ろへ倒れる・前へ倒れる・横へ倒れる・馬から落ちる
  animDeath(u, dt, near) {
    const m = u.mesh, D = u.death;
    // 最後のコマは DEATH_END ちょうどの姿勢にして、その後は動かさない（humans.js も同じ時に骨を固める）
    D.t = Math.min(DEATH_END, D.t + dt); u.deadT += dt;
    const t = D.t;
    const ease = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
    const fall = (x) => { x = Math.min(1, Math.max(0, x)); return x * x; };   // 重さで倒れる（だんだん速く）
    const lie = Math.PI / 2 * 0.96;
    let rx = 0, rz = 0, dy = 0, bodyY = 0, bodyX = 0, kneel = 0, ox = 0, oz = 0, b = 0;
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
    } else if (D.kind === 'side') {
      const a = ease(t / 0.25); b = fall((t - 0.15) / 0.6);
      kneel = 0.5 * a * (1 - b); bodyY = -0.25 * a * (1 - b); rz = -D.side * lie * b;
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
    const gx = u.pos.x + ox, gz = u.pos.z + oz, gy = ox || oz ? W.heightAt(gx, gz) : u.pos.y;
    if (lk > 0.01) {
      _dUp.set(0, 1, 0).applyQuaternion(m.quaternion);
      const cx = gx + _dUp.x * 0.85, cz = gz + _dUp.z * 0.85, e = 0.6;
      _dN.set(W.heightAt(cx - e, cz) - W.heightAt(cx + e, cz), 2 * e, W.heightAt(cx, cz - e) - W.heightAt(cx, cz + e)).normalize();
      _dQ.setFromUnitVectors(_dUp.set(0, 1, 0), _dN);
      _dQ.slerp(_dI, 1 - lk);
      m.quaternion.premultiply(_dQ);
    }
    // 寝た体が地面に沈まないよう、倒れた分だけ持ち上げる（地面の向きに）
    const lift = 0.11 * lk;
    m.position.set(gx + (lk > 0.01 ? _dN.x * lift : 0), gy + dy + (lk > 0.01 ? _dN.y * lift : lift), gz + (lk > 0.01 ? _dN.z * lift : 0));
    u.body.position.y = bodyY; u.body.rotation.set(bodyX, 0, 0);
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
      u.legL.rotation.x = -1.3 * kneel - (0.3 + 0.6 * r) * b; u.legL.rotation.z = sideLie ? 0 : (0.1 + 0.25 * (1 - r)) * b; u.legR.rotation.z = sideLie ? 0 : -(0.08 + 0.2 * r) * b;
      if (u.shinL) u.shinL.rotation.x = 2.0 * kneel + (0.5 + 0.9 * r) * b;
      if (sideLie) { aimArm(u.armR, 0.22, 1.37 - 0.55, 0.32 * b); aimArm(u.armL, -0.22, 1.37 - 0.5, 0.38 * b); }
      else { aimArm(u.armR, 0.27 + (0.3 + 0.2 * r) * b, 1.37 - 0.5 + 0.35 * r * b, 0.15 * b); aimArm(u.armL, -0.27 - (0.25 + 0.25 * (1 - r)) * b, 1.37 - 0.5 + 0.4 * (1 - r) * b, 0.2 * r * b); }
    }
    // 倒れた体の下に、ゆっくり広がる血だまり
    // 陣笠は倒れた拍子に頭から落ち、頭の先の地面に転がる（付けたままだと寝た体の笠の縁が地面にめり込む）
    if (t > 0.9 && !D.hat) { D.hat = true; this.dropHat(u); if (u.flag) { u.flag.material = muddyFlag(u.flagMat || u.flag.material); } }   // 地に落ちた指物は泥で汚れて沈んだ色に
    if (t > 0.9 && !D.pool) {
      D.pool = true;
      const f = D.kind === 'side' || (D.kind === 'crumple' && !D.fwd) || D.kind === 'unhorse' ? 0 : rx > 0 ? 0.85 : -0.85;
      const sd = f ? 0 : D.side * 0.85;
      const hh = u.heading + tw;
      const px = m.position.x + Math.sin(hh) * f + Math.cos(hh) * sd, pz = m.position.z + Math.cos(hh) * f - Math.sin(hh) * sd;
      u.stain = this.stain(px, pz, 0.6 + Math.random() * 0.3, 150, 1);
    }
  }
};
