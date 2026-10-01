// Army の手法：兵一人の判断と行い（think・act・騎馬の突撃・槍衾）
// （units.js から分けた。中身は元のまま。外の係は今までどおり units.js から import してよい）
import { TOFF, distToSeg, angleDiff, WOUND_FLOOR } from './units.js';
import { kickSpear } from './units_model.js';

// Army の手法（units.js の class Army に足す）
// 名のある敵を囲む時の、組頭（本人）の側から見た回り込みの角（本人の正面は空け、左右・斜め後ろ・真後ろへ）
const RING_OFF = [-1.9, -0.95, 0.95, 1.9, Math.PI];
export const ArmyThink = {

  think(u) {
    const g = u.group;
    // 槍衾の何列目か（前の列は槍を下げて揃える）
    u.row = g.formation === 'yari' ? Math.floor(u.slot / Math.max(2, Math.ceil(g.initial / (g.yariRanks || 2)))) : 0;
    // 手傷を負った武将：退いている間も、退いた後も戦わない（隊の奥に控える）。筋書きが invuln を解いたら元に戻す
    if (u.woundOut) {
      if (!u.invuln) { u.woundOut = null; u.noTarget = false; }
      else if (!u.fleeing) {
        u.target = null; u.atk = null; u.watch = null;
        if (u.woundOut.t > this.time) u.moveTo = u.woundOut.to;
        else { const f = g.forward(), s = g.slotPos(u.slot, g.initial); u.moveTo = { x: s.x - f.x * 10, z: s.z - f.z * 10 }; }
        return;
      }
    }
    // 旗本：手傷の武将の前に割って入り、打った者を迎える
    if (u.cover) {
      if (u.cover.t > this.time && !u.fleeing) {
        const p = this.playerUnit;
        u.target = p && p.alive && p.team !== u.team && Math.hypot(p.pos.x - u.pos.x, p.pos.z - u.pos.z) < 2.6 ? p : null;
        if (!u.target) u.moveTo = u.cover;
        return;
      }
      u.cover = null;
    }
    // 手傷の武将に肩を貸して退く旗本：武将の左右 0.6m に付いて歩く（間近の敵だけは払う）。武将が退き終えれば元の持ち場へ
    if (u.escort) {
      const w = u.escort.u;
      if (w.alive && w.woundOut && w.woundOut.t > this.time && !u.fleeing && !w.fleeing) {
        const near = this.nearestEnemy(u, 1.8);
        if (near) { u.target = near; return; }
        const rx = Math.cos(w.heading), rz = -Math.sin(w.heading);
        u.target = null; u.atk = null; u.watch = null; u.confused = 0;
        u.moveTo = { x: w.pos.x + rx * 0.62 * u.escort.s, z: w.pos.z + rz * 0.62 * u.escort.s };
        u.aiT = Math.min(u.aiT, 0.12);
        return;
      }
      u.escort = null;
    }
    // 逃げる者は戦わない（混乱・一呼吸・深手の下がりより先に見る。崩れた隊がまた斬りかかって見えないように）
    if (u.fleeing) {
      u.target = null; u.atk = null; u.confused = 0;
      if (u.loopP) this.freeSama(u);
      const f = g.fleeDir;
      // 逃げる向きは兵ごとに ±25° ほど違うが、走っている間は変えない（皆が同じ向きへ流れないように）
      const a = ((u.id * 0.618) % 1 - 0.5) * 0.87, ca = Math.cos(a), sa = Math.sin(a);
      const ox = f.x * ca - f.z * sa, oz = f.z * ca + f.x * sa;
      u.moveTo = { x: u.pos.x + ox * 20, z: u.pos.z + oz * 20 };
      return;
    }
    // 崩れた隊で、まだ背を向けていない者（ほつれの遅れの間）：斬りかからず、前を向いたまま後ずさる
    if (g.routed && u.routIn !== undefined) {
      u.target = null; u.atk = null;
      const f = g.forward();
      u.moveTo = { x: u.pos.x - f.x * 2, z: u.pos.z - f.z * 2 };
      return;
    }
    // 倒れた馬の下敷き（horseShot）：抜け出すまで何もできない
    if (u.pinT > this.time) { u.target = null; u.atk = null; u.moveTo = null; return; }
    // 勝鬨（celebrate）：旗の下へ寄って輪になる（目の前の敵だけは払う）
    if (g.victory && this.time - g.victory.t < 14 && !u.isPlayer) {
      const near = this.nearestEnemy(u, 2.5, (o) => !o.fleeing);
      if (near) { u.target = near; return; }
      u.target = null; u.atk = null; u.watch = null;
      const V = g.victory;
      if (u === V.by) { u.moveTo = null; return; }
      const a = u.slot * 2.39996, r = 1.6 + Math.sqrt(u.slot + 1) * 0.75;
      u.moveTo = { x: V.at.x + Math.sin(a) * r, z: V.at.z + Math.cos(a) * r };
      return;
    }
    if (u.pauseT > this.time && !u.fleeing) {
      const near = this.nearestEnemy(u, 1.6);
      u.target = near || null; if (!near) u.moveTo = null;
      return;
    }
    if (u.confused > 0) {
      // 部隊長を失った混乱：隊旗の下へ集まろうとして詰まる（旗が無ければ、あてもなく歩く）。行き先はたまにしか変えない
      const fb = g.units.find((o) => o.alive && o.banner && o !== u);
      if (!u.moveTo || Math.hypot(u.moveTo.x - u.pos.x, u.moveTo.z - u.pos.z) < 1 || Math.random() < 0.05) {
        u.moveTo = fb ? { x: fb.pos.x + (Math.random() - 0.5) * 3, z: fb.pos.z + (Math.random() - 0.5) * 3 } : { x: u.pos.x + (Math.random() - 0.5) * 6, z: u.pos.z + (Math.random() - 0.5) * 6 };
      }
      // 混乱していても、目の前（3m）に来た敵には身を守って打ち返す（すぐそばで棒立ちにしない）
      const close = this.nearestEnemy(u, 3, (o) => !o.fleeing);
      u.target = close || null;
      return;
    }
    if (g.regroupT > 0) {
      // 立て直し：はっきり退いて旗の下に集まり直す（持ち場を 10m 後ろへ詰めた形に並び直す）。その間は斬りかからない
      //   （ただし、すぐそば（2.6m）に付いてきた敵とは打ち合いながら下がる）
      const close = this.nearestEnemy(u, 2.6, (o) => !o.fleeing);
      if (close) { u.target = close; return; }
      const f = g.forward(), sp = g.slotPos(u.slot, g.initial), c = g.anchor;
      u.target = null; u.atk = null;
      u.moveTo = { x: c.x + (sp.x - c.x) * 0.6 - f.x * 10, z: c.z + (sp.z - c.z) * 0.6 - f.z * 10 };
      return;
    }
    // 深手の者は一度だけ隊の後ろへ下がり、しばらく息をつく（後ろの元気な者と持ち場を替わる）
    // （自分の組も同じ：深手の者は後ろの元気な者と替わる）
    if (!u.isPlayer && u.type !== 'busho' && u.type !== 'cavalry' && u.hp < u.maxHp * 0.25 && !u.backDone && g.count >= 5 && (g.order === 'hold' || g.order === 'attack' || g.order === 'yari' || g.order === 'follow')) {
      u.backDone = true; u.backT = this.time + 8 + Math.random() * 4;
      const { cols } = g.layout(g.initial);
      if (u.slot < cols && !g.isGun && !(g.cavShare > 0.1)) {
        let best = null;
        for (const o of g.units) if (o !== u && o.alive && !o.fleeing && !o.isPlayer && o.slot >= cols && o.hp > o.maxHp * 0.6 && (!best || o.slot > best.slot)) best = o;
        if (best) { const s0 = u.slot; u.slot = best.slot; best.slot = s0; }
      }
    }
    if (u.backT > this.time) {
      const near = this.nearestEnemy(u, 2);
      if (near) { u.target = near; return; }
      const f = g.forward(), c = g.center();
      u.target = null; u.moveTo = { x: c.x - f.x * 6, z: c.z - f.z * 6 };
      return;
    }
    // 守る隊（g.guard）の大将：敵に気づいたら旗本の後ろへ下がる（間近に来た敵だけを払う）
    if (g.guardOn && u === g.leader && u.type === 'busho' && g.count > 3 && (g.order === 'hold' || g.order === 'yari')) {
      const near = this.nearestEnemy(u, 2.6);
      if (near) { u.target = near; return; }
      u.target = null; u.watch = null;
      const f = g.forward(), s = g.slotPos(u.slot, g.initial);
      // 円陣（ai.js）の間は、輪の真ん中に立つ
      u.moveTo = g.formation === 'ring' ? { x: g.anchor.x, z: g.anchor.z } : { x: s.x - f.x * 7, z: s.z - f.z * 7 };
      return;
    }
    // 名のある武将（味方は誰でも、敵は大名・名将＝u.isLord だけ。本陣を守る隊＝guardOn は除く）：
    //   隊が斬り合っている間は突っ立たず、斬り合う兵の少し後ろへ馬を進めて下知する。間近の敵には刀を抜く
    if (!TOFF && (g.team === 0 || u.isLord) && u === g.leader && u.type === 'busho' && u.name && !g.guardOn && !g.isPlayerSquad && g.count > 3 && !u.fleeing && g.order !== 'retreat') {
      // 危ない時（深手・三人より多くの敵に寄られた）は、隊の後ろ（8m）へ下がって下知を続ける。すぐそば（1.8m）の敵だけは払う
      // 大名・名将は、本人（遊び手）が間近（6m）へ寄っただけでも退く：自分から斬り合いに出ない
      let crowd = 0;
      this.forNear(u.pos.x, u.pos.z, 5, (o) => { if (o.alive && o.team !== u.team && !o.fleeing && o.type !== 'dummy') crowd++; });
      const P = this.playerUnit;
      const playerNear = u.isLord && P && P.alive && P.team !== u.team && Math.hypot(P.pos.x - u.pos.x, P.pos.z - u.pos.z) < 6;
      if (u.hp < u.maxHp * 0.45 || crowd >= 3 || playerNear) {
        const close = this.nearestEnemy(u, 1.8);
        if (close) { u.target = close; return; }
        const f = g.forward(), c = g.center();
        u.target = null; u.watch = null; u.moveTo = { x: c.x - f.x * 8, z: c.z - f.z * 8 };
        if (!(u.backSayT > this.time) && this.hooks.onGeneralBack) { u.backSayT = this.time + 20; this.hooks.onGeneralBack(u); }
        return;
      }
      const near = this.nearestEnemy(u, u.mounted ? 3.4 : 2.6);
      if (near) { u.target = near; return; }
      // 自分を狙って寄ってくる敵（7m 内）と、隊が減って前に立つ兵が少ない時の近い敵（6m 内）には、自ら刀を抜いて迎える
      const hunter = this.nearestEnemy(u, 7, (o) => o.target === u && !o.fleeing);
      if (hunter) { u.target = hunter; return; }
      if (g.count <= 6) { const n6 = this.nearestEnemy(u, 6, (o) => !o.fleeing); if (n6) { u.target = n6; return; } }
      if (!(u.target && u.target.alive)) {
        let cx = 0, cz = 0, k = 0;
        for (const o of g.units) if (o !== u && o.alive && o.target && o.target.alive && !o.target.isStruct) { cx += o.pos.x; cz += o.pos.z; k++; }
        if (k >= 2) {
          const f = g.forward();
          u.target = null;
          u.moveTo = { x: cx / k - f.x * 3.5, z: cz / k - f.z * 3.5 };
          // ときどき采配を振り、敵の方を向いて下知する（数秒に一度。突っ立ったままに見せない）
          if (!(u.cheerT > this.time)) { u.cheerT = this.time + 4 + Math.random() * 5; u.cheer = 1; }
          return;
        }
        // 隊が敵に寄っていく間（進む・攻める）は、兵の群れの中ほどを一緒に進む（取り残されて立ち尽くさない）
        if ((g.order === 'move' || g.order === 'attack' || g.order === 'assault') && g.count > 3) {
          const c = g.center(), f = g.forward();
          if (Math.hypot(u.pos.x - c.x, u.pos.z - c.z) > 9) { u.target = null; u.moveTo = { x: c.x - f.x * 2.5, z: c.z - f.z * 2.5 }; return; }
        }
      }
    }
    let engage;
    switch (g.order) {
      case 'attack': engage = g.seekRange; break;
      case 'retreat': engage = 1.8; break;
      case 'path': engage = g.aggro * 0.6; break;
      case 'move': engage = Math.min(g.aggro, 6); break;
      case 'follow': engage = g.aggro; break;
      case 'assault': engage = 4.5; break;
      default: engage = g.aggro;
    }
    if ((u.type === 'bow' || u.type === 'gun') && g.fire !== false && g.order !== 'retreat') engage = Math.max(engage, u.range * (u.type === 'bow' ? 1 - 0.35 * (this.rain || 0) : 1));
    if (u.type === 'bow' && !g.fire) engage = Math.min(engage, 3);
    // 持ち場を守る弓は、届く間合いの外（60m まで）の敵へも遠矢を射かける（開戦の矢合わせ）
    if (u.type === 'bow' && g.fire !== false && (g.order === 'hold' || g.order === 'yari') && !(this.rain > 0.5)) engage = Math.max(engage, 58);
    // 横陣の後ろの段は列に残る：打ち合うのは前の段、二段目はすぐ前の敵だけ、三段目より後ろは目の前に来た敵だけ（一騎打ちの集まりにしない）
    if (u.type !== 'bow' && u.type !== 'gun' && u.type !== 'cavalry' && !g.isPlayerSquad && g.formation === 'line' && !g.marching && (g.order === 'hold' || g.order === 'attack' || g.order === 'follow')) {
      const row = Math.floor(u.slot / g.layout(g.initial).cols);
      if (row >= 1) engage = Math.min(engage, row === 1 ? 6 : 3);
    }
    // 「敵を狙え」の指定目標
    if (g.focus && g.focus.alive && g.order !== 'retreat') {
      const d = Math.hypot(g.focus.pos.x - u.pos.x, g.focus.pos.z - u.pos.z);
      if (d < 60) {
        // 近すぎる別の敵がいればそちらを優先（身を守る）
        const near = this.nearestEnemy(u, 2.2);
        u.target = near || g.focus;
        return;
      }
      // 狙う相手が遠い（60m より先）時は、その場で立ち尽くさず相手の方へ歩いて寄る（敵の隊だけ。自分の組は号令どおり）
      if (!g.isPlayerSquad && g.team !== 0 && g.order === 'attack' && d < 160) {
        const near = this.nearestEnemy(u, 3);
        if (near) { u.target = near; return; }
        u.target = null; u.moveTo = { x: g.focus.pos.x, z: g.focus.pos.z };
        return;
      }
    } else if (g.focus && !g.focus.alive) {
      g.focus = null;
      if (g.isPlayerSquad && this.hooks.onFocusDone) this.hooks.onFocusDone(g);
    }
    // 自分の組は、組頭（プレイヤー）に斬りかかる敵を優先して迎え撃つ
    // 本人が囲まれている（二人より多くに狙われている）時は、20m 先からでも駆け寄って、本人に打ちかかる敵の背を突く
    if (g.isPlayerSquad && (g.order === 'follow' || g.order === 'hold' || g.order === 'attack') && this.playerUnit && this.playerUnit.alive) {
      const pu = this.playerUnit;
      const dp = Math.hypot(pu.pos.x - u.pos.x, pu.pos.z - u.pos.z);
      const press = (this.threats || []).length;
      if (dp < (press >= 2 ? 20 : 14)) {
        // まず振りかぶっている敵（threats）から、次に本人を狙う敵を
        let foe = null, fd = 1e9;
        for (const o of this.threats || []) { if (!o.alive || o.team === u.team) continue; const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z); if (d < fd) { fd = d; foe = o; } }
        if (!foe) foe = this.nearestEnemy(pu, 6, (o) => o.target === pu || (o.atk && o.atk.target === pu));
        if (foe) { u.target = foe; return; }
      }
      // 本人を狙う鉄砲・弓（30m 内）がいれば、ついて来い・かかれの間は、槍・刀の者のうち二人が駆けて行って黙らせる
      if (g.order !== 'hold' && u.type !== 'bow' && u.type !== 'gun' && !u.mounted && dp < 25) {
        const sh = this.nearestEnemy(pu, 30, (o) => (o.type === 'gun' || o.type === 'bow') && (o.target === pu || (o.atk && o.atk.target === pu)) && !this.wallBetween(u.pos, u.team, o.pos));
        if (sh) {
          let n = 0;
          for (const o of g.units) if (o !== u && o.alive && o.target === sh) n++;
          if (n < 2 || u.target === sh) { u.target = sh; return; }
        }
      }
    }

    let t = null;
    // 槍・刀の者は、塀・柵の向こうで届かない敵を狙わない（弓・鉄砲は越えて撃てる）
    const melee = u.type !== 'bow' && u.type !== 'gun';
    // 自分の組の槍・刀の者は、近く（持ち場から届く所）に名のある敵（武将・侍大将）がいれば、四人まで寄ってたかって囲む
    if (g.isPlayerSquad && melee && engage > 0 && g.order !== 'retreat' && !u.mounted) {
      const boss = this.nearestEnemy(u, engage + 4, (o) => !!o.name && !o.fleeing && (o.type === 'busho' || o.type === 'samurai') && !this.wallBetween(u.pos, u.team, o.pos));
      if (boss) {
        let n = 0;
        for (const o of g.units) if (o !== u && o.alive && o.target === boss) n++;
        if (n < 4) { u.target = boss; u.watch = null; return; }
      }
    }
    // 鉄砲は、塀の向こうで見えない者（狭間にも塀の上にもいない者）を狙わない
    // 深追いしない：逃げる敵を追うのは騎馬だけ。徒歩の者は目の前（4m）の逃げる者だけを打つ
    const ok = (o) => (!melee || !this.wallBetween(u.pos, u.team, o.pos)) && (u.type !== 'gun' || !this.hiddenBehind(u, o))
      && (!o.fleeing || u.type === 'cavalry' || u.mounted || g.isPlayerSquad || Math.abs(o.pos.x - u.pos.x) + Math.abs(o.pos.z - u.pos.z) < 5);
    if (g.order === 'hold' || g.order === 'follow' || g.order === 'yari') {
      // 持ち場から離れすぎない
      const home = g.slotPos(u.slot, g.initial);
      t = this.nearestEnemy(u, engage, (o) => Math.hypot(o.pos.x - home.x, o.pos.z - home.z) < engage + 2 && ok(o));
    } else if (engage > 0) {
      t = this.nearestEnemy(u, engage, ok);
      // 届く敵がいなければ、塀の向こうの敵へ寄せる（塀ぎわで押す）。門や塀を攻める隊はそちらを優先
      if (!t && melee && g.order !== 'assault') t = this.nearestEnemy(u, engage);
    }
    if (t) { u.target = t; u.watch = null; return; }
    // 火矢の弓（g.fireArrows）：射る敵がいなければ、射程の内の敵方の柵・門・小屋へ火矢を射込む
    if (u.type === 'bow' && g.fireArrows && g.fire !== false) {
      let st = null, sd = u.range * 1.4;
      for (const s of this.structs) {
        if (!s.alive || s.team === u.team || s.maxHp > 1e8 || s.fireF || s.fireProof) continue;
        const d = this.distTo(u, s);
        if (d < sd) { sd = d; st = s; }
      }
      if (st) { u.target = st; u.watch = null; return; }
    }
    u.target = null;
    // 持ち場を守る者は、少し先（30m 以内）の敵を見張る（そちらへ体を向ける）
    if (g.order === 'hold') {
      if (!(u.watchT > this.time) || (u.watch && !u.watch.alive)) { u.watch = this.nearestEnemy(u, 30); u.watchT = this.time + 1 + Math.random(); }
    } else u.watch = null;
    if (g.order === 'assault' && g.assault) {
      const st = g.assault(u);
      if (st && st.isStruct) { u.target = st; return; }
      // 柵ごしの目の前（3.2m）に遊び手がいれば、その前の柵を打ち破りにかかる（柵の外で棒立ちにしない）
      if (st) {
        const pf = this.playerUnit;
        if (pf && pf.alive && pf.team !== u.team && Math.hypot(pf.pos.x - u.pos.x, pf.pos.z - u.pos.z) < 3.2) { const ws = this.wallAt(u.pos, u.team, pf.pos); if (ws) { u.target = ws; return; } }
        u.moveTo = st; return;
      }
    }
    // 狭間・柵ぎわで撃っていた者は、しばらくそこに留まる（敵が見えなくなるたびに持ち場へ戻らない）
    if (u.loopP && g.order === 'hold' && u.loopT > this.time - 8) { u.moveTo = u.loopP; return; }
    if (u.loopP) this.freeSama(u);
    // 開く途中：後ろの者は、先の者が開くまで少し待ってから持ち場へ（全員が一度に動かない）
    if (g._deployT > this.time - 3 && this.time - g._deployT < (u.slot / Math.max(1, g.initial)) * 2.4) { u.moveTo = null; return; }
    // 自分の組が「かかれ」のまま討つ敵がいない時は、その場で立ち尽くさず組頭（遊び手）の後ろへ寄って次を待つ
    const P = this.playerUnit;
    // 馬上の組頭の時も同じ（馬の後ろ足に掛からないよう、少し後ろへ）
    if (g.isPlayerSquad && g.order === 'attack' && P && P.alive) {
      const sp = g.slotPos(u.slot, g.initial), a = g.anchor, bk = P.mounted ? 6 : 3;
      const q = { x: P.pos.x + (sp.x - a.x) - Math.sin(P.heading) * bk, z: P.pos.z + (sp.z - a.z) - Math.cos(P.heading) * bk };
      if (Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 5 || (u.moveTo && Math.hypot(u.moveTo.x - q.x, u.moveTo.z - q.z) < 6)) { u.moveTo = q; return; }
    }
    // 押し合いの後ろの段：前の段が斬り合っている間は、同じ列の前の者の背（1m 後ろ）につき、槍を立てて押す（u.pressBack）
    u.pressBack = null;
    if (melee && u.type !== 'cavalry' && !u.mounted && !g.isPlayerSquad && !g.isGun && !(g.cavShare > 0.1) && g.formation === 'line' && !g.marching
      && (g.order === 'hold' || g.order === 'attack') && g._wasEng && this.time - g._wasEng < 3) {
      const { cols } = g.layout(g.initial);
      if (u.slot >= cols) {
        const fr = g.units.find((o) => o.slot === u.slot - cols);
        if (fr && fr.alive && !fr.fleeing && fr.target && fr.target.alive && !fr.target.isStruct) {
          const f = g.forward();
          u.pressBack = fr;
          u.moveTo = { x: fr.pos.x - f.x * 1.05, z: fr.pos.z - f.z * 1.05 };
          return;
        }
      }
    }
    u.moveTo = g.slotPos(u.slot, g.initial);
  },

  distTo(u, t) {
    if (t.isStruct) {
      if (t.seg) return distToSeg(u.pos.x, u.pos.z, t.seg) - 0.2;
      return Math.hypot(t.x - u.pos.x, t.z - u.pos.z) - (t.r || 1);
    }
    return Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z);
  },

  targetPoint(t) {
    if (t.isStruct) {
      if (t.seg) { const s = t.seg; return { x: (s[0] + s[2]) / 2, z: (s[1] + s[3]) / 2 }; }
      return { x: t.x, z: t.z };
    }
    return { x: t.pos.x, z: t.pos.z };
  },
  faceTo(u, t) { const p = this.targetPoint(t); return Math.atan2(p.x - u.pos.x, p.z - u.pos.z); },

  // 向きを変える：なめらかに、ただし一度に回れる速さ（rad/s）には限りがある
  turn(u, h, dt, rate) {
    const d = angleDiff(u.heading, h);
    const cap = rate * dt;
    u.heading += Math.max(-cap, Math.min(cap, d * Math.min(1, dt * 6)));
  },

  // 騎馬：助走をつけて突っ込み、当てたら駆け抜けて離れ、向きを変えてまた寄せる
  cavalry(u, t, d, tp, dt, near) {
    if (u.stagger > 0) return { want: null, speed: 0 };   // 止められて竿立ち
    if (u.cv === 'out') {
      u.cvT -= dt;
      // 十分に離れたら、向きを変えてまた寄せる
      if (u.cvT > 0 || (d < 9 && u.cvT > -2.5)) return { want: { x: u.pos.x + u.cvDir.x * 10, z: u.pos.z + u.cvDir.z * 10 }, speed: u.run * 0.9 };
    }
    u.cv = 'in';
    // 騎馬の隊（三騎より多い）は、並足から早足で寄せ、号令（鬨の声）で一斉に駆け出す。一騎ずつばらばらに駆け出さない
    const g = u.group;
    let hold = false;
    if (d > 7 && g && !u.charging && !(u.chargeCd > this.time) && g.units.filter((x) => x.alive && x.type === 'cavalry').length > 3) {
      if (!(g.cavGo > this.time - 2.5)) {
        g.cavGo = this.time + 1.4;
        const L = g.leader && g.leader.alive ? g.leader : u;
        if (L.camD < 90) { this.play('eshout', L.pos, 1.1); this.play('hooves', L.pos, 0.8); this.play('neigh', L.pos, 0.6); }   // 駆け出す前の気配：鬨の声・高まる蹄・いななき
      }
      hold = this.time < g.cavGo;
    }
    if (d > 7 && !hold) this.startCharge(u, near);
    if (u.stagger > 0) return { want: null, speed: 0 };
    if (hold) return { want: tp, speed: u.speed * 1.6 };
    if (d <= u.reach + (u.charging ? 0.9 : 0.4) && (u.charging || u.cd <= 0) && !t.isStruct && !this.wallBetween(u.pos, u.team, t.pos)) {
      const was = u.charging;
      // 駆けながらの突きは、構えた槍がそのまま当たる（振りかぶらない）
      u.swing = { kind: was ? 'charge' : 'thrust', t: 0, dur: 0.2, at: 0, done: true, target: t, res: null, d };
      this.strike(u, t, near, was ? 1.8 : 1, u.swing);
      u.strikeT = 0.2;
      u.cd = u.cdBase * (0.85 + Math.random() * 0.3);
      u.charging = false; u.chargeCd = this.time + (was ? 3 : 1.5);
      // 駆け抜ける：突いたらそのまま前へ抜け、止まって斬り合わない
      const h = u.heading + (was ? 0 : (u.id % 2 ? 0.8 : -0.8));
      u.cv = 'out'; u.cvT = was ? 1.8 : 2.2; u.cvDir = { x: Math.sin(h), z: Math.cos(h) };
      return { want: { x: u.pos.x + u.cvDir.x * 10, z: u.pos.z + u.cvDir.z * 10 }, speed: u.run };
    }
    return { want: tp, speed: u.charging || d > 5 ? u.run : u.speed * 1.4 };
  },
  // 駆け出す（蹄の音）。駆けている間に槍衾や柵に当たると止められる
  startCharge(u, near) {
    if (u.charging || u.chargeCd > this.time || u.stagger > 0) return;
    u.charging = true; u.chargeT = this.time;
    if (near) this.play('hooves', u.pos, 1.2);
  },
  // 槍衾に正面（±60°）から当たると止められる。横や後ろから突っ込めば止められない
  checkYari(u) {
    let stopped = null;
    this.forNear(u.pos.x, u.pos.z, 3.2, (o) => {
      if (stopped || !o.alive || o.team === u.team || !o.group || o.group.formation !== 'yari' || !(o.group.order === 'yari' || o.group.order === 'hold')) return;
      const dx = u.pos.x - o.pos.x, dz = u.pos.z - o.pos.z, d = Math.hypot(dx, dz) || 1;
      if ((dx * Math.sin(o.heading) + dz * Math.cos(o.heading)) / d < 0.5) return;
      stopped = o;
    });
    if (!stopped) return;
    // 槍衾の者が穂先を揃えて突き出し、柄が撓む
    stopped.swing = { kind: 'thrust', t: 0, dur: 0.2, at: 0, done: true, target: u, res: 'hit', d: Math.hypot(u.pos.x - stopped.pos.x, u.pos.z - stopped.pos.z) };
    stopped.strikeT = 0.2; kickSpear(stopped.wpn, 2.5);
    // 受け止めた者は石突を地に立てて踏ん張る（1.2 秒：穂先を馬の胸の高さへ上げ、柄を大きく撓ませ、半歩押し下げられる）
    stopped.planted = this.time + 1.2; kickSpear(stopped.wpn, 3.5);
    { const f = Math.hypot(u.pos.x - stopped.pos.x, u.pos.z - stopped.pos.z) || 1; stopped.push.x -= (u.pos.x - stopped.pos.x) / f * 2.2; stopped.push.z -= (u.pos.z - stopped.pos.z) / f * 2.2; }
    this.bleed(u, stopped, 'thrust', 1.4, 'flesh');
    this.cavalryStopped(u, stopped.pos.x, stopped.pos.z, 35);
    if (this.hooks.onCavalryStopped) this.hooks.onCavalryStopped(u, stopped);
    if (u.hp <= 0) this.kill(u, stopped);
  },
  // 騎馬が止められた：馬が竿立ちになり、しばらく動けず、そのあと退いて寄せ直す
  cavalryStopped(u, bx, bz, hurt) {
    u.charging = false; u.chargeCd = this.time + 6; u.stagger = 1.6; u.lastHitT = 0;
    // 討たれない武将は下限（WOUND_FLOOR）より下がらない
    u.hp = u.invuln ? Math.max(Math.min(u.hp, u.maxHp * WOUND_FLOOR), u.hp - hurt) : u.hp - hurt;
    const dx = u.pos.x - bx, dz = u.pos.z - bz, d = Math.hypot(dx, dz) || 1;
    // 士気の落ちた隊の馬は怯えて、長く退いてからでないと寄せ直さない
    const gm = u.group ? u.group.morale : 100;
    u.cv = 'out'; u.cvT = 2.2 + (gm < 55 ? (55 - gm) / 12 : 0); u.cvDir = { x: dx / d, z: dz / d };
    u.mv.x *= 0.1; u.mv.z *= 0.1;
    if (u.horse && u.horse.userData.horse) u.horse.userData.horse.rear = 0.8;
    this.spark(u.pos.x, u.pos.y + 1.6, u.pos.z, 10);
    this.play('neigh', u.pos, 0.8);
  },

  act(u, dt, near) {
    const g = u.group;
    let want = null, face = null;
    let speed = u.speed;
    if (u.stagger > 0) u.stagger -= dt;
    // 鍔迫り合いの決着：力（残りの体力）と運で押し勝った方が、相手を大きく崩す（膝をつかせる）
    if (u.bind && (u.bind.t -= dt) <= 0) {
      const o = u.bind.o; u.bind = null;
      if (o && o.alive && u.alive) {
        const win = u.hp / u.maxHp * (0.6 + Math.random()) > o.hp / o.maxHp * (0.6 + Math.random());
        const lo = win ? o : u, hi = win ? u : o;
        lo.stagger = 1.0; lo.lastKneelT = this.time; hi.stagger = 0; hi.cd = Math.min(hi.cd, 0.1);
        const dx = lo.pos.x - hi.pos.x, dz = lo.pos.z - hi.pos.z, dl = Math.hypot(dx, dz) || 1;
        lo.push.x += dx / dl * 3; lo.push.z += dz / dl * 3;
      }
    }
    if (u.relT > 0) u.relT -= dt;
    // 一騎打ち：見届ける者は輪になって見守り、名乗りと鍔迫り合いの間は敵将も足を止める
    if (this.duel && (u.duelW || u === this.duel.foe) && !u.fleeing) {
      const r = this.duelAct(u);
      if (r) { this.steer(u, dt, r.want, r.speed, r.face); return; }
    }
    if (u.hit) { u.hit.t += dt; if (u.hit.t > u.hit.dur) u.hit = null; }
    // 振り出した武器：穂先・刃が届いた時に当たりを決める（振る前・届く前には当たらない）
    if (u.swing) {
      const s = u.swing;
      s.t += dt;
      if (!s.done && s.t >= s.dur * s.at) { s.done = true; this.landSwing(u, s, near); }
      if (s.t >= s.dur + 0.3) u.swing = null;
    }
    if (u.atk) {
      const a = u.atk;
      a.t -= dt;
      if (a.ranged) {
        // 鉄砲：火蓋を切り、台尻を頬に付けて狙い、引き金を落とす（火皿の口薬が先に光り、すぐ筒の薬に移る）
        if (a.t <= 0.1 && !a.pan) { a.pan = true; this.panFlash(u, near); }
        if (a.t <= 0 && a.target.alive && !a.target.isStruct && this.shotBlocked(u, this.targetPoint(a.target))) {
          // 狙う間に的が動き、自分の方の塀が前に来た：撃たずに筒を下ろす（弾は塀を抜けない）
          u.atk = null; u.cd = 0.4;
        } else if (a.t <= 0) {
          u.atk = null;
          const ok = this.fireGun(u, a.target);
          // 不発（雨で火縄が湿った）：火縄を吹き、付け直すのに込め直しの半分ほどかかる（膝をついて袖で庇いながら）
          this.startReload(u, ok ? 1 : 0.55);
          this.gunRotate(u);
          // 敵の鉄砲組が揃えて放った直後は、弾込めの間（遊び手に知らせる。組ごとに 20 秒に一度）
          if (g.isGun && g.vCall > this.time - 1 && g.team !== (this.playerUnit ? this.playerUnit.team : 0) && !(g.reloadCallT > this.time - 20) && this.hooks.onFoeReload) { g.reloadCallT = this.time; this.hooks.onFoeReload(g); }
        } else face = this.faceTo(u, a.target);
      } else if (a.bow) {
        // 弓：番えて、打ち起こし、引き分け、会で狙いを定めて離れ
        const tg = a.target.alive ? a.target : u.target && u.target.alive && !u.target.isStruct ? u.target : null;
        // 引く間は体を横に開く（左の肩を的へ）ので、向きを少し右へ
        if (tg) face = this.faceTo(u, tg) + (a.dur - a.t > 0.8 ? 0.3 : 0);
        if (a.t <= 0) {
          u.atk = null; u.relT = 0.55;
          if (tg) this.shoot(u, tg);
          u.cd = u.cdBase * (0.8 + Math.random() * 0.5) * (a.far ? 1.7 : 1);   // 遠矢は引きが重く、間を空けて射る
        }
      } else if (a.t <= 0) {
        u.atk = null;
        u.cd = u.cdBase * (0.85 + Math.random() * 0.45) * (g.morale < 40 ? 1.35 : 1) * (1 + 0.35 * (u.fat || 0));   // 疲れた者は手が遅い
        this.startSwing(u, a.kind || 'thrust', a.target);
        if (a.fast && u.swing) u.swing.dur *= 0.7;
      } else face = this.faceTo(u, a.target);
    } else if (u.target && u.target.alive) {
      const t = u.target;
      const d = this.distTo(u, t);
      const tp = this.targetPoint(t);
      const fa = Math.atan2(tp.x - u.pos.x, tp.z - u.pos.z);
      if (u.type === 'cavalry' && t.isStruct && u.cv === 'out' && !u.fleeing && !(u.stagger > 0) && (u.cvT -= dt) > 0) {
        // 柵に止められた騎馬は、いったん退いてから寄せ直す
        want = { x: u.pos.x + u.cvDir.x * 10, z: u.pos.z + u.cvDir.z * 10 }; speed = u.run * 0.8;
        if (u.cvT <= dt) u.cv = 'in';
      } else if (u.type === 'cavalry' && !t.isStruct && !u.fleeing) {
        const r = this.cavalry(u, t, d, tp, dt, near);
        want = r.want; speed = r.speed;
        if (!want) face = null;
      } else if (u.type === 'gun' && !u.sidearm && !t.isStruct && d < 2.2 && !u.isPlayer && !u.mounted && !(u.sideTry > 0) && (u.sideTry = 1) && Math.random() < 0.35) {
        // 寄られた鉄砲足軽の三人に一人ほどは、鉄砲を置いて脇差を抜く（台尻で殴り合わない）
        this.drawSidearm(u);
      } else if (u.type === 'gun' && !u.sidearm && !t.isStruct && d > 4 && d <= u.range) {
        // 鉄砲：足を止めて狙いを定め、撃つ（撃てば長い装填）。段を組んだ隊は、前の段の者だけが撃つ
        face = fa;
        let ready = true;
        if (this.gunGated(g) && !this.atLoop(u)) {
          const sp = g.slotPos(u.slot, g.initial);
          const ds = Math.hypot(sp.x - u.pos.x, sp.z - u.pos.z);
          if (ds > 0.45) { want = sp; speed = ds > 3 ? u.run : u.speed; }
          ready = ds < 1.1 && this.gunFront(u);
        }
        // 自分の方の塀・柵が撃つ線をさえぎる時は撃たない。狭間の後ろや柵のすぐ後ろへ寄って、そこから撃つ
        const wb = this.shotBlocked(u, tp);
        if (wb) {
          ready = false;
          const p = this.loopPost(u, tp, wb);
          const dp = p ? Math.hypot(p.x - u.pos.x, p.z - u.pos.z) : 0;
          if (dp > 0.12) { want = p; speed = dp > 3 ? u.run : u.speed; }
        } else if (this.atLoop(u)) u.loopT = this.time;
        // 塀の向こうに隠れた者（狭間にも塀の上にも見えない者）は撃たない
        if (ready && this.hiddenBehind(u, t)) ready = false;
        // 撃つ線の上（前）に味方がいれば、撃たずに待つ
        if (ready && u.cd <= 0 && this.allyInLine(u, tp, d)) ready = false;
        // 号令を待つ鉄砲組（holdFire）は、込めたまま「放て」を待つ
        // 段を組んだ隊は、組頭の「放て」で前の段がそろって撃つ（最初の者が構えてから 0.8 秒待って号令。0.25 秒の間に構えている者だけが撃つ）
        let vol = false;
        // 自分（プレイヤー）の近くの敵の鉄砲組（6 挺より多い）も、段を組んでいなくても「構え」から揃えて放つ。構えから放つまでの間を長く取る（食らう前の一瞬の間）
        const P0 = this.playerUnit;
        const foeLine = !TOFF && g.isGun && g.count >= 6 && P0 && P0.alive && g.team !== P0.team && Math.abs(P0.pos.x - u.pos.x) + Math.abs(P0.pos.z - u.pos.z) < u.range + 20;
        if (ready && u.cd <= 0 && !(u.stagger > 0) && !g.holdFire && g.fire !== false && (this.gunGated(g) || foeLine)) {
          if (!(g.vCall > this.time - 0.25)) {
            const wait = foeLine ? 1.4 : 0.8;
            g.vCall = this.time + wait;
            const L = g.leader && g.leader.alive ? g.leader : u;
            if (L.camD < 70) this.play('eshout', L.pos, 0.5);
            if (foeLine && this.hooks.onFoeVolleyCall) this.hooks.onFoeVolleyCall(g, L, wait);
          }
          if (this.time < g.vCall) ready = false; else vol = true;
        }
        if (ready && u.cd <= 0 && !(u.stagger > 0) && !g.holdFire && g.fire !== false && Math.abs(angleDiff(u.heading, fa)) < 0.5) {
          const dur = vol ? 0.12 + Math.random() * 0.16 : 0.45 + u.windup * (0.8 + Math.random() * 0.4);   // 火蓋を切る（0.45 秒）と狙い。号令の時は構えたまま待っていたので、すぐ落とす
          u.atk = { t: dur, dur, target: t, ranged: true };
          if (t.isPlayer) this.playerAttackers++;
        }
      } else if (u.type === 'gun' && !t.isStruct && d > u.range) {
        want = tp; speed = u.run;
      } else if (u.type === 'bow' && t.isStruct && g.fireArrows && g.fire !== false) {
        // 火矢：届く所（射程の 0.9）まで寄り、足を止めて射込む
        if (d > u.range * 0.9) { want = tp; speed = u.run; }
        else {
          face = fa;
          if (u.cd <= 0 && Math.abs(angleDiff(u.heading, fa)) < 0.6 && !(u.stagger > 0)) { const dur = 1.9 + Math.random() * 0.4; u.atk = { t: dur, dur, target: t, bow: true }; u.bowElev = d > 20 ? 0.35 : 0.12; }
        }
      } else if (u.type === 'bow' && !t.isStruct && (d < 4 || u.bowBack && d < 9) && g.order !== 'hold' && g.order !== 'yari') {
        // 弓兵は間合いを詰められたら、背を向けて走って下がり（9m 離れるまで振り返らない）、離れてから向き直って番える
        u.bowBack = true;
        const dl = Math.max(0.1, d);
        want = { x: u.pos.x - (tp.x - u.pos.x) / dl * 4, z: u.pos.z - (tp.z - u.pos.z) / dl * 4 }; speed = u.run;
      } else if (u.type === 'bow' && !t.isStruct && d > 4 && g.fire) {
        u.bowBack = false;
        const farShot = (g.order === 'hold' || g.order === 'yari') && d <= 60 && !(this.rain > 0.5);
        if (d <= u.range * (1 - 0.35 * (this.rain || 0)) || farShot) {
          face = fa;
          // 自分の方の塀・柵が前にある時：近くの狭間へ寄って射る。狭間が無ければ塀の上越しに高く射上げる（塀のすぐ後ろからは射ない）
          let clear = true;
          const wb = this.shotBlocked(u, tp);
          if (wb) {
            const p = this.loopPost(u, tp, wb);
            const dp = p ? Math.hypot(p.x - u.pos.x, p.z - u.pos.z) : 0;
            if (p && dp > 0.12) { want = p; speed = dp > 3 ? u.run : u.speed; clear = false; }
            else if (distToSeg(u.pos.x, u.pos.z, wb.seg) < 2.5) clear = false;
          } else if (this.atLoop(u)) u.loopT = this.time;
          // 組の弓はおおむね揃えて引く（誰かが番えれば、支度のできかけた者も続く）
          const volley = g.bowT > this.time - 0.9 && (u.cd < 1.2 || g.lastVolley > this.time - 0.5);   // 最後の一矢（ai.js）は込め途中の者も放つ
          if (clear && (u.cd <= 0 || volley) && Math.abs(angleDiff(u.heading, fa)) < 0.6 && !(u.stagger > 0)) {
            // 番える 0.8・打ち起こし 0.5・引き分け 0.7・会。組の一斉射では、先に番えた者の離れにそろえる（0.1 秒の内に放つ＝矢の雨）
            if (!(g.bowT > this.time - 0.9)) g.bowT = this.time;
            const dur = Math.max(1.4, g.bowT + 2.3 - this.time) + Math.random() * 0.1;
            u.atk = { t: dur, dur, target: t, bow: true, far: d > u.range };
            u.bowElev = d > 24 ? Math.min(0.75, 0.3 + (d - 24) / 50) : wb ? 0.5 : 0.04;
          }
        } else { want = tp; speed = u.run; }
      } else if (d > (t.isPlayer && !u.mounted ? Math.min(u.reach * 0.92, 2.6) : u.reach * 0.92) || (u.charging && t.isStruct)) {
        // （本人へは 2.6m まで詰めてから打つ。長柄の間合いの外から一方的に打たれて、本人の突きが届かないことが無いように）
        want = tp; speed = d > 6 || g.order === 'attack' ? u.run : u.speed;
        // 自分の組が名のある敵を囲む：真正面へ団子にならず、組頭（本人）の側から左右と背へ回り込んで間合いに入る
        if (g && g.isPlayerSquad && t.name && !t.isStruct && (t.type === 'busho' || t.type === 'samurai') && d < 9 && !u.mounted && this.playerUnit) {
          const P = this.playerUnit, base = Math.atan2(P.pos.x - t.pos.x, P.pos.z - t.pos.z);
          const a = base + RING_OFF[u.slot % 5], r = u.reach * 0.85;
          const q = { x: t.pos.x + Math.sin(a) * r, z: t.pos.z + Math.cos(a) * r };
          // 回り込む先がもうすぐ目の前なら、そのまま打ちかかる
          if (Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 0.8) want = q;
        }
        // 騎馬は柵へも駆けて当たる（正面から当たると止められる）
        if (u.type === 'cavalry' && d > 7) this.startCharge(u, near);
        if (u.charging) speed = u.run;
      } else if (t.isPlayer && u.guarding > 0) {
        // 構えの姿勢：その場で槍を立てて待つ
        u.guarding -= dt;
        face = fa;
      } else if (t.isPlayer && this.playerAttackers >= (this.attackCap || this.maxAttackers || 3) + (this.behindOf(t, u) ? 1 : 0) && !u.stagger) {
        // （囲まれた時は、背の側の者がもう一人だけ上限を越えて打ってくる。組から離れて一人で突っ込むと危ない）
        // 一度に斬りかかるのは3人まで。残りは間合いの外で機をうかがう
        // 自分の列の持ち場が近ければそこへ戻って構えて待つ。遠ければ間合いの外で機をうかがう
        const hm = g && !g.isPlayerSquad && (g.order === 'hold' || g.order === 'yari' || g.order === 'follow') ? g.slotPos(u.slot, g.initial) : null;
        const hd = hm ? Math.hypot(hm.x - t.pos.x, hm.z - t.pos.z) : 99;
        if (hm && hd < 8 && hd > u.reach + 0.8) want = hm;
        else {
          const a = (u.id * 2.39996) % (Math.PI * 2);
          const r = u.reach + 1.4;
          want = { x: t.pos.x + Math.sin(a) * r, z: t.pos.z + Math.cos(a) * r };
        }
        if (Math.hypot(want.x - u.pos.x, want.z - u.pos.z) < 0.5) want = null;
        face = fa;
      } else {
        face = fa;
        // 武将は足軽ひとりと延々打ち合わない：手の空いた旗本（同じ隊の者）を二人まで前へ呼び、自分は半歩下がる
        if (u.type === 'busho' && t.isPlayer && !u.mounted && !(u.callT > this.time)) {
          u.callT = this.time + 3;
          let k = 0;
          this.forNear(u.pos.x, u.pos.z, 8, (o) => { if (k < 2 && o !== u && o.alive && o.group === g && !o.fleeing && !(o.target && o.target.alive) && o.type !== 'gun' && o.type !== 'bow') { o.target = t; k++; } });
          if (k) { u.stepBackT = this.time + 1.2; if (u.camD < 30) this.play('eshout', u.pos, 0.6); }
        }
        if (u.stepBackT > this.time && u.cd > 0.2) { want = { x: u.pos.x - Math.sin(fa) * 1.5, z: u.pos.z - Math.cos(fa) * 1.5 }; speed = u.speed * 0.5; }
        // 侍と武将は、打つ間の空いた時に相手の周りを小さく回り込み、間合いを測る（足軽のように棒立ちで打ち合わない）
        if ((u.type === 'samurai' || u.type === 'busho') && t.isPlayer && !u.mounted && u.cd > 0.4 && !(u.guarding > 0) && !(u.stepBackT > this.time)) {
          const side = u.id % 2 ? 1 : -1, a0 = Math.atan2(u.pos.x - t.pos.x, u.pos.z - t.pos.z) + side * 0.5, r = u.reach + 0.5;
          want = { x: t.pos.x + Math.sin(a0) * r, z: t.pos.z + Math.cos(a0) * r }; speed = u.speed * 0.55;
        }
        // 崩れかけ（士気 32 未満）の者は、打ち終えると前を向いたまま小さな歩幅で後ずさる
        if (g.morale < 32 && !g.noRout && u.cd > 0.3 && !u.mounted) { want = { x: u.pos.x - Math.sin(fa) * 1.1, z: u.pos.z - Math.cos(fa) * 1.1 }; speed = u.speed * 0.3; }
        // 一騎打ちの敵将：打つ間の空いた時は、間合いを測って左右へ回り、ときどき踏み込むふり（誘い）を見せる
        if (this.duel && this.duel.foe === u && t.isPlayer && u.cd > 0.15 && !(u.stagger > 0)) {
          const D = this.duel;
          if (this.time > D.sideT) {
            D.sideT = this.time + 1.4 + Math.random() * 1.8; D.side = Math.random() < 0.5 ? 1 : -1; D.rr = u.reach + 0.8 + Math.random() * 1.3;
            if (Math.random() < 0.3) { D.feintT = this.time + 0.4; if (near) this.play('eshout', u.pos, 0.5); }
          }
          const fe = D.feintT > this.time, r = fe ? u.reach * 0.75 : D.rr;
          const a0 = Math.atan2(u.pos.x - t.pos.x, u.pos.z - t.pos.z) + D.side * 0.42;
          want = { x: t.pos.x + Math.sin(a0) * r, z: t.pos.z + Math.cos(a0) * r }; speed = u.speed * (fe ? 1.2 : 0.55);
        }
        // 自分（プレイヤー）を前にした侍・足軽は、ときどき構えの姿勢をとる
        if (t.isPlayer && u.cd > 0.2 && !(u.guardCd > this.time) && u.type !== 'bow' && Math.random() < dt * (u.type === 'ashigaru' ? 0.5 : 1.1)) {
          u.guarding = 0.8 + Math.random() * 0.9; u.guardCd = this.time + 3;
        }
        if (u.cd <= 0 && !(u.stagger > 0)) {
          // 技を選ぶ：長柄は突く・上から叩く・払う。刀は袈裟・逆袈裟・横に薙ぐ・突く。鉄砲と弓は台尻・弓で打つ
          const w = u.wpnKind || u.lookWeapon, r = Math.random();
          // 長柄は列で技が変わる：前の段は上から叩き、二段目より後ろは前の者の肩越しに突く
          const back = g && !g.isPlayerSquad && (g.formation === 'line' || g.formation === 'yari') ? (g.formation === 'yari' ? (u.row || 0) : Math.floor(u.slot / g.layout(g.initial).cols)) > 0 : false;
          const pS = back ? 0.15 : 0.55, pW = back ? 0.2 : 0.67;
          const kind = w === 'sword' ? (r < 0.32 ? 'kesa' : r < 0.56 ? 'gyaku' : r < 0.8 ? 'yoko' : 'tsuki')
            : w === 'spear' ? (u.type === 'ashigaru' && !u.mounted && !t.isStruct ? (r < pS ? 'slam' : r < pW ? 'sweep' : 'thrust') : 'thrust')
            : w === 'gun' || w === 'bow' ? 'butt' : 'thrust';
          // 侍と武将は三度に一度、二段の拍子：長く溜めてから速く振る（拍子を読ませない）
          const two = (u.type === 'samurai' || u.type === 'busho') && Math.random() < 0.3;
          const dur = u.windup * (kind === 'slam' ? 1.4 : 1) * (0.9 + Math.random() * 0.3) * (two ? 1.5 : 1) + (t.isPlayer ? 0.12 : 0);
          u.atk = { t: dur, dur, target: t, kind, slam: kind === 'slam', fast: two };
          if (t.isPlayer) { this.playerAttackers++; if (near) this.play('tick', u.pos, 0.8); }
          if (near && this.hooks.onWindup) this.hooks.onWindup(u, t);
        }
      }
      u.settled = false;
    } else if (u.moveTo) {
      const dx = u.moveTo.x - u.pos.x, dz = u.moveTo.z - u.pos.z;
      const d = Math.hypot(dx, dz);
      const busy = u.fleeing || g.order === 'retreat' || u.confused > 0 || g.regroupT > 0;
      // 持ち場に着いたら落ち着く（隊が止まっている間は、少しずれても歩き直さない）
      // 持ち場のすぐそば（1.6m）まで来て、人や柵に塞がれて 3 秒ほど進めなければ、そこで着いたと見なす（持ち場の前で足踏みし続けない）
      u.nearT = d < 1.6 && u.moving < 0.25 ? (u.nearT || 0) + dt : 0;
      const stay = !busy && g.anchorSpeed < 0.3 && (u.settled ? d < 0.9 : d < 0.3 || u.nearT > 3);
      if (stay) {
        u.settled = true; face = g._face ?? g.facing;
        // 円陣の者は輪の外を向く
        if (g.formation === 'ring' && u !== g.leader) face = Math.atan2(u.pos.x - g.anchor.x, u.pos.z - g.anchor.z);
        // 勝鬨の輪の者は旗の方を向く
        if (g.victory && this.time - g.victory.t < 14) face = Math.atan2(g.victory.at.x - u.pos.x, g.victory.at.z - u.pos.z);
        const w = u.watch;
        if (w && w.alive && g.order === 'hold') {
          face = Math.atan2(w.pos.x - u.pos.x, w.pos.z - u.pos.z);
          // 棒立ちにならないよう、ときどき小さく足を踏みかえる
          if (!(u.stepT > 0) && Math.random() < dt * 0.35) {
            const a = Math.random() * Math.PI * 2;
            u.stepTo = { x: u.moveTo.x + Math.sin(a) * 0.3, z: u.moveTo.z + Math.cos(a) * 0.3 }; u.stepT = 0.6;
          }
          if (u.stepT > 0) { u.stepT -= dt; want = u.stepTo; speed = u.speed * 0.35; }
        } else u.stepT = 0;
      } else if (d > 0.05) {
        u.settled = false; u.stepT = 0;
        want = u.moveTo;
        speed = d > 4 || busy || g.anchorSpeed > u.speed * 0.85 ? u.run : u.speed;
        // 騎馬の隊が駆けて寄せるとき（逃げるときは除く）
        if (u.type === 'cavalry' && !busy && d > 12 && g.anchorSpeed > 2.5) this.startCharge(u, near);
      }
    }
    // 駆けている騎馬：槍衾に当たれば止められる。足が止まれば駆けるのをやめる
    // 行軍する隊の足もとに低い土ぼこり（乾いた日だけ・近くの兵だけ。雨の後は出さない）
    if (!u.mounted && g && g.marching && u.camD < 45 && !(this.rain > 0.1) && !(this.world && this.world.def && this.world.def.muddy) && u.moving > 0.4 && Math.random() < dt * 1.2) {
      this.burst(u.pos.x, u.pos.y + 0.05, u.pos.z, 1, 'dust', 0, 0);
    }
    // 駆ける馬の蹄が土を蹴り上げる（乾いた日だけ・近くの馬だけ）
    if (u.mounted && u.camD < 60 && !(this.rain > 0.3) && Math.hypot(u.mv.x, u.mv.z) > 5 && Math.random() < dt * 7) {
      const bx = u.pos.x - Math.sin(u.heading) * 1.1, bz = u.pos.z - Math.cos(u.heading) * 1.1;
      this.burst(bx, this.world.heightAt(bx, bz) + 0.1, bz, 3, 'dust', -Math.sin(u.heading), -Math.cos(u.heading));
    }
    if (u.charging && u.type === 'cavalry') {
      if (!u.fleeing) this.checkYari(u);
      // 玉突き：前で止められた味方の馬（竿立ち）にぶつかり、後ろの騎馬も詰まって止まる
      if (u.charging) {
        const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
        let jam = null;
        this.forNear(u.pos.x, u.pos.z, 2.6, (o) => {
          if (jam || o === u || !o.alive || !o.mounted || o.team !== u.team || !(o.stagger > 0.5)) return;
          const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z, dd = Math.hypot(dx, dz);
          if (dd < 2.6 && (dx * fx + dz * fz) / (dd || 1) > 0.6) jam = o;
        });
        if (jam) { u.charging = false; u.chargeCd = this.time + 3; u.stagger = 0.7; u.mv.x *= 0.3; u.mv.z *= 0.3; this.play('neigh', u.pos, 0.6); }
      }
      if (u.charging && this.time - (u.chargeT || 0) > 2.5 && Math.hypot(u.mv.x, u.mv.z) < 2.5) u.charging = false;
    }
    // 手負いは鈍り、縦陣は速く、槍衾の前では足が止まる
    if (u.hp < u.maxHp * 0.3) speed *= 0.75;
    // 手傷で退く徒歩の武将は、肩を借りて歩く速さ（走らない）
    if (u.woundOut && !u.mounted && u.woundOut.t > this.time && !u.fleeing) speed = Math.min(speed, u.speed * 0.6);
    // 疲れ：打ち合い続けると（1 分半ほどで）足が重くなり、離れて休めば 40 秒ほどで戻る
    if (!u.isPlayer) {
      const busy = !!(u.atk || u.swing || (u.target && !u.target.isStruct && u.target.alive && Math.abs(u.target.pos.x - u.pos.x) + Math.abs(u.target.pos.z - u.pos.z) < 5));
      u.fat = Math.max(0, Math.min(1, (u.fat || 0) + dt * (busy ? 1 / 90 : -1 / 40)));
      if (u.fat > 0.2 && !u.fleeing) speed *= 1 - 0.3 * (u.fat - 0.2) / 0.8;
    }
    // 馬の持久：全力で駆け続けると（数分で見えて）重くなり、並足や止まれば戻る（敵味方の騎馬。自分の馬は player.js）
    if (u.mounted && !u.isPlayer) {
      const galloping = Math.hypot(u.mv.x, u.mv.z) > 6.2;
      u.hfat = Math.max(0, Math.min(1, (u.hfat || 0) + dt * (galloping ? 1 / 160 : -1 / 70)));
      if (u.hfat > 0.15 && !u.fleeing) speed *= 1 - 0.4 * (u.hfat - 0.15) / 0.85;
    }
    if (g.formation === 'column') speed *= 1.15;
    // 倒れた体の上は足もとが悪い（踏み越えるのに足が鈍る）
    if (this.corpses && this.corpses.size && !u.mounted && this.corpses.get((Math.floor(u.pos.x / 2) + 20000) * 40000 + Math.floor(u.pos.z / 2) + 20000)) speed *= 0.8;
    if (u.target && u.target.group && u.target.group.formation === 'yari' && !u.target.isStruct && u.team !== u.target.team && u.type !== 'cavalry' && this.distTo(u, u.target) < 4.5) speed *= 0.4;
    if (u.fleeing) speed = u.run * (0.9 + ((u.id * 0.377) % 1) * 0.3);   // 逃げ足は人ごとに ±15%
    else if (u.woundOut && u.woundOut.t > this.time) speed = u.run * (u.mounted ? 1.1 : 0.9);   // 手傷の武将は急いで退く
    if (u.confused > 0) speed = u.speed * 0.6;
    if (u.mounted && u.stagger > 0) want = null;   // 竿立ちの間は動けない
    this.steer(u, dt, want, speed, face);
  }
};
