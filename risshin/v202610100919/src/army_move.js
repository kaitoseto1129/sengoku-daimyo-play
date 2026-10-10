import { recoverGround, mountainWay } from './army_local_way.js';
import { groundAt } from './floors.js';
// Army の手法：足と当たり（steer・押し合い・ぶつかり・待つ間の小さな動き）
// （units.js から分けた。中身は元のまま。外の係は今までどおり units.js から import してよい）
import { angleDiff, distToSeg } from './units.js';
import { CollisionGrid } from './collision_grid.js';
import { IDLE } from './units_flags.js';
import { sm } from './units_model.js';
import { terrainFx, uphillAt } from './terrain_tags.js';
import { startWallClimb } from './siege_ladder.js';
import { INTERIOR_WALLS, interiorBlocked, interiorFollow } from './shironaka.js';

// 束22：逆茂木の「遅くする帯」。army.structs は多いので、struct.band を持つ物（置いた戦だけ）を
// 1コマに一度だけ拾い出して使い回す（army.time が変わった時だけ拾い直す）
function sakamogiBands(army) {
  const bands = army._sakaCache || (army._sakaCache = []);
  if (army._sakaT === army.time) return bands;
  army._sakaT = army.time; bands.length = 0;
  for (const s of army.structs || []) if (s.alive && !s.opened && s.band) bands.push(s);
  return bands;
}

// 先の一点だけだと、斜面の角を飛び越した所を「歩ける」と見誤る。
function slopeWay(world, x, z, dx, dz, y) {
  for (let i = 1; i <= 5; i++) {
    const px = x + dx * i * 0.2, pz = z + dz * i * 0.2;
    if (!world.walkable(px, pz, y)) return false;
    y = groundAt(world, px, pz, y);
  }
  return true;
}

// Army の手法（units.js の class Army に足す）
export const ArmyMove = {

  // 口の数え（army.chokes ＝ [{ a, b, w }]：口の両端 a・b と幅 w）。一つの口につき一コマに一度だけ数える
  //   芯（口の中ほど、両端の線から 2.5m）の人数 core と、口の前後（8m）の人数 queue を数えておく
  gateStat(ch) {
    if (ch._t === this.time) return ch;
    ch._t = this.time;
    const dx = ch.b.x - ch.a.x, dz = ch.b.z - ch.a.z, len = Math.hypot(dx, dz) || 1;
    const tx = dx / len, tz = dz / len, nx = -tz, nz = tx;
    let core = 0, queueA = 0, queueB = 0;
    this.forNear((ch.a.x + ch.b.x) / 2, (ch.a.z + ch.b.z) / 2, len / 2 + 9, (o) => {
      if (!o.alive || o.isStruct) return;
      const px = o.pos.x - ch.a.x, pz = o.pos.z - ch.a.z;
      const s = px * tx + pz * tz, r = px * nx + pz * nz;
      if (s < -1.5 || s > len + 1.5) return;
      if (Math.abs(r) < 2.5) core++;
      if (Math.abs(r) < 8) { if (r >= 0) queueA++; else queueB++; }
    });
    // maxFlow（tsumari.js・束20）があればそれを芯の定員に使う。無い口は今まで通り幅から出す
    ch._cap = ch.maxFlow != null ? Math.max(1, ch.maxFlow) : Math.max(1, ch.w * 0.7);   // 幅 5m の口で一秒に 3〜4 人
    ch._core = core; ch._queueA = queueA; ch._queueB = queueB;
    return ch;
  },

  // ある兵が口の混みに掛かっているか（芯にいれば通す数を絞り、前後で 5m升に 8 人を超えて集まれば向きを変える速さも落ちる）
  gateFactor(u) {
    let spd = 1, rate = 1;
    for (const ch of this.chokes) {
      const dx = ch.b.x - ch.a.x, dz = ch.b.z - ch.a.z, len = Math.hypot(dx, dz) || 1;
      const tx = dx / len, tz = dz / len, nx = -tz, nz = tx;
      const px = u.pos.x - ch.a.x, pz = u.pos.z - ch.a.z;
      const s = px * tx + pz * tz, r = px * nx + pz * nz;
      if (s < -1.5 || s > len + 1.5 || Math.abs(r) > 9) continue;
      // 閉じた門の狭さは攻め手が詰まるためのもの。門の持ち主（守り手）が自分の門を通って退く時は詰まらせない
      if (ch.team != null && u.team === ch.team) continue;
      this.gateStat(ch);
      if (Math.abs(r) < 2.5 && ch._core > ch._cap) spd = Math.min(spd, ch._cap / ch._core);
      const queue = r >= 0 ? ch._queueA : ch._queueB;
      if (queue > 8) {
        const over = queue - 8;
        rate = Math.min(rate, Math.max(0.3, 1 - over / 14));
        spd = Math.min(spd, Math.max(0.4, 1 - over / 20));
      }
    }
    if (spd === 1 && rate === 1) return null;
    const result = u._gateFactor || (u._gateFactor = { spd: 1, rate: 1 });
    result.spd = spd; result.rate = rate; return result;
  },

  // 竪堀（束21）：斜面を横に進む兵が竪堀の縁に当たって二秒ほど進めない時、竪堀の上か下の近い端の先へ
  // 隊の行き先を一度だけ置き直す（端を回ったら元の行き先へ戻す）。竪堀の無い戦・城の道の網（castleRoute）の無い戦は何もしない
  tateDetour(u, want, g) {
    const wd = this.world && this.world.def;
    if (!wd || !wd.castleRoute || !wd.tateLines || !wd.tateLines.length || !g || g.isPlayerSquad || g._tateRe) return false;
    for (const L of wd.tateLines) {
      const P = L.pts, n = P.length;
      for (let i = 0; i < n - 1; i++) {
        const [ax, az] = P[i], [bx, bz] = P[i + 1];
        const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-6;
        const t = Math.max(0, Math.min(1, ((u.pos.x - ax) * dx + (u.pos.z - az) * dz) / L2));
        const ex = u.pos.x - (ax + dx * t), ez = u.pos.z - (az + dz * t);
        if (Math.hypot(ex, ez) > L.w / 2 + 2.2) continue;
        // 行き先が竪堀の向こう側（線の左右が入れ替わる）の時だけ回る
        const side = (p) => Math.sign(dx * (p.z - az) - dz * (p.x - ax));
        if (side(u.pos) === side(want)) continue;
        // 線の上の端と下の端（高い方が上）。近い方の先 4m へ
        const [sx, sz] = P[0], [tx, tz] = P[n - 1];
        const ds = Math.hypot(u.pos.x - sx, u.pos.z - sz), dtn = Math.hypot(u.pos.x - tx, u.pos.z - tz);
        const [kx, kz, ox, oz] = ds < dtn ? [sx, sz, P[1][0], P[1][1]] : [tx, tz, P[n - 2][0], P[n - 2][1]];
        const ol = Math.hypot(kx - ox, kz - oz) || 1;
        const pt = { x: kx + (kx - ox) / ol * (L.w / 2 + 4), z: kz + (kz - oz) / ol * (L.w / 2 + 4) };
        if (g.order === 'path' && g.path) { g._tatePath = g.path; g._tateIdx = g.pathIdx || 0; g.path.splice(g._tateIdx, 0, [pt.x, pt.z]); }
        else if (g.order === 'move' && g.dest) {
          const back = g.dest, after = g.onArrive;
          g.dest = pt; g._tateDest = pt;
          // 端を回ったら元の行き先へ（その間に別の下知で行き先が変わっていれば、何もしない）
          g.onArrive = (gg) => { if (gg.dest === pt && gg.order === 'move') { gg.dest = back; gg.onArrive = after; gg._tateRe = false; } };
        } else return false;
        g._tateRe = true;
        this.tateN = (this.tateN || 0) + 1;
        return true;
      }
    }
    return false;
  },

  // 深みを横切る行き先なら、近い浅瀬へ回る。行き先の入れ物は兵ごとに使い回す。
  riverDetour(u, want) {
    const W = this.world;
    if (!want || u.isPlayer || !W.def.streams?.length) return want;
    for (const st of W.def.streams) {
      if (!st.fords?.length || !st.pts?.length) continue;
      for (let i = 0; i < st.pts.length - 1; i++) {
        const a = st.pts[i], b = st.pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1];
        const side = dx * (u.pos.z - a[1]) - dz * (u.pos.x - a[0]);
        const end = dx * (want.z - a[1]) - dz * (want.x - a[0]);
        if (side * end >= 0) continue;
        const t = side / (side - end), x = u.pos.x + (want.x - u.pos.x) * t, z = u.pos.z + (want.z - u.pos.z) * t;
        const along = ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1);
        if (along < 0 || along > 1 || W.waterFootDepthAt(x, z, groundAt(W, x, z, u.pos.y)) <= 0.85) continue;
        let best = null, distance = Infinity, bankZ = z;
        for (const f of st.fords) {
          // 浅瀬の幅は横方向の半幅。川の折れと縦の距離も含める。
          let fz = z, near = Infinity;
          for (let j = 0; j < st.pts.length - 1; j++) {
            const c = st.pts[j], e = st.pts[j + 1];
            if (f.x < Math.min(c[0], e[0]) || f.x > Math.max(c[0], e[0])) continue;
            const zz = e[0] === c[0] ? (f.z ?? Math.max(Math.min(c[1], e[1]), Math.min(Math.max(c[1], e[1]), u.pos.z))) : c[1] + (e[1] - c[1]) * (f.x - c[0]) / (e[0] - c[0]);
            const d = Math.hypot(f.x - u.pos.x, zz - u.pos.z) + Math.hypot(f.x - want.x, zz - want.z) * 0.3;
            if (d < near) { near = d; fz = zz; }
          }
          if (near < distance) { distance = near; best = f; bankZ = fz; }
        }
        if (!best) continue;
        const pt = u._riverWant || (u._riverWant = { x: 0, z: 0 });
        const radius = u.mounted ? 0.7 : 0.45;
        // 増水を自前で扱う戦では、その浅瀬の水深を使う。平時の上限で岸に止めない。
        const fordDepth = st.fordDepth ?? 0.85;
        const aligned = Math.abs(u.pos.x - best.x) <= Math.max(0, best.w - radius) &&
          W.waterDepthAt(u.pos.x - radius, bankZ) <= fordDepth && W.waterDepthAt(u.pos.x + radius, bankZ) <= fordDepth;
        // 川の向きに直角な岸へ寄る。縦に流れる川も同じ側を保つ。
        const len = Math.hypot(dx, dz) || 1, nx = -dz / len, nz = dx / len;
        const bank = (aligned ? Math.sign(end) : Math.sign(side)) * (st.w + 4);
        pt.x = aligned ? u.pos.x + nx * bank : best.x + nx * bank;
        pt.z = bankZ + nz * bank;
        return pt;
      }
    }
    return want;
  },

  steer(u, dt, want, speed, face) {
    const orderGroup = u.group;
    const orderX = orderGroup?.order === 'move' ? orderGroup.dest?.x : orderGroup?.order === 'path' ? orderGroup.path?.[orderGroup.pathIdx]?.[0] : undefined;
    const orderZ = orderGroup?.order === 'move' ? orderGroup.dest?.z : orderGroup?.order === 'path' ? orderGroup.path?.[orderGroup.pathIdx]?.[1] : undefined;
    // 使番の相手は歩き続ける。細かな行き先の変化で詰まりの時計を消さない。
    const destChanged = orderGroup?.isRunner && Number.isFinite(orderX) && Number.isFinite(u._stuckX)
      ? Math.hypot(orderX - u._stuckX, orderZ - u._stuckZ) > 3
      : u._stuckX !== orderX || u._stuckZ !== orderZ;
    if (u._stuckOrder !== orderGroup?.order || destChanged || u._stuckFocus !== orderGroup?.focus) {
      if (u.stk) { u.stk.t = 0; u.stk.d = 0; u.stk.s = 0; u.stk.n = 0; u.stk.bigN = 0; u.stk.x = u.pos.x; u.stk.z = u.pos.z; }
      u._stuckOrder = orderGroup?.order; u._stuckX = orderX; u._stuckZ = orderZ; u._stuckFocus = orderGroup?.focus;
    }
    want = interiorFollow(this.interiorRooms, u, want, this.playerUnit);
    if (want && want === u._innerWay) speed = Math.max(speed, u.speed * 0.7);
    // 梯子を登っている間は歩みで動かさない（siege_ladder.js の updateLadders が高さと位置を進める。docs C3）
    if (u.climb) { u.mv.x = 0; u.mv.z = 0; u.push.x = 0; u.push.z = 0; u.vel.x = 0; u.vel.z = 0; u.moving = 0; return; }
    // 味方の旗持ちは自分から四メートル半あける。押し戻さず、通れる道を歩いて離れる。
    const p = this.playerUnit;
    // 使番は三メートル以内まで寄って下知を伝える。馬の待機距離で行き先を変えない。
    if (p?.alive && u !== p && !u.group?.isRunner && u.team === p.team && (u.stdHeld || u.banner || u.look?.standard || u.uma) && !u.fleeing && !u.target && !u.atk && !u.swing && !u.stdPickup && Math.abs(u.pos.y - p.pos.y) < 3) {
      const dx = u.pos.x - p.pos.x, dz = u.pos.z - p.pos.z, d = Math.hypot(dx, dz);
      const wx = (want ? want.x : u.pos.x) - p.pos.x, wz = (want ? want.z : u.pos.z) - p.pos.z;
      if (d < 3.5 || wx * wx + wz * wz < 20.25) {
        const q = u._flagSpace || (u._flagSpace = { x: 0, z: 0 });
        const x = d > 0.1 ? dx / d : Math.cos(p.heading), z = d > 0.1 ? dz / d : -Math.sin(p.heading);
        q.x = p.pos.x + x * 4.5; q.z = p.pos.z + z * 4.5;
        want = q;
        speed = Math.max(speed, u.speed * 0.6);
      }
    }
    // 道譲りは押す速さだけでなく行き先に残す。兵の更新で押しが消えても列へ戻らない。
    if (u._yieldUntil > this.time && p?.alive && u.team === p.team && !u.isPlayer && !u.climb && !u.downed) {
      const q = u._yieldWant || (u._yieldWant = { x: 0, z: 0 });
      q.x = u._yieldX; q.z = u._yieldZ; want = q; speed = Math.max(speed, u.speed);
    }
    want = mountainWay(this, u, want);
    if (want && want !== u._mountainWant && !u.isPlayer && !u.fleeing && this.world?.def.moveWay) want = this.world.def.moveWay(this, u, want);
    if (want && u.fleeing && this.world?.def.fleeWay) want = this.world.def.fleeWay(this, u, want);
    // 持ち場・追撃・避け足の行き先も場の内へ。位置だけ戻すと外へ歩き続ける。
    const lim = this.world.def.moveLim || 176;
    if (want && (Math.abs(want.x) > lim || Math.abs(want.z) > lim)) {
      const q = u._fieldWant || (u._fieldWant = { x: 0, z: 0 });
      q.x = Math.max(-lim, Math.min(lim, want.x)); q.z = Math.max(-lim, Math.min(lim, want.z));
      want = q;
    }
    want = this.riverDetour(u, want);
    // 敗走・陣形の端・迂回先も、場外へ歩こうとする前に収める。
    // 兵は端から少し内側へ。行き先は隊や相手と共有するので、兵ごとの入れ物を使い回す。
    if (want) {
      const fieldLim = lim - (u.isPlayer ? 0 : 0.3);
      if (Math.abs(want.x) > fieldLim || Math.abs(want.z) > fieldLim) {
        const q = u._fieldWay || (u._fieldWay = { x: 0, z: 0 });
        q.x = Math.max(-fieldLim, Math.min(fieldLim, want.x));
        q.z = Math.max(-fieldLim, Math.min(fieldLim, want.z));
        want = q;
      }
    }
    // 押し合いで切岸へ出た兵を、八歩先へ飛ばさず同じ側の足場へ歩かせる。
    if (!u.isPlayer && !(u._groundCheckAt > this.time)) {
      u._groundCheckAt = this.time + 1;
      u._groundReturn = recoverGround(this, u, false) || null;
    }
    if (u._groundReturn && !this.world.walkable(u.pos.x, u.pos.z, u.pos.y)) {
      want = u._groundReturn; speed = Math.min(u.speed, 2);
    } else u._groundReturn = null;
    const g = u.group, mounted = !!u.mounted;
    const rankLine = g && !g.routed && !g.cav && !(g.cavShare > 0.1) && !g.isGun && !mounted && !u.isPlayer && !u.fleeing && !(u.stagger > 0) && !u.woundOut &&
      (g.formation === 'line' || g.formation === 'yari') && !g.marching;
    // 持ち場を追う兵は隊の歩みに合わせる。遅れた分だけ小さく速める。
    if (rankLine && want && !u.target && !u.atk && !u.swing && !u.confused && !(g.regroupT > 0) && (g.order === 'move' || g.order === 'path' || g.order === 'follow') && g.anchorSpeed > 0.3) {
      const gap = Math.hypot(want.x - u.pos.x, want.z - u.pos.z);
      speed = Math.min(speed, g.anchorSpeed + Math.min(0.7, gap * 0.25));
    }
    let rate = mounted ? 2.4 : u.target && !u.isPlayer ? 3.4 : 5;   // 向きを変えられる速さ（rad/s）。斬り合う間は体の回りを少し重く
    if (u.atk && !u.atk.gun && !u.atk.bow) speed = Math.min(speed, (u.wpnKind || u.lookWeapon) === 'spear' ? 0.35 : 0.6);
    // 地形の種類による速さ・向き変え（M1。タグの無い所＝'open' は今までと同じ）
    if (this.world && this.world.heightAt) {
      const uphill = want ? uphillAt(this.world, u.pos.x, u.pos.z, want.x - u.pos.x, want.z - u.pos.z) : false;
      const tf = terrainFx(this.world, u, u.pos.x, u.pos.z, uphill);
      u.terrain = tf.tag;
      u._tdef = tf.def; u._tdefHigh = tf.defHigh;   // 切岸の登り・堀の底で受ける損が増える（army_combat の damage。束21）
      if (tf.loose && g) { g.formLoose = this.time; g._looseT = this.time; }   // 陣形が保てない（units_group の slotPos が並びを乱す。束21）
      speed *= tf.spd; rate *= tf.turn;
      if (tf.tire > 0 && want && speed > 0.1 && Math.hypot(u.mv.x, u.mv.z) > 0.2) {
        u.tire = Math.min(3, (u.tire || 0) + tf.tire * dt * (uphill ? 0.06 : 0.03));
      } else u.tire = Math.max(0, (u.tire || 0) - dt * 0.3);
      u._terrainTire = tf.tire;
      if (u.tire > 0) speed *= 1 - Math.min(0.4, u.tire * 0.15);
    }
    // 逆茂木の帯：歩兵0.6・騎馬0.25（騎馬は帯の中で突撃を切る。army_think.js が u._bandCut を見る。束22）
    u._bandCut = false;
    if (this.structs && this.structs.length) {
      const bands = sakamogiBands(this);
      for (let i = 0; i < bands.length; i++) {
        const s = bands[i];
        if (distToSeg(u.pos.x, u.pos.z, s.band) < (s.bandR ?? 1.6)) {
          speed *= mounted ? 0.25 : 0.6;
          if (mounted) u._bandCut = true;
          break;
        }
      }
    }
    // 口（army.chokes＝城攻めの段取りが登録する狭い出入り口）の混み合い：口が無い戦は今までどおり
    u._gated = false;
    if (this.chokes && this.chokes.length && u.alive && !u.isPlayer) {
      const gf = this.gateFactor(u);
      if (gf) { rate *= gf.rate; speed *= gf.spd; u._gated = gf.spd < 0.9; }
    }
    // 前が詰まった隊は陣形を崩す（束20-2）。抜けた兵がいなくなって少し経ったら戻す
    if (g) {
      if (u._gated) { g.formLoose = this.time; g._looseT = this.time; }
      else if (g.formLoose != null && this.time - (g._looseT ?? g.formLoose) > 1.5) g.formLoose = null;
    }
    let sp = 0, fx = 0, fz = 0;
    if (want) {
      const dx = want.x - u.pos.x, dz = want.z - u.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-3) {
        fx = dx / d; fz = dz / d;
        // 着く前に足をゆるめる（隊が進んでいれば、その歩みに合わせる）
        const gs = g && g.anchorSpeed > 0.3 ? g.anchorSpeed : 0;
        sp = Math.min(speed, gs + 0.4 + d * (mounted ? 1.0 : 1.5));
        // 引き足：「退け」の隊は、敵が近い（38m）うちは正面を敵に向けたまま下がる（背を見せて走るのは「逃げよ」＝潰走の時）
        const backStep = g && ((u.rearWound && u.target?.alive) || (g.order === 'retreat' && g._foeNear) || u.backUntil > this.time) && !u.fleeing && !mounted && !u.isPlayer;
        if (backStep && d > 1.2) {
          this.turn(u, u.rearWound && u.target?.alive ? this.faceTo(u, u.target) : u.backUntil > this.time ? u.backFace : g._face ?? g.facing, dt, rate);
          sp = Math.min(sp, u.speed * 0.75);
        } else if (!mounted && !u.isPlayer && !u.fleeing && face != null &&
            (u.target?.alive || u.pressBack || u.combatRetreat)) {
          // 敵を見たまま横へ寄り、後ずさる。歩く先へ体を向け直して穂先を外さない。
          this.turn(u, face, dt, rate);
          if (dx * Math.sin(face) + dz * Math.cos(face) < 0) sp = Math.min(sp, u.speed * 0.75);
        } else if (d > (mounted ? 0.6 : 1.2) || u.fleeing) {
          const hd = Math.atan2(dx, dz);
          this.turn(u, hd, dt, rate);
          const off = Math.abs(angleDiff(u.heading, hd));
          if (mounted) {
            // 馬は横へは歩けない：向いている方へ進み、大きく曲がるときは速さを落とす
            sp *= Math.max(0.3, Math.cos(Math.min(off, 1.3)));
            fx = Math.sin(u.heading); fz = Math.cos(u.heading);
          } else if (off > 1.3) sp *= 0.4;   // 大きく向きを変えるときは、まず向き直る
        } else {
          // 持ち場の少しの直しは、向きを変えずに横へ寄る
          sp = Math.min(sp, mounted ? 1.2 : 1.6);
          this.turn(u, face ?? (g ? g._face ?? g.facing : u.heading), dt, rate * 0.5);
        }
      } else if (face != null) this.turn(u, face, dt, rate * 1.2);
    } else if (face !== null && face !== undefined) this.turn(u, face, dt, rate * 1.2);
    // 詰まり：行き先がまだ遠いのに二秒ほどでほとんど進めなければ、しばらく斜め横へ回り込む
    // （押し合い・前の者の背・柵の角で、足踏みもせずに止まったままにしない）
    const detourMax = sp;
    let detour = false;
    // 川の中でも、止まった列の後ろから回り込める。深みの判定は下の slopeWay が守る。
    if (IDLE.on && want && !u.isPlayer && sp > 0.2) {
      const S = u.stk || (u.stk = { x: u.pos.x, z: u.pos.z, t: 0, d: 0, s: 1 });
      S.t += dt;
      if (S.t > 2) {
        const far = Math.hypot(want.x - u.pos.x, want.z - u.pos.z) > 1.5;
        const moved = Math.hypot(u.pos.x - S.x, u.pos.z - S.z);
        if (far && S.d <= 0 && moved < 0.35 && this.tateDetour(u, want, g)) { S.n = 0; }
        else if (far && S.d <= 0 && moved < 0.35) {
          // 三度続けて抜けられない時は、大きく横（やや後ろ）へ回って、別の筋から寄り直す（20 秒立ち尽くさない）
          S.n = (S.n || 0) + 1;
          const big = S.n >= 3;
          if (big) {
            // 大回りが続けて空振りした時だけ向きを変える（毎回逆へ振ると、長い壁ぞいで行ったり来たりして抜けられない）
            S.bigN = (S.bigN || 0) + 1;
            if (S.bigN > 2 || !S.s) { S.s = S.s ? -S.s : (Math.random() < 0.5 ? -1 : 1); S.bigN = 0; }
            S.d = 2.6 + Math.random() + Math.min(5, (S.bigN) * 1.6); S.a = 1.75;
            S.n = 0;
          } else {
            S.d = 1 + Math.random() * 0.8; S.a = 1.1;
            if (!S.s) S.s = Math.random() < 0.5 ? -1 : 1;
          }
        } else if (moved > 0.8) { S.n = 0; S.bigN = 0; }
        S.t = 0; S.x = u.pos.x; S.z = u.pos.z;
      }
      if (S.d > 0) {
        S.d -= dt; detour = true;
        // 馬の回り先は行き先から決める。今の向きを毎コマ曲げると、その場を回り続ける。
        const dl = mounted ? Math.hypot(want.x - u.pos.x, want.z - u.pos.z) || 1 : 1;
        const bx = mounted ? (want.x - u.pos.x) / dl : fx, bz = mounted ? (want.z - u.pos.z) / dl : fz;
        const aa = (S.a || 1.1) * S.s, c = Math.cos(aa), s = Math.sin(aa), nx = bx * c + bz * s, nz = -bx * s + bz * c;
        fx = nx; fz = nz;
        sp = Math.min(detourMax, Math.max(sp, u.speed * 0.7));
        // 馬も詰まりを抜ける。横滑りさせず、回る方へ向いて進む。
        if (mounted) {
          this.turn(u, Math.atan2(nx, nz), dt, rate);
          fx = Math.sin(u.heading); fz = Math.cos(u.heading);
          sp = Math.min(sp, u.speed);
        }
      }
    } else if (u.stk) { u.stk.t = 0; u.stk.x = u.pos.x; u.stk.z = u.pos.z; }
    // 振りかぶり中は肩を大きく回せない。足と肩の速さを得物で分ける。
    let dvx = fx * sp, dvz = fz * sp;
    // 押し合い（馬は足軽を押しのける）・前の味方が進んでいれば詰まって待つ・立っている味方はよけて通る
    let px = 0, pz = 0, sx = 0, sz = 0, block = 1;
    const queue = !u.target || u.terrain === 'water';   // 隊列で歩くときだけ、前の者に合わせて詰まる（敵へ向かうときは押し合う）
    const r0 = mounted ? 1.25 : 0.85;
    // 槍衾と遊び手は持ち場を保つ。ほかの徒歩の兵は、走る馬の進路から接触前に横へ避ける。
    const dodge = !mounted && !u.isPlayer && !(u.stagger > 0) && !(u.planted > this.time) &&
      !(g && g.formation === 'yari' && (g.order === 'yari' || g.order === 'hold'));
    const rh = g ? g._face ?? g.facing : u.heading, rfx = Math.sin(rh), rfz = Math.cos(rh);
    let support = 0, recoil = 0;
    u._lineFront = null;
    let hx = 0, hz = 0;
    this.forNear(u.pos.x, u.pos.z, dodge ? 5 : mounted ? 1.5 : rankLine ? 2.2 : 1.3, (o) => {
      if (o === u || !o.alive || Math.abs(u.pos.y - o.pos.y) > 1.8 || this.wallBetween(u.pos, -1, o.pos)) return;
      if ((u.naka || o.naka) && (Math.abs(u.pos.y - o.pos.y) > 1.8 || interiorBlocked(INTERIOR_WALLS, u.pos, o.pos))) return;
      const dx = u.pos.x - o.pos.x, dz = u.pos.z - o.pos.z;
      const d2 = dx * dx + dz * dz;
      if (dodge && o.mounted && o.mv && d2 < 25 && Math.abs(u.pos.y - o.pos.y) < 2) {
        const hs = Math.hypot(o.mv.x, o.mv.z);
        if (hs > 4.5) {
          const vx = o.mv.x / hs, vz = o.mv.z / hs;
          const ahead = dx * vx + dz * vz, side = dx * vz - dz * vx;
          if (ahead > -0.5 && ahead < Math.min(5, hs * 0.55) && Math.abs(side) < 1.8) {
            const sign = Math.abs(side) > 0.05 ? Math.sign(side) : (u.id % 2 ? 1 : -1);
            const k = sign * (1.8 - Math.abs(side)) * (1 - Math.max(0, ahead) / 6);
            hx += vz * k; hz -= vx * k;
          }
        }
      }
      // 同じ列で実際に背へ寄った後列だけが支える。別の階・壁越しは支えない。
      if (rankLine && o.group === g && !o.mounted && !o.isPlayer && !o.fleeing && !(o.stagger > 0) && !o.woundOut && !o.rearWound && !o.downed && !(o.pinT > this.time) && !o.dropped && !o.dragging && !o.confused && d2 < 4.84 && Math.abs(u.pos.y - o.pos.y) < 0.7) {
        const cols = g._stepCols || 1, row = Math.floor(u.slot / cols), otherRow = Math.floor(o.slot / cols), ahead = -(dx * rfx + dz * rfz), side = Math.abs(dx * rfz - dz * rfx);
        if (side < g.spacing * 0.45 && Math.abs(ahead) > 0.55 && Math.abs(ahead) < 2.2) {
          const contact = Math.max(0, Math.min(1, (2.2 - Math.abs(ahead)) / 1.1));
          if (ahead < -0.55 && otherRow === row + 1) support = Math.max(support, contact * Math.min(1, o.hp / o.maxHp) * (1 - (o.fat || 0) * 0.5));
          else if (ahead > 0.55 && otherRow === row - 1) {
            recoil = Math.max(recoil, Math.min(0.8, o._lineRecoil || 0) * contact * 0.35);
            if (recoil > 0.02 || o.target?.alive) u._lineFront = o;
          }
        }
      }
      if (d2 > 2.25) return;
      if (d2 < 1e-6) {
        const side = u.id < o.id ? -1 : 1, h = g?._face ?? u.heading;
        px += Math.cos(h) * side * 0.35; pz -= Math.sin(h) * side * 0.35; return;
      }
      const d = Math.sqrt(d2);
      const rr = o.mounted ? 1.25 : r0;
      if (d < rr) {
        const k = o.isPlayer ? 5 : o.mounted && !mounted ? 5.5 : mounted && !o.mounted ? 1.1 : 3.2;
        // 駆ける馬に当たった徒歩の者は、突き飛ばされて膝をつき、蹄にかかって傷を負うことがある
        if (u.alive && o.mounted && !mounted && !u.isPlayer && o.team !== u.team && Math.hypot(o.mv.x, o.mv.z) > 4 && !(u.stagger > 0) && Math.random() < dt * 3) {
          this.damage(u, 4, o, { kind: 'charge', pierce: true });
          if (u.alive) u.stagger = Math.max(u.stagger || 0, 0.95);
        }
        const push = (rr - d) * k;
        px += dx / d * push; pz += dz / d * push;
      }
      // 押し合い：斬り合う敵と間近で向き合うと、士気と人数で勝る側が少しずつ押し込む（押し負けた側の列がじわりと下がる）
      if (o.team !== u.team && !u.isPlayer && !o.isPlayer && !mounted && !o.mounted && d < 1.5 && u.group && o.group && !u.fleeing) {
        const adv = (o.group.morale - u.group.morale) / 100 + ((o.group._readyCount ?? o.group.count) - (g._readyCount ?? g.count)) / 40 + Math.max(-0.5, Math.min(0.5, o.pos.y - u.pos.y)) * 0.5;
        if (adv > 0.05) { const k = Math.min(0.5, adv) * 0.9; px += dx / d * k; pz += dz / d * k; }
      }
      if (queue && sp > 0.3 && o.team === u.team && d < 1.3 && !o.isPlayer) {
        const ahead = -(dx * fx + dz * fz);
        if (ahead > 0.25) {
          const lat = -dx * fz + dz * fx;
          if (Math.abs(lat) < 0.7) {
            const along = o.mv ? o.mv.x * fx + o.mv.z * fz : 0;
            if (rankLine && o.group === g && Math.floor(o.slot / (g._stepCols || 1)) === Math.floor(u.slot / (g._stepCols || 1)) - 1) block = Math.min(block, Math.max(0, (d - 0.85) / 0.45));
            else if (along > 0.3) block = Math.min(block, Math.max(0.15, (d - 0.75) / 0.5));
            else { const s = (lat >= 0 ? -1 : 1) * sp * 0.7 * (1.3 - d); sx += fz * s; sz -= fx * s; }
          }
        }
      }
    });
    // 押し返される前列を後列が受ける。力は段ごとに弱まり、無限に増えない。
    if (rankLine) {
      const back = Math.max(0, -(px * rfx + pz * rfz));
      const brace = back * Math.min(0.55, support * 0.55) * Math.max(0.2, Math.min(1, g.morale / 60));
      px += rfx * (brace - recoil); pz += rfz * (brace - recoil);
    }
    // 数騎が重なっても横へ飛ばさず、小さな避け足に留める。
    const hl = Math.hypot(hx, hz), hk = hl > 1.6 ? 1.6 / hl : 1;
    sx += hx * hk; sz += hz * hk;
    if (!detour) { dvx *= block; dvz *= block; }
    // 切岸や川の深みへ直進すると units.js が歩みを毎回ゼロに戻す。
    // 無作為に振るだけでは同じ斜面へ戻るので、歩ける縁に沿って道を探す。
    // 回る側は保ち、道が開けたら元の行き先へ戻す。兵や行き先は増やさない。
    const world = this.world;
    if (want && !u.isPlayer && sp > 0.2 && world &&
      (world.noClimb || world.def.climbTan != null || world.def.riverCross || world.def.streams?.some(st => st.fords?.length))) {
      // 勾配を調べるのは一秒に八回ほど。間のコマは決めた向きを使う。
      if (!(u._slopeCheckT > this.time)) {
        u._slopeCheckT = this.time + 0.12;
        u._slopeX = u._slopeZ = 0;
        const wx = want.x - u.pos.x, wz = want.z - u.pos.z, wd = Math.hypot(wx, wz);
        if (wd > 1.2 && world.walkable(u.pos.x, u.pos.z, u.pos.y)) {
          const nx = wx / wd, nz = wz / wd;
          if (!slopeWay(world, u.pos.x, u.pos.z, nx, nz, u.pos.y)) {
            const side = u._slopeSide || (u.id % 2 ? 1 : -1);
            let found = false;
            for (let pass = 0; pass < 2 && !found; pass++) {
              const s = pass ? -side : side;
              for (let a = 0.4; a < 3; a += 0.4) {
                const c = Math.cos(a), sn = Math.sin(a) * s;
                const tx = nx * c - nz * sn, tz = nx * sn + nz * c;
                if (!slopeWay(world, u.pos.x, u.pos.z, tx, tz, u.pos.y)) continue;
                u._slopeX = tx; u._slopeZ = tz; u._slopeSide = s; found = true;
                break;
              }
            }
          } else u._slopeSide = 0;
        }
      }
      if (u._slopeX || u._slopeZ) {
        if (mounted) {
          this.turn(u, Math.atan2(u._slopeX, u._slopeZ), dt, rate);
          const k = Math.min(sp, u.speed);
          dvx = Math.sin(u.heading) * k; dvz = Math.cos(u.heading) * k;
        } else { dvx = u._slopeX * sp; dvz = u._slopeZ * sp; }
      }
    } else {
      u._slopeCheckT = 0; u._slopeSide = 0; u._slopeX = u._slopeZ = 0;
    }
    // 加減速（馬は立ち上がりが遅い）
    const cur = Math.hypot(u.mv.x, u.mv.z), tgt = Math.hypot(dvx, dvz);
    const acc = (tgt > cur ? (mounted ? 3.4 : 5.5) : (mounted ? 5 : 8)) * dt;
    const ex = dvx - u.mv.x, ez = dvz - u.mv.z, el = Math.hypot(ex, ez);
    if (el <= acc) { u.mv.x = dvx; u.mv.z = dvz; } else { u.mv.x += ex / el * acc; u.mv.z += ez / el * acc; }
    // 押し合いはならして使う（兵がガクガク揺れないように）
    const pk = Math.min(1, dt * 10);
    u.push.x += (px + sx - u.push.x) * pk; u.push.z += (pz + sz - u.push.z) * pk;
    u.vel.x = u.mv.x + u.push.x; u.vel.z = u.mv.z + u.push.z;
    u.moving = Math.min(1, Math.max(Math.hypot(u.mv.x, u.mv.z), Math.min(1.6, hl)) / 2.4);
  },

  // 味方は駆け出す前から左右へ退く。近い升だけを見て、押す強さは時間でそろえる。
  makeHorseWay(u, speed, dt) {
    if (Math.abs(speed) < 0.1) return;
    const sign = speed < 0 ? -1 : 1, fx = Math.sin(u.heading) * sign, fz = Math.cos(u.heading) * sign;
    const way = this._horseWay || (this._horseWay = {});
    way.u = u; way.fx = fx; way.fz = fz; way.dt = dt;
    if (!way.visit) way.visit = (o) => {
      const { u, fx, fz, dt } = way;
      if (o === u || !o.alive || o.isPlayer || o.isStruct || o.team !== u.team || !o.push || o.climb || o.downed || o.woundOut || Math.abs(o.pos.y - u.pos.y) > 1.8) return;
      const rx = o.pos.x - u.pos.x, rz = o.pos.z - u.pos.z;
      const ahead = rx * fx + rz * fz, lat = rx * fz - rz * fx, width = o.mounted ? 2 : 1.45;
      if (ahead < -0.8 || ahead > 4.2 || Math.abs(lat) >= width) return;
      const side = Math.abs(lat) < 0.05 ? (o.id % 2 ? 1 : -1) : Math.sign(lat);
      const k = Math.min(1, dt * 8), want = side * Math.min(3, (width - Math.abs(lat)) * 3);
      o._yieldUntil = this.time + 0.6;
      o._yieldX = o.pos.x + fz * side * Math.max(0.5, width - Math.abs(lat));
      o._yieldZ = o.pos.z - fx * side * Math.max(0.5, width - Math.abs(lat));
      const now = o.push.x * fz - o.push.z * fx;
      o.push.x += fz * (want - now) * k; o.push.z -= fx * (want - now) * k;
    };
    this.forNear(u.pos.x + fx * 1.5, u.pos.z + fz * 1.5, 3.2, way.visit);
  },

  // 体どうしの当たり：兵と兵（敵味方とも、遊び手も）の体が重ならないよう、めり込んだ分だけ押し戻す（近い升目だけを見る）
  //   徒歩は半径 0.4m の円、馬は前後に長い（首の側と尻の側の二つの円・半径 0.55m）。押し戻す割合は重さで分ける
  bodies(u, dt = 0.016) {
    if (!u.alive || u.type === 'dummy') return;
    const mounted = !!u.mounted, ra = mounted ? .55 : .4;
    const fx = mounted ? Math.sin(u.heading) : 0, fz = mounted ? Math.cos(u.heading) : 0;
    // 押し出しの合計（1 コマ分）。重なる相手が多い所（柵の口・湧いた直後）で、
    // 一人ずつの押しを足し込むと一息で何m も飛んでしまうので、1 コマで動かす分には時間に応じた上限を付ける
    let tx = 0, tz = 0;
    this.forNear(u.pos.x, u.pos.z, u.mounted ? 2.4 : 1.8, (o) => {
      if (o === u || !o.alive || o.isStruct || o.type === 'dummy' || o.fall || Math.abs(u.pos.y - o.pos.y) > 1.8) return;
      if ((u.naka || o.naka) && (Math.abs(u.pos.y - o.pos.y) > 1.8 || interiorBlocked(INTERIOR_WALLS, u.pos, o.pos))) return;
      const om = !!o.mounted, min = ra + (om ? .55 : .4);
      const ofx = om ? Math.sin(o.heading) : 0, ofz = om ? Math.cos(o.heading) : 0;
      let bx = 0, bz = 0, best2 = min * min, found = false;
      // 馬の前後二点も数だけで比べ、重なる相手ごとの配列を作らない。
      for (let i = 0; i < (mounted ? 2 : 1); i++) {
        const a = mounted ? (i ? -.5 : .6) : 0;
        for (let j = 0; j < (om ? 2 : 1); j++) {
          const b = om ? (j ? -.5 : .6) : 0;
          const dx = (u.pos.x + fx * a) - (o.pos.x + ofx * b), dz = (u.pos.z + fz * a) - (o.pos.z + ofz * b), d2 = dx * dx + dz * dz;
          if (d2 < best2) { bx = dx; bz = dz; best2 = d2; found = true; }
        }
      }
      if (!found) return;
      let d = Math.sqrt(best2), nx, nz;
      if (d > 1e-4) { nx = bx / d; nz = bz / d; } else { const a = Math.min(u.id, o.id) * 2.39996, sign = u.id < o.id ? 1 : -1; nx = Math.sin(a) * sign; nz = Math.cos(a) * sign; d = 0; }
      // どちらがどれだけ退くか：遊び手は徒歩の兵には押されにくく、馬には押される。徒歩の兵は馬から退く
      let share;
      // （味方の徒歩の兵は、遊び手に道を譲る：人垣で前へ進めなくならないように）
      // （人足・荷を担ぐ者は、遊び手を止めない）
      if (u.isPlayer) share = o.team === u.team || o.type === 'porter' ? 0 : o.mounted && !u.mounted ? 1 : u.mounted && o.team === u.team ? 0.02 : u.mounted && !o.mounted ? 0.1 : o.team === u.team ? 0.08 : 0.3;
      else if (o.isPlayer) share = u.mounted && !o.mounted ? 0.3 : 1;
      else if (u.mounted !== !!o.mounted) share = u.mounted ? 0.15 : 1;
      else share = 0.5;
      const k = (min - d) * share * (1 - Math.exp(-60 * dt));
      tx += nx * k; tz += nz * k;
    });
    const tl = Math.hypot(tx, tz), cap = 6 * dt;
    if (tl > cap) { tx = tx / tl * cap; tz = tz / tl * cap; }
    u.pos.x += tx; u.pos.z += tz;
  },

  collide(u, dt = 0.016) {
    const SG = this.structCollision || (this.structCollision = new CollisionGrid());
    SG.update(this.structs, this.time, true);
    let x0 = u.pos.x, z0 = u.pos.z, ids = SG.query(x0, z0), full = false;
    for (let i = 0; (full ? i < this.structs.length : i < ids.length || Math.abs(u.pos.x - x0) > 2 || Math.abs(u.pos.z - z0) > 2); i++) {
      // 深くめり込んで二メートル以上押された時は、残りを元の順で全て調べる。
      if (!full && (Math.abs(u.pos.x - x0) > 2 || Math.abs(u.pos.z - z0) > 2)) { i = i ? ids[i - 1] + 1 : 0; full = true; if (i >= this.structs.length) break; }
      const s = this.structs[full ? i : ids[i]];
      if (!s.alive || !s.seg || s.opened) continue;   // 開いた門（siege_gate の opened）は素通し
      if (s.yTop != null && u.pos.y >= s.yTop - .05) continue;
      const [ax, az, bx, bz] = s.seg;
      const dx = bx - ax, dz = bz - az;
      const l2 = dx * dx + dz * dz || 1;
      let t = ((u.pos.x - ax) * dx + (u.pos.z - az) * dz) / l2;
      t = Math.max(0, Math.min(1, t));
      const cx = ax + dx * t, cz = az + dz * t;
      const ox = u.pos.x - cx, oz = u.pos.z - cz;
      const d = Math.hypot(ox, oz);
      // 柵・塀との当たり：徒歩は体の太さ（0.45m）、馬は 0.7m。狭い口でも人は抜けられる（墨俣の柵の口で詰まらないように）
      const rr = u.mounted ? 0.7 : 0.45;
      if (d < rr) {
        const len = Math.sqrt(l2), side = u.vel.x * (-dz) + u.vel.z * dx > 0 ? -1 : 1;
        const nx = d > 1e-4 ? ox / d : s.nx ?? (-dz / len * side), nz = d > 1e-4 ? oz / d : s.nz ?? (dx / len * side);
        u.pos.x = cx + nx * rr; u.pos.z = cz + nz * rr;
        // 駆けてきた騎馬は柵に当たって止まる（馬が竿立ちになり、しばらく動けない）
        if (u.mounted && u.charging && u.team !== s.team) {
          this.cavalryStopped(u, cx, cz, 18);
          u.stagger = 1.4;
          // 何騎も当たるほど柵は緩み、一騎ごとの痛みも増す（傾きは structWear）
          s.knock = (s.knock || 0) + 1;
          s.hp -= 8 + Math.min(12, s.knock * 2);
          this.play('knock', { x: cx, z: cz }, 1);
          if (this.hooks.onCavalryStopped) this.hooks.onCavalryStopped(u, s);
          if (u.hp <= 0) this.kill(u, null);
          else if (s.hp <= 0 && s.alive) { s.alive = false; s.hp = 0; s.hitFrom = { x: u.pos.x, z: u.pos.z }; this.structFall(s); if (this.hooks.onStructDestroyed) this.hooks.onStructDestroyed(s); }
          else { s.hitFrom = { x: u.pos.x, z: u.pos.z }; this.structWear(s); }
        }
        // 柵・塀・石垣にただ突っかかるだけに見えないよう、しばらく押し続けた歩兵はよじ登る（門は siege_gate.js の仕組みに任せる）
        else if (!u.mounted && !u.isPlayer && u.alive && !u.fleeing && !u.group?.routed && !u.downed && !(u.pinT > this.time) && !(u.stagger > 0) && !u.woundOut && !u.rearWound && !u.dragging && u.team !== s.team && !u.climb && !s.noClimb && s.name !== '崖' && !(s.name && s.name.indexOf('門') >= 0)) {
          u._wallStuckT = (u._wallStuckS === s ? (u._wallStuckT || 0) + dt : 0);
          u._wallStuckS = s;
          if (u._wallStuckT > 1.3 && Math.random() < 1 - Math.pow(0.98, dt * 60)) startWallClimb(u, s, { height: s.h });
        }
      }
    }
    if (u._wallStuckS && (!u._wallStuckS.alive || u._wallStuckS.opened || distToSeg(u.pos.x, u.pos.z, u._wallStuckS.seg) > (u.mounted ? 0.7 : 0.45) + 0.05)) { u._wallStuckS = null; u._wallStuckT = 0; }
    x0 = u.pos.x; z0 = u.pos.z; ids = SG.query(x0, z0); full = false;
    for (let i = 0; (full ? i < this.structs.length : i < ids.length || Math.abs(u.pos.x - x0) > 2 || Math.abs(u.pos.z - z0) > 2); i++) {
      if (!full && (Math.abs(u.pos.x - x0) > 2 || Math.abs(u.pos.z - z0) > 2)) { i = i ? ids[i - 1] + 1 : 0; full = true; if (i >= this.structs.length) break; }
      const s = this.structs[full ? i : ids[i]];
      if (!s.alive || s.opened || !s.solidR) continue;
      if (s.yTop != null && u.pos.y >= s.yTop - .05) continue;
      const dx = u.pos.x - s.x, dz = u.pos.z - s.z;
      const d = Math.hypot(dx, dz);
      if (d < s.solidR) {
        const nx = d > 1e-4 ? dx / d : Math.sin(u.heading), nz = d > 1e-4 ? dz / d : Math.cos(u.heading);
        u.pos.x = s.x + nx * s.solidR; u.pos.z = s.z + nz * s.solidR;
      }
    }
    // 建物・陣幕・置き物（props.js の SOLIDS。battle.js が army.solids に渡す）：押し戻すだけ
    const SO = this.solids;
    if (SO && SO.length) {
      const WG = this.solidCollision || (this.solidCollision = new CollisionGrid());
      WG.update(SO, this.time, false);
      x0 = u.pos.x; z0 = u.pos.z; ids = WG.query(x0, z0); full = false;
      for (let i = 0; (full ? i < SO.length : i < ids.length || Math.abs(u.pos.x - x0) > 2 || Math.abs(u.pos.z - z0) > 2); i++) {
        if (!full && (Math.abs(u.pos.x - x0) > 2 || Math.abs(u.pos.z - z0) > 2)) { i = i ? ids[i - 1] + 1 : 0; full = true; if (i >= SO.length) break; }
        const w = SO[full ? i : ids[i]];
        // 室内では体の幅で通す。幅九十センチの戸口にも壁の厚みを残して通れる。
        const rr = u.mounted ? 0.7 : w.naka != null ? 0.3 : 0.45;
        if (w.struct && (!w.struct.alive || w.struct.opened)) continue;
        if (w.yTop != null && u.pos.y >= w.yTop - 0.05) continue;   // 中の床（floors.js）まで登った後は、外壁の足もとの当たりは素通し
        if (w.yBot != null && u.pos.y + (w.bodyOverlap ? (u.mounted ? 2.4 : 1.7) : 0) < w.yBot) continue;   // 横木は体の高さも見る。室内壁は従来どおり階で区切る。
        const px = u.pos.x, pz = u.pos.z;
        if (px < w.x0 - rr || px > w.x1 + rr || pz < w.z0 - rr || pz > w.z1 + rr) continue;
        if (w.k === 'r') {
          const dx = px - w.x, dz = pz - w.z, lx = dx * w.c - dz * w.s, lz = dx * w.s + dz * w.c;
          // 体は円。角まで四角く膨らませると、見える隙間が狭まり角で引っかかる。
          let nx = Math.max(-w.hw, Math.min(w.hw, lx)), nz = Math.max(-w.hd, Math.min(w.hd, lz));
          const ox = lx - nx, oz = lz - nz, d = Math.hypot(ox, oz);
          if (d >= rr) continue;
          if (d > 1e-6) { nx += ox / d * rr; nz += oz / d * rr; }
          else if (w.hw - Math.abs(lx) < w.hd - Math.abs(lz)) { nx = (lx < 0 ? -1 : 1) * (w.hw + rr); nz = lz; }
          else { nx = lx; nz = (lz < 0 ? -1 : 1) * (w.hd + rr); }
          u.pos.x = w.x + nx * w.c + nz * w.s; u.pos.z = w.z - nx * w.s + nz * w.c;
        } else if (w.k === 'c') {
          const dx = px - w.x, dz = pz - w.z, d = Math.hypot(dx, dz), R = w.r + rr;
          if (d < R) { const nx = d > 1e-4 ? dx / d : Math.sin(u.heading), nz = d > 1e-4 ? dz / d : Math.cos(u.heading); u.pos.x = w.x + nx * R; u.pos.z = w.z + nz * R; }
        } else {
          const dx = w.bx - w.ax, dz = w.bz - w.az, l2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((px - w.ax) * dx + (pz - w.az) * dz) / l2));
          const cx = w.ax + dx * t, cz = w.az + dz * t, ox = px - cx, oz = pz - cz, d = Math.hypot(ox, oz), R = w.r + rr;
          if (d < R) { const nx = d > 1e-4 ? ox / d : -dz / Math.sqrt(l2), nz = d > 1e-4 ? oz / d : dx / Math.sqrt(l2); u.pos.x = cx + nx * R; u.pos.z = cz + nz * R; }
        }
      }
    }
    // 押し合い・敗走でも深みに入れない。直前の通れる場所を数だけで覚える。
    if ((this.world.def.riverCross || this.world.def.streams?.some(st => st.fords?.length)) && !u.climb && !u.perch) {
      if (this.world.waterFootDepthAt(u.pos.x, u.pos.z, groundAt(this.world, u.pos.x, u.pos.z, u.pos.y)) > 0.85) {
        if (u._riverX != null) {
          u.pos.x = u._riverX; u.pos.z = u._riverZ;
          u.vel.x = 0; u.vel.z = 0; u.mv.x = 0; u.mv.z = 0;
        }
      } else { u._riverX = u.pos.x; u._riverZ = u.pos.z; }
    }
  },

  // 待つ間の小さな動き：棒立ちにしない。一人ずつ時をずらして、
  //   ・いつも：重心を左右へ移す（力を抜いた脚の膝がゆるむ）・首を少し回す
  //   ・ときどき：足の踏みかえ・見回し・隣と話す・槍の持ち替え・得物の手入れ
  //   ・陣の中（持ち場で待ち、敵が遠い）：膝をつく者もいる。敵が近ければ（見張る相手がいれば）立って腰を落として構える
  // 返す物 u.idl：drop（手を下げる分）・low（身構え）・sit（膝つき）・rx（槍の傾けの足し）。骨の入った人（humans.js）も low と sit を使う
  idleFx(u, dt) {
    const I = u.idl || (u.idl = { ph: Math.random(), a: null, k: 0, d: 0, t: 1 + Math.random() * 7, s: 1, tw: 0, hy: 0, hp: 0, rx: 0, sit: 0, sitW: 0, sitT: 3 + Math.random() * 10, low: 0, drop: 0, hOff: 0, talk: false });
    const g = u.group, w = u.wpnKind || u.lookWeapon;
    // 狙う相手はいるが、まだ撃たない・打ちかからない者（「放て」を待つ鉄砲・間合いの外で待つ者）も、構えたまま小さく動く
    const waitT = !!u.target && !u.target.isStruct && u.target.alive !== false && !u.atk && !u.swing && !(u.guarding > 0) && u.moving < 0.15;
    const idle = !u.fleeing && (!u.target || waitT) && !u.atk && !u.swing && !u.hit && !(u.stagger > 0) && !(u.cheer > 0) && !(u.confused > 0) && u.moving < 0.15
      && !(u.reload && w === 'gun') && !(u.bowPh && u.bowPh !== 'rest');
    if (idle && !(u._idleSenseAt > this.time)) { u._idleSenseAt = this.time + 0.5; u._idleFoe = this.nearestEnemy(u, 30, o => Math.abs(o.pos.y - u.pos.y) < 1.8 && !this.wallBetween(u.pos, -1, o.pos)); }
    const foe = !idle ? null : u._idleFoe?.alive ? u._idleFoe : waitT ? u.target : u.watch && u.watch.alive ? u.watch : null;
    // 身構え（敵が 30m ほどに来た）
    I.low += ((foe ? 1 : 0) - I.low) * Math.min(1, dt * 3);
    // 陣の中で膝をつく：持ち場で落ち着いて待ち、敵が遠い時だけ。しばらくすると立ち上がる（槍衾の前の列は立ったまま）
    const jinchu = u.jinchu;
    const sitting = jinchu && !jinchu.standing && idle && !foe;
    const camp = idle && !foe && g && g.order === 'hold' && u.settled && !(g.formation === 'yari' && u.row === 0) && !u.isSub;
    const fatigue = Math.max(0, Math.min(1, Math.max(u.fat || 0, u.human ? u.human.heavy || 0 : 0)));
    I.sitT -= dt;
    if (I.sitT <= 0) {
      // 疲れた者ほど座って休む。休みの長さも一人ずつ違い、必ず立つ間を挟む
      I.sitW = I.sitW ? 0 : Math.random() < 0.2 + fatigue * 0.65 ? 1 : 0;
      I.sitT = I.sitW ? 6 + Math.random() * 8 + fatigue * 8 : 8 + Math.random() * 18;
    }
    // 騎馬を迎える槍衾（g.yariKneel）：前の段は膝をついて石突を地に立て、後ろの段がその上から穂先を揃える
    const brace = g && g.yariKneel && g.formation === 'yari' && u.row === 0 && (g.order === 'yari' || g.order === 'hold') && !u.fleeing && !u.atk && !u.swing && u.moving < 0.3;
    // 込め直しの鉄砲足軽は、足を止めて膝をつき（柵・塀の陰に身を低くして）込める
    const reloadKneel = w === 'gun' && u.reload && u.moving < 0.15 && !u.fleeing && !u.isPlayer;
    const sitWant = jinchu ? (sitting ? 1 : 0) : brace || reloadKneel ? 1 : camp ? I.sitW : 0;
    I.sit += (sitWant - I.sit) * Math.min(1, dt * (jinchu?.standing ? 7 : brace || reloadKneel ? 4 : 2.2));
    // ときどきの仕草
    if (!idle) { I.a = null; I.t = Math.max(I.t, 1 + Math.random() * 2); }
    else if (I.a) { I.k += dt; if (I.k >= I.d) { I.a = null; I.t = foe ? 0.6 + Math.random() * 2 : 1.5 + Math.random() * 5; } }
    else if ((I.t -= dt) <= 0) {
      const r = Math.random();
      let a = foe ? (r < 0.5 ? 'step' : 'look') : r < 0.18 + fatigue * 0.18 ? 'breathe'
        : r < 0.4 ? 'sky' : r < 0.62 ? 'talk' : r < 0.82 && w !== 'bow' ? 'regrip'
        : I.sit > 0.5 ? 'tend' : r < 0.92 ? 'step' : 'look';
      // 持ち場を空けず、近くの味方は笠・柄・具足を手入れする。戦う時の構えには割り込まない。
      if (!foe && u.team === 0 && !u.name && !u.isSub && !u.stdHeld && g?.order === 'hold' &&
          this.playerUnit && Math.hypot(u.pos.x - this.playerUnit.pos.x, u.pos.z - this.playerUnit.pos.z) < 24 && r > 0.55) a = 'tend';
      I.s = Math.random() < 0.5 ? -1 : 1;
      if (a === 'talk') {
        // 隣の者へ顔を向けて話す（相手も手が空いていれば、こちらを向いて聞く）
        let m = null;
        this.forNear(u.pos.x, u.pos.z, 2.6, (o) => { if (!m && o !== u && o.alive && o.team === u.team && Math.abs(o.pos.y - u.pos.y) < 0.7 && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) <= 2.6 && !this.wallBetween(u.pos, -1, o.pos) && !o.isPlayer && !o.target && !o.mounted && !o.atk && !o.swing && !o.hit && !o.fleeing && !(o.stagger > 0) && !(o.reload || o.cheer > 0 || o.confused > 0) && !(o.bowPh && o.bowPh !== 'rest') && o.moving < 0.15 && o.idl && !o.idl.a && o.idl.low < 0.1) m = o; });
        if (!m) a = 'look';
        else {
          const rel = (o) => Math.max(-1, Math.min(1, angleDiff(o === u ? u.heading : m.heading, o === u ? Math.atan2(m.pos.x - u.pos.x, m.pos.z - u.pos.z) : Math.atan2(u.pos.x - m.pos.x, u.pos.z - m.pos.z))));
          I.tw = rel(u); I.talk = true;
          const J = m.idl;
          if (J && !J.a) { J.a = 'talk'; J.k = 0; J.d = 3 + Math.random() * 3; J.tw = rel(m); J.talk = false; }
        }
      }
      I.a = a; I.k = 0;
      I.d = a === 'step' ? 1.1 : a === 'look' ? 2 + Math.random() * 2 : a === 'talk' ? 3 + Math.random() * 3 : a === 'regrip' ? 1.2 + I.ph * 0.6 : a === 'breathe' ? 4 + I.ph * 2 : 3 + Math.random() * 2;
    }
    // 太鼓が詰まるにつれて目を前へ。座ったまま踏みかえや空を仰ぐ仕草はしない。
    if (jinchu && (jinchu.standing || I.a !== 'talk' && I.a !== 'breathe')) I.a = null;
    // 仕草ごとの体の向き・首・槍
    let yaw = 0, hy = 0, hp = 0, rx = 0, lean = 0, lift = 0, liftL = true;
    if (I.a) {
      const q = I.k / I.d, env = sm(0, 0.2, q) * (1 - sm(0.78, 1, q));
      if (I.a === 'step') { const q2 = (q * 2) % 1; lift = Math.sin(q2 * Math.PI); liftL = (q < 0.5) === (I.s > 0); yaw = I.s * 0.1 * env; }
      else if (I.a === 'look') { hy = I.s * (0.55 + I.ph * 0.45) * env; yaw = I.s * 0.2 * env; }
      else if (I.a === 'sky') { hp = -(0.35 + I.ph * 0.2) * env; hy = I.s * 0.2 * env; lean = -0.03 * env; }
      else if (I.a === 'breathe') {
        const breath = Math.sin(q * Math.PI * 4 + I.ph * 0.4) * env;
        lean = (0.07 + fatigue * 0.08) * env - 0.04 * breath;
        hp = 0.12 * env; rx = 0.04 * breath;
        u.body.position.y += 0.014 * breath;
      }
      else if (I.a === 'talk') { yaw = I.tw * 0.5 * env; hy = I.tw * 0.45 * env; hp = env * (0.05 + 0.07 * Math.sin(I.k * (I.talk ? 5.5 : 2.2) + I.ph * 9)); }
      else if (I.a === 'regrip') rx = -0.45 * Math.sin(q * Math.PI);
      else if (I.a === 'tend') { lean = 0.16 * env; hp = 0.42 * env; rx = -0.5 * env; }
    }
    // 敵が近い時は、見張る相手へ顔を向ける
    if (foe) hy += Math.max(-0.8, Math.min(0.8, angleDiff(u.heading + u.body.rotation.y, Math.atan2(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z)))) * 0.6;
    const T = this.time, ph = I.ph, on = idle ? 1 : 0;
    // 重心の左右（人ごとに速さと向きが違う）
    // 敵が近い時は落ち着かず、速く小さく揺れる。穂先・筒先もわずかに上下する
    const ws = Math.sin(T * (0.45 + ph * 0.35) * (1 + I.low * 1.6) + ph * 40) * on;
    u.body.rotation.z += ws * 0.045 * (1 - I.sit * 0.5);
    if (foe) rx += 0.06 * Math.sin(T * (1.1 + ph * 0.6) + ph * 20);
    u.body.rotation.y += yaw;
    u.body.rotation.x += lean + I.low * 0.14 + I.sit * 0.05;
    // 首（胴の子）：なめらかに向きを追い、うなずきは首の付け根を軸に
    const kh = Math.min(1, dt * 5);
    I.hy += (hy + 0.12 * Math.sin(T * 0.31 + ph * 17) * on - I.hy) * kh;
    if (jinchu && !jinchu.standing) hp += 0.08 * Math.min(1, jinchu.t / (jinchu.len * 0.7));
    I.hp += (hp - I.hp) * kh;
    I.rx += (rx - I.rx) * Math.min(1, dt * 8);
    if (u.head) {
      const N = 1.5;
      u.head.rotation.set(I.hp, I.hy, 0);
      u.head.position.set(0, N - N * Math.cos(I.hp), -N * Math.sin(I.hp));
    }
    // 脚（units.js の形の時だけ。骨の入った人は humans.js が low・sit から脚を折る）
    const drop = I.sit * 0.29 + I.low * 0.06;
    I.drop = drop;
    if (u.shinL && u.body.visible !== false) {
      let lL = u.legL.rotation.x, lR = u.legR.rotation.x, sL = u.shinL.rotation.x, sR = u.shinR.rotation.x;
      // 力を抜いた脚の膝がゆるむ
      if (ws > 0) { sL += 0.14 * ws; lL -= 0.05 * ws; } else { sR -= 0.14 * ws; lR += 0.05 * ws; }
      // 踏みかえ：片足ずつ軽く上げて置き直す
      if (lift) { if (liftL) { lL -= 0.38 * lift; sL += 0.7 * lift; } else { lR -= 0.38 * lift; sR += 0.7 * lift; } }
      // 身構え：左足を前、膝を曲げて腰を落とす
      lL -= 0.25 * I.low; sL += 0.35 * I.low; lR += 0.12 * I.low; sR += 0.3 * I.low;
      // 膝つき：右の膝を立て、左の膝を地につける（骨の入った人と同じ向き）
      const k = I.sit;
      if (k > 0.01) { lR += (-1.4 - lR) * k; sR += (1.45 - sR) * k; lL += (0.1 - lL) * k; sL += (1.5 - sL) * k; }
      u.legL.rotation.x = lL; u.legR.rotation.x = lR; u.shinL.rotation.x = sL; u.shinR.rotation.x = sR;
      u.body.position.y -= drop + Math.abs(ws) * 0.008;
    }
    return I;
  }
};
