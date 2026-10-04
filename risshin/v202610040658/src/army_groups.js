// Army の手法：隊の動き（updateGroups・崩れ・立て直し・陣形の形・勝鬨）
// （units.js から分けた。中身は元のまま。外の係は今までどおり units.js から import してよい）
import { angleDiff } from './units.js';
import { groupSignal, signalWait } from './army_signals.js';
import { localClear, localPoint } from './army_local_way.js';

const SIDES = [-1, 1];

// Army の手法（units.js の class Army に足す）
export const ArmyGroups = {

  // ---------------- 部隊の更新 ----------------
  updateGroups(dt) {
    for (const g of this.groups) {
      if (g._tateRe && (g._tatePath ? g.order !== 'path' || g.path !== g._tatePath || g.pathIdx > g._tateIdx : g.order !== 'move' || g.dest !== g._tateDest)) {
        g._tateRe = false; g._tatePath = null; g._tateDest = null;
      }
      for (const u of g.units) if (u.loopWall && (!u.loopWall.alive || u.loopWall.opened)) { if (u.moveTo === u.loopP) u.moveTo = null; this.freeSama(u); }
      const n = g.count;
      if (n === 0) continue;
      // 死傷・逃亡で失った仲間は、声を掛けるだけでは戻らない。
      // 戦固有の不退転と町の者は、この共通の崩れ判定から外す。
      if (!g.noRout && !g.civ && g.initial > 0) {
        // 未上陸の控えは、目前で戦う隊の死傷を薄めない。
        let ready = 0, represented = g.initial;
        for (const u of g.units) {
          if (u.alive && !u.fleeing && !u.woundOut) ready++;
          // 軽い兵への置き換えは死傷ではない。体力の残る非敗走の退場は分母から外す。
          else if (u.gone && u.hp > 0 && !u.fleeing) represented--;
        }
        if (represented > 0) g.morale = Math.min(g.morale, Math.max(0, 100 - 130 * (1 - ready / represented)));
      }
      // 崩れた部隊は、戦の筋書きが号令を出しても逃げ続ける（bot の報告から。自分の組は号令で立て直せる）
      if (g.routed && g.order !== 'flee' && !g.isPlayerSquad) g.order = 'flee';
      if (!g.routed && !g.noRout && g.morale < 22) {
        g.routed = true;
        g.order = 'flee';
        // 崩れは「ほつれ」から：後ろの段と端の者が先に逃げ出し、前の中ほどの者は 1〜3 秒遅れて背を向ける
        const c = g.center(), f = g.forward();
        // 逃げる向きが決まっていなければ、近くの敵の重心から離れる向きへ（敵が見えなければ隊の後ろへ）
        if (!g.fleeSet) {
          let ex = 0, ez = 0, en = 0;
          this.forNear(c.x, c.z, 50, (o) => { if (o.alive && o.team !== g.team && !o.fleeing) { ex += o.pos.x; ez += o.pos.z; en++; } });
          let dx = en ? c.x - ex / en : -f.x, dz = en ? c.z - ez / en : -f.z;
          const dl = Math.hypot(dx, dz);
          if (dl > 0.5) { dx /= dl; dz /= dl; } else { dx = -f.x; dz = -f.z; }
          g.fleeDir = { x: dx, z: dz };
        }
        let dMin = 0, dMax = 0, lMax = 0;
        const al = g.units.filter((u) => u.alive);
        for (const u of al) {
          const dx = u.pos.x - c.x, dz = u.pos.z - c.z, d = dx * f.x + dz * f.z, l = Math.abs(dx * f.z - dz * f.x);
          dMin = Math.min(dMin, d); dMax = Math.max(dMax, d); lMax = Math.max(lMax, l);
        }
        for (const u of al) {
          const dx = u.pos.x - c.x, dz = u.pos.z - c.z;
          const fr = dMax - dMin > 0.5 ? ((dx * f.x + dz * f.z) - dMin) / (dMax - dMin) : 0.5;
          const ed = lMax > 0.5 ? Math.abs(dx * f.z - dz * f.x) / lMax : 0;
          // 後ろの段は 0.2〜0.6 秒、前の段の端は 1.5 秒ほど、前の中ほどは 3 秒ほど踏みとどまる
          u.routIn = u.isPlayer ? 0 : 0.2 + 3.0 * fr * (1 - 0.5 * ed) * (0.85 + Math.random() * 0.3) + Math.random() * 0.4;
          // 崩れた時に振りかぶっていた一撃は捨てる（背を向けるまでの間に、また斬りかかって見えないように）
          if (!u.isPlayer) { u.target = null; u.atk = null; u.swing = null; u.bind = null; u.charging = false; u.cheer = 0; }
        }
        this.routStep(g, 0);
        if (!this.withdrawal && g.onRout) g.onRout(g);
        if (this.hooks.onRout) this.hooks.onRout(g);
      }
      if (g.routed && (g._routLeft || (g._routChkT = (g._routChkT || 0) - dt) <= 0)) { g._routChkT = 0.5; this.routStep(g, dt); }
      if (g.routed) this.rallyRouted(g, dt);
      if (g.victory) this.victoryCall(g);
      // 斬り合いが収まったら、組頭の「並び直せ」の声で一斉に持ち場へ戻る（一人ずつばらばらに戻らない）
      if (!g.routed && !g.isPlayerSquad) {
        g._engT = (g._engT || 0) - dt;
        if (g._engT <= 0) {
          g._engT = 0.5;
          const eng = g.units.some((u) => u.alive && u.target && !u.target.isStruct && u.target.alive && Math.abs(u.target.pos.x - u.pos.x) + Math.abs(u.target.pos.z - u.pos.z) < 6);
          if (eng) g._wasEng = this.time;
          else if (g._wasEng && this.time - g._wasEng > 2.5) {
            g._wasEng = 0;
            const L = g.leader && g.leader.alive ? g.leader : g.units.find((u) => u.alive);
            if (L && L.camD < 50) this.play('eshout', L.pos, 0.5);
            for (const u of g.units) if (u.alive && !u.target) u.aiT = 0.1 + Math.random() * 0.15;
          }
        }
      }
      // 崩れかけた敵勢は一度だけ後ろへ下がって立て直そうとする
      // 崩れかけた隊から、弱気な叫びが上がる（近くの隊だけ）
      if (!g.routed && !g.wavered && g.morale < 30 && n >= 3 && this.hooks.onWaver) {
        g.wavered = true;
        const P = this.playerUnit;
        const c = g.center();
        if (P && Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < 40) this.hooks.onWaver(g);
      }
      if (g.morale > 55) g.wavered = false;
      // 敵味方とも、崩れる前の立て直しは一度だけ。
      const reN = g.regrouped === true ? 1 : (g.regrouped || 0);
      const reMax = 1;
      if (!g.isPlayerSquad && !g.routed && !g.noRout && reN < reMax && g.morale < 35 && g.morale >= 22) {
        g.regrouped = reN + 1; g.regroupT = 6; g.regroupRecovered = false; g.regroupStart = this.time;
        // 知らせ（「敵が下がって立て直そうとしている」）は敵の隊の時だけ
        if (g.team !== 0 && this.hooks.onRegroup) this.hooks.onRegroup(g);
      }
      if (g.regroupT > 0) {
        g.regroupT = Math.max(0.1, g.regroupT - dt);
        if (!(g.regroupCheck > this.time) && this.time - g.regroupStart >= 3) {
          g.regroupCheck = this.time + 0.5;
          let ready = 0, arrived = 0, danger = false;
          const fx = Math.sin(g.facing), fz = Math.cos(g.facing);
          for (const u of g.units) {
            if (!u.alive || u.fleeing || u.woundOut || u.rearWound || u.noTarget || u.dropped) continue;
            ready++;
            const slot = g.slotPos(u.slot, g.initial);
            const q = localPoint(this, u, u.moralePoint, g.anchor.x + (slot.x - g.anchor.x) * 0.6 - fx * 10, g.anchor.z + (slot.z - g.anchor.z) * 0.6 - fz * 10);
            if (Math.hypot(q.x - u.pos.x, q.z - u.pos.z) < 3 && (u.pos.x - g.anchor.x) * fx + (u.pos.z - g.anchor.z) * fz < -5 && !u.downed && !(u.pinT > this.time)) arrived++;
            if (u.atk || u.swing || this.nearestEnemy(u, 9, o => Math.abs(o.pos.y - u.pos.y) < 3 && localClear(this, u.pos, o.pos))) danger = true;
          }
          if (ready && arrived >= Math.ceil(ready * 0.7) && !danger) {
            g.regroupRecovered = true; g.regroupT = 0;
            // 死傷の上限は戻さず、鎮まった恐怖だけを戻す。
            for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.rearWound) u.fright = Math.max(0, (u.fright || 0) - 8);
            if (this.hooks.onRegroupReady) this.hooks.onRegroupReady(g);
          }
        }
      }
      // 敵の侍（部隊長）と、味方の名のある武将は、ときどき采配を振って隊を鼓舞する（押されても立て直す）
      if ((g.team !== 0 || (g.leader && g.leader.name && !g.isPlayerSquad)) && !g.routed && g.leader && g.leader.alive && !g.leader.fleeing && !g.leader.woundOut && !g.leader.rearWound && !g.leader.downed && !(g.leader.pinT > this.time) && !(g.leader.stagger > 0) && g.units.some((u) => u.alive && u.target)) {
        g.rallyT = (g.rallyT ?? 8 + Math.random() * 6) - dt;
        if (g.rallyT <= 0) {
          g.rallyT = 12 + Math.random() * 6; g.morale = Math.min(100, g.morale + 6); if (!g.leader.restThreat && !g.leader.atk && !g.leader.swing) g.leader.cheer = 1; this.play('eshout', g.leader.pos, 0.7);
          // 采配に応えて、手の空いた兵が「応」と得物を突き上げる
          for (const o of g.units) if (o.alive && o !== g.leader && !o.atk && !o.swing && !o.fleeing && !o.restThreat && !o.woundOut && !o.rearWound && !o.downed && !(o.pinT > this.time) && !(o.stagger > 0) && !o.dragging && !o.climb && !o.bind && Math.random() < 0.45) o.cheer = 0.6 + Math.random() * 0.3;
        }
      }
      // 組頭がいるだけで打ち合い中の恐怖を消さない。安全な所で息を整える。
      if (!g.routed) {
        const danger = g.units.some((u) => u.alive && !u.fleeing && (u.restThreat || u.atk || u.swing));
        g.calmT = danger ? 0 : (g.calmT || 0) + dt;
        if (g.calmT > 4) {
          if (g.leader && g.leader.alive && !g.leader.fleeing && !g.leader.woundOut && !g.leader.rearWound && !g.leader.downed && !(g.leader.pinT > this.time)) g.morale += 0.4 * dt;
          if (g.isPlayerSquad && g.morale < 85) g.morale += dt;
        }
      }
      g.morale = Math.max(0, Math.min(100, g.morale));
      this.fitGroupSlots(g);
      groupSignal(this, g);
      const waiting = signalWait(this, g);
      if (!waiting && g.order === 'move' && g.dest) {
        const dx = g.dest.x - g.anchor.x, dz = g.dest.z - g.anchor.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.3) {
          // 口（army.chokes）で兵が詰まっている時は、要（anchor）も足並みに合わせて足踏みする
          //   （下知を出しても、隊の動きがすぐには追いつかない＝反応が遅れて見える）
          let sp = g.speed;
          if (this.chokes && this.chokes.length && g.units.some((u) => u.alive && u._gated)) {
            const c = g.center(), lag = Math.hypot(c.x - g.anchor.x, c.z - g.anchor.z);
            if (lag > n * 0.6 + 6) sp = g.speed * 0.25;
          }
          const s = Math.min(d, sp * dt);
          g.anchor.x += dx / d * s; g.anchor.z += dz / d * s;
          if (d > 2) g.facing = Math.atan2(dx, dz);
        } else if (g.onArrive && this.groupArrived(g)) { const f = g.onArrive; g.onArrive = null; f(g); }
      }
      if (!waiting && g.order === 'path' && g.path) {
        const p = g.path[g.pathIdx];
        if (p) {
          const dx = p[0] - g.anchor.x, dz = p[1] - g.anchor.z;
          const d = Math.hypot(dx, dz);
          // 隊列の最後尾が遅れすぎたら先頭を待たせる
          const c = g.center();
          const lag = Math.hypot(c.x - g.anchor.x, c.z - g.anchor.z);
          // 列が伸びすぎたら先頭は止まって待ち、少し伸びた時は歩みを落とす（列が伸び縮みして見える）
          //   六秒詰まった時は道幅と持ち場を伝え直し、後列を置き去りにしない。
          if (!(g._tailCheckAt > this.time)) {
            g._tailCheckAt = this.time + 0.5; g._tailLag = 0;
            for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.rearWound && !u.noTarget && !u.downed && !(u.pinT > this.time)) {
              const home = g.slotPos(u.slot, g.initial);
              g._tailLag = Math.max(g._tailLag, Math.hypot(home.x - u.pos.x, home.z - u.pos.z));
            }
          }
          const tailLag = g._tailLag || 0;
          const far = tailLag > 10 || lag > n * 1.2 + 10;
          g._waitT = far ? (g._waitT || 0) + dt : 0;
          if (far && g._waitT > 6 && !(g._routeHelpAt > this.time)) {
            g._routeHelpAt = this.time + 2; g._fitAt = 0;
            this.fitGroupSlots(g);
            for (const u of g.units) if (u.alive && !u.fleeing && !u.target) u.aiT = 0;
          }
          const sp = far ? 0 : tailLag > 5 || lag > n * 0.9 + 6 ? g.speed * 0.3 : g.speed;
          const next = g.path[g.pathIdx + 1], probe = g._routeProbe || (g._routeProbe = { x: 0, y: 0, z: 0 });
          let narrowTurn = false;
          if (next && Math.abs(angleDiff(g._face ?? g.facing, Math.atan2(next[0] - p[0], next[1] - p[1]))) > 0.35) {
            const h = Math.atan2(next[0] - p[0], next[1] - p[1]), w = Math.max(2, g.halfWidth());
            for (const side of SIDES) {
              probe.x = p[0] + Math.cos(h) * w * side; probe.z = p[1] - Math.sin(h) * w * side;
              if (!localClear(this, g.anchor, probe)) narrowTurn = true;
            }
          }
          if (d < 1 && !far && (!narrowTurn || tailLag < 3.5)) g.pathIdx++;
          else if (d >= 1) {
            g.anchor.x += dx / d * Math.min(d, sp * dt);
            g.anchor.z += dz / d * Math.min(d, sp * dt);
            const want = Math.atan2(dx, dz);
            g.facing += angleDiff(g.facing, want) * Math.min(1, dt * 2);
          }
        } else if (g.onArrive && this.groupArrived(g)) { const f = g.onArrive; g.onArrive = null; f(g); }
      }
      g._readyCount = n;
      this.shapeGroup(g, dt);
    }
  },

  // 半秒ごとに道幅と持ち場を整える。入れ物は隊が持ち、通れない端を到着条件にしない。
  fitGroupSlots(g) {
    if (g._fitAt > this.time || g.routed || g.formation === 'ring' || g.fixed || g.civ) return;
    if (g.order !== 'move' && g.order !== 'path' && !g.onArrive) { g._routeCols = 0; g._slotFit = null; return; }
    g._fitAt = this.time + 0.5;
    const q = g._fitProbe || (g._fitProbe = { x: 0, y: 0, z: 0 });
    const fit = g._slotFit || (g._slotFit = []);
    g._fittingSlots = true;
    g._routeCols = 0;
    if ((g.order === 'path' || g.order === 'move') && !g.cav && !g.isGun && !g.cavShare) {
      const layout = g.layout(g.initial), h = g._face ?? g.facing;
      let width = layout.cols;
      for (; width > 1; width--) {
        let clear = true;
        for (const side of SIDES) {
          q.x = g.anchor.x + Math.cos(h) * layout.sp * (width - 1) * 0.5 * side;
          q.z = g.anchor.z - Math.sin(h) * layout.sp * (width - 1) * 0.5 * side;
          if (!localClear(this, g.anchor, q)) clear = false;
        }
        if (clear) break;
      }
      g._routeCols = width;
    }
    for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.rearWound) {
      const slot = g.slotPos(u.slot, g.initial), p = fit[u.slot] || (fit[u.slot] = { x: 0, z: 0 });
      p.x = p.z = 0;
      if (localClear(this, g.anchor, slot)) continue;
      // 要へ向かって幅を詰める。壁の反対側を持ち場にしない。
      for (let i = 1; i <= 7; i++) {
        const k = Math.max(0, 1 - i * 0.15);
        q.x = g.anchor.x + (slot.x - g.anchor.x) * Math.max(0, k);
        q.z = g.anchor.z + (slot.z - g.anchor.z) * Math.max(0, k);
        if (localClear(this, g.anchor, q)) { p.x = q.x - slot.x; p.z = q.z - slot.z; break; }
      }
    }
    g._fittingSlots = false;
  },

  // 要だけ先へ着いても次の任務へ進まない。戦ごとの指定があれば人数と範囲を優先する。
  groupArrived(g) {
    if (g._arriveCall === g.onArrive && g._arriveCheckAt > this.time) return false;
    g._arriveCall = g.onArrive; g._arriveCheckAt = this.time + 0.5;
    const status = g.arrivalStatus || (g.arrivalStatus = {});
    let ready = 0, arrived = 0, blocked = 0, gated = 0, delayed = 0;
    const radius = g.arriveRadius ?? 3.5;
    // 到着を待つ時だけ半秒ごとに持ち場を調べる。長い縦隊の後列も持ち場で判定する。
    for (const u of g.units) {
      if (!u.alive || u.gone || u.fleeing || u.woundOut || (u.noTarget && !g.arriveNoncombat)) continue;
      ready++;
      if (u.climb || u.downed || u.pinT > this.time) { delayed++; continue; }
      const slot = g.slotPos(u.slot, g.initial);
      if (this.wallBetween(u.pos, -1, slot)) { blocked++; continue; }
      if (u._gated) { gated++; continue; }
      if ((u.pos.x - slot.x) ** 2 + (u.pos.z - slot.z) ** 2 <= radius * radius) arrived++;
      // 近くの歩ける場所へ着いた兵は従来どおり数える。坂の内の持ち場は待つ理由だけに使う。
      else if (!this.world.walkable(slot.x, slot.z)) blocked++;
    }
    status.ready = ready; status.arrived = arrived; status.blocked = blocked; status.gated = gated; status.delayed = delayed;
    status.needed = Math.min(ready, g.arriveCount ?? Math.ceil(ready * 0.6));
    return ready > 0 && arrived >= status.needed;
  },

  // 崩れた隊の兵を、決まった遅れ（u.routIn）の順に逃がす。徒歩の兵は武器を捨てる。
  routStep(g, dt) {
    let left = 0;
    for (const u of g.units) {
      // 本人は自分で退く。隊の崩れで操作を奪ったり、得物を消したりしない。
      if (u.isPlayer) { u.routIn = undefined; continue; }
      // 崩れた後にこの隊へ加わった者も、少し遅れて一緒に逃げる
      if (u.alive && !u.fleeing && u.routIn === undefined && !u.isPlayer) { u.routIn = 0.3 + Math.random() * 0.6; u.target = null; u.atk = null; }
      if (!u.alive || u.fleeing || u.routIn === undefined) continue;
      // 背を向けるまでの間も、斬りかからない（後ずさるだけ）
      if (u.target && !u.isPlayer) { u.target = null; u.atk = null; }
      u.routIn -= dt;
      if (u.routIn > 0) { left++; continue; }
      u.routIn = undefined;
      u.fleeing = true; u.target = null; u.atk = null; u.swing = null; u.bind = null; u.charging = false; u.cheer = 0; u.fleeT = this.time;
      if (u.wpn && u.wpn.parent && !u.dropped && !u.mounted) {
        this.dropWeapon(u);
        // 地面の武器を手の動きで回したり、骨のある人へ再び持たせたりしない。
        u.wpn = null; u.wpnKind = 'none';
        // 逃げる者の半分ほどは陣笠も脱ぎ捨てる（潰走の跡が地面に残る）
        if (Math.random() < 0.5) this.dropHat(u);
      }
    }
    g._routLeft = left;
  },

  // 再集結：崩れて逃げた味方の隊（自分の組は除く）は、敵のいない所まで逃げ切ると、組頭の旗の下にもう一度集まる（一度だけ）
  //   得物を捨てた者は逃げ続ける。敵の隊は戻らない（戦の定義が「崩した」ことを任務の成否に使うため）。g.noRally で止められる
  rallyRouted(g, dt) {
    if (g.team !== 0 || g.isPlayerSquad || g.noRally || g.civ || g.rallied || g.noRout ||
        !g.leader || !g.leader.alive || g.leader.dropped || g.leader.woundOut || g.leader.rearWound || g.leader.noTarget || g.leader.downed || g.leader.pinT > this.time) return;
    if (g._routAt === undefined) g._routAt = this.time;
    if ((g._rlT = (g._rlT || 0) - dt) > 0) return;
    g._rlT = 1;
    if (this.time - g._routAt < 16 || g._routLeft) return;
    const keep = g.units.filter((u) => u.alive && !u.isPlayer && !u.dropped && !u.downed && !(u.pinT > this.time) && !u.dragging && !u.woundOut && !u.rearWound && !u.noTarget && u.type !== 'porter');
    if (keep.length < Math.max(4, g.initial * 0.45)) {
      if (!g._rallyUnableSaid) { g._rallyUnableSaid = true; if (this.hooks.onRallyUnable) this.hooks.onRallyUnable(g); }
      return;
    }
    let x = 0, z = 0;
    for (const u of keep) { x += u.pos.x; z += u.pos.z; }
    const c = { x: x / keep.length, z: z / keep.length };
    // 敵が 45m の内にいれば、まだ逃げる
    let foe = false;
    this.forNear(c.x, c.z, 45, (o) => { if (!foe && o.alive && o.team !== g.team && !o.fleeing && !o.noTarget && Math.hypot(o.pos.x - c.x, o.pos.z - c.z) < 45 && Math.abs(o.pos.y - keep[0].pos.y) < 3 && localClear(this, keep[0].pos, o.pos)) foe = true; });
    if (foe) return;
    // 旗持ち（いなければ一番先を逃げた者）の所へ集まる。向きは来た方（敵のいる方）
    const fb = keep.find((u) => u.banner) || keep[0];
    g.routed = false; g.rallied = true; g.order = 'hold'; g.focus = null;
    g.anchor = { x: fb.pos.x * 0.5 + c.x * 0.5, z: fb.pos.z * 0.5 + c.z * 0.5 };
    g.facing = Math.atan2(-g.fleeDir.x, -g.fleeDir.z); g._face = g.facing;
    g.morale = 42; g.wavered = false; g.regrouped = Math.max(1, g.regrouped || 0); g.regroupT = 0;
    g.marching = false; g.dest = null; g.path = null;
    for (const u of keep) { u.fleeing = false; u.routIn = undefined; u.target = null; u.atk = null; u.confused = 0; u.aiT = 0.3 + Math.random() * 1.2; }
    // 組頭が采配を振って「集まれ」の声、兵は旗の下へ駆け寄る
    const L = g.leader && g.leader.alive && !g.leader.dropped ? g.leader : fb;
    L.cheer = 1;
    this.play('eshout', L.pos, 0.8);
    if (this.hooks.onRally) this.hooks.onRally(g);
  },

  // 隊の形を整える：横の並びと歩調を保ち、鉄砲は段を入れ替える
  shapeGroup(g, dt) {
    // 隊の要（anchor）の動く速さ（兵がそれに歩調を合わせる）
    if (g._ax === undefined) { g._ax = g.anchor.x; g._az = g.anchor.z; g.anchorSpeed = 0; }
    const av = Math.hypot(g.anchor.x - g._ax, g.anchor.z - g._az) / Math.max(dt, 1e-3);
    g.anchorSpeed += (Math.min(9, av) - g.anchorSpeed) * Math.min(1, dt * 4);
    g._ax = g.anchor.x; g._az = g.anchor.z;
    // 横隊は遠くへの移動でも横の並びを守る。縦隊は明示された行軍だけ。
    const march = g.march === true && (g.order === 'move' || g.order === 'path');
    g._foeT = (g._foeT || 0) - dt;
    if (g._foeT <= 0 && (g.order === 'move' || g.order === 'path' || g.order === 'retreat')) { g._foeT = 0.5 + Math.random() * 0.2; g._foeNear = this.foeNear(g, 38); }
    // 停止は前から伝わる。後ろの段は歩いていた時の遅れを詰めて止まる。
    if (av < 0.05 && (g._advanceSpeed || 0) > 0.05) { g._stopT = this.time; g._stopSpeed = Math.min(4, g._advanceSpeed); }
    g._advanceSpeed = Math.min(9, av);
    g._t = this.time;
    const impulse = Math.abs(av - (g._lastAv ?? av)) / Math.max(dt, 0.001);
    const disorder = Math.min(1.5, Math.max(0, (av - 2.4) * 0.3) + Math.min(1, impulse * 0.06));
    g._wob = (g._wob || 0) + (disorder - (g._wob || 0)) * Math.min(1, dt * 2);
    g._lastAv = av;
    let rough = 0;
    const h = g._face ?? g.facing, fx = Math.sin(h), fz = Math.cos(h);
    for (const u of g.units) {
      // 前のコマの押され方を置いておき、兵の更新順で支えの強さを変えない。
      u._lineRecoil = u.alive && !u.fleeing ? Math.max(0, -(u.push.x * fx + u.push.z * fz)) : 0;
      if (u.alive && !u.fleeing && u.moving > 0.1) rough = Math.max(rough, u._gated ? 1 : u._terrainFx?.loose ? 1 : Math.max(0, 1 - (u._terrainFx?.spd ?? 1)));
    }
    g._terrainLoose = (g._terrainLoose || 0) + (rough - (g._terrainLoose || 0)) * Math.min(1, dt * (rough > (g._terrainLoose || 0) ? 3 : 1.2));
    // 拍子は隊で一度だけ進める。兵が見えなくても、同じ歩調が続く。
    g._ph = (g._ph || 0) + dt * (3 + Math.min(1, g.anchorSpeed / 2.4) * 6);
    // 陣形を変えた直後の 2 秒は、並び直しの隙（受けにくく、当たりやすい）
    if (g._form0 !== undefined && g._form0 !== g.formation) {
      g._reformT = this.time + 2;
      // 槍衾に構える時は、一斉に穂先が下りる「ザッ」（具足の擦れと柄の打つ音）
      if (g.formation === 'yari') { const c = g.anchor; this.play('kozane', c, 1.2); this.play('wood', c, 0.5); }
    }
    g._form0 = g.formation;
    // 縦隊から横陣へ開く時刻（先頭から扇のように開く。後ろの者ほど遅れて横へ出る）
    if (g.marching && !march) g._deployT = this.time;
    g.marching = march;
    if (g._stepForm !== g.formation || g._stepMarch !== march || g._stepN !== g.initial || g._stepWidth !== g.width || g._stepSpacing !== g.spacing || g._stepYari !== g.yariRanks || g._stepRanks !== g.ranks || g._stepColW !== g.colW || g._stepGun !== g.isGun || g._stepCav !== g.cav || g._stepRouteCols !== g._routeCols) {
      g._stepCols = g.layout(g.initial).cols;
      g._stepForm = g.formation; g._stepMarch = march; g._stepN = g.initial; g._stepWidth = g.width; g._stepSpacing = g.spacing;
      g._stepYari = g.yariRanks; g._stepRanks = g.ranks; g._stepColW = g.colW; g._stepGun = g.isGun; g._stepCav = g.cav; g._stepRouteCols = g._routeCols;
    }
    // 向きを変える：一斉にくるりと回らず、横に広い隊ほどゆっくり回る（外側の兵が歩いて回り込める速さ）
    if (g._face === undefined) g._face = g.facing;
    const df = angleDiff(g._face, g.facing);
    if (Math.abs(df) > 1e-4) {
      const rate = Math.max(0.3, Math.min(1.6, 3 / Math.max(1, g.halfWidth())));
      // 大きな向き変え（15° より大きい）は、曲がる側の端を軸にした旋回に見せる：内の端はほぼその場で、外の端が大回りする
      //   （要 anchor は動かさない。回っている間だけ並びをずらし、回り終えるころに元へ戻す）
      const W = g._wh;
      if (!W || Math.sign(df) !== W.s) g._wh = Math.abs(df) > 0.26 && (g.formation === 'line' || g.formation === 'yari') && !g.marching && !g.isPlayerSquad
        ? { h0: g._face, s: Math.sign(df), p: -Math.sign(df) * g.halfWidth(), tot: Math.abs(df) } : null;
      let clear = true;
      const probe = g._turnProbe || (g._turnProbe = { x: 0, y: 0, z: 0 });
      if (!(g._turnCheckAt > this.time)) {
        g._turnCheckAt = this.time + 0.2;
        const step = Math.sign(df) * Math.min(Math.abs(df), rate * 0.2);
        for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.rearWound) {
          const x = u.pos.x - g.anchor.x, z = u.pos.z - g.anchor.z;
          probe.x = g.anchor.x + x * Math.cos(step) + z * Math.sin(step);
          probe.z = g.anchor.z - x * Math.sin(step) + z * Math.cos(step);
          if (!localClear(this, u.pos, probe)) { clear = false; break; }
        }
        g._turnClear = clear;
      }
      if (g._turnClear !== false) g._face += Math.sign(df) * Math.min(Math.abs(df), rate * dt);
    } else g._wh = null;
    if (g._wh) {
      const W = g._wh, left = Math.abs(angleDiff(g._face, g.facing)), w = Math.min(1, left / Math.max(0.01, W.tot));
      const ox = W.p * (-Math.cos(W.h0) + Math.cos(g._face)), oz = W.p * (Math.sin(W.h0) - Math.sin(g._face));
      const offset = g._whPoint || (g._whPoint = { x: 0, z: 0 });
      offset.x = ox * w; offset.z = oz * w; g._whOff = offset;
    } else g._whOff = null;
    // 伏兵は隠れた移動でも旗を伏せる。敵を迎える時に姿と旗をそろえて明かす。
    if (g.hideFlags) {
      const up = !g.hidden && !g._ai?.ambushWait && (g.order === 'attack' || g.units.some(u => u.alive && !u.fleeing && (u.atk || u.swing)));
      for (const u of g.units) if (u.flag) u.flag.visible = up;
      if (up) g.hideFlags = false;
    }
    // 号令を待っていた鉄砲組（holdFire）が「放て」を受けたら、その場で一斉に撃つ（組頭の号令を待たない）
    if (g.isGun) { if (g._hf && !g.holdFire) g.vCall = this.time; g._hf = !!g.holdFire; }
    // 鉄砲の段：前の段の者が倒れていたら、次の者を前へ
    if (g.isGun && g.front) {
      const n = g.initial, { cols, R } = g.layout(n);
      if (R > 1) for (let c = 0; c < cols; c++) {
        const cnt = Math.floor((n - 1 - c) / cols) + 1;
        let fr = g.front[c] || 0;
        for (let k = 0; k < cnt; k++) { const u = this.gunSlots(g)[c + fr * cols]; if (u && u.alive && u.type === 'gun' && !u.sidearm && !u.fleeing && !u.woundOut && !u.rearWound && !u.noTarget && u.gunAmmo !== 0) break; fr = (fr + 1) % cnt; }
        g.front[c] = fr;
      }
    }
  },

  // 隊の要の近くに敵がいるか
  foeNear(g, r) {
    let hit = false;
    const a = g.anchor;
    this.forNear(a.x, a.z, r, (o) => { if (!hit && o.alive && o.team !== g.team && !o.fleeing && !o.noTarget && (o.pos.x - a.x) ** 2 + (o.pos.z - a.z) ** 2 < r * r) hit = true; });
    return hit;
  },

  // 勝鬨：その陣営の兵が槍を掲げる
  // 勝鬨：隊ごとに旗（なければ組頭）の下へ寄り、「えい、えい」「おう」を三度。一度目は勝った時すぐ（得物を掲げる）
  celebrate(team) {
    for (const u of this.units) if (u.alive && u.team === team && !u.isPlayer && !u.fleeing && !u.group?.routed && !u.woundOut && !u.rearWound && !u.death?.aid && !u.dragging && !u.bind && !u.climb && !u.downed && !(u.pinT > this.time) && !(u.stagger > 0) && !u.restThreat && !u.atk && !u.swing) u.cheer = 1.2 + Math.random() * 0.4;
    for (const g of this.groups) {
      if (g.team !== team || g.routed || !g.count || g.victory) continue;
      const ready = u => u.alive && !u.isPlayer && !u.fleeing && !u.woundOut && !u.rearWound && !u.downed && !(u.pinT > this.time) && !u.dragging && !u.climb && !u.restThreat;
      const fb = g.units.find(u => ready(u) && (u.banner || u.stdHeld)) || (g.leader && ready(g.leader) ? g.leader : null) || g.units.find(ready);
      if (!fb) continue;
      const at = localPoint(this, fb, fb.moralePoint, fb.pos.x, fb.pos.z);
      g.victory = { t: this.time, at: { x: at.x, z: at.z }, by: fb, k: 0 };
      for (const u of g.units) if (u.alive && !u.isPlayer) u.aiT = Math.random() * 0.4;
    }
  },
  // 勝鬨の三度の声（updateGroups から）：集まり始めて 2.5 秒ごと
  victoryCall(g) {
    const V = g.victory;
    if (!V || V.k >= 3 || this.time - V.t < 2.5 + V.k * 1.9) return;
    V.k++;
    for (const u of g.units) if (u.alive && !u.isPlayer && !u.fleeing && !u.woundOut && !u.rearWound && !u.dragging && !u.bind && !u.climb && !u.downed && !(u.pinT > this.time) && !(u.stagger > 0) && !u.restThreat && !u.atk && !u.swing) u.cheer = 0.9 + Math.random() * 0.2;
    this.play(V.k % 2 ? 'shout' : 'eshout', V.at, 0.9);
  }
};
