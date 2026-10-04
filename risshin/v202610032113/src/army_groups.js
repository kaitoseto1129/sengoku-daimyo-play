// Army の手法：隊の動き（updateGroups・崩れ・立て直し・陣形の形・勝鬨）
// （units.js から分けた。中身は元のまま。外の係は今までどおり units.js から import してよい）
import { angleDiff } from './units.js';

// Army の手法（units.js の class Army に足す）
export const ArmyGroups = {

  // ---------------- 部隊の更新 ----------------
  updateGroups(dt) {
    for (const g of this.groups) {
      const n = g.count;
      if (n === 0) continue;
      // 死傷・逃亡で失った仲間は、声を掛けるだけでは戻らない。
      // 戦固有の不退転と町の者は、この共通の崩れ判定から外す。
      if (!g.noRout && !g.civ && g.initial > 0) {
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
          if (!u.isPlayer) { u.target = null; u.atk = null; }
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
        g.regrouped = reN + 1; g.regroupT = 6; g.regroupRecovered = false;
        // 知らせ（「敵が下がって立て直そうとしている」）は敵の隊の時だけ
        if (g.team !== 0 && this.hooks.onRegroup) this.hooks.onRegroup(g);
      }
      if (g.regroupT > 0) {
        g.regroupT -= dt;
        // 実際に退いて敵から離れた後にだけ、息を整えて立て直す。
        if (g.regroupT < 3 && !g.regroupRecovered && !g.units.some((u) => u.alive && u.restThreat)) {
          g.regroupRecovered = true; g.morale += 8;
        }
      }
      // 敵の侍（部隊長）と、味方の名のある武将は、ときどき采配を振って隊を鼓舞する（押されても立て直す）
      if ((g.team !== 0 || (g.leader && g.leader.name && !g.isPlayerSquad)) && !g.routed && g.leader && g.leader.alive && g.units.some((u) => u.alive && u.target)) {
        g.rallyT = (g.rallyT ?? 8 + Math.random() * 6) - dt;
        if (g.rallyT <= 0) {
          g.rallyT = 12 + Math.random() * 6; g.morale = Math.min(100, g.morale + 6); if (!g.leader.restThreat && !g.leader.atk && !g.leader.swing) g.leader.cheer = 1; this.play('eshout', g.leader.pos, 0.7);
          // 采配に応えて、手の空いた兵が「応」と得物を突き上げる
          for (const o of g.units) if (o.alive && o !== g.leader && !o.atk && !o.swing && !o.fleeing && !o.restThreat && Math.random() < 0.45) o.cheer = 0.6 + Math.random() * 0.3;
        }
      }
      // 組頭がいるだけで打ち合い中の恐怖を消さない。安全な所で息を整える。
      if (!g.routed) {
        const danger = g.units.some((u) => u.alive && !u.fleeing && (u.restThreat || u.atk || u.swing));
        g.calmT = danger ? 0 : (g.calmT || 0) + dt;
        if (g.calmT > 4) {
          if (g.leader && g.leader.alive && !g.leader.fleeing) g.morale += 0.4 * dt;
          if (g.isPlayerSquad && g.morale < 85) g.morale += dt;
        }
      }
      g.morale = Math.min(100, g.morale);
      if (g.order === 'move' && g.dest) {
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
        } else if (g.onArrive) { const f = g.onArrive; g.onArrive = null; f(g); }
      }
      if (g.order === 'path' && g.path) {
        const p = g.path[g.pathIdx];
        if (p) {
          const dx = p[0] - g.anchor.x, dz = p[1] - g.anchor.z;
          const d = Math.hypot(dx, dz);
          // 隊列の最後尾が遅れすぎたら先頭を待たせる
          const c = g.center();
          const lag = Math.hypot(c.x - g.anchor.x, c.z - g.anchor.z);
          // 列が伸びすぎたら先頭は止まって待ち、少し伸びた時は歩みを落とす（列が伸び縮みして見える）
          //   （止まるのは続けて 6 秒まで。兵が詰まって追いつけない時に、列ごと止まったままにしない）
          const far = lag > n * 1.2 + 10;
          g._waitT = far ? (g._waitT || 0) + dt : 0;
          const sp = far && g._waitT < 6 ? 0 : lag > n * 0.9 + 6 ? g.speed * 0.3 : g.speed;
          if (d < 1) g.pathIdx++;
          else {
            g.anchor.x += dx / d * Math.min(d, sp * dt);
            g.anchor.z += dz / d * Math.min(d, sp * dt);
            const want = Math.atan2(dx, dz);
            g.facing += angleDiff(g.facing, want) * Math.min(1, dt * 2);
          }
        } else if (g.onArrive) { const f = g.onArrive; g.onArrive = null; f(g); }
      }
      this.shapeGroup(g, dt);
    }
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
      u.fleeing = true; u.target = null; u.atk = null; u.fleeT = this.time;
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
        !g.leader || !g.leader.alive || g.leader.dropped || g.leader.woundOut) return;
    if (g._routAt === undefined) g._routAt = this.time;
    if ((g._rlT = (g._rlT || 0) - dt) > 0) return;
    g._rlT = 1;
    if (this.time - g._routAt < 16 || g._routLeft) return;
    const keep = g.units.filter((u) => u.alive && !u.isPlayer && !u.dropped && u.type !== 'porter');
    if (keep.length < Math.max(4, g.initial * 0.45)) return;
    let x = 0, z = 0;
    for (const u of keep) { x += u.pos.x; z += u.pos.z; }
    const c = { x: x / keep.length, z: z / keep.length };
    // 敵が 45m の内にいれば、まだ逃げる
    let foe = false;
    this.forNear(c.x, c.z, 45, (o) => { if (!foe && o.alive && o.team !== g.team && !o.fleeing && !o.noTarget && Math.hypot(o.pos.x - c.x, o.pos.z - c.z) < 45) foe = true; });
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

  // 隊の形を整える：向きはゆっくり変え、行軍は縦隊、鉄砲は段の入れ替わり
  shapeGroup(g, dt) {
    // 隊の要（anchor）の動く速さ（兵がそれに歩調を合わせる）
    if (g._ax === undefined) { g._ax = g.anchor.x; g._az = g.anchor.z; g.anchorSpeed = 0; }
    const av = Math.hypot(g.anchor.x - g._ax, g.anchor.z - g._az) / Math.max(dt, 1e-3);
    g.anchorSpeed += (Math.min(9, av) - g.anchorSpeed) * Math.min(1, dt * 4);
    g._ax = g.anchor.x; g._az = g.anchor.z;
    g._t = this.time; g._wob = Math.min(1, Math.max(0, (g.anchorSpeed - 0.3) / 1.5));
    // 行軍：遠くへ進むときは縦隊、行き先が近づいたら横隊へ開く（騎馬の多い隊は横に並んだまま駆ける）
    let march = false;
    // 敵が近ければ行軍をやめて横隊に開く（半秒ごとに見る）
    g._foeT = (g._foeT || 0) - dt;
    if (g._foeT <= 0 && (g.order === 'move' || g.order === 'path' || g.order === 'retreat')) { g._foeT = 0.5 + Math.random() * 0.2; g._foeNear = this.foeNear(g, 38); }
    if (g.march !== false && !g.isPlayerSquad && g.formation === 'line' && (g.cavShare || 0) < 0.25 && g.initial >= 6 && !g._foeNear) {
      if (g.order === 'path') march = true;
      else if (g.order === 'move' && g.dest) march = Math.hypot(g.dest.x - g.anchor.x, g.dest.z - g.anchor.z) > (g.marching ? 20 : 26);
    }
    if (g.march === true && (g.order === 'move' || g.order === 'path')) march = true;
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
      g._face += Math.sign(df) * Math.min(Math.abs(df), rate * dt);
    } else g._wh = null;
    if (g._wh) {
      const W = g._wh, left = Math.abs(angleDiff(g._face, g.facing)), w = Math.min(1, left / Math.max(0.01, W.tot));
      const ox = W.p * (-Math.cos(W.h0) + Math.cos(g._face)), oz = W.p * (Math.sin(W.h0) - Math.sin(g._face));
      g._whOff = { x: ox * w, z: oz * w };
    } else g._whOff = null;
    // 伏兵（g.hideFlags = true）：持ち場（hold）で潜む間は指物を伏せ、「かかれ」（hold 以外の下知）で一斉に旗が立つ
    if (g.hideFlags) {
      const up = g.order !== 'hold';
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
        for (let k = 0; k < cnt; k++) { const u = g.units[c + fr * cols]; if (u && u.alive) break; fr = (fr + 1) % cnt; }
        g.front[c] = fr;
      }
    }
  },

  // 隊の要の近くに敵がいるか
  foeNear(g, r) {
    let hit = false;
    const a = g.anchor;
    this.forNear(a.x, a.z, r, (o) => { if (!hit && o.alive && o.team !== g.team && !o.fleeing && !o.noTarget && Math.abs(o.pos.x - a.x) < r && Math.abs(o.pos.z - a.z) < r) hit = true; });
    return hit;
  },

  // 勝鬨：その陣営の兵が槍を掲げる
  // 勝鬨：隊ごとに旗（なければ組頭）の下へ寄り、「えい、えい」「おう」を三度。一度目は勝った時すぐ（得物を掲げる）
  celebrate(team) {
    for (const u of this.units) if (u.alive && u.team === team && !u.isPlayer) u.cheer = 1.2 + Math.random() * 0.4;
    for (const g of this.groups) {
      if (g.team !== team || g.routed || !g.count || g.victory) continue;
      const fb = g.units.find((u) => u.alive && u.banner && !u.isPlayer) || (g.leader && g.leader.alive && !g.leader.isPlayer ? g.leader : null) || g.units.find((u) => u.alive && !u.isPlayer);
      if (!fb) continue;
      g.victory = { t: this.time, at: { x: fb.pos.x, z: fb.pos.z }, by: fb, k: 0 };
      for (const u of g.units) if (u.alive && !u.isPlayer) u.aiT = Math.random() * 0.4;
    }
  },
  // 勝鬨の三度の声（updateGroups から）：集まり始めて 2.5 秒ごと
  victoryCall(g) {
    const V = g.victory;
    if (!V || V.k >= 3 || this.time - V.t < 2.5 + V.k * 1.9) return;
    V.k++;
    for (const u of g.units) if (u.alive && !u.isPlayer && !u.fleeing) u.cheer = 0.9 + Math.random() * 0.2;
    this.play(V.k % 2 ? 'shout' : 'eshout', V.at, 0.9);
  }
};
