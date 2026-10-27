// Player の手のうち「移動・馬の乗り降り・落ちる・梯子」（player.js から分けた。中身は同じ。Player.prototype へ戻すのは player.js の終わり）
import { projectileCover } from './projectile_cover.js';
import { horseThreatTick, horseExhausted, horseLooseMove, horseLooseDanger } from './horse_reality.js';
import { terrainFx, uphillAt } from './terrain_tags.js';
import { canRide } from './state.js';
import { angleDiff, animateHorse } from './units.js';
import { sfx } from './audio.js';
import { S, K, reduceMotion } from './settings.js';
import { isTouch } from './touch.js';
import { groundAt, rampAt, ladderNear } from './floors.js';
import { ladderAlive, startClimb } from './siege_ladder.js';
import { yieldToPlayerHorse } from './player.js';

export class PlayerMove {

  // ---------------- 馬の乗り降り ----------------
  horseReachable(p) {
    const u = this.u, army = this.rt.army;
    return Math.abs(p.y - u.pos.y) <= 0.9 && this.canStep(u.pos.x, u.pos.z, p.x, p.z, u.pos.y) &&
      !army.wallBetween(u.pos, -1, p) &&
      projectileCover(army, u.pos.x, u.pos.y + 0.8, u.pos.z, p.x, p.y + 0.8, p.z, u).q > 1;
  }

  dismountSpot(force = false) {
    const u = this.u, army = this.rt.army, W = this.rt.world;
    const spot = this._dismountSpot || (this._dismountSpot = { x: 0, y: 0, z: 0 });
    for (let i = 0; i < 25; i++) {
      // 左右から探し、前後・斜め・最後は馬の足元も調べる。柵際でも降り口を残す。
      const ring = Math.floor(i / 8), angle = u.heading + (i % 8) * Math.PI / 4;
      const d = i === 24 ? 0 : ring === 0 ? 1.3 : ring === 1 ? 1.8 : 2.4;
      const x = u.pos.x + Math.cos(angle) * d, z = u.pos.z - Math.sin(angle) * d;
      const y = groundAt(W, x, z, u.pos.y);
      if (Math.abs(y - u.pos.y) > 1.4 || W.waterFootDepthAt(x, z, y) > 0.8 || !this.clearWalkTo(x, z, false)) continue;
      spot.x = x; spot.y = y; spot.z = z;
      // 本人と同じ当たりを借りて、柵・建物・兵と重ならないか調べる。
      const ox = u.pos.x, oy = u.pos.y, oz = u.pos.z, mounted = u.mounted, riverX = u._riverX, riverZ = u._riverZ;
      u.pos.set(x, y, z); u.mounted = false; army.collide(u, 0);
      const fits = Math.hypot(u.pos.x - x, u.pos.z - z) < 0.08;
      u.pos.set(ox, oy, oz); u.mounted = mounted; u._riverX = riverX; u._riverZ = riverZ;
      let empty = fits;
      if (empty) for (const o of army.units) { if (o !== u && o.alive && !o.isStruct && Math.abs(o.pos.y - y) < 1.8 && Math.hypot(o.pos.x - x, o.pos.z - z) < (o.mounted ? 1.1 : 0.8)) { empty = false; break; } }
      const limit = W.def.moveLim || 176;
      if (empty && Math.abs(x) <= limit && Math.abs(z) <= limit) return spot;
    }
    // 不意の落馬は馬の足元へ倒れる。安全な場所への移動にはしない。
    if (force) { spot.x = u.pos.x; spot.y = u.pos.y; spot.z = u.pos.z; return spot; }
    return null;
  }

  // 降り先・詰まりの逃げ道を二十センチずつ調べる。途中の柵・切岸も越さない。
  // 本人の当たりを一時的に借り、位置と馬・川の記録は必ず元へ戻す。
  clearWalkTo(x, z, mounted) {
    const u = this.u, W = this.rt.world, army = this.rt.army;
    const ox = u.pos.x, oy = u.pos.y, oz = u.pos.z, ride = u.mounted;
    const riverX = u._riverX, riverZ = u._riverZ;
    const dx = x - ox, dz = z - oz, n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.2));
    const lim = W.def.moveLim || 176, bounds = W.def.playerBoundsAt?.(this.rt) || W.def.playerBounds;
    if (Math.abs(x) > lim || Math.abs(z) > lim || bounds && (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ)) return false;
    u.mounted = mounted;
    try {
      for (let i = 1; i <= n; i++) {
        const px = u.pos.x, py = u.pos.y, pz = u.pos.z;
        const nx = ox + dx * i / n, nz = oz + dz * i / n, ny = groundAt(W, nx, nz, py);
        if (Math.abs(ny - py) > 0.3 || !this.canStep(px, pz, nx, nz, py) || W.waterFootDepthAt(nx, nz, ny) > 0.8) return false;
        u.pos.set(nx, ny, nz); army.collide(u, 0);
        if (Math.hypot(u.pos.x - nx, u.pos.z - nz) > 0.01) return false;
      }
      return true;
    } finally {
      u.pos.set(ox, oy, oz); u.mounted = ride; u._riverX = riverX; u._riverZ = riverZ;
    }
  }

  escapeBlocked(vx, vz) {
    const u = this.u, W = this.rt.world, h = Math.atan2(vx, vz);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < 8; i++) {
        // まず横、次に後ろへ。閉じた門に向かう入力でも同じ所へ押し戻さない。
        const a = h + Math.PI / 2 + i * Math.PI / 4;
        const x = u.pos.x + Math.sin(a) * 1.2, z = u.pos.z + Math.cos(a) * 1.2;
        if (!this.clearWalkTo(x, z, this.mounted)) continue;
        const y = groundAt(W, x, z, u.pos.y);
        let empty = true;
        for (const o of this.rt.army.units) if (o !== u && o.alive && !o.isStruct && Math.abs(o.pos.y - y) < 1.8 && Math.hypot(o.pos.x - x, o.pos.z - z) < (this.mounted || o.mounted ? 1.1 : 0.8)) { empty = false; break; }
        if (!empty) continue;
        u.pos.set(x, y, z); this.hspd = 0; this.vel.x = this.vel.z = 0;
        return;
      }
      if (!this.mounted) break;
      this.toggleMount();
      if (this.mounted) break;
    }
  }

  toggleMount(force = false) {
    const rt = this.rt, u = this.u, army = rt.army;
    if (this.mountT > 0 || u.climb || !u.alive || rt.over) return;
    if (this.catching) { this.catching = null; rt.hud.flash('手綱を放した', 'dim'); return; }
    if (this.shot?.pan) { rt.hud.flash('火皿に火が移った。放ってから乗り降りする', 'dim'); return; }
    if (this.mounted) {
      if (!this.canRide) return;
      const spot = this.dismountSpot(force);
      if (!spot) { rt.hud.flash('降りる場所がない。広い所へ馬を進める', 'dim'); return; }
      this.cancelAttack();
      // 降りる：馬はその場で待つ
      army.setMounted(u, false);
      this.loose = { x: u.pos.x, z: u.pos.z, heading: u.heading, spd: 0, mode: 'wait' };
      this.horse.position.set(this.loose.x, groundAt(rt.world, this.loose.x, this.loose.z, u.pos.y), this.loose.z);
      this.horse.rotation.set(0, u.heading, 0);
      rt.scene.add(this.horse);
      this.mounted = false; this.hspd = 0; this.mountT = 0.35;
      this.dodgeT = this.iframe = 0; this.vel.x = this.vel.z = 0;
      u.pos.set(spot.x, spot.y, spot.z);
      sfx('step', 1.2);
      rt.hint('dismount');
      return;
    }
    const L = this.loose;
    // すぐそばの空馬・置いた馬：R でも手綱を取って乗れる（今の馬より近ければ）。乗る身分（canRide）でなくても、捕らえた馬には乗れる
    const o = this.takeO;
    if (o && (!this.canRide || !L || L.mode === 'fled' || Math.hypot(o.h.position.x - u.pos.x, o.h.position.z - u.pos.z) < Math.hypot(L.x - u.pos.x, L.z - u.pos.z))) {
      if (o.kept) this.takeHorse(o); else if (!this.catching) { this.catching = { o, t: 0, dur: this.horseCatchDuration(o) }; rt.hud.flash('手綱を取っている。もう一度押すと放す', 'dim'); }
      return;
    }
    if (!this.canRide) { rt.hud.flash('まだ馬に乗れる身分ではない（足軽大将候補から）', 'dim'); return; }
    if (L && (L.mode === 'flee' || L.mode === 'fled')) { rt.hud.flash(L.mode === 'flee' ? `${this.horseName}は怯えて逃げている。逃げる先を見る` : `${this.horseName}は逃げ去った。近くの空馬を探す`, 'dim'); return; }
    if (!L) { rt.hud.flash(`${this.horseName}がいない`, 'dim'); return; }
    const d = Math.hypot(L.x - u.pos.x, L.z - u.pos.z);
    if (d < 3.2) {
      const q = this.horse.position;
      if (!this.horseReachable(q)) { rt.hud.flash('馬の横へ回る。同じ高さで手綱を取る', 'dim'); return; }
      // 乗る
      this.cancelAttack();
      rt.scene.remove(this.horse);
      u.heading = L.heading;
      u.pos.x = L.x; u.pos.z = L.z;
      army.setMounted(u, true, this.horse);
      this.mounted = true; this.loose = null; this.mountT = 0.5; this.hspd = 0;
      sfx('neigh', 0.7);
    } else if (d > 15 || !this.horseReachable(this.horse.position)) {
      L.mode = 'wait';
      rt.hud.flash('馬の見える近くへ寄る。壁の向こうや遠くからは呼べない', 'dim');
    } else if (L.mode === 'come') {
      rt.hud.flash(`${this.horseName}はこちらへ来ている。広い所で待つ`, 'dim');
    } else if (this.spoil) {
      // 戦利の馬は口笛を知らない
      rt.hud.flash(`${this.horseName}は口笛では来ない（そばへ寄って乗る）`, 'dim');
    } else if (this.horse?.userData.horse?.fear > 0.5) {
      rt.hud.flash('馬が怯えている。逃げる先を見て寄る', 'dim');
    } else {
      // 口笛で呼ぶ
      L.mode = 'come';
      sfx('flute', 0.4);
      rt.hud.flash(`口笛で${this.horseName}を呼んだ`, 'dim');
    }
  }

  horseHurt(n) {
    if (!this.mounted || !Number.isFinite(n) || n <= 0) return;
    this.horseHp -= n;
    if (this.horseHp <= this.horseMax * 0.3 && !this.horseWarned) { this.horseWarned = true; this.rt.bark(`${this.horseName}が弱って足が鈍る！`, true); }
    if (this.horseHp <= 0) {
      this.horseHp = 0;
      if (this.horse === this.ownedHorse) this.ownedLast = this.packHorse();
      this.fall();
    }
  }

  // 道の横の急さだけで足を止めず、進む向きの段差を調べる。堀・登れない土塁は守る。
  canStep(x0, z0, x, z, y) {
    const W = this.rt.world;
    const h = groundAt(W, x, z, y);
    if (W.nonWalkSurface?.(x, z, h)) return false;
    // 切岸で詰まる山道は、横へ退いた一歩で崖から落ちないよう下りも調べる。
    if (W.def.maxWalkDrop != null) {
      const dx = x - x0, dz = z - z0, d = Math.hypot(dx, dz);
      if (y - h > W.def.maxWalkDrop) return false;
      if (d > 1e-6 && h - groundAt(W, x + dx / d * 1.2, z + dz / d * 1.2, h) > W.def.maxWalkDrop) {
        // 急な上り階段の先を低い足の高さで探すと、階段を拾えず地面まで落ちたと誤る。
        // 足場を二十センチずつたどる。途中の崖や歩けない段差は通さない。
        let aheadY = h;
        for (let j = 1; j <= 6; j++) {
          const nextY = groundAt(W, x + dx / d * j * .2, z + dz / d * j * .2, aheadY);
          if (aheadY - nextY > W.def.maxWalkDrop || nextY - aheadY > .91) return false;
          aheadY = nextY;
        }
        if (h - aheadY > W.def.maxWalkDrop) return false;
      }
    }
    if ((W.def.riverCross || W.def.streams?.some(st => st.fords?.length)) && W.waterFootDepthAt(x, z, h) > (W.def.wadeDepth ?? 0.85)) return false;
    if (W.noClimb) for (const f of W.noClimb) if (f(x, z)) return false;
    if (W.walkable(x, z, y)) return true;
    const dx = x - x0, dz = z - z0, d = Math.hypot(dx, dz);
    if (d < 1e-6) return true;
    // 一歩ごとの小さな差で切岸を登り続けないよう、少し先の高さも見る。
    const ax = x + dx / d * 1.2, az = z + dz / d * 1.2;
    const ahead = groundAt(W, ax, az, h);
    // 設営した階段は切岸ではない。下の端の手前から通し、一歩の段差は守る。
    const ramp = rampAt(x, z, y), aheadRamp = rampAt(ax, az, h);
    if (h <= y + .91 && ((ramp != null && ramp >= h - .91)
      || (aheadRamp != null && Math.abs(aheadRamp - ahead) < .01))) return true;
    return h <= y + 0.91 && ahead <= h + Math.max(0.9, (W.def.climbTan ?? 0.7) * 1.2);
  }

  // 短い歩幅で当たりを解き、押し戻された向きの速度だけを落とす。壁に沿う分は残す。
  movePlayer(dt, vx, vz) {
    const u = this.u, W = this.rt.world, army = this.rt.army;
    const driveX = vx, driveZ = vz;
    const wanted = Math.hypot(vx, vz) * dt;
    if (dt <= 0 || u.climb) { u.vel.x = 0; u.vel.z = 0; return; }
    if (W.def.playerVelocity) { const q = W.def.playerVelocity(this.rt, vx, vz); vx = q.x; vz = q.z; }
    if (army.bodies) army.bodies(u, dt);
    const x0 = u.pos.x, z0 = u.pos.z;
    let slopeBlocked = false, solidBlocked = false;
    const count = Math.min(8, Math.max(1, Math.ceil(Math.hypot(vx, vz) * dt / 0.2))), step = dt / count;
    for (let i = 0; i < count; i++) {
      const px = u.pos.x, pz = u.pos.z, py = u.pos.y;
      let x = px + vx * step, z = pz + vz * step;
      if (!this.canStep(px, pz, x, z, py)) {
        slopeBlocked = true;
        // 斜面の縁でも、通れる軸の分だけ進む。
        if (Math.abs(vx) >= Math.abs(vz) && this.canStep(px, pz, x, pz, py)) { z = pz; vz = 0; }
        else if (this.canStep(px, pz, px, z, py)) { x = px; vx = 0; }
        else if (this.canStep(px, pz, x, pz, py)) { z = pz; vz = 0; }
        else { x = px; z = pz; vx = 0; vz = 0; }
      }
      u.pos.x = x; u.pos.z = z;
      u.pos.y = groundAt(W, x, z, py);
      // 重なった当たりは順番に押し返すだけでは挟まる。動いた時だけ、最大四回まで解く。
      for (let j = 0; j < 4; j++) {
        const bx = u.pos.x, bz = u.pos.z;
        army.collide(u, step);
        const nx = u.pos.x - bx, nz = u.pos.z - bz, n2 = nx * nx + nz * nz;
        if (n2 < 1e-8) break;
        solidBlocked = true;
        const inward = vx * nx + vz * nz;
        if (inward < 0) { vx -= nx * inward / n2; vz -= nz * inward / n2; }
        if (j === 3) { u.pos.x = px; u.pos.z = pz; u.pos.y = py; vx = 0; vz = 0; }
      }
      if (!this.canStep(px, pz, u.pos.x, u.pos.z, py)) { u.pos.x = px; u.pos.z = pz; u.pos.y = py; vx = 0; vz = 0; }
      u.pos.y = groundAt(W, u.pos.x, u.pos.z, py);
      const drop = py - u.pos.y;
      if (drop >= 4 && !u.climb) {
        const hurt = Math.min(u.maxHp, (drop - 3) * 8);
        u.hp = Math.max(0, u.hp - hurt); u.stagger = Math.max(u.stagger || 0, .8);
        this.lastHit = { t: this.rt.t, kind: 'fall' };
        // 落ちる前の足場を覚える（崖の下で詰んだら、ここへ引き上げる）
        { const vd = Math.hypot(vx, vz) || 1; this.fallFrom = { x: px - vx / vd * 1.6, z: pz - vz / vd * 1.6, y: py, t: this.rt.t, lx: u.pos.x, lz: u.pos.z }; }
        this.rt.hud.hurt(.5); this.rt.bark('高い所から落ちて傷を負った', true);
        sfx('hit', .9); sfx('umeki', .7);
        army.burst(u.pos.x, u.pos.y + .1, u.pos.z, 5, 'dust', 0, 0, u.pos.y);
        // 本人の重傷・討死は戦の側（playerDown）で決める。ここで討たれた事にすると、倒れたまま戦が終わらない
        if (u.hp <= 0) { u.hp = 0; break; }
      }
    }
    const water = W.def.water, lim = W.def.moveLim || 176;
    // 西の海や両岸のある水面では、陸にいる人まで東岸から押し戻さない。
    if (water && u.pos.x > water.x - 1 && u.pos.x < (water.x2 ?? Infinity) + 1) {
      u.pos.x = water.x2 != null && u.pos.x > (water.x + water.x2) / 2 ? water.x2 + 1 : water.x - 1;
    }
    u.pos.x = Math.max(-lim, Math.min(lim, u.pos.x)); u.pos.z = Math.max(-lim, Math.min(lim, u.pos.z));
    const bounds = W.def.playerBoundsAt?.(this.rt) || W.def.playerBounds;
    let atEdge = false;
    if (bounds) {
      const inset = bounds.pushBack || 0;
      const bx = u.pos.x, bz = u.pos.z;
      u.pos.x = Math.max(bounds.minX + inset, Math.min(bounds.maxX - inset, bx));
      u.pos.z = Math.max(bounds.minZ + inset, Math.min(bounds.maxZ - inset, bz));
      if (u.pos.x !== bx) { this.vel.x = 0; vx = 0; }
      if (u.pos.z !== bz) { this.vel.z = 0; vz = 0; }
      const edge = Math.min(u.pos.x - bounds.minX, bounds.maxX - u.pos.x, u.pos.z - bounds.minZ, bounds.maxZ - u.pos.z);
      atEdge = edge <= inset + 0.01;
      if (edge <= 30 && !(this.edgeHintT > this.rt.t)) {
        this.edgeHintT = this.rt.t + 8;
        this.rt.hud.flash('これより先は戦場の外。矢印の方へ向き直れ', 'dim');
      }
    }
    u.pos.y = groundAt(W, u.pos.x, u.pos.z, u.pos.y);
    // 道を塞ぐ物は残す。歩こうとして足が止まった時だけ、その戦の通り道を知らせる。
    // 柵へ押し続ける時は毎コマ速度が戻される。出足の短い歩幅も詰まりに数える。
    if (!atEdge && wanted > 0.00001 && Math.hypot(u.pos.x - x0, u.pos.z - z0) < wanted * 0.2) {
      this.blockedWalkT = (this.blockedWalkT || 0) + dt;
      if (W.def.blockedHint && this.blockedWalkT >= 0.7 && !(this.blockedHintT > this.rt.t)) {
        this.blockedHintT = this.rt.t + 8;
        const record = this.rt.blockedMove || (this.rt.blockedMove = {});
        record.x = u.pos.x; record.z = u.pos.z; record.t = this.rt.t;
        record.cause = solidBlocked ? '建物や柵' : slopeBlocked ? '急な斜面' : '兵の列';
        this.rt.hud.flash(W.def.blockedHint(this.rt), 'dim');
      }
    } else this.blockedWalkT = 0;
    if (W.def.blockedEscape && this.blockedWalkT >= (W.def.blockedEscapeAfter ?? 5) && wanted > 0 && !atEdge) {
      this.blockedWalkT = 0;
      this.escapeBlocked(driveX, driveZ);
    }
    // 十秒動けない時は味方の列の先へ。ただし閉じた門・柵・切岸は一歩ずつ確かめて越さない。
    if (this.blockedWalkT >= 10 && wanted > 0 && !atEdge) {
      this.blockedWalkT = 0;
      const speed = Math.hypot(driveX, driveZ), fx = driveX / speed, fz = driveZ / speed;
      const way = this._columnWay || (this._columnWay = { ahead: 0 });
      way.ahead = 0; way.x = u.pos.x; way.z = u.pos.z; way.fx = fx; way.fz = fz; way.team = u.team;
      if (!way.visit) way.visit = (o) => {
        if (!o.alive || o.downed || o.woundOut || o.isPlayer || o.isStruct || o.team !== way.team || Math.abs(o.pos.y - u.pos.y) > 1.8) return;
        const dx = o.pos.x - way.x, dz = o.pos.z - way.z, ahead = dx * way.fx + dz * way.fz;
        if (ahead > -1 && ahead < 6 && Math.abs(dx * way.fz - dz * way.fx) < 1.6) way.ahead = Math.max(way.ahead, ahead + 1.3);
      };
      army.forNear(u.pos.x, u.pos.z, 7, way.visit);
      for (let d = 0; d < way.ahead; d += 0.2) {
        const px = u.pos.x, pz = u.pos.z, py = u.pos.y, x = px + fx * 0.2, z = pz + fz * 0.2;
        if (!this.canStep(px, pz, x, z, py)) break;
        u.pos.set(x, groundAt(W, x, z, py), z); army.collide(u, 0);
        if (Math.hypot(u.pos.x - x, u.pos.z - z) > 0.01) { u.pos.set(px, py, pz); break; }
      }
    }
    // 動き・足音・歩いた距離は入力ではなく実際の移動に合わせる。
    u.vel.x = (u.pos.x - x0) / dt; u.vel.z = (u.pos.z - z0) / dt;
    if (Math.hypot(u.vel.x, u.vel.z) < 0.05) { u.vel.x = 0; u.vel.z = 0; }
  }

  // 馬上の動き：並足・駆け足（Shift）・手綱を引く（Space）。向きは馬が少しずつ変える
  rideMove(dt, input, iz, mx, mz, ml) {
    const u = this.u, rt = this.rt, army = rt.army;
    const refused = horseThreatTick(army, u, dt, this);
    if (!this.mounted) return;
    const locked = this.mountT > 0 || this.horseStopUntil > rt.t;
    // 息とは別に長い疲れを残す。実際に駆けた分だけ、移動後に数える。
    const tired = Math.max(0, (this.hfat || 0) - 0.15) / 0.85;
    if (tired > 0.55 && this.hspd > 7 && !(this.hfatWarnT > rt.t)) { this.hfatWarnT = rt.t + 25; rt.hud.flash(`${this.horseName}が疲れてきた（並足で休ませよ）`, 'dim'); }
    const exhausted = horseExhausted(this.horse?.userData.horse, this.hfat);
    if (this.running && iz > 0 && (exhausted || this.guard) && !(this.gallopTipT > rt.t)) {
      this.gallopTipT = rt.t + 8;
      rt.hud.flash(exhausted ? `馬が疲れ切った。止めて休ませると、あと${Math.max(5, Math.ceil(((this.hfat || 0) - 0.55) * 90))}秒ほどでまた駆ける` : '構えを解くと馬を駆けさせられる', 'dim');
    }
    // 息が切れた後は三割まで休む。一コマごとに駆け足へ戻って速度が揺れない。
    if (this.breath <= 5) this.breathRest = true;
    else if (this.breath >= this.maxBreath * 0.3) this.breathRest = false;
    if (this.running && iz > 0 && this.breathRest && !(this.breathTipT > rt.t)) {
      this.breathTipT = rt.t + 8;
      rt.hud.flash('馬の息が切れた。並足で休むと、また駆けられる', 'dim');
      sfx('snort', 0.9);
    }
    const gallop = !exhausted && !this.breathRest && this.running && this.breath > 5 && iz > 0 && !this.guard;
    // 馬が傷つくほど足が鈍る（体力が半分を切ってから利いてくる）
    const hurtMul = this.horseMax ? Math.max(0.5, Math.min(1, this.horseHp / (this.horseMax * 0.5))) : 1;
    let target = locked ? 0 : iz > 0 ? (gallop && iz >= 0.8 ? Math.min(12, 11.5 * (this.horseSpeed || 1)) * (1 - 0.4 * tired) : isTouch && iz < 0.5 ? 2.2 : 5.4) * hurtMul : iz < 0 ? -1.8 : ml > 0 ? 2.2 * hurtMul : 0;
    if (refused && target > 0) target = 0;
    if (exhausted && target > 5.4) target = 5.4;   // 疲れ切っても速足までは出る
    const travelSign = target < 0 ? -1 : 1;
    const tf = terrainFx(rt.world, u, u.pos.x, u.pos.z, uphillAt(rt.world, u.pos.x, u.pos.z, Math.sin(u.heading) * travelSign, Math.cos(u.heading) * travelSign));
    u.terrain = tf.tag; u._tdef = tf.def; u._tdefHigh = tf.defHigh;
    // 山・川・田の補正が重なっても、通れる地面では並足を残す。深みと切岸は canStep で止める。
    const groundSpeed = Math.max(0.35, tf.spd);
    this.rideGround = (this.rideGround ?? groundSpeed) + (groundSpeed - (this.rideGround ?? groundSpeed)) * Math.min(1, dt * 3);
    target *= this.rideGround;
    if (this.guard && target > 3) target = 3;
    // 怯えて止まっていても、横へ向けて危険から離れられる。乗り降りの間だけ向きを固定する。
    if (!(this.mountT > 0) && (ml > 0 || this.lookIdle < 0.2)) {
      const maxTurn = (Math.abs(this.hspd) > 8 ? 1.8 : 3.2) * Math.max(0.7, tf.turn) * dt;
      const d = angleDiff(u.heading, ml > 0 ? Math.atan2(iz < 0 ? -mx : mx, iz < 0 ? -mz : mz) : this.yaw);
      u.heading += Math.max(-maxTurn, Math.min(maxTurn, d));
    }
    // 滑る前の勢いを別に覚える。実際の速さは息・蹄・攻撃へ渡し、壁の投影で次の一歩まで縮めない。
    if (!locked && !refused && Math.abs(this.hspd) > 0.05 && Math.sign(target) === Math.sign(this.rideDrive)) this.hspd = this.rideDrive;
    const acc = Math.abs(target) > Math.abs(this.hspd) && target * this.hspd >= 0 ? 4.2 : 6;
    const hspd0 = this.hspd;
    this.hspd += (target - this.hspd) * (1 - Math.exp(-dt * acc));
    // 走り出しの溜め・止まる時の前のめり（カメラが使う。加速の度合いをならす。正＝蹴り出し、負＝手綱を引いた）
    if (dt > 0) this.surge = (this.surge || 0) + (Math.max(-12, Math.min(8, (this.hspd - hspd0) / dt)) - (this.surge || 0)) * Math.min(1, dt * 6);
    // 駆け出しに嘶く（しばらくは繰り返さない）
    if (hspd0 < 6 && this.hspd >= 6 && target > 9 && !((this.neighT ?? -99) + 14 > rt.t)) { this.neighT = rt.t; sfx('neigh', 0.55); }
    this.dodgeT = -1; this.iframe = 0;
    // 気力は馬上では並足の分だけ戻る
    this.staDelay -= dt;
    if (this.staDelay <= 0) this.sta = Math.min(this.maxSta, this.sta + (this.guard ? 5 : 18) * dt);
    if (this.hspd > 4 && army.checkYari(u, this) && !this.mounted) return;
    if (!locked && !refused && ml > 0) army.makeHorseWay(u, target, dt);
    this.movePlayer(dt, Math.sin(u.heading) * this.hspd, Math.cos(u.heading) * this.hspd);
    const sp = Math.hypot(u.vel.x, u.vel.z);
    // 壁沿いに滑る速さを残す。向きへの投影を毎コマ掛けると、斜めの柵で減速し続ける。
    this.rideDrive = sp >= 0.05 ? this.hspd : 0;
    this.hspd = Math.sign(this.hspd) * Math.min(Math.abs(this.hspd), sp);
    if (sp < 0.05) { this.hspd = 0; this.strideHz = 0; }
    // 平地の全力走で約四分。坂や悪路では負担が増すが、並足・速歩は休息になる。
    // 坂で速度が落ちても全力走の負担を残し、壁で止まった時には休める。
    const exerting = sp > 0.5 && (this.hspd > 6 || (gallop && iz >= 0.8 && !locked && !refused));
    const effort = 1 + tf.tire * 0.6;
    this.hfat = Math.max(0, Math.min(1, (this.hfat || 0) + dt * (exerting ? effort / 360 : sp > 2.5 ? -1 / 300 : sp > 0.5 ? -1 / 150 : -1 / 90)));
    if (exerting) { this.breath -= (100 / 240) * effort * dt; rt.tutMark('run'); }
    else this.breath = Math.min(this.maxBreath, this.breath + this.maxBreath / (sp > 2.5 ? 240 : sp > 0.5 ? 150 : 90) * (1 - 0.5 * tired) * dt);
    this.breath = Math.max(0, this.breath);
    // 馬の息が上がると、荒い鼻息が聞こえる（息が戻るほど間遠に）
    if (this.breath < this.maxBreath * 0.3) {
      this.snortT = (this.snortT || 0) - dt;
      if (this.snortT <= 0) { this.snortT = 1.4 + this.breath / this.maxBreath * 6 + Math.random() * 0.8; sfx('snort', 0.9 - this.breath / this.maxBreath); }
    }
    if (this.breath <= 5) this.breathRest = true;
    if (this.breath < this.maxBreath * 0.25 && sp > 7 && !(this.breathLowT > rt.t)) {
      this.breathLowT = rt.t + 8;
      rt.hud.flash('馬の息が残り少ない。並足で休ませる', 'dim');
      sfx('snort', 0.75);
    }
    u.moving = Math.min(0.5, sp / 12);
    u.dodging = false;
    u.u_dodging = this.iframe > 0;
    this.movedAcc += sp * dt;
    if (this.movedAcc > 6) rt.tutMark('move');
    rt.stats.dist += sp * dt;
    // 蹄の音は下の一完歩の拍子で鳴らす（歩く・速歩・駆ける）。土ぼこりは駆ける時だけ
    if (sp > 7 && rt.world.rainLevel < 0.3) { this.stepT -= dt; if (this.stepT <= 0) { this.stepT = 2.4; rt.world.puff(u.pos.x, u.pos.z, 4); } } else this.stepT = Math.max(this.stepT, 0.6);
    // 歩き方（並足・速歩・駆歩・襲歩）の一完歩の拍子。カメラの揺れと、駆ける時の重い蹄・鼻息・蹴り上げる土を同じ拍子で
    const hz = sp < 0.2 ? 0 : sp < 2.5 ? 0.95 : sp < 6.5 ? 2.6 : sp < 9.8 ? 1.75 : 2.3;
    this.strideHz = (this.strideHz || 0) + (hz - (this.strideHz || 0)) * Math.min(1, dt * 3);
    const ph0 = this.gaitPh || 0;
    this.gaitPh = ph0 + dt * this.strideHz;
    if (sp > 0.4 && Math.floor(this.gaitPh) !== Math.floor(ph0)) {
      this.strideN = (this.strideN || 0) + 1;
      // 足並みに合わせた蹄（並足・速歩・駆歩・襲歩）と、馬具の鳴り。数えた音（__hoofLog）は確かめ用
      const gait = sp < 2.5 ? 'hoofWalk' : sp < 6.5 ? 'hoofTrot' : sp < 9.8 ? 'hoofCanter' : 'hoofGallop';
      const hv = gait === 'hoofWalk' ? 0.55 : gait === 'hoofTrot' ? 0.75 : gait === 'hoofCanter' ? 0.9 : 1;
      sfx(gait, hv);
      if (this.strideN % 2 === 0) sfx('tack', gait === 'hoofWalk' ? 0.5 : 0.8);
      if (gait === 'hoofWalk' && this.strideN % 7 === 0) sfx('snort', 0.2);
      if (window.__hoofLog) window.__hoofLog.push([gait, +sp.toFixed(1)]);
    }
    if (sp > 6 && Math.floor(this.gaitPh) !== Math.floor(ph0)) {
      const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
      // 駆けている間の息：一完歩ごとに強く吐く（息が上がるほど荒い）
      if (Math.floor(this.gaitPh) % 2 === 0) sfx('snort', 0.18 + 0.5 * (1 - this.breath / this.maxBreath));
      const wd = rt.world;
      if (wd.kick && !(wd.rainLevel > 0.6)) wd.kick(u.pos.x - fx * 0.9, u.pos.z - fz * 0.9, fx, fz, sp > 9 ? 3 : 2, sp);
    }
    // 駆けていれば、前の敵を蹴散らす（槍衾には止められる）
    if (sp > 6) {
      if (this.hspd > 4 && army.checkYari(u, this)) return;
      const loss = army.trample(u, this.hspd);
      if (loss < 1) {
        this.hspd *= loss; this.rideDrive *= loss; u.vel.x *= loss; u.vel.z *= loss;
        // 当たりの重さ：一瞬止まり、首が前へ振られ、視野が詰まる
        rt.game.hitstop = Math.min(0.06, Math.max(rt.game.hitstop || 0, 0.085));
        if (!reduceMotion()) { this.pitch -= 0.035; if (S.shake) this.fovKick = Math.min(this.fovKick || 0, -3.2); }
        this.addShake(0.2);
        sfx('hoofBeat', 1);
      }
      // 道が開く：馬の前（4m ほど）の兵は、ぶつかる前に左右へ身をかわして崩れる（味方も避ける。槍衾を組んだ敵は動かない）
      this.parT = (this.parT || 0) - dt;
      if (this.parT <= 0 && army.forNear) {
        this.parT = 0.15;
        const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
        this.rideYieldX = fx; this.rideYieldZ = fz; this.rideYieldSpeed = sp;
        army.forNear(u.pos.x + fx * 2.5, u.pos.z + fz * 2.5, 3, yieldToPlayerHorse, this);
      }
    }
    // 手綱で曲がる時は進む先を見る。自分で見回している間は視点を保つ。
    const steering = Math.abs(this.inX || 0) > 0.05;
    if ((steering || S.autoCam) && !this.lock && !this.aiming && !(this.draw > 0) && !this.radial && this.lookIdle > (steering ? 0.25 : 2.5) && sp > 1) {
      if (!reduceMotion()) this.yaw += angleDiff(this.yaw, u.heading) * Math.min(1, dt * (steering ? 4 : 1.5));
    }
  }

  // 崖から落ちて二十五秒、落ちた所から十二歩も出られず、任務の印へも近づけない：味方が手を貸して元の足場へ引き上げる
  cliffRescue(rt) {
    const F = this.fallFrom, u = this.u;
    if (!F || !u.alive || u.climb) return;
    const age = rt.t - F.t;
    if (age > 120 || Math.hypot(u.pos.x - F.lx, u.pos.z - F.lz) > 12) { this.fallFrom = null; return; }
    const g = rt.missionGuide;
    if (age < 25 || (g && g.stalled < 15) || rt.army.nearestEnemy(u, 6)) return;
    this.fallFrom = null;
    u.pos.x = F.x; u.pos.z = F.z; u.pos.y = groundAt(rt.world, F.x, F.z, F.y);
    u.vel.x = u.vel.z = 0; this.hspd = 0;
    this.rt.hud.hurt?.(0.2);
    rt.bark(this.mounted ? '味方が手綱を引き、崖の上の道へ馬を戻した' : '味方が槍の柄を差し出し、崖の上の道へ引き上げた', true);
  }

  // 落馬：馬が倒れる・逃げる
  fall() {
    const rt = this.rt, u = this.u;
    if (!this.mounted) return;
    this.cancelAttack();
    this.guardOn = this.guard = this.aiming = u.guard = false;
    if (this.horseHp <= 0 && this.mounted) {
      const h = this.horse, H = h && h.userData.horse;
      rt.army.setMounted(u, false);
      if (h) {
        if (h.parent) h.parent.remove(h);
        h.position.copy(u.pos); h.rotation.set(0, u.heading, 0); rt.scene.add(h);
        if (H) { H.dead = true; H.deadT = 0; }
        (rt.army.fallenHorses || (rt.army.fallenHorses = [])).push({ h, t: 0 });
      }
      this.mounted = false; this.horse = null; this.loose = null; this.hspd = 0; this.mountT = 0;
      this.knockT = 2; this.guardBroken = 1;
      u.hp = Math.max(0, u.hp - u.maxHp * 0.2);
      rt.bark(`落馬！　${this.horseName}が倒れた`, true);
      return;
    }
    this.mountT = 0;   // 乗った直後でも確実に降ろす（toggleMount の mountT>0 ガードに阻まれない）
    this.toggleMount(true);
    if (!this.loose) return;   // 乗り役でない等で降りられなかった時は何もしない
    const L = this.loose;
    // 怯えて逃げた馬は、決まった時刻に主の所へ戻らない。落馬の傷でも命を落とす。
    L.mode = 'flee';
    this.iframe = 0; this.guardBroken = 1.0; this.knockT = 2;
    u.hp = Math.max(0, u.hp - u.maxHp * 0.15);
    this.addShake(0.35);
    sfx('neigh', 1);
    rt.bark(`落馬！　${this.horseName}が逃げた`, true);
    // 近く（30m）に主を失った空馬がいれば、乗り換えられる事を知らせる
    const LH = rt.army.looseHorses;
    if (LH && LH.some((o) => o.from && !o.kept && this.horseAlive(o) && Math.hypot(o.h.position.x - u.pos.x, o.h.position.z - u.pos.z) < 30)) {
      rt.after(2.2, () => { if (!this.mounted && u.alive) rt.bark(`近くに空馬がいる。寄って${isTouch ? '「取る」の丸' : K('use')}を長押しすれば乗り換えられる`); });
    }
  }

  updateLoose(dt) {
    const L = this.loose;
    if (!L) return;
    const rt = this.rt, u = this.u;
    if (horseLooseDanger(rt.army, this.horse, rt.t) && L.mode !== 'fled') {
      L.mode = 'flee';
    }
    this.hfat = Math.max(0, Math.min(1, (this.hfat || 0) + dt * (L.spd > 6 ? 1 / 360 : L.spd > 2.5 ? -1 / 300 : L.spd > 0.5 ? -1 / 150 : -1 / 90)));
    // 降りて休ませた馬も息を戻す。呼び寄せて歩く間も回復する。
    this.breath = Math.max(0, Math.min(this.maxBreath, this.breath + dt * (L.spd > 6 ? -100 / 240 : this.maxBreath / (L.spd > 2.5 ? 240 : L.spd > 0.5 ? 150 : 90) * (1 - 0.5 * (this.hfat || 0)))));
    let want = null, speed = 0;
    if (L.mode === 'come') {
      const d = Math.hypot(u.pos.x - L.x, u.pos.z - L.z);
      if (this.horse?.userData.horse?.fear > 0.5 || d > 15 || !this.horseReachable(this.horse.position)) L.mode = 'wait';
      if (d > 2.4) { want = Math.atan2(u.pos.x - L.x, u.pos.z - L.z); speed = L.mode === 'come' ? 2.2 : 0; } else L.mode = 'wait';
    } else if (L.mode === 'flee') {
      want = L.heading; speed = 9;
      L.fleeT = (L.fleeT || 0) + dt;
      if (L.fleeT > 12 && Math.hypot(u.pos.x - L.x, u.pos.z - L.z) > 50) { L.mode = 'fled'; this.horse.visible = false; }
    }
    if (horseExhausted(this.horse?.userData.horse, this.hfat)) speed = Math.min(speed, 2.2);
    speed *= this.horseMax ? Math.max(0.3, Math.min(1, this.horseHp / (this.horseMax * 0.6))) : 1;
    if (want !== null) L.heading += angleDiff(L.heading, want) * Math.min(1, dt * 4);
    L.spd += (speed - L.spd) * Math.min(1, dt * 2.5);
    L.h = this.horse;
    horseLooseMove(rt.army, L, dt);
    L.x = this.horse.position.x; L.z = this.horse.position.z;
    { const lim = rt.world.def.moveLim || 176; L.x = Math.max(-lim, Math.min(lim, L.x)); L.z = Math.max(-lim, Math.min(lim, L.z)); }
    this.horse.position.set(L.x, groundAt(rt.world, L.x, L.z, this.horse.position.y), L.z);
    this.horse.rotation.y = L.heading;
    animateHorse(this.horse, dt, L.spd);
  }

  // ---------------- 戦利の馬（討たれた騎馬武者の空馬を捕らえて乗る） ----------------
  // 今の馬の中身をまとめる・戻す（自分の馬と戦利の馬を乗り換えるため）
  packHorse() {
    return { horse: this.horse, name: this.horseName, speed: this.horseSpeed, max: this.horseMax, hp: this.horseHp, maxBreath: this.maxBreath, breath: this.breath, hfat: this.hfat || 0, yariResist: this.yariResist, warned: this.horseWarned, spoil: this.spoil || null };
  }
  rememberHorseCondition() {
    if (!this.ownedHorse || this.G.practice || this.rt.def.dojo) return;
    let s = this.horse === this.ownedHorse ? this.packHorse() : this.ownedLast;
    for (const o of this.rt.army.looseHorses || []) if (o.h === this.ownedHorse && o.stats) { s = o.stats; break; }
    if (!s) return;
    this.G.horse = this.G.horse || { id: 'tsukikage', bond: 0 };
    this.G.horse.condition = { health: Math.max(0, Math.min(1, s.hp / s.max)), fatigue: Math.max(0, Math.min(1, s.hfat || 0)) };
  }
  unpackHorse(s) {
    this.horse = s.horse; this.horseName = s.name; this.horseSpeed = s.speed; this.horseMax = s.max; this.horseHp = s.hp;
    this.hfat = s.hfat || 0; this.breathRest = false; this.rideGround = undefined; this.rideDrive = 0;
    this.maxBreath = s.maxBreath; this.breath = s.breath; this.yariResist = s.yariResist; this.horseWarned = s.warned; this.spoil = s.spoil;
  }

  // 徒歩の時、近くの空馬に「取る」の札を出す。E 長押し（R でも）で手綱を取って乗る
  horseAlive(o) {
    return !!o?.h?.parent && !o.h.userData.horse?.dead && (o.stats?.hp ?? o.from?.hp ?? 0) > 0;
  }

  horseCatchDuration(o) {
    const dx = this.u.pos.x - o.h.position.x, dz = this.u.pos.z - o.h.position.z;
    const behind = (Math.sin(o.heading) * dx + Math.cos(o.heading) * dz) / (Math.hypot(dx, dz) || 1) < -0.45;
    return o.calm || (behind && Math.hypot(this.u.vel.x, this.u.vel.z) < 4.2) ? 1 : 1.5;
  }

  updateTake(dt) {
    const rt = this.rt, u = this.u, L = rt.army.looseHorses;
    let best = null, bd = 3.4;
    if (!this.mounted && u.alive && L) {
      for (const o of L) {
        if (!o.from || !this.horseAlive(o) || Math.abs(o.h.position.y - u.pos.y) > 0.9) continue;
        const d = Math.hypot(o.h.position.x - u.pos.x, o.h.position.z - u.pos.z);
        if (d < bd && this.horseReachable(o.h.position)) { bd = d; best = o; }
      }
    }
    // 主を失った空馬が近く（15m）にいる事を、一戦に一度だけ知らせる（捕らえて乗れる事が分かるように）
    if (!this.looseNoted && !this.mounted && u.alive && L && L.some((o) => o.from && !o.kept && this.horseAlive(o) && Math.hypot(o.h.position.x - u.pos.x, o.h.position.z - u.pos.z) < 15)) {
      this.looseNoted = true;
      rt.bark(rt.t < 40 ? '控えの馬がいる。そばへ寄れば手綱を取って乗れる' : '乗り手を失った馬がいる。そばへ寄れば手綱を取って乗れる');
    }
    if (best !== this.takeO) {
      rt.uninteract('horse-take');
      rt.unmark('horse-loose');
      this.takeO = best;
      // 空馬の頭上に印（谷の影・煙で見えない馬を見つけられる。B109）
      if (best && !best.kept && !this.mounted) { const hp0 = best.h.position; rt.marker('horse-loose', () => ({ x: hp0.x, z: hp0.z }), '空馬', { h: 2.4 }); }
      if (best) {
        const o = best, f = o.from;
        const label = o.kept ? `馬に乗る（${o.stats.name}）` : `馬を捕らえて乗る（${f.name ? f.name + 'の馬' : f.house ? f.house + 'の馬' : '空馬'}）`;
        rt.addInteract('horse-take', () => (o.h.parent ? o.h.position : null), label, () => this.takeHorse(o), { r: 3.2, hold: o.kept ? 0 : 1.5 });
      }
    }
    const o = best;
    if (o && !o.kept) {
      // 落ち着いて止まった馬や、後ろから静かに寄った時は早く捕らえられる（1秒）。そうでなければ1.5秒
      const dx = u.pos.x - o.h.position.x, dz = u.pos.z - o.h.position.z, d = Math.hypot(dx, dz) || 1;
      const easy = this.horseCatchDuration(o) === 1;
      const it = rt.interacts.find((i) => i.id === 'horse-take');
      if (it && rt.holdId !== 'horse-take') it.hold = easy ? 1.0 : 1.5;
      // 手綱を取っている間は、馬がこちらを向いて首を振り、逃げない
      if (rt.holdId === 'horse-take') { o.held = 0.25; u.heading += angleDiff(u.heading, Math.atan2(-dx, -dz)) * Math.min(1, dt * 6); }
    }
    // R で始めた手綱取り（タッチの「乗る」も同じ）
    const c = this.catching;
    if (c) {
      const q = c.o.h.position;
      if (this.mounted || !u.alive || u.climb || this.knockT > 0 || this.staggerT > 0 || !this.horseAlive(c.o) || !this.horseReachable(q) || Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 3.4) {
        this.catching = null;
        if (u.alive && !this.mounted && !rt.over) {
          const why = !this.horseAlive(c.o) ? '馬がいなくなった。別の空馬を探す'
            : u.climb ? '登っている間は乗れない。地面へ降りて馬の横へ寄る'
            : this.knockT > 0 || this.staggerT > 0 ? '打たれて手綱を放した。敵から離れて、馬の横で取り直す'
            : !this.horseReachable(q) ? '馬の横へ回り、同じ高さで手綱を取る'
            : '馬から離れて手綱を放した。そばで足を止めて取り直す';
          rt.hud.flash(why, 'dim');
        }
      }
      else {
        c.t += dt; c.o.held = 0.25;
        u.heading += angleDiff(u.heading, Math.atan2(q.x - u.pos.x, q.z - u.pos.z)) * Math.min(1, dt * 6);
        if (c.t >= c.dur) { this.catching = null; this.takeHorse(c.o); }
      }
    }
  }

  // 床の層（floors.js）：すぐそばの梯子に「登る」の札を出す。E 長押しで登り始める（docs/castle-design.md 4-2）
  updateLadderUse(dt) {
    const rt = this.rt, u = this.u;
    const l = (!this.mounted && u.alive && !u.climb) ? ladderNear(u.pos.x, u.pos.z, 1.6, u.pos.y) : null;
    const ok = l && ladderAlive(l) && (l.team == null || l.team === u.team);
    if (ok !== this.ladderO) {
      rt.uninteract('ladder-climb');
      this.ladderO = ok ? l : null;
      if (ok) rt.addInteract('ladder-climb', () => (ladderAlive(l) ? { x: l.x, z: l.z } : null), `${l.name || '梯子'}を登る`, () => startClimb(u, l), { r: 1.8, hold: 0.4 });
    }
  }

  // 空馬に乗る。元の馬具・速さ・体力のまま。自分の馬（や前の戦利の馬）はその場に置いておく
  takeHorse(o) {
    const rt = this.rt, u = this.u, army = rt.army;
    if (!o || this.mounted || !this.horseAlive(o) || !u.alive || rt.over || u.climb ||
        Math.hypot(o.h.position.x - u.pos.x, o.h.position.z - u.pos.z) > 3.4 ||
        !this.horseReachable(o.h.position)) {
      if (o && !this.mounted) rt.hud.flash('馬の横へ回る。同じ高さで手綱を取る', 'dim');
      return;
    }
    this.cancelAttack();
    rt.uninteract('horse-take'); this.takeO = null; this.catching = null;
    if (this.horse === this.ownedHorse) this.ownedLast = this.packHorse();
    const LH = army.looseHorses;
    const i = LH.indexOf(o);
    if (i >= 0) LH.splice(i, 1);
    // 今の馬を置く：待っている馬は空馬の列に入れて、また乗れるようにする。逃げ去った戦利の馬は消す
    if (this.horse && this.loose) {
      const L = this.loose;
      if (L.mode !== 'fled' && L.mode !== 'flee') {
        LH.push({ h: this.horse, heading: L.heading, spd: 0, t: 99, kept: true, calm: true, stats: this.packHorse(), from: { team: u.team, house: '', name: '' } });
        this.horse.visible = true;
      } else if (this.spoil) rt.scene.remove(this.horse);
    }
    this.loose = null;
    let first = false;
    if (o.stats) this.unpackHorse(o.stats);
    else {
      const f = o.from;
      const who = f.name || (f.house ? `${f.house}の騎馬武者` : '騎馬武者');
      this.unpackHorse({ horse: o.h, name: f.team !== u.team ? '分捕り馬' : '借り馬', speed: f.speed, max: f.maxHp || f.hp, hp: f.hp, hfat: f.hfat || 0, maxBreath: 100, breath: 70, yariResist: 1, warned: false, spoil: { who, team: f.team } });
      first = true;
    }
    this.canRide = true;
    // 乗る（手綱を取った馬の横から鞍へ）
    rt.scene.remove(this.horse);
    this.horse.visible = true;
    u.heading = o.heading;
    u.pos.x = o.h.position.x; u.pos.z = o.h.position.z;
    army.setMounted(u, true, this.horse);
    this.mounted = true; this.mountT = 0.5; this.hspd = 0;
    sfx('snort', 0.7);   // 乗ると馬が鼻を鳴らす
    sfx('neigh', 0.8);
    if (first) {
      const S = this.spoil;
      if (S.team !== u.team && !this.spoilAwarded) {
        // 敵の馬を分捕った（戦功は一戦に一度。戦の終わりの戦功の表に載る）
        this.spoilAwarded = true;
        rt.award((t) => t.side.push(`${S.who}の馬を分捕った`), `${S.who}の馬を分捕った`, u.pos);
      } else rt.hud.flash(S.team !== u.team ? `${S.who}の馬に乗った` : '味方の空馬に乗った', 'dim');
      rt.hint('ride');
    }
  }
}
