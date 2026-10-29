// Player の手のうち「カメラ（後ろからの追い・倒れた時・目の位置）」（player.js から分けた。中身は同じ。Player.prototype へ戻すのは player.js の終わり）
import { VIEW } from './viewport.js';
import * as THREE from 'three';
import { angleDiff, RIDE } from './units.js';
import { POST, edgeDark, speedStreaks, filmGrain } from './post.js';
import { setScene } from './audio.js';
import { S, reduceMotion } from './settings.js';
import { isTouch } from './touch.js';
import { groundAt } from './floors.js';
import { NAKA, nakaCamClamp } from './naka.js';
import { decisiveCameraReset, decisiveCameraApply } from './decisive_camera.js';
import { avoidCameraBodies } from './render_camera.js';
import { collectMeleeDust, countCameraAlly, collectCameraFoe, _cT, _cD, _cR, _cW, _cQ, _cLk, _cTmp, _cE, _cFr, _cAh, _WORLD_UP, _cLow, _cUP, CORNERS, cameraGroundAt, terrainSideClear, terrainCameraClamp } from './player.js';

export class PlayerCamera {

  updateCamera(dt, camera) {
    this.camCameraFrame = (this.camCameraFrame || 0) + 1;
    this.cameraRayFrame();
    this.updateCameraTarget(dt);
    // 接敵した武将への一瞬の振り向きだけ残し、手動で選んだ距離を保つ。
    if (!this.cine?.encounter) this.cine = null;
    this.camShot = null; this.shotZoom = 0; this.introT = 0;
    decisiveCameraReset(this.rt, camera);
    const u = this.u;
    if (!u.alive && this.rt.result?.down) { this.updateDownCamera(dt, camera); return; }
    this.downCamReady = false;
    // 乱戦の土煙：近くで大勢が斬り合っているほど、足もとから土煙が立つ（乾いた日だけ。半秒おきに数える）
    this.meleeDustT = (this.meleeDustT || 0) - dt;
    if (this.meleeDustT <= 0 && this.rt.world && this.rt.army && this.rt.army.forNear) {
      this.meleeDustT = 0.5;
      const W = this.rt.world;
      if (!(W.rainLevel > 0.4 || (W.wetness || 0) > 0.5)) {
        const busy = this.dustBusy || (this.dustBusy = []); busy.length = 0;
        this.rt.army.forNear(u.pos.x, u.pos.z, 26, collectMeleeDust, this);
        const n = Math.min(3, Math.floor(busy.length / 5));
        for (let i = 0; i < n; i++) { const o = busy[Math.floor(Math.random() * busy.length)]; W.dustCloud(o.pos.x, o.pos.z, o.mounted); }
      }
      // 倒れた兵のまわりは、もみ合った足で踏み荒らされ、草が倒れて土（雨なら泥）が出る（一人一度だけ）
      if (false) for (const o of this.rt.army.units) {   // 10/24：倒れた所の踏み荒らしは作らない
        if (o.alive || o._trod || o.isStruct || !o.pos) continue;
        o._trod = true;
        W.stampWear(o.pos.x, o.pos.z, 1.9, 55);
        W.stampWear(o.pos.x + (Math.random() - 0.5) * 2, o.pos.z + (Math.random() - 0.5) * 2, 1.2, 40);
      }
    }
    edgeDark(this.rt.game && this.rt.game.paused ? 0 : dt);
    filmGrain();
    // 襲歩の流れ：駆けるほど画面の外寄りに風と土埃の筋（一人称・動きを減らす設定・画面の揺れを切った時は出さない）
    { const hs = this.mounted && u.alive ? Math.abs(this.hspd || 0) : 0, q = Math.max(0, Math.min(1, (hs - 7.5) / 4));
      POST.speed = reduceMotion() || !S.shake || (this.fpK || 0) > 0.5 || (this.rt.game && this.rt.game.paused) ? 0 : (POST.speed || 0) + (q * q - (POST.speed || 0)) * Math.min(1, dt * 3);
      POST.speedPh = this.gaitPh || 0; speedStreaks(); }
    // 駆ける間は左の札を薄く（深手・号令を開いている時は薄くしない）
    { const gal = this.mounted && u.alive && Math.abs(this.hspd || 0) > 8 && u.hp > u.maxHp * 0.35 && !this.cmdOpen && !this.radial, hud = this.rt.hud && this.rt.hud.root;
      if (hud && (this.galHud === undefined || gal !== this.galHud)) { this.galHud = gal; hud.classList.toggle('gallop', gal); } }
    this.senseWar(dt);
    // 世界の側（手前の雨筋など）が視点の場所を知れるように
    if (this.rt.world) {
      this.rt.world.camRef = camera;
      // 夏の戦か（battle.js が日付から決める）を世界へ渡す（夏の昼の光・陽炎）
      if (this.rt.isSummer != null && this.rt.world.setSummer) this.rt.world.setSummer(this.rt.isSummer);
      // 敵方（敵の鬨の声の言葉づかいを変える）
      if (!this.foeSet) { this.foeSet = true; const sd = this.rt.def && this.rt.def.sides; setScene({ foe: (sd && sd.b && sd.b.mon) || '' }); }
      // 一人称で雨の中にいる時だけ、画面の端に雨粒（post.js。設定の rainScreen で切れる）
      POST.drops = (this.fpK || 0) > 0.7 ? Math.min(1, (this.rt.world.rainLevel || 0) * 1.3) : 0;
    }
    // 火縄銃・弓を構えた直後は、筒先・弓手の重さで狙いがゆっくり揺れ、1 秒ほどで落ち着く（息の小さな揺れは残る）
    {
      const ranged = this.aiming && (this.weapon === 'gun' || this.weapon === 'bow') && !reduceMotion();
      const amp = ranged ? 0.014 * Math.exp(-this.aimHoldT * 2.4) + 0.0022 : 0;
      const tt = (this.swayClock = (this.swayClock || 0) + dt);
      const sy = Math.sin(tt * 1.3) * amp + Math.sin(tt * 2.9 + 1) * amp * 0.4, sp = Math.sin(tt * 1.7 + 2) * amp * 0.8;
      this.yaw += sy - (this.swayY || 0); this.pitch += sp - (this.swayP || 0);
      this.swayY = sy; this.swayP = sp;
    }
    // 馬上は目の高さが上がり、少し遠くから見る
    const bodySc = (u.mesh && u.mesh.scale.y) || 1;
    // 徒歩は肩の少し下を狙い、低めの肩越しに（地に足が着いた目線。馬上は高く）
    // 足もとの段差・小石で目の高さが跳ねないよう、カメラの見る高さだけなめらかに追う（上りは速く、下りは少しゆっくり）
    const tyRaw = u.pos.y + (this.mounted ? 1.7 + RIDE.y : 1.58) * bodySc;
    if (this.camTY == null || Math.abs(tyRaw - this.camTY) > 3 || dt >= 0.5) this.camTY = tyRaw;
    else this.camTY += (tyRaw - this.camTY) * Math.min(1, dt * (tyRaw > this.camTY ? 14 : 8));
    const target = _cT.set(u.pos.x, this.camTY, u.pos.z);
    const running = Math.hypot(u.vel.x, u.vel.z) > 5;
    const fight = this.inCombatT > 0 || this.lock;
    const hsp = Math.abs(this.hspd || 0), gallop = this.mounted && hsp > 9;
    // 馬上の寄り：乗ると低く寄り、乗り手の背と馬の首が手前に大きく入る（駆けるほど低く近く）。戦う・狙う・号令・味方に囲まれた時は引いて周りを見せる
    {
      const busy = fight || this.aiming || this.lock || this.cmdOpen || this.radial || this.overHold;
      const g0 = Math.max(0, Math.min(1, (hsp - 4) / 6));
      const goal = this.mounted && u.alive && !busy ? (0.45 + 0.55 * g0 * g0 * (3 - 2 * g0)) * (1 - Math.min(1, (this.crowd || 0) / 8)) : 0;
      this.rideClose = (this.rideClose || 0) + (goal - (this.rideClose || 0)) * Math.min(1, dt * (goal > (this.rideClose || 0) ? 1.2 : 2.5));
    }
    // 屋外も近い肩越しで見る。携帯とパソコンで同じ間合いを保つ。
    const fieldView = !this.rt.def.town && !this.rt.def.dojo && !NAKA.cur && !this.aiming && !this.fpWanted();
    const selfFrame = fieldView && u.alive && !this.rt.over && !this.overHold && !this.cine && !this.camShot && !this.rt.game?.photo;
    this.fieldViewK = (this.fieldViewK || 0) + ((fieldView ? 1 : 0) - (this.fieldViewK || 0)) * Math.min(1, dt * 4);
    const viewK = this.fieldViewK;
    const rc = 0;
    // 近くの敵は間合いの調整に数える。視点の向きは変えない。
    this.frameT = (this.frameT || 0) - dt;
    if (this.frameT <= 0) {
      this.frameT = 0.25;
      const f = this.cameraFoeWork || (this.cameraFoeWork = { sx: 0, sz: 0, n: 0, near: 99, rearYaw: null, rearDist: 7 });
      f.sx = f.sz = f.n = 0; f.near = 99; f.rearYaw = null; f.rearDist = 7;
      f.focusYaw = null; f.focusDist = 7;
      if (u.alive && this.rt.army.forNear) this.rt.army.forNear(u.pos.x, u.pos.z, 7, collectCameraFoe, this);
      const { sx, sz, n, near, rearYaw } = f;
      this.foeN = n; this.foeNear = near;
      this.foeYaw = n ? Math.atan2(sx / n, sz / n) : null;
      this.rearFoeYaw = rearYaw;
      this.closeFoeYaw = f.focusYaw;
    }
    // 護衛中は近い守る人も画面へ収める。手動の見回し・照準・一人称を優先する。
    const escortPerson = this.rt.def.escortGuideTarget?.(this.rt);
    const guardPerson = escortPerson?.alive ? escortPerson : this.rt.def.guardTarget?.(this.rt);
    const guardDistance = guardPerson?.alive ? Math.hypot(guardPerson.pos.x - u.pos.x, guardPerson.pos.z - u.pos.z) : Infinity;
    const steady = !!this.rt.def.steadyMeleeCamera;
    const guardFrame = !steady && S.autoCam && guardDistance < (escortPerson?.alive ? 36 : 10) && !this.aiming && !this.lock && !this.cine &&
      !this.camShot && !this.overHold && !this.rt.over && !this.rt.game?.photo && !NAKA.cur && !this.fpWanted() &&
      (this.lookIdle || 0) > .7 && !this.rt.army.wallBetween(u.pos, u.team, guardPerson.pos);
    this.guardFrameK = (this.guardFrameK || 0) + ((guardFrame ? 1 : 0) - (this.guardFrameK || 0)) * Math.min(1, dt * (reduceMotion() ? 30 : 3));
    let offWant = 0;
    // 手で見回していない時は、近い相手を肩越しの中央へ穏やかに収める。
    if (!steady && selfFrame && !this.rt.def.autoTargetCamera && S.autoCam && !reduceMotion() && this.closeFoeYaw != null &&
        !this.lock && !this.aiming && !this.rt.choice && (this.lookIdle || 0) > .8) {
      const focus = this.rt.army.missionMarkedEnemy;
      const focusNear = focus?.alive && Math.hypot(focus.pos.x - u.pos.x, focus.pos.z - u.pos.z) < 7;
      const foeYaw = focusNear ? Math.atan2(focus.pos.x - u.pos.x, focus.pos.z - u.pos.z) : this.closeFoeYaw;
      const turn = angleDiff(this.yaw, foeYaw);
      offWant = focusNear ? turn : Math.max(-.65, Math.min(.65, turn));
    }
    if (guardFrame && guardDistance > .8) offWant = angleDiff(this.yaw, Math.atan2(guardPerson.pos.x - u.pos.x, guardPerson.pos.z - u.pos.z));
    // 戸口のある狭い戦場では、壁越しの集団の平均でなく通れる側の一人を中央へ収める。
    const closeFightFrame = !steady && S.autoCam && this.rt.def.routeDestinationSight && this.closeFoeYaw != null &&
      !this.lock && !this.aiming && !this.cine && !this.camShot && !this.overHold &&
      !this.rt.over && !this.rt.choice && !this.rt.game?.photo && !this.fpWanted() && (this.lookIdle || 0) > .7;
    // 道案内中は遠い目的地でなく、次に通る戸口や曲がり角を画面へ収める。
    // 手で見回した直後や戦っている間は、本人の視点を優先する。
    const route = this.rt.missionGuide;
    const escape = this.rt.dodgeGuide?.valid && !this.rt.dodgeGuide.arrived ? this.rt.dodgeGuide.pos : null;
    // まだ着いていない味方の旗も道案内の対象にし、画面端の矢印だけにしない。
    const waitingPlace = route?.marker && /^(wait|guard)$/.test(route.marker.guideArea);
    const followAlly = this.rt.def.missionFollowAlly?.(this.rt);
    const flagTravel = isTouch && VIEW.h <= 500 && (route?.marker?.guideFlag || waitingPlace) && route.pos &&
      !this.rt.def.footFlagGuides && Math.hypot(route.pos.x - u.pos.x, route.pos.z - u.pos.z) > (route.marker.guideRadius || 8);
    const routeFrame = !steady && !this.cameraTarget && S.autoCam && !S.reduceGuidance && !reduceMotion() && (escape || route?.marker &&
      (followAlly || flagTravel || this.rt.def.routeGuidePriority?.(this.rt) || route.marker.entrance || route.marker.guideArea === 'move')) &&
      !this.lock && !this.aiming && !this.cine && !this.camShot && !this.overHold &&
      !this.rt.over && !this.rt.choice && !this.rt.game?.photo && !this.fpWanted() &&
      (this.lookIdle || 0) > 2.5 && (escape || !closeFightFrame && (!fight || this.foeYaw == null)) && !guardFrame;
    const routeGoal = escape || route?.pos;
    let routePoint = routeFrame ? this.rt.def.routeSignPoint?.(this.rt, routeGoal) ||
      this.rt.world.def.guideWay?.(u, routeGoal) || routeGoal : null;
    if (routeFrame && followAlly && !escape) {
      // 布や足元でなく、追う本人とその先の道を見る。入れ物は使い回す。
      routePoint = this.flagCameraPoint || (this.flagCameraPoint = new THREE.Vector3());
      routePoint.set(followAlly.pos.x, followAlly.pos.y + 1.6, followAlly.pos.z);
      const distance = Math.max(1, Math.hypot(routePoint.x - u.pos.x, routePoint.z - u.pos.z));
      const pitch = Math.max(-.15, Math.min(.15, Math.atan2(routePoint.y - target.y, distance)));
      this.pitch += (pitch - this.pitch) * Math.min(1, dt * 2.4);
    } else if (routeFrame && flagTravel && !escape) {
      const hud = this.rt.hud;
      // 画面外でも選んだ実旗を保つ。布の中心を見せ、足元だけへ向けない。
      hud.goalFlagBounds(this.rt, route.marker, route.pos);
      const flag = hud.flagMarker === route.marker ? hud.goalFlag : null;
      if (!waitingPlace && flag?.visible && flag.geometry?.boundingBox) {
        const box = flag.geometry.boundingBox;
        routePoint = this.flagCameraPoint || (this.flagCameraPoint = new THREE.Vector3());
        routePoint.set((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2,
          (box.min.z + box.max.z) / 2).applyMatrix4(flag.matrixWorld);
      } else {
        routePoint = this.flagCameraPoint || (this.flagCameraPoint = new THREE.Vector3());
        routePoint.set(route.pos.x, this.rt.world.heightAt(route.pos.x, route.pos.z) + .1, route.pos.z);
      }
      // 持ち場は実旗の布でなく地面を収め、行き先の印を画面内に見せる。
      const distance = Math.hypot(routePoint.x - u.pos.x, routePoint.z - u.pos.z);
      const pitch = Math.max(-.6, Math.min(.45, Math.atan2(routePoint.y - target.y, distance)));
      this.pitch += (pitch - this.pitch) * Math.min(1, dt * 2.4);
    }
    if (routePoint && Math.hypot(routePoint.x - u.pos.x, routePoint.z - u.pos.z) > 1.2) {
      offWant = angleDiff(this.yaw, Math.atan2(routePoint.x - u.pos.x, routePoint.z - u.pos.z));
    }
    const targetFrame = !steady && selfFrame && S.autoCam && !reduceMotion() && this.cameraTarget &&
      !this.aiming && !this.lock && !this.rt.choice && (this.lookIdle || 0) > .7;
    if (targetFrame) {
      const p = this.cameraTarget.pos, distance = Math.hypot(p.x - u.pos.x, p.z - u.pos.z);
      offWant = angleDiff(this.yaw, Math.atan2(p.x - u.pos.x, p.z - u.pos.z));
      const pitch = Math.max(-.25, Math.min(.25, Math.atan2(p.y + 1.1 - target.y, Math.max(1, distance))));
      this.pitch += Math.max(-dt * .2, Math.min(dt * .2, (pitch - this.pitch) * dt));
    }
    // 狙う・狙い定め・一人称では狙いと画面がずれないよう、すぐ戻す
    const cameraTurn = angleDiff(this.camYawOff || 0, offWant) * Math.min(1, dt * (this.lookIdle < 0.7 || this.aiming || this.lock || this.fpK > 0.3 ? 12 : 1.4));
    this.camYawOff = (this.camYawOff || 0) + (this.rt.def.autoTargetCamera ? Math.max(-dt * .45, Math.min(dt * .45, cameraTurn)) : cameraTurn);
    if (steady) this.camYawOff = 0;
    const cyaw = this.yaw + this.camYawOff;
    this.frameK = (this.frameK || 0) + (((this.foeNear || 99) < 4.5 && !this.mounted && !reduceMotion() ? 1 : 0) - (this.frameK || 0)) * Math.min(1, dt * 2);
    // 横持ちの肩越しだけ見下ろしを抑え、地面で画面が埋まるのを防ぐ。
    const landscapeFrame = selfFrame && VIEW.h <= 500 && VIEW.w > VIEW.h;
    // 勝った後は空を見上げない。自分と味方を肩越しに映す（テストプレイの声 10/24「空を見上げて終わった」）。
    const winView = this.rt.over && this.rt.tracker?.main === true || this.rt.vicHoldUntil > this.rt.t;
    if (winView && !this.camShot && !this.cine) { this.pitch = Math.max(-.3, Math.min(.06, this.pitch)); this.camYawOff *= 1 - Math.min(1, dt * 3); }
    const viewPitch = landscapeFrame ? Math.max(-.08, Math.min(.25, this.pitch)) : this.pitch;
    const cp = Math.cos(viewPitch);
    const dir = _cD.set(Math.sin(cyaw) * cp, Math.sin(viewPitch), Math.cos(cyaw) * cp);
    const right = _cR.set(-Math.cos(cyaw), 0, Math.sin(cyaw));
    // 止まっている時間を覚える。視点の距離は変えない。
    const still = Math.hypot(u.vel.x, u.vel.z) < 0.3 && !fight && !this.mounted;
    this.stillT = still ? (this.stillT || 0) + dt : 0;
    this.stillK = (this.stillK || 0) + ((this.stillT > 1.5 && !reduceMotion() ? 1 : 0) - (this.stillK || 0)) * Math.min(1, dt * 0.7);
    // 戦闘・停止・煙で自動的に寄せず、同じ距離を保つ。
    const base = this.cmdOpen || this.radial ? 7.5 : 4.0;
    // 一人称への寄り（0.3秒ほど。動きを減らす設定ならすぐ）
    const fpGoal = this.fpWanted() && !this.overHold ? 1 : 0;
    if (reduceMotion() || dt >= 0.5) this.fpK = fpGoal;
    else this.fpK += Math.sign(fpGoal - this.fpK) * Math.min(Math.abs(fpGoal - this.fpK), dt / 0.3);
    const e = this.fpK * this.fpK * (3 - 2 * this.fpK);
    // 体の側（humans.js）へ一人称の寄り具合を渡す（手と武器を目の下へ寄せ、柄を握らせる）
    u.fpk = u.alive ? e : 0;
    // 一人称では足もとの間合いの輪を出さない（目の真下に大きな白い輪が映るので）
    if (e > 0.5) this.reachT = 0;
    // 走ると視野が少し広がる。一人称も設定の狭い視野を保つ
    // 火縄銃・弓で構えて狙う時は視野を狭める（一人称は照門をのぞく）
    // 打たれた瞬間は視野が一瞬すぼまる（fovKick。0.3秒ほどで戻る）
    this.fovKick = (this.fovKick || 0) * Math.exp(-dt * 7);
    // 馬上は速さにつれて視野がなめらかに広がる（速歩で少し、襲歩で大きく）。蹴り出した瞬間はもう一息広がる。動きを減らす設定では三割だけ
    const rideGoal = this.mounted ? Math.pow(Math.max(0, Math.min(1, (hsp - 2.5) / 9)), 1.4) * 11 + Math.max(0, Math.min(2.5, (this.surge || 0) * 0.6)) : 0;
    this.gallopK = (this.gallopK || 0) + (rideGoal * (reduceMotion() ? 0.3 : 1) - (this.gallopK || 0)) * Math.min(1, dt * 2.2);
    // 携帯の横では近い兵の姿を大きく保つ。兵数や当たり判定は変えない。
    const fieldFov = isTouch && VIEW.h <= 500 && !this.rt.def.town && !this.rt.def.dojo ? 43 : 54;   // やや望遠（写真のように奥が詰まって見える）
    const fovWant = Math.min(fieldFov, S.fov) + e * 2;
    if (Math.abs(camera.fov - fovWant) > 0.05) { camera.fov += (fovWant - camera.fov) * Math.min(1, dt * (Math.abs(this.fovKick) > 0.3 ? 18 : 4)); camera.updateProjectionMatrix(); }
    decisiveCameraApply(this.rt, camera);
    // 目の前の手と武器が切れないよう、一人称では手前の切り口を近づける
    const nearWant = e > 0.5 ? 0.05 : 0.1;
    if (camera.near !== nearWant) { camera.near = nearWant; camera.updateProjectionMatrix(); }
    // 開戦の引き
    if (this.introT > 0) this.introT -= dt;
    const pr = this.introT > 0 && !reduceMotion() ? Math.min(1, this.introT / 3.4) : 0;
    const pull = selfFrame ? 0 : pr * pr * (3 - 2 * pr);
    // 大事な場面では、その方へ視点を向ける
    if (reduceMotion()) { this.cine = null; this.camShot = null; this.shotZoom = 0; this.camPush = null; this.camLean = null; }
    if (this.cine && (this.lookIdle < 0.2 || this.aiming || this.lock || this.inCombatT > 0 && !this.cine.encounter)) this.cine = null;
    if (this.cine) {
      this.cine.t -= dt;
      const want = Math.atan2(this.cine.x - u.pos.x, this.cine.z - u.pos.z);
      this.yaw += angleDiff(this.yaw, want) * Math.min(1, dt * 3);
      // 高い所（天守の上など）を見せる時は、見上げる角度へも寄せる
      if (this.cine.up != null) {
        const W0 = this.rt.world, d = Math.max(4, Math.hypot(this.cine.x - u.pos.x, this.cine.z - u.pos.z));
        const lift = W0.heightAt(this.cine.x, this.cine.z) + this.cine.up - (u.pos.y + 1.6);
        this.pitch += (Math.max(-0.5, Math.min(0.55, Math.atan2(lift, d) + 0.12)) - this.pitch) * Math.min(1, dt * 3);
      }
      if (this.cine.t <= 0) this.cine = null;
    }
    // 行軍の間は少し引いて、斜め後ろから隊列の長さを見せる。勝った後は 3 秒かけてゆっくり上へ引き、旗の林と戦の跡を見せる
    const rt0 = this.rt;
    this.marchK = reduceMotion() ? 0 : (this.marchK || 0) + ((rt0.phase === 'march' && !(this.inCombatT > 0) ? 1 : 0) - (this.marchK || 0)) * Math.min(1, dt * 0.8);
    if (rt0.over && rt0.result && !rt0.result.down && rt0.tracker && rt0.tracker.main === true && !reduceMotion() && !this.cine?.up && !rt0.def.noWinCrane) this.winK = Math.min(1, (this.winK || 0) + dt / 3); else this.winK = 0;
    const wk = this.winK * this.winK * (3 - 2 * this.winK);
    // 高い所を見せる場面（cine.up）：少し引いて上げ、見上げる物を画面の真ん中へ入れる
    this.cineK = reduceMotion() ? 0 : (this.cineK || 0) + ((this.cine?.up ? 1 : 0) - (this.cineK || 0)) * Math.min(1, dt * 1.5);
    const defeat = rt0.over && (rt0.result?.down || rt0.tracker?.main === false);
    const defeatPull = defeat ? rt0.def.defeatCamPull || 0 : 0;
    const defeatLift = defeat ? rt0.def.defeatCamLift || 0 : 0;
    // 倒れた時も肩越しの向きと距離を保つ。地面へ視線を少し下げる。
    this.downK = !u.alive && !reduceMotion() ? Math.min(1, (this.downK || 0) + dt / 4) : 0;
    const dk = this.downK * this.downK * (3 - 2 * this.downK);
    // 大将の目：足軽 3m・組頭 6m・足軽大将 12m の高さへ上がり、少し引いて前の戦場を見下ろす
    const overH = this.G.rank >= 4 ? 12 : this.G.rank >= 2 ? 6 : 3;
    this.overK = (this.overK || 0) + ((this.overHold ? 1 : 0) - (this.overK || 0)) * Math.min(1, dt * (reduceMotion() ? 30 : 4));
    const ok = this.overK * this.overK * (3 - 2 * this.overK);
    // 視点の遠さの三段（V の短押し・「視点」の釦で回す）
    const range = S.camRange === 'near' ? -0.9 : S.camRange === 'far' ? 2.2 : 0;
    // 硝煙・土煙の中では少し寄る（先が見えない怖さ。煙が晴れれば戻る）
    const W0 = rt0.world, smoke = W0 ? Math.min(1, ((W0.haze && W0.haze.k) || 0) + ((W0.dustVeil && W0.dustVeil.k) || 0) * 0.5) : 0;
    this.smokeK = (this.smokeK || 0) + (smoke - (this.smokeK || 0)) * Math.min(1, dt * 0.8);
    // 騎乗して味方に囲まれている時（鹿垣の段など）は、馬の首・鞍で前が塞がらないよう、もう少し引く
    const mountCrowd = this.mounted ? Math.min(1.1, (this.crowd || 0) / 6) : 0;
    const dist = Math.max(2.2, (base + this.zoom + range + (this.mounted ? 2.8 - rc * 6.4 + mountCrowd * 1.4 : 0)) * 1) + pull * 7 + this.marchK * 0.8 * (1 - rc * 0.85) + wk * 9 + this.cineK * 7 + ok * overH * 0.7 + ((rt0.holdPct || 0) > 0 ? 1.5 : 0) + ((rt0.def && rt0.def.camPull) || 0) + defeatPull;   // 戦ごとの引き（塀・暗い林で前が塞がる戦。B099・B112）   // 長押し（首取りなど）の間は少し引いて周りを見せる
    // 天守・櫓・御殿の中（naka.js）：狭い部屋なので肩越しに寄る
    const inRoom = !!NAKA.cur;
    // 横持ちでも近くの相手がいる間は少し寄せ、本人と敵の姿を読み取りやすくする。
    const closeEnemy = rt0.hud.approachGuideEnemy || rt0.hud.attackGuideEnemy || rt0.hud.defendEnemy || this.lock;
    const closeBattle = this.inCombatT > 0 || closeEnemy?.alive &&
      Math.hypot(closeEnemy.pos.x - u.pos.x, closeEnemy.pos.z - u.pos.z) < 14;
    const landscapePull = !inRoom && !this.aiming && !rt0.def.town && !rt0.def.dojo && VIEW.h <= 500 && VIEW.w > VIEW.h ? 1.2 : 0;
    const fieldDistance = (this.mounted ? 7 : 4.4) + landscapePull;
    // 護衛中は二人の間を見る。肩越しの距離上限で守る人が切れないよう、
    // 視野に収まる距離までだけ引く。兵の位置や当たり判定は変えない。
    const guardK = this.guardFrameK || 0;
    if (guardPerson?.alive && guardK > .001) {
      target.x += (guardPerson.pos.x - u.pos.x) * .4 * guardK;
      target.z += (guardPerson.pos.z - u.pos.z) * .4 * guardK;
    }
    const guardPull = guardFrame ? Math.min(12, 4.8 + guardDistance * .65) : 0;
    const routeNear = routeFrame && (this.rt.def.routeDestinationSight || this.rt.def.singlePassageArrow || route?.marker?.entrance && Math.hypot(route.pos.x - u.pos.x, route.pos.z - u.pos.z) < 8);
    const desiredDist = Math.max(dist, dist + (fieldDistance - dist) * viewK, guardPull);
    // 肩越しの本人を大きく保つ。馬上は首と鞍を越す距離を残す。
    // 遠さの設定と戦ごとの引きを、肩越しの上限にも反映する。
    // 壁・柱の検査はこの後で行い、狭い所を突き抜けない。
    const footLimit = S.camRange === 'near' ? 4.2 : S.camRange === 'far' ? 5.2 : 4.8;
    // 桶狭間・森部の横持ちは本人を引き離さず、生成りの袖と武器の動きを見せる。
    const selfLandscapePull = landscapeFrame ? (rt0.def.missionStyle === 'raid' || rt0.def.missionStyle === 'ford') && !this.mounted ? 0 : 1.2 : 0;
    const distR = selfFrame ? Math.max(2.2, (this.mounted ? 6 : S.camRange === 'near' ? 3.8 : S.camRange === 'far' ? 4.8 : 4.4) + this.zoom + selfLandscapePull) : Math.min(desiredDist + (routeNear ? 0 : landscapePull), Math.max(this.mounted ? 6 : footLimit, guardPull) + landscapePull);
    this.camDist = this.camDist ? this.camDist + (distR - this.camDist) * Math.min(1, dt * (inRoom ? 5 : 3)) : distR;
    this.sideK = (this.sideK ?? 0.85) + ((routeNear || closeFightFrame ? .2 : fight || this.guard ? 0.95 : 0.85) - (this.sideK ?? 0.85)) * Math.min(1, dt * 3);
    // 狭い所（門・塀の内）：肩の側が壁に近ければ、空いている逆の肩へカメラだけ回す（決めた肩の設定は変えない）
    this.wallT = (this.wallT || 0) - dt;
    if (this.wallT <= 0) {
      this.wallT = 0.3;
      const probe = (sg) => { const q = _cQ.copy(target).addScaledVector(right, 1.3 * sg); return this.camBlockHit(target, q) !== null; };
      this.wallFlip = probe(this.shoulder) && !probe(-this.shoulder) ? -1 : 1;
    }
    this.shK = (this.shK ?? 1) + ((this.wallFlip || 1) - (this.shK ?? 1)) * Math.min(1, dt * 4);
    const side = (this.sideK * this.shoulder + rc * (VIEW.h < 500 ? 0.2 : 0.6) * this.shoulder + pull * 4 * this.shoulder) * this.shK;
    const want = _cW.copy(target).addScaledVector(dir, -this.camDist).addScaledVector(right, side);
    // 組を率いているときは少し高い位置から見下ろす（部下で視界が塞がらないように）
    // 味方に囲まれて密集しているときは、少し高くから見る
    this.crowdT = (this.crowdT || 0) - dt;
    if (this.crowdT <= 0) { this.crowdT = 0.3; this.crowd = 0; this.rt.army.forNear(u.pos.x, u.pos.z, 4, countCameraAlly, this); }
    // 持ち上げは小さく（見下ろしの絵にしない。前の味方は allyFade で透かす）。馬上は馬の首を越えて前が見える高さに
    // 騎乗中は囲まれるほど、さらに高く引く（自分の馬のたてがみ・鞍で前が塞がらないように）
    this.crowdLift = (this.crowdLift || 0) + ((this.crowd > 5 && this.mounted ? 0.55 : 0) - (this.crowdLift || 0)) * Math.min(1, dt * 2);
    want.y += landscapePull * .4 + (this.rt.squad.length ? 0.35 : 0.15) - pull * 0.7 + this.crowdLift + (this.mounted ? 1.3 - rc * 2 : 0) + viewK * 0.25 + this.marchK * 1.0 * (1 - rc * 0.85) + wk * 6 + this.cineK * 1.2 + ok * overH + (this.rt.def.camLift || 0) + defeatLift;
    // 横持ちでは味方の肩越しへ上げ、視線も上げて前方の敵を残す。
    if (landscapeFrame && !this.mounted) want.y = Math.max(want.y, u.pos.y + 2.6);   // 目の高さに近い低めの肩越し
    // 廊下では野戦用の持ち上げで鴨居や白壁を正面に映さない。
    if (routeNear || closeFightFrame) want.y = Math.min(want.y, u.pos.y + 1.8);
    let terrainBlocked = !inRoom && terrainCameraClamp(this.rt.world, target, want, true);
    if (inRoom) want.y = Math.max(want.y, u.pos.y + 0.5);
    // 建物・柵・櫓がカメラと自分の間にあれば、その手前まで寄せる
    // 足場・櫓のような格子の物は、真ん中の一本の線だけだと隙間を抜けてしまうので、カメラの四隅寄りにも線を引いて一番手前で止める（隅は 3 コマに一度）
    // 腰より低い柵・横木・石垣の縁は当たりにしない（細い物で寄ったり離れたりしない）。部屋の中は全部を当たりにする
    this.camLowY = inRoom ? null : u.pos.y + 1.15;
    // 三人称の即時判定は最後の位置に一本残す。ここは建物の箱と接触済みの面で寄せる。
    let hit = this.camBlockHit(target, want, e >= .5);
    const movedView = Math.abs(angleDiff(this.camCornYaw ?? this.yaw, this.yaw)) > 0.12 || Math.abs((this.camCornPitch ?? this.pitch) - this.pitch) > 0.12;
    this.camCornT = movedView ? 0 : ((this.camCornT || 0) + 1) % 3;
    if (this.camCornT === 0) {
      let hc = null;
      for (const [a, b] of CORNERS) {
        const q = _cQ.copy(want).addScaledVector(right, a).addScaledVector(_cUP, b);
        const h2 = this.camBlockHit(target, q);
        if (h2 !== null && (hc === null || h2 < hc)) hc = h2;
      }
      this.camCornHit = hc; this.camCornYaw = this.yaw; this.camCornPitch = this.pitch;
    }
    if (this.camCornHit != null && (hit === null || this.camCornHit < hit)) hit = this.camCornHit;
    // 柵の内でも前が見えるよう、寄せすぎず（自分の頭と重ならない）、寄せた分だけ高さも肩の辺りへ下げる
    // 壁がとても近い時（陣幕の内など）は 0.3 の床に負けて壁の向こうへ突き抜けないよう、hit 自体を超えない範囲に留める
    // 戸口の鴨居など頭上の梁で本人の位置まで寄る時は、目の高さを下げた視点を先に試す（戸口の中で白壁しか映らず本人が消えていた。10/20）。
    if (hit !== null && hit < 0.45 && this.fpK < 0.5) {
      const low = _cLow.copy(want); low.y = Math.min(want.y, target.y + 0.1);
      const h2 = this.camBlockHit(target, low);
      if (h2 === null || h2 > hit + 0.3) { want.copy(low); hit = h2; }
    }
    let occRaw = hit !== null ? Math.max(0, Math.min(hit, hit - 0.02, Math.max(0.3, hit - 0.06))) : 1;
    // 木の幹：カメラと自分の間に幹があれば、その手前まで寄せる（近くの幹は 0.5 秒おきに拾い直す）
    {
      const W = this.rt.world;
      this.trunkT = (this.trunkT || 0) - dt;
      if (this.trunkT <= 0) {
        this.trunkT = 0.5;
        const pts = W && W.treePoints, list = this.trunks || (this.trunks = []); list.length = 0;
        if (pts) for (const q of pts) if (Math.abs(q[0] - u.pos.x) < 16 && Math.abs(q[1] - u.pos.z) < 16) list.push(q);
        this.trunks = list;
      }
      if (this.trunks && this.trunks.length) {
        const ax = target.x, az = target.z, bx = want.x - ax, bz = want.z - az, L2 = bx * bx + bz * bz;
        if (L2 > 0.01) {
          const L = Math.sqrt(L2);
          let tMin = 1;
          for (const q of this.trunks) {
            const t = ((q[0] - ax) * bx + (q[1] - az) * bz) / L2;
            if (t <= 0.02 || t > 1.08) continue;
            const cx = ax + bx * Math.min(1, t) - q[0], cz = az + bz * Math.min(1, t) - q[1];
            if (cx * cx + cz * cz < 0.7 * 0.7) tMin = Math.min(tMin, t - 0.75 / L);
          }
          if (tMin < 1) occRaw = Math.min(occRaw, Math.max(0.15, tMin));
        }
      }
    }
    // 当たりの距離をなめらかに：寄る時は速く（一瞬だけの当たりは無視）、戻る時はゆっくり。
    // 当たりの出入りが続いても毎コマ近づいたり離れたりして震えない（テストプレイ 10/23「柵・家でアングルが乱れる」）
    if (this.occK == null || dt >= 0.5 || inRoom) { this.occK = occRaw; this.occInT = 0; }
    else if (occRaw < this.occK - 0.005) {
      this.occInT = (this.occInT || 0) + dt;
      if (this.occInT > 0.07 || occRaw < 0.35) this.occK += (occRaw - this.occK) * Math.min(1, dt * 16);
    } else {
      this.occInT = Math.max(0, (this.occInT || 0) - dt * 0.35);
      if (this.occInT <= 0) this.occK = Math.min(occRaw, this.occK + dt * 0.45);
    }
    if (this.occK < 0.999) { const k = this.occK, y0 = want.y; want.lerpVectors(target, want, k); want.y = Math.min(want.y, y0 - (1 - k) * 0.5); }
    // 地面の高さで跳ねない：カメラの高さは上りは速く、下りはゆっくり追う
    if (!inRoom) {
      if (this.camWY == null || Math.abs(want.y - this.camWY) > 4 || dt >= 0.5) this.camWY = want.y;
      else this.camWY += (want.y - this.camWY) * Math.min(1, dt * (want.y > this.camWY ? 12 : 4));
      want.y = this.camWY;
    }
    if (inRoom) nakaCamClamp(want, this.fpK < 0.5);   // 部屋の壁・天井に埋もれない
    if (!this.camInit) { this.camPos.copy(want); this.camInit = true; }
    // 速い移動ほど追従を早め、曲がる時に視点だけ置き去りにしない。
    const lagK = this.mounted && Math.abs(this.hspd || 0) > 6 ? 18 : running ? 20 : 22;
    this.camPos.lerp(want, 1 - Math.exp(-dt * lagK));
    if (!inRoom && this.fpK < 0.5 && this.rt.def.nearAllySolidBody && this.rt.def.nearAllyCameraAvoid !== false) {
      avoidCameraBodies(this.rt.army.units, u, target, this.camPos);
    }
    if (inRoom) nakaCamClamp(this.camPos, this.fpK < 0.5);
    // 壁へ深くめり込んだ時だけ、その場で手前へ（浅い当たりは上のなめらかな寄せに任せ、毎コマ跳ねさせない）
    { const h = this.camBlockHit(target, this.camPos); if (h !== null && (inRoom || h < this.occK * 0.6)) this.camPos.lerpVectors(target, this.camPos, Math.max(0, h - 0.03)); }
    this.camLowY = null;
    // 追従の遅れで、曲がり角の斜面や高い地面へ戻らないよう、そのコマの位置も直す。
    if (!inRoom && terrainCameraClamp(this.rt.world, target, this.camPos)) terrainBlocked = true;
    let look = _cLk.copy(target).addScaledVector(dir, 12 + ok * overH * 1.5).addScaledVector(right, side);
    // 開戦の引き：膝ほどの低い所から、向こうに構える敵の群れの方を見る（両軍が向き合う絵）。終われば自分の向きへ戻る
    if (pull > 0.01) {
      if (!this.introFoe) {
        let sx = 0, sz = 0, n = 0;
        for (const o of this.rt.army.units) if (o.alive && o.team !== u.team && !o.isStruct) { const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z); if (d < 260) { sx += o.pos.x; sz += o.pos.z; n++; } }
        this.introFoe = n ? { x: sx / n, z: sz / n } : { x: u.pos.x + dir.x * 60, z: u.pos.z + dir.z * 60 };
      }
      const F = this.introFoe, W = this.rt.world;
      look.lerp(_cTmp.set(F.x, W.heightAt(F.x, F.z) + 2.5, F.z), pull * 0.5);
    } else this.introFoe = null;
    if (dk > 0) look.lerp(_cTmp.set(u.pos.x, u.pos.y + 0.3, u.pos.z), dk * 0.35);
    // 狙い定めた時は、自分と相手の間を見る（二人が画面の左右に収まる対峙の構図）
    this.lockK = (this.lockK || 0) + ((this.lock && this.lock.alive ? 1 : 0) - (this.lockK || 0)) * Math.min(1, dt * 3);
    if (this.lockK > 0.01 && this.lock) {
      const L = this.lock.pos, mid = _cTmp.set((u.pos.x + L.x) / 2, (u.pos.y + L.y) / 2 + 1.3 * bodySc, (u.pos.z + L.z) / 2);
      look.lerp(mid, 0.4 * this.lockK);
    }
    // 坂：上り坂では目線を少し上げ、下り坂では下げる（地面で画面の半分が塞がらないように）
    {
      const W = this.rt.world, fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const sl = inRoom ? 0 : (groundAt(W, u.pos.x + fx * 8, u.pos.z + fz * 8, u.pos.y) - u.pos.y) / 8;
      this.slopeK = inRoom ? 0 : (this.slopeK || 0) + (Math.max(-0.5, Math.min(0.5, sl)) - (this.slopeK || 0)) * Math.min(1, dt * 2);
      look.y += this.slopeK * 12 * 0.6;
    }
    camera.position.copy(this.camPos);
    if (inRoom) nakaCamClamp(camera.position, this.fpK < 0.5);
    if (this.camPush && this.camPush.t > 0) {
      this.camPush.t -= dt;
      const f = Math.max(0, this.camPush.t / 0.18);
      camera.position.x += this.camPush.x * f; camera.position.z += this.camPush.z * f;
    }
    if (this.camLean) {
      const L = this.camLean; L.t += dt;
      const q = L.t / L.dur;
      if (q >= 1) this.camLean = null;
      else { const f = q < 0.2 ? q / 0.2 : 1 - (q - 0.2) / 0.8, m = L.k * f * f * (1 - this.fpK * 0.7); camera.position.x += L.x * m; camera.position.z += L.z * m; }
    }
    if (e > 0) {
      const eye = this.eyePos(dt, dir);
      camera.position.lerp(eye, e);
      // 構えた時は目線を少し落とし、手元の構えが見えるように
      this.guardDip = (this.guardDip || 0) + ((this.guard ? 0.2 : 0) - (this.guardDip || 0)) * Math.min(1, dt * 14);
      _cTmp.copy(eye).addScaledVector(dir, 12); _cTmp.y -= 12 * this.guardDip;
      look.lerp(_cTmp, e);
    }
    // 三人称の歩み：走ると肩越しのカメラも足の運びに合わせて小さく上下・左右に揺れる（手持ちの撮影のように）
    // 馬上は鞍の弾み（駆けるほど大きく、蹄の拍子で）。画面の揺れを切った時・動きを減らす時は揺らさない
    // 歩きの揺れは S.shakeWalk で別に切れる（無ければ S.shake に従う）
    const calm = !(S.shakeWalk ?? S.shake) || reduceMotion();
    const sp = Math.hypot(u.vel.x, u.vel.z);
    // 動きを減らす時は、鞍の揺れも止める。
    const rideK = !(S.shakeWalk ?? S.shake) || reduceMotion() ? 0 : 1;
    let gaitRoll = 0;
    if (this.mounted && rideK > 0 && e < 0.5) {
      // 歩き方ごとの鞍の動き（拍子は rideMove の gaitPh＝一完歩で 1）：
      // 並足＝四拍でゆったり左右に揺れる・速歩＝二拍で上下に弾む・駆歩＝三拍の揺り木馬（前後に大きく揺れる）・襲歩＝速く低く、細かく突き上げる
      const k3 = (1 - e * 2) * rideK * 0.6, hs = Math.abs(this.hspd || 0), ph = (this.gaitPh || 0) * Math.PI * 2;
      const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
      const wWalk = sm(0.2, 0.9, hs) * (1 - sm(2, 3.2, hs)), wTrot = sm(2, 3.2, hs) * (1 - sm(5.8, 7.2, hs));
      const wCant = sm(5.8, 7.2, hs) * (1 - sm(9.2, 10.4, hs)), wGal = sm(9.2, 10.4, hs);
      const sn = Math.sin(ph), ab = Math.abs(sn) - 0.64;
      const yy = (wWalk * Math.sin(ph * 2) * 0.014 + wTrot * Math.abs(Math.sin(ph * 2)) * 0.1 - wTrot * 0.064 + wCant * sn * 0.075 + wGal * (ab * 0.07 + Math.sin(ph * 4) * 0.01)) * k3;
      const pitchY = (wWalk * Math.sin(ph * 2 + 1) * 0.03 + wTrot * Math.sin(ph * 4) * 0.035 + wCant * Math.sin(ph + 1.3) * 0.22 + wGal * Math.sin(ph * 2 + 0.8) * 0.09) * k3;
      const sway = (wWalk * sn * 0.04 + wTrot * sn * 0.012 + wCant * sn * 0.022 + wGal * sn * 0.014) * k3;
      camera.position.y += yy; look.y += yy * 0.4 + pitchY;
      camera.position.addScaledVector(right, sway); look.addScaledVector(right, sway * 0.3);
      gaitRoll = (wWalk * sn * 0.01 + wTrot * Math.sin(ph * 2) * 0.004 + wCant * Math.sin(ph + 0.5) * 0.014 + wGal * sn * 0.007) * k3;
      // 襲歩では乗り手が鐙に立って身を低くする：カメラも少し低く、前へ詰める
      const fxz = Math.hypot(look.x - camera.position.x, look.z - camera.position.z) || 1;
      const fx = (look.x - camera.position.x) / fxz, fz = (look.z - camera.position.z) / fxz;
      camera.position.y -= wGal * 0.18 * (1 - e * 2);
      // 溜めと前のめり：蹴り出すと体が後ろに残り（カメラが遅れて引かれ、目線は前へ伏せる）、手綱を引くと体が前へ投げ出される（カメラが前へ突っ込み、下を向いて戻る）
      const sg = Math.max(-1.6, Math.min(1, (this.surge || 0) / 5)) * k3;
      if (sg > 0) { camera.position.x -= fx * sg * 0.45; camera.position.z -= fz * sg * 0.45; look.y -= sg * 0.35; }
      else if (sg < 0) { camera.position.x -= fx * sg * 0.5; camera.position.z -= fz * sg * 0.5; camera.position.y += sg * 0.12; look.y += sg * 0.6; }
    }
    if (!calm && e < 0.5) {
      const k3 = 1 - e * 2;
      if (this.mounted) {
        // 馬上は上（rideK）で揺らす
      } else if (sp > 0.6) {
        this.gaitT = (this.gaitT || 0) + dt * (sp > 5 ? 10.5 : 7.5);
        const a = Math.min(1, sp / 6) * (sp > 5 ? 0.026 : 0.012) * k3;
        camera.position.y += Math.sin(this.gaitT * 2) * a;
        camera.position.addScaledVector(right, Math.sin(this.gaitT) * a * 0.8);
      }
    }
    // 揺れ：毎フレームのでたらめな跳びではなく、なめらかな揺れ（重なった波）で、強いほど速く・大きく。少し傾きも入る
    // 倒れた後は揺らさない（揺れ・首の振られ・押しを止め、静かに上へ離れるだけ）
    if (!u.alive || reduceMotion() || !S.shake) { this.shake = 0; this.camPush = null; this.neckV = null; }
    this.shakeT = (this.shakeT || 0) + dt * (14 + this.shake * 30);
    let roll = 0;
    if (this.shake > 0.001) {
      const s = this.shake * (0.22 + this.shake * 0.3) * (1 - 0.5 * e);
      const t = this.shakeT;
      const n = (a, b) => Math.sin(t * a + b) * 0.6 + Math.sin(t * a * 2.13 + b * 1.7) * 0.4;
      camera.position.addScaledVector(right, n(1.0, 0.3) * s);
      camera.position.y += n(1.27, 2.1) * s;
      look.addScaledVector(right, n(0.83, 4.2) * s * 0.6);
      look.y += n(1.53, 0.9) * s * 0.5;
      roll = n(0.71, 5.3) * s * 0.45;
    }
    // 打たれた時の首の振られ：打たれた方から外へ、顔が弾かれて戻る（一人称で強く。動きを減らす設定・揺れを切った時は出ない）
    if (this.camPush && this.camPush !== this.neckSeen) {
      this.neckSeen = this.camPush;
      if (!reduceMotion() && S.shake) {
        const pl = Math.hypot(this.camPush.x, this.camPush.z) || 1;
        const sd = (this.camPush.x * right.x + this.camPush.z * right.z) / pl;
        this.neckV = { y: sd * 0.9, p: 0.5, r: -sd * 0.7 };
      }
    }
    if (this.neckV) {
      const nv = this.neckV, k = Math.exp(-dt * 10);
      this.neck = this.neck || { y: 0, p: 0, r: 0 };
      // ばねで弾んで戻る
      for (const a of ['y', 'p', 'r']) { this.neck[a] += nv[a] * dt; nv[a] = nv[a] * k - this.neck[a] * dt * 90; this.neck[a] *= Math.exp(-dt * 6); }
      const sc = 0.5 + 0.5 * e, NK = this.neck;
      look.addScaledVector(right, NK.y * 12 * sc); look.y += NK.p * 6 * sc; roll += NK.r * sc;
      if (Math.abs(NK.y) + Math.abs(NK.p) + Math.abs(nv.y) + Math.abs(nv.p) < 1e-4) this.neckV = null;
    }
    // 騎馬に倒された：視点が地面近くまで沈み、起き上がるにつれて戻る（動きを減らす設定では沈みを浅く）
    if (this.knockT > 0 && !this.mounted) {
      const k = Math.min(1, this.knockT / 0.5) * (reduceMotion() ? 0.35 : 1);
      camera.position.y -= 0.9 * k; look.y -= 0.7 * k; roll += 0.12 * k;
    }
    // 見せ場の一枚（camShot。火縄の this.shot とは別）：低い所から見上げる数秒の絵。終われば元の視点へなめらかに戻る
    if (this.camShot && (this.aiming || this.lock || this.inCombatT > 0 || this.lookIdle < 0.2)) { this.camShot = null; this.shotZoom = 0; }
    if (this.camShot) {
      const sh = this.camShot;
      sh.t += dt;
      const W = this.rt.world, k = reduceMotion() ? 0 : Math.min(1, sh.t / 0.4, (sh.dur - sh.t) / 0.6);
      this.shotZoom = (sh.zoom || 0) * (k > 0 ? k : 0);
      if (sh.t >= sh.dur) { this.camShot = null; this.shotZoom = 0; }
      else if (k > 0) {
        const kk = k * k * (3 - 2 * k);
        const fx = typeof sh.from === 'function' ? sh.from() : sh.from, at = typeof sh.at === 'function' ? sh.at() : sh.at;
        // 撮る所はゆっくり横へ動く（手持ちで回り込むように）
        const drift = sh.t * (sh.drift || 0.6);
        const px = fx.x + Math.cos(sh.ang || 0) * drift, pz = fx.z + Math.sin(sh.ang || 0) * drift;
        camera.position.lerp(_cTmp.set(px, W.heightAt(px, pz) + (sh.h ?? 0.8), pz), kk);
        look.lerp(_cTmp.set(at.x, W.heightAt(at.x, at.z) + (sh.lookH ?? 2.2), at.z), kk);
      }
    }
    // 近くを騎馬の群れが駆けると、地の震えで視点が細かく震える（揺れを切った時・動きを減らす設定では出さない）
    const rumbleOn = u.alive && S.shake && !reduceMotion();
    const cr = rumbleOn ? (this.cavShake || 0) : 0;
    this.rumbleK = rumbleOn ? (this.rumbleK || 0) + (cr - (this.rumbleK || 0)) * Math.min(1, dt * 5) : 0;
    if (this.rumbleK > 0.02) {
      const t = this.shakeT * 1.7, a = this.rumbleK * 0.022;
      camera.position.y += (Math.sin(t * 2.3) * Math.sin(t * 1.37 + 1)) * a;
      look.y += Math.sin(t * 1.9 + 2) * a * 0.5;
    }
    // 開戦の引き・揺れ・見せ場を足した後にも地形を調べる。一人称と室内は従来の目線を使う。
    if (!inRoom && e < 0.5 && terrainCameraClamp(this.rt.world, target, camera.position)) terrainBlocked = true;
    // 横の切岸・崖：カメラの真横 1m 内の山肌が目の高さより上なら、体の方へ寄せて少し上げる（山肌の絵が画面いっぱいに伸びない）
    if (!inRoom && e < 0.5 && !terrainSideClear(this.rt.world, camera.position.x, camera.position.y, camera.position.z)) {
      const P = camera.position, x0 = P.x, y0 = P.y, z0 = P.z;
      for (let k = 1; k <= 5; k++) {
        const f = k / 5;
        P.set(x0 + (target.x - x0) * f * 0.85, y0 + f * 1.1, z0 + (target.z - z0) * f * 0.85);
        if (terrainSideClear(this.rt.world, P.x, P.y, P.z)) break;
      }
      terrainBlocked = true;
    }
    // 急な切岸で持ち上げ続けて、頭の上の高い所から見下ろさない。高すぎる時は体の方へ寄せる（肩越しの近い目線）
    if (!inRoom && e < 0.5 && !this.mounted && camera.position.y > target.y + 3.6) {
      const P = camera.position;
      for (let k = 0; k < 8 && P.y > target.y + 3.6; k++) P.lerp(target, 0.22);
      P.y = Math.max(P.y, this.rt.world.heightAt(P.x, P.z) + 0.65);
      terrainBlocked = true;
    }
    // 地形補正・演出の後も壁の手前へ収める。開戦の引きや室内でも黒い壁を映さない。
    if (e < 0.5) {
      if (inRoom) nakaCamClamp(camera.position, this.fpK < 0.5);
      let h = this.camBlockHit(target, camera.position);
      // 揺れ・地形補正の後の四隅も、近くの柵がある時に拾う。
      // 中央の線だけが格子の隙間を通っても、画面の端を横木へ入れない。
      if (this.blockers?.length) for (const [a, b] of CORNERS) {
        const q = _cQ.copy(camera.position).addScaledVector(right, a).addScaledVector(_cUP, b);
        const corner = this.camBlockHit(target, q);
        if (corner !== null && (h === null || corner < h)) h = corner;
      }
      if (h !== null) camera.position.lerpVectors(target, camera.position, Math.max(0, h - 0.25 / Math.max(0.25, target.distanceTo(camera.position))));
      // 目の前（1.1m）に石垣・崖・壁が迫る時は、自分の線上でなくても、体の方へ寄せて少し上げる（画面が壁で埋まらない）
      this.camFrontClear(target, camera.position, look, inRoom);
    }
    this.rt.def.clampCamera?.(this.rt, camera.position);
    if (inRoom) nakaCamClamp(camera.position, this.fpK < 0.5); // 揺れや戦ごとの補正の後も室内の高さを守る。
    // 戦ごとの補正で石垣を避けて寄せた後も、斜面の中へ戻さない。
    if (!inRoom && e < 0.5) {
      const moved = terrainCameraClamp(this.rt.world, target, camera.position);
      if (moved) terrainBlocked = true;
      // 位置が変わった時だけ壁を測り直し、普段の線判定を増やさない。
      if (moved || this.rt.def.clampCamera) {
        const h = this.camBlockHit(target, camera.position);
        if (h !== null) camera.position.lerpVectors(target, camera.position, Math.max(0, h - 0.25 / Math.max(0.25, target.distanceTo(camera.position))));
      }
      camera.position.y = Math.max(camera.position.y, cameraGroundAt(this.rt.world, camera.position.x, camera.position.z) + 0.65);
    }
    // 壁の補正や一人称の揺れの後も、水面より上へ目線を保つ。川床の高さだけでは胸まで浸かる川で沈む。
    if (!inRoom) {
      const W = this.rt.world, depth = W.waterDepthAt(camera.position.x, camera.position.z);
      if (depth > 0.02) camera.position.y = Math.max(camera.position.y, W.heightAt(camera.position.x, camera.position.z) + depth + 0.35);
    }
    // 信貴山の柵際で寄った三人称は、半透明の横木を上から越して見る。
    if (!inRoom && e < 0.5 && this.rt.world.def.battleKey === 'shigisan' && target.distanceToSquared(camera.position) < 6.25 && this.blockers?.length) {
      camera.position.y = Math.max(camera.position.y, target.y + 1.1);
    }
    this.terrainLookK = terrainBlocked ? 1 : (this.terrainLookK || 0) * Math.max(0, 1 - dt * 5);
    if (!inRoom && e < 0.5 && this.terrainLookK > 0.001) look.lerp(target, this.terrainLookK * (1 - e * 2) * (this.rt.def.terrainLookWeight ?? 0.85));
    // 高い所を見せる場面：見る点をその物へ寄せる（崖の下からでも画面の真ん中に入れる）
    if (this.cine?.up != null) (this.cineLook || (this.cineLook = new THREE.Vector3())).set(this.cine.x, this.rt.world.heightAt(this.cine.x, this.cine.z) + this.cine.up, this.cine.z);
    if (!inRoom && this.cineK > 0.01 && this.cineLook) look.lerp(this.cineLook, this.cineK * 0.85);
    if (guardFrame && this.guardFrameK > .01) {
      _cTmp.set((u.pos.x + guardPerson.pos.x) * .5, (u.pos.y + guardPerson.pos.y) * .5 + 1.25, (u.pos.z + guardPerson.pos.z) * .5);
      look.lerp(_cTmp, this.guardFrameK);
    }
    // 戸口の先へ十二歩も視線を延ばすと、曲がった先の白壁が中央を占める。
    // 次に通る点の高さへ目を向け、肩越しに開口が隠れる時は本人へ寄る。
    const routeLook = routeNear && routePoint && Math.hypot(routePoint.x - u.pos.x, routePoint.z - u.pos.z) > 1.2;
    this.routeLookK = (this.routeLookK || 0) + ((routeLook ? 1 : 0) - (this.routeLookK || 0)) * Math.min(1, dt * 4);
    if (routeLook) {
      _cTmp.set(routePoint.x, (routePoint.y ?? u.pos.y) + 1.1, routePoint.z);
      if (this.rt.def.sightBlocked && (this.routeSightAt ?? -1) <= this.rt.t) {
        this.routeSightAt = this.rt.t + .2;
        this.routeObscured = this.rt.def.sightBlocked(this.rt, camera.position, _cTmp, camera.position.y, _cTmp.y);
      }
      this.routeNearK = (this.routeNearK || 0) + ((this.routeObscured ? .75 : 0) - (this.routeNearK || 0)) * Math.min(1, dt * 6);
      if (this.routeNearK > .01) {
        const distance = camera.position.distanceTo(target);
        camera.position.lerp(target, Math.min(this.routeNearK, Math.max(0, 1 - 2 / Math.max(.01, distance))));
        this.rt.def.clampCamera?.(this.rt, camera.position);
      }
      look.lerp(_cTmp, this.routeLookK);
    } else { this.routeNearK = 0; this.routeObscured = false; this.routeSightAt = -1; }
    this.rt.def.frameCamera?.(this.rt, camera.position, look);
    if (landscapeFrame && !inRoom && e < .5) {
      const span = Math.hypot(look.x - camera.position.x, look.z - camera.position.z);
      look.y = Math.max(look.y, camera.position.y - span * .16);
    }
    this.clearWallView(camera.position, look);
    this.clearCameraBody(camera);
    // 肩よけ・戦ごとの補正で動いた最後の位置を、待ち行列へ回さず近くの面で測る。
    // 判定は従来どおり一コマ二本まで。低い壁も、実際の視点への線を塞ぐ時は止める。
    if (e < .5) {
      const lowY = this.camLowY;
      this.camLowY = null;
      const h = this.camBlockHit(target, camera.position, true);
      this.camLowY = lowY;
      if (h !== null) {
        camera.position.lerpVectors(target, camera.position, Math.max(0, h - .25 / Math.max(.25, target.distanceTo(camera.position))));
        this.camPos.copy(camera.position);
      }
    }
    camera.lookAt(look);
    // 合戦では視点補正の後にも本人の足を画面内へ戻し、下端に余白を残す。
    // 位置は動かさず見下ろす角度だけ補い、壁の内側へカメラを押し出さない。
    const fieldFeet = !this.rt.def.town && !this.rt.def.dojo;
    if (!selfFrame && (fieldFeet || this.rt.def.keepPlayerFeet) && !inRoom && e < .01 && !this.aiming && !this.camShot &&
        Math.hypot(camera.position.x - u.pos.x, camera.position.z - u.pos.z) >= (this.rt.def.footFrameMinDistance || 0) &&
        !this.cine && !this.rt.game?.photo && !this.rt.over) {
      camera.updateMatrixWorld();
      _cQ.set(u.pos.x, u.pos.y, u.pos.z).project(camera);
      let footY = _cQ.z >= -1 && _cQ.z <= 1 ? _cQ.y : 0;
      const enemy = this.rt.hud?.defendEnemy || this.rt.guideEnemy;
      if (enemy?.alive && Math.hypot(enemy.pos.x - u.pos.x, enemy.pos.z - u.pos.z) < 9) {
        _cQ.set(enemy.pos.x, enemy.pos.y, enemy.pos.z).project(camera);
        if (_cQ.z >= -1 && _cQ.z <= 1 && Math.abs(_cQ.x) < .9) footY = Math.min(footY, _cQ.y);
      }
      const bottom = fieldFeet && VIEW.h <= 500 && VIEW.w > VIEW.h ? -.46 : -.58;
      if (footY < bottom) {
        const halfFov = Math.tan(camera.fov * Math.PI / 360) / camera.zoom;
        const distance = Math.hypot(look.x - camera.position.x, look.z - camera.position.z);
        const pitch = Math.atan2(look.y - camera.position.y, distance);
        look.y = camera.position.y + distance * Math.tan(pitch + Math.atan(footY * halfFov) - Math.atan(bottom * halfFov));
        camera.lookAt(look);
      }
    }
    // 馬で曲がると体が内へ傾くように、カメラも傾ける（速いほど深く）
    if (this.mounted && rideK > 0) {
      const turn = angleDiff(this.prevYawCam ?? u.heading, u.heading) / Math.max(dt, 1e-3);
      this.leanCam = (this.leanCam || 0) + (Math.max(-1, Math.min(1, turn * 0.6)) * 0.035 * rideK * Math.min(1, Math.abs(this.hspd || 0) / 8) - (this.leanCam || 0)) * Math.min(1, dt * 4);
      roll += (this.leanCam + gaitRoll) * (1 - e);
    }
    if (!this.mounted || rideK === 0) this.leanCam = 0;
    this.prevYawCam = u.heading;
    if (e > 0 && this.fpRoll) roll += this.fpRoll * e;
    if (roll) camera.rotateZ(roll);
    // 最後の補正でも胴を中央より少し下へ固定。壁を避けた位置は保ち、
    // 開戦・走り・乱戦で本人を探し直させない。作業用ベクトルを使い回す。
    if (selfFrame && e < .01) {
      this.framePlayerCamera(camera);
    }
  }

  // 地形を避けて横へ移った後も、本人とその前方を同じ構図へ戻す。
  framePlayerCamera(camera) {
    const u = this.u;
    if (!u.alive || u.naka || this.fpK >= .01 || this.aiming || this.camShot || this.cine ||
        this.rt.over || this.overHold || this.rt.game?.photo) return;
    const scale = u.mesh?.scale.y || 1;
    _cTmp.set(u.pos.x, u.pos.y + (1.25 + (this.mounted ? RIDE.y : 0)) * scale, u.pos.z);
    camera.up.copy(_WORLD_UP);
    camera.lookAt(_cTmp);
    camera.rotateX(Math.atan(.18 * Math.tan(camera.fov * Math.PI / 360) / camera.zoom));
    camera.updateMatrixWorld();
    // 壁を避けて視点が寄った時も、頭と足に余白が残る画角まで広げる。
    // 視点の位置は保ち、地形や建物を突き抜けない。作業用の点は使い回す。
    let fit = 0;
    for (let i = 0; i < 2; i++) {
      const height = i ? (this.mounted ? 3.6 : (u.bodyHeight || 1.72) + .35) * scale : 0;
      _cQ.set(u.pos.x, u.pos.y + height, u.pos.z).applyMatrix4(camera.matrixWorldInverse);
      if (_cQ.z >= -.1) continue;
      fit = Math.max(fit, Math.abs(_cQ.y) / (-_cQ.z * (i ? .78 : .62)),
        (Math.abs(_cQ.x) + .45 * scale) / (-_cQ.z * camera.aspect * .86));
    }
    // def.maxFramedFov：狭い廊下で広角にすると柱と梁が額縁になる戦（本能寺）だけ、広げる上限を下げる。
    const framedFov = Math.min(this.rt.def.maxFramedFov ?? 100, Math.atan(fit * camera.zoom) * 360 / Math.PI);
    if (framedFov > camera.fov) {
      camera.fov = framedFov;
      camera.updateProjectionMatrix();
    }
  }

  // 川・浅瀬の中にいるか（足音と蹄の音を水の音に替える）
  inWater() {
    const u = this.u, W = this.rt.world;
    return !NAKA.cur && W.inWaterAt(u.pos.x, u.pos.z, u.pos.y);
  }

  // 一人称の目の位置（ならし・歩みの揺れ・柵や塀へのめり込み止め）
  eyePos(dt, dir) {
    const u = this.u;
    const raw = this.eyeRaw(_cQ);
    // 足もとからのずれでならす（歩く速さで横に遅れない）。揺れを切った時は上下を強くならす
    const off = raw.sub(u.pos);
    const calm = !(S.shakeWalk ?? S.shake) || reduceMotion();
    if (!this.eyeOff) this.eyeOff = off.clone();
    else if (dt >= 0.5) this.eyeOff.copy(off);
    else {
      const kh = Math.min(1, dt * 14), kv = Math.min(1, dt * (calm ? 2.5 : 10));
      this.eyeOff.x += (off.x - this.eyeOff.x) * kh;
      this.eyeOff.z += (off.z - this.eyeOff.z) * kh;
      this.eyeOff.y += (off.y - this.eyeOff.y) * kv;
    }
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    // 馬上は目を少し高く・前へ（馬の頭が画面の下へ下がり、狙う相手が真ん中に見える）
    const fe = this.mounted ? 0.12 : 0.1;
    const eye = _cE.set(u.pos.x + this.eyeOff.x + fx * fe, u.pos.y + this.eyeOff.y + (this.mounted ? 0.16 : 0), u.pos.z + this.eyeOff.z + fz * fe);
    // 歩みの小さな上下（画面の揺れの設定を守る）。馬上は鞍の弾みがそのまま出るので足さない
    const sp = Math.hypot(u.vel.x, u.vel.z);
    if (!calm && !this.mounted && sp > 0.5) {
      this.bobT += dt * (sp > 5 ? 11 : 8);
      const ba = Math.min(1, sp / 3.7) * (sp > 5 ? 0.024 : 0.016);
      eye.y += Math.sin(this.bobT) * ba;
      // 左右の足に体重が移る揺れと、踏み出しの小さな傾き
      eye.x += -fz * Math.sin(this.bobT * 0.5) * ba * 0.7; eye.z += fx * Math.sin(this.bobT * 0.5) * ba * 0.7;
      this.fpRoll = Math.sin(this.bobT * 0.5) * ba * 0.12;
    } else this.fpRoll = calm ? 0 : (this.fpRoll || 0) * Math.exp(-dt * 6);
    // 柵・塀・建物へ目が入り込まないよう、体の芯から目の少し先までを調べて手前で止める
    const from = _cFr.set(u.pos.x, eye.y, u.pos.z);
    const ahead = _cAh.copy(eye).addScaledVector(dir, 0.3);
    const hit = this.camBlockHit(from, ahead);
    if (hit !== null) {
      const len = from.distanceTo(ahead);
      const d = Math.max(-0.2, len * hit - 0.3);
      eye.copy(from).addScaledVector(_cTmp.copy(ahead).sub(from).normalize(), d);
    }
    // 柵のすぐ内：馬防柵の上の横木（1.45m）がちょうど目の高さを塞ぐので、少し背を伸ばして横木の上の隙間から前を見る
    this.fenceT = (this.fenceT || 0) - dt;
    if (this.fenceT <= 0) {
      this.fenceT = 0.25;
      this.nearFence = false;
      if (!this.mounted) for (const st of this.rt.army.structs) {
        if (!st.alive || st.opened || !st.seg || !/柵/.test(st.name || '')) continue;
        const [ax, az, bx, bz] = st.seg, dx = bx - ax, dz = bz - az;
        const t = Math.max(0, Math.min(1, ((eye.x - ax) * dx + (eye.z - az) * dz) / (dx * dx + dz * dz || 1)));
        const x = ax + dx * t, z = az + dz * t;
        if (Math.hypot(x - eye.x, z - eye.z) < 1.4 && (x - eye.x) * dir.x + (z - eye.z) * dir.z > 0 && Math.abs(eye.y - (this.rt.world.heightAt(x, z) + 1.45)) < 0.35) { this.nearFence = true; break; }
      }
    }
    this.fenceLift = (this.fenceLift || 0) + ((this.nearFence ? 0.2 : 0) - (this.fenceLift || 0)) * Math.min(1, dt * 4);
    eye.y += this.fenceLift;
    const g = (NAKA.cur ? u.pos.y : groundAt(this.rt.world, eye.x, eye.z, u.pos.y)) + 0.3;
    if (eye.y < g) eye.y = g;
    return eye;
  }
}
