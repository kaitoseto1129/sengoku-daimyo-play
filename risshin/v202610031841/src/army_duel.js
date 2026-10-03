// Army の手法：一騎打ちの見せ方（名乗り・見届けの輪・間合い・鍔迫り合い・隙・どよめき）
// （units.js から分けた。中身は元のまま。外の係は今までどおり units.js から import してよい）

// Army の手法（units.js の class Army に足す）
export const ArmyDuel = {

  // 歩き方：加減速し、向きは少しずつ変え、前が詰まれば待ち、立っている味方はよけて通る
  // ---------------- 一騎打ちの見せ方 ----------------
  // 戦の定義（b_castle.js の duel）が一騎打ちを始めると（敵将が noTarget で、その隊が本人に focus を向け、崩れない）、それを見つけて見せ方を足す：
  //   名乗りの間（2.4 秒、敵将は足を止めて名乗る）・周りの兵は輪になって見届ける・敵将は間合いを測って回り、誘いを見せる・
  //   打ち合い（受け）と鍔迫り合い・大振りの後の隙（その間の一撃は深く入る）・討ち取れば周りがどよめく
  // 始めと終わり（褒美・下知の戻し）は戦の定義の側のまま。ここは足さばきと音だけ（毎コマ重い事はしない）
  duelTick(dt) {
    const P = this.playerUnit;
    if (!this.duel) {
      if ((this.duelScanT = (this.duelScanT || 0) - dt) > 0 || !P || !P.alive) return;
      this.duelScanT = 0.3;
      for (const g of this.groups) {
        if (g.focus !== P || !g.noRout) continue;
        // 戦の定義は一騎打ちの相手を「狙われない（noTarget）・しぶとい（体力 620 以上）」にする。その印のそろった敵だけを相手とみなす
        if (g.team === P.team) continue;
        for (const u of g.units) {
          if (!u.alive || !u.noTarget || u.isPlayer || u.maxHp < 620 || !(u.type === 'busho' || u.type === 'samurai' || u.name)) continue;
          // 周りの兵が手を止めて見届けている（duelHold）のも、戦の定義が一騎打ちを始めた印
          let held = false;
          this.forNear(P.pos.x, P.pos.z, 50, (o) => { if (!held && o.alive && o.duelHold) held = true; });
          if (held) { this.duelStart(u); return; }
        }
      }
      // 戦固有の一騎打ちは上の印を優先。ふつうの戦では、名のある敵へ近づくと向き合う。
      if (this.hooks.canDuel && this.hooks.canDuel()) for (const u of this.units) {
        if (!u.alive || u.team === P.team || !u.name || !(u.type === 'busho' || u.type === 'samurai') || u.noTarget || u.invuln || u.fleeing || u.woundOut || u.duelDone || !u.group || u.group.routed) continue;
        if (Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) > 9 || this.wallBetween(P.pos, P.team, u.pos)) continue;
        this.duelStart(u, true); return;
      }
      return;
    }
    const D = this.duel, f = D.foe;
    if (!P || !P.alive || !f.alive || f.fleeing || f.woundOut || !f.noTarget || !f.group || (!D.auto && f.group.focus !== P) || (D.auto && (this.time - D.t0 > 100 || Math.hypot(f.pos.x - P.pos.x, f.pos.z - P.pos.z) > 24))) { this.duelEnd(false); return; }
    D.c.x = (f.pos.x + P.pos.x) / 2; D.c.z = (f.pos.z + P.pos.z) / 2;
    // 名乗りを受けて、見届ける者たちが声を上げる
    if (!D.ack && this.time > D.t0 + 1.3) { D.ack = true; this.play('shout', D.c, 0.6); }
    // 鍔迫り合いの決着：力（残りの体力）と運で押し勝った方が相手を崩す（本人が少し勝ちやすい）
    if (D.bind && (D.bind.t -= dt) <= 0) {
      D.bind = null;
      const win = P.hp / P.maxHp * (0.75 + Math.random()) > f.hp / f.maxHp * (0.6 + Math.random());
      this.clashAt(P, f);
      if (win) {
        f.stagger = 1.2; f.lastKneelT = this.time; D.openT = this.time + 1.4;
        const dx = f.pos.x - P.pos.x, dz = f.pos.z - P.pos.z, dl = Math.hypot(dx, dz) || 1;
        f.push.x += dx / dl * 2.6; f.push.z += dz / dl * 2.6;
        this.play('shout', D.c, 0.5);
      } else {
        // 押し負けた：敵将がすかさず速い一太刀
        f.stagger = 0; f.cd = 0;
        f.atk = { t: 0.35, dur: 0.35, target: P, kind: 'kesa', fast: true };
        this.play('eshout', f.pos, 0.9);
      }
    }
  },
  duelStart(foe, auto = false) {
    const P = this.playerUnit, t = this.time;
    const D = this.duel = { foe, t0: t, naT: t + 2.4, sideT: 0, side: 1, rr: foe.reach + 1.2, feintT: 0, bind: null, bindCd: t + 6, blockCd: 0, openT: 0, c: { x: (foe.pos.x + P.pos.x) / 2, z: (foe.pos.z + P.pos.z) / 2 }, watch: [] };
    D.auto = auto; D.foeNoTarget = foe.noTarget; D.heavyT = t + 4; D.step = { want: null, speed: 0, face: 0 }; D.want = { x: 0, z: 0 };
    foe.noTarget = true; foe.target = P; foe.guarding = 2.4;
    foe.atk = null; foe.swing = null; foe.cd = Math.max(foe.cd, 2.6);
    // 見届ける者：戦の定義が手を止めさせた兵（duelHold）と、敵将の隊の旗本（手を出さずに下がる）
    this.forNear(D.c.x, D.c.z, 32, (o) => {
      if (!o.alive || o === foe || o.isPlayer || o.fleeing || o.type === 'dummy' || o.isStruct) return;
      if (!(o.duelHold || o.group === foe.group || Math.hypot(o.pos.x - D.c.x, o.pos.z - D.c.z) < 13)) return;
      D.watch.push({ unit: o, noTarget: o.noTarget });
      o.noTarget = true; o.duelW = true; o.target = null; o.atk = null; o.swing = null;
    });
    this.play('eshout', foe.pos, 1.2);
    if (this.hooks.onDuelStart) this.hooks.onDuelStart(foe);
  },
  duelEnd(won) {
    const D = this.duel;
    if (!D) return;
    this.duel = null; this.duelScanT = 3;   // 終わった直後は、戦の定義が見届けの印を外すまで探し直さない
    const P = this.playerUnit;
    D.foe.guarding = 0;
    if (D.auto) { D.foe.noTarget = D.foeNoTarget; D.foe.duelDone = true; }
    for (const w of D.watch) { w.unit.duelW = false; if (w.unit.noTarget) w.unit.noTarget = w.noTarget; }
    if (this.hooks.onDuelEnd) this.hooks.onDuelEnd(D.foe, won);
    if (!won || !P) return;
    // 討ち取った：味方はどっと沸き、敵は声を失ってたじろぐ（輪が崩れる）
    this.play('toki', P.pos, 1.1);
    setTimeout(() => this.play('eiei', P.pos, 0.8), 900);
    let groan = 0;
    for (const w of D.watch) {
      const o = w.unit;
      if (!o.alive || o.team === P.team) continue;
      const dx = o.pos.x - P.pos.x, dz = o.pos.z - P.pos.z, dl = Math.hypot(dx, dz) || 1;
      o.push.x += dx / dl * 1.5; o.push.z += dz / dl * 1.5;
      if (groan++ < 2) this.play('umeki', o.pos, 0.8);
    }
    const seen = new Set();
    for (const w of D.watch) { const o = w.unit; if (o.team !== P.team && o.group && !seen.has(o.group)) { seen.add(o.group); if (!o.group.noRout) o.group.morale = Math.max(0, o.group.morale - 12); } }
  },
  // 大振りの後の隙：敵将の振りが本人に受けられ・外れた時、体が流れる（p の割合で）
  duelOpen(u, t, p) {
    const D = this.duel;
    if (!D || u !== D.foe || !t.isPlayer || Math.random() > p) return;
    u.stagger = Math.max(u.stagger || 0, 0.9); D.openT = this.time + 1.1;
  },
  // 一騎打ちの間の、見届ける者と敵将の足：null なら、いつもの動きのまま
  duelAct(u) {
    const D = this.duel, P = this.playerUnit;
    const r0 = D.step, w = D.want;
    r0.want = null; r0.speed = 0;
    if (u === D.foe) {
      const fa = Math.atan2(P.pos.x - u.pos.x, P.pos.z - u.pos.z);
      // 名乗りの間：足を止めて向き合う
      if (this.time < D.naT) { u.cd = Math.max(u.cd, 0.4); r0.face = fa; return r0; }
      // 鍔迫り合いの間：一歩の間合いに詰めて押し合う
      if (D.bind) { w.x = P.pos.x - Math.sin(fa) * 0.95; w.z = P.pos.z - Math.cos(fa) * 0.95; r0.want = w; r0.speed = u.speed * 0.5; r0.face = fa; return r0; }
      return null;
    }
    // 見届ける者：二人の真ん中から 9〜12m の輪に立ち、真ん中を向く（今いる向きのまま下がる）
    const c = D.c, a = Math.atan2(u.pos.x - c.x, u.pos.z - c.z), r = 9 + (u.id % 3) * 1.2;
    w.x = c.x + Math.sin(a) * r; w.z = c.z + Math.cos(a) * r;
    const face = Math.atan2(c.x - u.pos.x, c.z - u.pos.z);
    r0.want = Math.hypot(w.x - u.pos.x, w.z - u.pos.z) > 0.8 ? w : null; r0.speed = u.speed * 0.8; r0.face = face; return r0;
  }
};
