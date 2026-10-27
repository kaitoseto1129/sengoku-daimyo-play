// Player の手のうち「攻撃と技（槍・刀の振り・届き・当たり）」（player.js から分けた。中身は同じ。Player.prototype へ戻すのは player.js の終わり）
import { spearReach } from './weapon_reality.js';
import { ITEMS } from './state.js';
import { angleDiff, bloodLv } from './units.js';
import { sfx } from './audio.js';
import { S, reduceMotion } from './settings.js';
import { isTouch } from './touch.js';
import { _meleeResult, _horseBox } from './player.js';

export class PlayerMelee {

  // 刀の斬り：一太刀目は袈裟、続けて押せば逆袈裟で切り返し、三つ目は踏み込んだ重い袈裟（押した時に決める。技の名と振りを合わせる）
  nextSlash() { return this.slashK || 'kesa'; }

  // 離した時の分岐順と必要な気力を、操作丸と間合いの印で共有する。
  previewMeleeKind() {
    if (this.weapon !== 'spear' && this.weapon !== 'sword') return '';
    if (this.pending) return this.pending.kind;
    if (this.swingImpact) return this.swingImpact.kind;
    return this.autoMeleeKind();
  }
  // ボタンは一つ。状況と連打の段で技が替わる（kaito 10/26）：
  //   周りに三人以上 → 頭上で回す。連打の三段目 → 叩きつけ。二段目か前の扇に二人以上 → 横の払い。ほかは突き。
  //   近くの兵だけを十分の一秒ごとに数える（予告と実際の技をそろえる）。
  autoMeleeKind() {
    if (this.weapon === 'sword') return this.sta >= 5 ? 'slash' : '';
    if (this.sta < 6) return '';
    const stage = this.comboT > 0 ? this.combo + 1 : 1;
    if (this.mounted || this.jumonji) return stage >= 3 ? 'sweep' : 'thrust';
    const c = this.crowdCount();
    if (c.around >= 3) return 'spin';
    if (stage >= 3) return 'slam';
    if (stage === 2 || c.front >= 2) return 'sweep';
    return 'thrust';
  }
  crowdCount() {
    const C = this._crowdC || (this._crowdC = { at: -9, front: 0, around: 0 });
    const rt = this.rt, u = this.u;
    if (C.at > rt.t - 0.1 && C.at <= rt.t) return C;
    C.at = rt.t; C.around = 0;
    const r = this.meleeReach('spin');
    rt.army.forNear(u.pos.x, u.pos.z, r + 0.4, (o) => {
      if (o.team === u.team || !o.alive || o.gone || o.isStruct || o.noTarget || o.fleeing) return;
      if (Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) <= r + 0.4) C.around++;
    });
    C.front = C.around >= 2 ? rt.army.enemiesInArc(u.pos, u.heading, this.meleeReach('sweep'), this.meleeHalf('sweep'), u.team, true, false, this.meleeFenceClear(this.meleeReach('sweep'))).length : C.around;
    return C;
  }

  updateRangeCue(kind) {
    const u = this.u, army = this.rt.army;
    this.inRange = false; this.rangeCue = ''; this.rangeCueTarget = null;
    if (this.weapon === 'gun' || this.weapon === 'bow') {
      const gun = this.weapon === 'gun', target = this.aimRanged(this.aiming ? gun ? 0.055 : 0.05 : gun ? 0.13 : 0.1, gun ? 70 : 45);
      if (target && !army.hiddenBehind(u, target) && !army.shotBlocked(u, target.pos) && !army.terrainBlocks(u.pos, target.pos)) this.rangeCue = '◇ 射線あり';
      return;
    }
    if (!kind || this.rt.flags?.carry) return;
    const reach = this.meleeReach(kind);
    const half = this.meleeHalf(kind);
    const heading = this.mounted ? u.heading + Math.max(-1.2, Math.min(1.2, angleDiff(u.heading, this.yaw))) : u.heading;
    const over = this.weapon === 'spear', fenceClear = this.meleeFenceClear(reach), assist = S.aimAssist || isTouch;
    const lunge = assist ? isTouch ? 0.9 : 0.35 : 0;
    let turnCandidate = null;
    let hits = army.enemiesInArc(u.pos, heading, reach, half, u.team, over, true, fenceClear, this.lock);
    // 初陣・森部の間合いの変化は、実際の向き直り・踏み込みまで含めて届く本人に付ける。
    // 攻撃と同じ選び方にし、横の敵へ向き直す操作を何度も要求しない。
    if ((!!this.rt.def.missionStyle || this.rt.def.inouFeel) && !hits.length && assist && !this.mounted && kind !== 'butt') {
      const target = this.meleeAssistTarget(kind, heading);
      if (target) { this.inRange = true; this.rangeCueTarget = target; }
      return;
    }
    if (!hits.length && assist) turnCandidate = this.assistPick(army.enemiesInArc(u.pos, heading, reach + lunge, isTouch ? Math.max(half + this.D.aim, 1.05) : half + this.D.aim, u.team, over, true, fenceClear, this.lock));
    let turn = turnCandidate;
    if (!hits.length && !turn && assist && (isTouch || this.rt.firstFights)) turn = this.assistPick(army.enemiesInArc(u.pos, heading, reach + lunge * 0.5, Math.PI, u.team, over, true, fenceClear, this.lock));
    if (!hits.length && kind === 'butt') hits = army.enemiesInArc(u.pos, heading + Math.PI, 2.3, 0.8, u.team, false);
    if (hits.length) { this.inRange = true; this.rangeCue = '● 兵に届く'; this.rangeCueTarget = hits[0].u; }
    else if (this.meleeStructTarget(kind, heading)) this.rangeCue = '■ 柵や門に届く';
    else if (turn && Math.abs(angleDiff(heading, Math.atan2(turn.pos.x - u.pos.x, turn.pos.z - u.pos.z))) < 0.15) this.rangeCue = '一歩寄ると届く';
    else if (turn) this.rangeCue = angleDiff(heading, Math.atan2(turn.pos.x - u.pos.x, turn.pos.z - u.pos.z)) > 0 ? '右へ向く →' : '← 左へ向く';
  }
  meleeHalf(kind) {
    if (this.weapon === 'spear' && (kind === 'thrust' || kind === 'charged' || kind === 'hook' || kind === 'slam')) return Math.max(this.rt.world.def.closeCombatAssist ? 0.45 : 0, Math.atan2(0.35, this.meleeReach(kind)));
    return kind === 'kthrust' || kind === 'charged' ? 0.5 : kind === 'slam' ? 0.4 : kind === 'hook' ? 0.55 : kind === 'kara' ? 0.45 : kind === 'nagi' ? 1.15 : kind === 'sweep' ? Math.PI / 3 : kind === 'spin' ? Math.PI : kind === 'slash' ? 0.8 : kind === 'butt' ? 0.7 : 0.62;
  }
  meleeReach(kind) {
    if (this.weapon === 'spear') return spearReach(this.u, kind);
    if (this.rt.world.def.closeCombatAssist && this.weapon === 'sword' && kind === 'slash') return 2.4;
    const extra = ITEMS[this.G.equip.weapon].reach || 0, ride = this.mounted ? 0.7 : 0;
    return kind === 'kthrust' ? 2.3 : kind === 'nagi' || kind === 'kara' ? 2.2 : kind === 'slash' ? 2 : kind === 'butt' ? 1.7 : kind === 'sweep' ? (this.jumonji ? 2.8 + extra : 2.6) + ride : kind === 'spin' ? 2.9 + ride : (kind === 'charged' ? 3.2 : kind === 'slam' || kind === 'hook' ? 3 : 2.9) + extra + ride;
  }
  // 当たりの本体と予告で同じ柵越しの長さを使う。箱は既存の物を使い回す。
  meleeFenceClear(reach) {
    const u = this.u, tip = u.wpn?.userData.tip || 2.2;
    let clear = Math.min(reach, tip);
    const neck = this.mounted && this.horse?.userData.horse?.neck;
    if (neck) {
      neck.updateWorldMatrix(true, true); _horseBox.setFromObject(neck);
      const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
      const nx = fx >= 0 ? _horseBox.max.x : _horseBox.min.x, nz = fz >= 0 ? _horseBox.max.z : _horseBox.min.z;
      clear = Math.min(reach, Math.max(0, (nx - u.pos.x) * fx + (nz - u.pos.z) * fz) + tip);
    }
    return clear;
  }
  // 兵がいない時に打つ柵・門。座標の入れ物は一つだけ使い回す。
  meleeStructTarget(kind, heading) {
    const u = this.u;
    const reach = this.meleeReach(kind);
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const result = this._structTarget || (this._structTarget = { st: null, px: 0, pz: 0 });
    result.st = null; let bd = Infinity;
    for (const st of this.rt.army.structs) {
      if (!st.alive || st.team === u.team || st.maxHp > 1e8) continue;
      let d, px, pz;
      if (st.seg) {
        const ax = st.seg[0], az = st.seg[1], dx = st.seg[2] - ax, dz = st.seg[3] - az, l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((u.pos.x - ax) * dx + (u.pos.z - az) * dz) / l2));
        px = ax + dx * t; pz = az + dz * t; d = Math.hypot(px - u.pos.x, pz - u.pos.z);
      } else { px = st.x; pz = st.z; d = Math.hypot(px - u.pos.x, pz - u.pos.z) - (st.r || 1); }
      if (d > reach) continue;
      const dl = Math.hypot(px - u.pos.x, pz - u.pos.z) || 1;
      if (((px - u.pos.x) * fx + (pz - u.pos.z) * fz) / dl < 0.35 && d > 0.6) continue;
      if (d < bd) { bd = d; result.st = st; result.px = px; result.pz = pz; }
    }
    return result.st ? result : null;
  }
  // 予告と攻撃で、味方・壁・地形を含む同じ判定を使う。入れ物は増やさない。
  meleeAssistTarget(kind, heading) {
    const u = this.u, army = this.rt.army, reach = this.meleeReach(kind), half = this.meleeHalf(kind);
    const clear = this.meleeFenceClear(reach), over = this.weapon === 'spear';
    this.meleeAssistStep = isTouch ? 0.9 : 0.35;
    const wide = isTouch || this.rt.firstFights || this.rt.world.def.closeCombatAssist ? Math.PI : half + this.D.aim;
    let target = this.assistPick(army.enemiesInArc(u.pos, heading, reach + this.meleeAssistStep, wide, u.team, over, true, clear, this.lock));
    if (!target) {
      target = this.assistPick(army.enemiesInArc(u.pos, heading, reach + 1, 0.52, u.team, over, true, clear, this.lock));
      if (target) this.meleeAssistStep = 1;
    }
    return target;
  }
  strike(kind, third, impact = false, assisted = false) {
    // 頭上で回す一撃（spin）は、周りに三人以上いる時だけ autoMeleeKind が選ぶ。
    const u = this.u;
    const army = this.rt.army;
    if (this.assistImpact && !assisted) return;
    if (!impact && !assisted && kind !== 'butt' && kind !== 'spin' && !this.mounted && (S.aimAssist || isTouch)) {
      const reach = this.meleeReach(kind), half = this.meleeHalf(kind), clear = this.meleeFenceClear(reach), over = this.weapon === 'spear';
      if (!army.enemiesInArc(u.pos, u.heading, reach, half, u.team, over, true, clear, this.lock).length) {
        const target = this.meleeAssistTarget(kind, u.heading), stepTo = this.meleeAssistStep;
        if (target) {
          const dx = target.pos.x - u.pos.x, dz = target.pos.z - u.pos.z, d = Math.hypot(dx, dz) || 1, h = Math.atan2(dx, dz);
          this.assist = { h, t: 0.65 };
          const step = Math.max(0, Math.min(stepTo, d - (reach - 0.2)));
          if (step > 0) this.lunge = { x: dx / d * step, z: dz / d * step, t: 0.12 };
          this.assistImpact = { kind, third, h, t: 0.12 }; this.cd = Math.max(this.cd, 0.2);
          return;
        }
      }
    }
    const swKind = kind === 'thrust' || kind === 'charged' ? 'thrust' : kind === 'sweep' ? 'sweep' : kind === 'spin' ? 'spin' : kind === 'slam' ? 'slam' : kind === 'butt' ? 'butt' : kind === 'hook' ? 'hook' : kind === 'kthrust' ? 'tsuki' : kind === 'nagi' ? 'yoko' : kind === 'kara' ? 'kara' : this.nextSlash();
    // 足の押し出しと穂先が伸び切る時に当てる。押した瞬間から振りは始まる。
    const spearThrust = this.weapon === 'spear' && !this.mounted && (kind === 'thrust' || kind === 'charged');
    if (!impact && (kind === 'sweep' || kind === 'slam' || spearThrust)) {
      const swing = this.u.swing = { kind: swKind, t: 0, dur: spearThrust ? 0.22 : 0.3, at: spearThrust ? 0.5 : kind === 'slam' ? 0.45 : 0.4, dir: this.pendDir || 1, done: false, res: null, target: this.lock || this.aimed, d: 0, side: Math.random() < 0.5 ? -1 : 1 };
      this.swingImpact = { kind, third, swing };
      return;
    }
    if (kind === 'slash') this.slashN++;
    const reachExtra = ITEMS[this.G.equip.weapon].reach || 0;
    u.strikeT = 0.2;
    // 馬上では体をひねって、見ている方を突く。駆けているほど重い
    let heading = this.mounted ? u.heading + Math.max(-1.2, Math.min(1.2, angleDiff(u.heading, this.yaw))) : u.heading;
    const ride = this.mounted ? 0.7 : 0;
    const rush = this.mounted ? 1 + Math.min(0.9, Math.abs(this.hspd) / 11 * 0.9) : 1;
    let lastArc = null;   // 城下で人へ斬りかかれるように：当たりが無かった時、同じ間合いで町の人を探す（arc.civScan）
    const arc = (reach, half, n) => {
      reach = this.meleeReach(kind); half = this.meleeHalf(kind);
      lastArc = { reach, half };
      const over = this.weapon === 'spear';   // 槍は柵越しに突ける
      // 柵越しに届く間合い：馬上は馬の図体（馬の胴の長さ分、柵の手前で止まる）だけ柵に近寄れないので、その分だけ広げる
      // 馬の首の実寸と穂先までの長さで測る。技の届く長さを超えて柵を抜けない。
      const fenceClear = this.meleeFenceClear(reach);
      // 味方の騎馬も、的を絞って（this.lock）選んだ時だけ混ぜる（自分の馬・味方の馬も討てるように。kaito 10/1）
      const sweep = this.weapon === 'spear' && (kind === 'sweep' || kind === 'spin');
      const h = army.enemiesInArc(u.pos, heading, reach, half, u.team, over, !sweep, fenceClear, this.lock);
      return sweep ? h.slice(0, n) : h.slice(0, 1); // 横払い・回しは扇（回しは周り）の中の敵へ一度ずつ当てる。
    };
    let hits, dmg;
    if (kind === 'thrust') { hits = arc(2.9 + reachExtra + ride, 0.62, this.mounted && this.hspd > 8 ? 2 : 1); dmg = this.spearDmg() * (third ? 1.3 : 1) * rush; }
    else if (kind === 'charged') { hits = arc(3.2 + reachExtra + ride, 0.5, 1); dmg = this.spearDmg() * 2 * rush; }
    else if (kind === 'kthrust') { hits = arc(2.3, 0.5, 1); dmg = 17 * (1 + 0.06 * (this.G.stats.spear - 1)); }
    // 十文字槍の薙ぎ：鎌刃が横へ張り出す分、深く斬る
    else if (kind === 'sweep' && this.jumonji) { hits = arc(2.8 + reachExtra + ride, 1.0, 2); dmg = this.spearDmg() * 1.0 * rush; }
    else if (kind === 'sweep') { hits = arc(2.6 + ride, 1.1, this.mounted ? 5 : 6); dmg = this.spearDmg() * 0.62 * rush; }
    // 十文字槍の引き倒し：突き出して鎌刃を相手の首・膝裏へ掛け、手前へ引く。傷は浅いが、相手は倒れてしばらく起きられない
    else if (kind === 'hook') { hits = arc(3.0 + reachExtra + ride, 0.55, 1); dmg = this.spearDmg() * 0.55; }
    // 叩き下ろし：柄のしなりで上から打つ。狭く重く、兜の上から効く
    else if (kind === 'slam') { hits = arc(3.0 + reachExtra + ride, 0.4, 1); dmg = this.spearDmg() * 1.35 * rush; }
    // 石突き：懐に入った敵を柄の尻で突き放す（軽いが、相手を押し退けてよろめかせる）
    // 後ろへ柄を突き出すので、背後に寄った敵も打つ
    else if (kind === 'butt') {
      hits = arc(1.7, 0.7, 1);
      if (!hits.length) hits = army.enemiesInArc(u.pos, heading + Math.PI, 2.3, 0.8, u.team, false).slice(0, 1);
      dmg = this.spearDmg() * 0.45;
    }
    // 刀の横薙ぎ：体をひねって横一文字に。最初の一人で止まる
    else if (kind === 'nagi') { hits = arc(2.2, 1.15, 3); dmg = 15 * (1 + 0.06 * (this.G.stats.spear - 1)); }
    // 刀の真っ向斬り：上段から頭へまっすぐ。狭く重い
    else if (kind === 'kara') { hits = arc(2.2, 0.45, 1); dmg = 34 * (1 + 0.06 * (this.G.stats.spear - 1)); }
    // 振り回し：頭上で槍を回し、ぐるりと四方の敵を払う
    else if (kind === 'spin') { hits = arc(2.9 + ride, Math.PI, 8); dmg = this.spearDmg() * 0.55 * rush; }
    else { hits = arc(2.0, 0.8, 2); dmg = 19 * (1 + 0.06 * (this.G.stats.spear - 1)) * (third ? 1.45 : 1); }
    // 振りの記録（穂先・刃がどこで止まったかを見せる）
    // 薙ぎ（長柄の叩き）は重い柄を振り回すので、突きより長く（0.42 秒）
    const dir = (this.pendDir || 1);
    if (!impact) u.swing = { kind: swKind, t: 0, dur: kind === 'spin' ? 0.9 : kind === 'hook' ? 0.46 : kind === 'sweep' || kind === 'slam' ? 0.42 : kind === 'kara' ? 0.3 : kind === 'nagi' ? 0.28 : kind === 'thrust' ? 0.18 : 0.22, at: kind === 'slam' ? 0.67 : 0, dir, rear: kind === 'butt' && hits[0] && ((hits[0].u.pos.x - u.pos.x) * Math.sin(heading) + (hits[0].u.pos.z - u.pos.z) * Math.cos(heading)) < 0,  done: true, res: null, target: hits[0] ? hits[0].u : null, d: hits[0] ? hits[0].d : 0, side: 1 };
    // 討死の知らせで戦が終わると u.swing は消える。当たった振りの記録は手応えまで保つ。
    const swing = u.swing;
    if (impact) { if (!swing) return; swing.done = true; swing.target = hits[0]?.u || null; swing.d = hits[0]?.d || 0; }
    const counter = this.counterT > 0 && hits.length > 0;
    if (counter) { this.counterT = 0; this.rt.hud.flash(this.counterPerfect ? '見切りの反撃' : '反撃', 'gold'); }
    // 槍の癖：味方と肩を並べる密集では強く、懐に入られると弱い
    const spearKind = kind === 'thrust' || kind === 'charged' || kind === 'sweep' || kind === 'slam' || kind === 'butt' || kind === 'spin' || kind === 'hook';
    let crowd = 0;
    if (spearKind) army.forNear(u.pos.x, u.pos.z, 3.5, (o) => { if (o !== u && o.alive && o.team === u.team && !o.isStruct) crowd++; });
    for (const h of hits) {
      // 構えている敵には通りにくい、背後からは通りやすい
      let m = 0.9 + Math.random() * 0.2;
      const t = h.u;
      const dx = u.pos.x - t.pos.x, dz = u.pos.z - t.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const facing = (dx * Math.sin(t.heading) + dz * Math.cos(t.heading)) / d;
      if (facing < -0.2) m *= 1.3;
      if (t.atk) m *= 1.15;
      if (t.stagger > 0.5) m *= 1.25;
      if (counter) m *= 1.6;
      if (spearKind && crowd >= 3) m *= 1.1;
      if (spearKind && d < 1.15 && !this.mounted) {
        m *= ITEMS[this.G.equip.weapon].close ?? 0.6;
        this.rt.hint('tooClose');
      }
      this.rt.onPlayerHit(t);
      if (third && (kind === 'thrust' || kind === 'slam') && h === hits[0]) { this.rt.stats.thirds++; this.rt.tutMark('combo'); }
      if (kind === 'thrust' || kind === 'sweep' || kind === 'slam' || kind === 'spin') this.rt.tutMark('thrust');
      if (kind === 'charged') this.rt.tutMark('charged');
      if (kind === 'sweep') this.rt.tutMark('sweep');
      // 技と敵の構えのかみ合い：
      //   槍衾（穂先を揃えた隊）の正面へ突いても穂先に弾かれて通りにくい。払い・叩き下ろし・振り回しは槍の列を崩して深く入り、相手をよろめかせる
      const yariFront = t.group && t.group.formation === 'yari' && facing > 0.3;
      if (yariFront) {
        if (kind === 'thrust' || kind === 'charged' || kind === 'kthrust') { m *= 0.6; }
        else if (kind === 'sweep' || kind === 'slam' || kind === 'spin') { m *= 1.3; t.stagger = Math.max(t.stagger || 0, 0.7); }
      }
      // 薙ぎ・溜め突き・反撃・背後からの一撃は、敵の構えでは防げない。石突きは構えごと押し退ける。
      // 叩き下ろし・上段の斬り下ろしは受けられても構えを崩す（次の一撃が通る）
      const wk = { thrust: 'thrust', charged: 'thrust', sweep: 'sweep', spin: 'sweep', slam: 'slam', butt: 'butt', hook: 'thrust', kthrust: 'tsuki', kara: 'slam', nagi: 'yoko' }[kind] || swKind;
      const result = h === hits[0] ? swing : _meleeResult;
      result.res = null;
      const hpBefore = t.hp;
      army.damage(t, dmg * m, u, { kind: wk, out: result, selectedAlly: this.lock === t && t.team === u.team, pierce: kind === 'sweep' || kind === 'hook' || kind === 'charged' || kind === 'kara' || kind === 'butt' || kind === 'spin' || counter || facing < -0.2, guardBreak: kind === 'slam' || kind === 'kara' || kind === 'hook' });
      h.res = result.res;
      h.hurt = t.hp < hpBefore;
      h.killed = hpBefore > 0 && !t.alive;
      // 突きは後ろへ小さく、払いは横へ、叩きは足を止める。大きなよろけの連続は避ける
      if (spearKind && (!this.mounted || kind === 'sweep') && t.alive && !t.isStruct && !t.isPlayer && !t.mounted && t.team !== u.team && (h.res === 'hit' || h.res === 'armor' || (kind === 'slam' && h.res === 'block'))) {
        const sweepSoldier = kind === 'sweep' && t.type !== 'busho' && !t.isOfficer && !t.isTaisho && !t.name && !t.invuln;
        const fresh = sweepSoldier || !(t.spearStagT > army.time - 1.2);
        const solid = h.res === 'hit' || kind === 'slam' || sweepSoldier;
        const stagger = sweepSoldier ? 0.75 : !solid ? 0.12 : kind === 'slam' ? 0.75 : kind === 'sweep' ? 0.4 : kind === 'charged' || third || counter ? 0.55 : 0.18;
        if (fresh) {
          t.spearStagT = army.time;
          t.stagger = Math.max(t.stagger || 0, stagger);
          if (kind === 'slam' || sweepSoldier) { t.atk = null; t.swing = null; t.guarding = 0; t.cd = Math.max(t.cd || 0, 0.8); }
          if (t.push && (kind === 'thrust' || kind === 'charged' || kind === 'sweep' || kind === 'slam')) {
            const force = !solid ? 0.15 : kind === 'sweep' ? 1.1 : kind === 'slam' ? 0.65 : kind === 'charged' ? 1 : 0.35;
            t.push.x += (kind === 'sweep' ? Math.cos(heading) * dir : -dx / d) * force;
            t.push.z += (kind === 'sweep' ? -Math.sin(heading) * dir : -dz / d) * force;
          }
        }
      }
      if (kind === 'hook' && t.alive) this.hookDown(t);
      if (h === hits[0] && swing.res && swing.res !== 'miss' && this.weapon === 'spear') { const F = u.wpn && u.wpn.userData.flex; if (F) F.vel += (swing.res === 'hit' ? 1.6 : 3) * F.G.sp.bend; }
      if (kind === 'sweep' && this.jumonji && t.alive) t.stagger = Math.max(t.stagger || 0, 0.7);
      if (t.alive && t.atk && kind !== 'sweep' && t.lastStagT === army.time && Math.random() < 0.35) { t.atk = null; t.cd = 0.8; }
    }
    // 結果は当たりの判定後に渡す。振り始めを命中として知らせない。
    this.rt.def.meleeResult?.(this.rt, hits[0]?.u || null, hits[0]?.res || 'miss');
    // 城下で町の人へ斬りかかった時（rt.civScan が有る場所＝城下でだけ）：敵は居なくても人はいる
    let civHit = null;
    if (!hits.length && this.rt.civScan && lastArc) {
      const cv = this.rt.civScan(u.pos, heading, lastArc.reach, lastArc.half);
      if (cv && cv.length) civHit = cv[0];
    }
    if (civHit) { this.rt.civStrike(civHit.u, dmg); }
    // 兵に当たらなかった時は、目の前の敵の柵・逆茂木・竹束・陣幕・盾を打つ（味方の柵は打たない）。
    //   門や城の塀のような太い物は、槍・刀では少ししか減らない（掛矢の門破りの方が効く）
    if (!hits.length && !civHit) {
      const end = this._bladeEnd || (this._bladeEnd = { x: 0, y: 0, z: 0 });
      end.x = u.pos.x + Math.sin(heading) * this.meleeReach(kind); end.z = u.pos.z + Math.cos(heading) * this.meleeReach(kind); end.y = u.pos.y;
      if (army.wallBetween(u.pos, u.team, end, this.weapon === 'spear', this.meleeFenceClear(this.meleeReach(kind))) && !(this.bladeWallTipT > this.rt.t)) {
        this.bladeWallTipT = this.rt.t + 8; sfx('thud', 0.5); this.rt.hud.flash('壁に遮られ、刃が通らない', 'dim');
      }
      const fx = Math.sin(heading), fz = Math.cos(heading);
      const best = this.meleeStructTarget(kind, heading);
      if (best) {
        const st = best.st, thick = /門|塀|城|櫓|石垣/.test(st.name || '') || (st.maxHp || 0) >= 1200;
        const amt = dmg * (kind === 'charged' ? 1.4 : 1) * (thick ? 0.15 : 1.1);
        army.damage(st, amt, u, { kind: swKind, out: swing });
        const y = this.rt.world.heightAt(best.px, best.pz) + 1.0;
        army.burst(best.px, y, best.pz, thick ? 3 : 7, 'wood', -fx * 0.6, -fz * 0.6);
        sfx(thick ? 'thud' : 'crack', thick ? 0.9 : 1.1); sfx('wood', 0.7);
        if (!reduceMotion()) this.rt.game.hitstop = Math.min(0.07, Math.max(this.rt.game.hitstop || 0, thick ? 0.06 : 0.05));
        this.addShake(thick ? 0.08 : 0.05);
        if (thick && !this.thickHint) { this.thickHint = true; this.rt.hud.flash(`太い門や塀は、${this.weapon === 'sword' ? '刀' : '槍'}では少ししか傷まない`, 'dim'); }
      } else if (kind !== 'spin' && kind !== 'butt') {
        swing.res = 'miss';
        // 空を切った：重い得物に体が持っていかれ、戻りが遅れる（当たった時との差をはっきり）。溜めた大技ほど大きく泳ぐ
        const big = kind === 'charged' || kind === 'slam' || kind === 'kara' || kind === 'sweep';
        this.cd += big ? 0.22 : 0.1;
        if (!this.mounted && !(this.lunge && this.lunge.t > 0)) { const st = big ? 0.3 : 0.15; this.lunge = { x: Math.sin(heading) * st, z: Math.cos(heading) * st, t: 0.12 }; }
        if (!reduceMotion() && S.shake) this.recoilPitch(big ? 0.012 : 0.005);
      }
    }
    if (hits.some(h => h.res === 'hit' || h.res === 'armor' || h.res === 'block')) {
      // 槍は技ごとの短い止めと音。受けられた突きを命中のよろけに混ぜない
      const heavy = kind === 'charged' || kind === 'slam' || kind === 'kara' || kind === 'hook' || (kind === 'thrust' && third) || (kind === 'slash' && third) || counter;
      const spearFeel = spearKind && !this.mounted;
      const blocked = !hits.some(h => h.hurt) && swing.res === 'block' && kind !== 'slam' && kind !== 'kara' && kind !== 'hook';
      if (this.rt.def.meleeHitFeedback && (swing.res === 'block' || swing.res === 'hit' || swing.res === 'armor'))
        this.rt.hud.hitMarker(swing.res === 'block');
      const killed = hits.some(h => h.killed);
      const wide = kind === 'sweep' || kind === 'spin';
      const blade = kind === 'slash' || kind === 'kthrust';
      // 普通の当たり四十ミリ秒、払い五十、重い一撃六十、討ち取りだけ七十。
      const stop = killed ? 0.07 : blocked ? 0.04 : heavy ? 0.06 : wide ? 0.05 : 0.04;
      if (!reduceMotion()) this.rt.game.hitstop = Math.min(0.07, Math.max(this.rt.game.hitstop || 0, stop));
      if (this.rt.game.haptic) this.rt.game.haptic(killed || heavy ? 'heavy' : 'hit', Math.min(1, 0.45 + stop * 5));
      if (spearFeel) sfx(blocked ? 'kin' : kind === 'sweep' || kind === 'butt' || kind === 'spin' ? 'wood' : heavy ? 'thud' : swing.res === 'armor' ? 'kin' : 'hit', blocked ? 0.65 : kind === 'slam' ? 0.9 : 0.8);
      if (hits.some(h => h.hurt)) sfx('playerCut', killed ? 1.1 : heavy ? 1 : 0.85);
      else if (heavy) { sfx('thud', 0.7); if (counter || kind === 'charged') this.rt.game.slowmo = Math.max(this.rt.game.slowmo || 0, counter && this.counterPerfect ? 0.4 : 0.18); }
      if (counter) this.counterPerfect = false;
      if (kind === 'slash') { sfx('slash', 0.6); if (!reduceMotion()) this.yaw += (this.slashN % 2 ? 1 : -1) * 0.012; }
      else if ((kind === 'thrust' || kind === 'charged') && !reduceMotion()) this.recoilPitch(0.006);   // 穂先が入る時、前へわずかに引かれる
      // 薙ぎが当たると、重い柄が体に食い込む手応え：少し長い止めと、下へ沈む揺れ
      if (kind === 'sweep') { this.addShake(0.08); if (!reduceMotion()) this.recoilPitch(0.015); }
      if (hits.some((h) => h.u.type === 'samurai' || h.u.type === 'busho' || h.u.type === 'cavalry')) sfx('clank', heavy ? 1.3 : 0.9);
      // 一打につき最大十八粒。既存の形・材質・配列の枠を使い回す。
      let burstBudget = 18;
      let hurtCount = 0;
      for (const h of hits) {
        if (h.res !== 'hit' && h.res !== 'armor' && h.res !== 'block') continue;
        const t = h.u;
        if (t.isStruct || !t.pos) continue;
        const dx = t.pos.x - u.pos.x, dz = t.pos.z - u.pos.z, dl = Math.hypot(dx, dz) || 1;
        const nx = dx / dl, nz = dz / dl, x = t.pos.x - nx * 0.2, z = t.pos.z - nz * 0.2;
        if (h.hurt) {
          hurtCount++;
          if (t.alive && !t.isPlayer && !t.mounted) {
            t.flinchT = Math.max(t.flinchT || 0, heavy || wide ? 0.3 : 0.24);
            t.stagger = Math.max(t.stagger || 0, wide ? 0.55 : heavy ? 0.65 : 0.28);
            const force = wide ? 3.2 : kind === 'butt' ? 2.4 : heavy ? 1.8 : 1.1;
            if (t.push) { t.push.x += nx * force; t.push.z += nz * force; }
            // 足の踏み直しも既存の傷の記録へ入れ、柵・崖への押し出しを防ぐ。
            if (t.hit && (wide || heavy)) {
              t.hit.stepX = nx * (wide ? 0.65 : 0.35);
              t.hit.stepZ = nz * (wide ? 0.65 : 0.35);
              t.hit.step = 0;
            }
          }
        }
        if (burstBudget < 6) continue;
        burstBudget -= 6;
        const y = army.partY(t, t.hit?.part || t.lastHit?.part || 'body');
        // 刃先の小さな火花と、傷口の血、足元の土。血を消す設定や稽古では土だけ。
        army.spark(x, y, z, 2, nx * 0.15, nz * 0.15);
        if (h.hurt) {
          const blood = bloodLv() && !army.hideBlood && t.type !== 'dummy' && t.maxHp <= 9000;
          army.burst(x, y, z, blood ? bloodLv() : 2, blood ? 'blood' : 'dust', nx, nz, t.pos.y, true);
          army.burst(t.pos.x, t.pos.y + 0.08, t.pos.z, 2, 'dust', nx, nz, t.pos.y, true);
        }
      }
      this.addShake(killed ? 0.16 : heavy ? 0.12 : wide ? 0.09 : 0.06);
      if (hurtCount >= 2) this.addShake(Math.min(0.06, hurtCount * 0.015));
      // 馬上の一撃は馬の勢いが乗って重い：長めに止まり、低い音、突かれた者は馬の進む向きへ大きく突き飛ばされ、腕に返る衝撃で馬が少し落ちる
      const mh = this.mounted ? Math.min(1, Math.abs(this.hspd) / 10) : 0;
      if (mh > 0.3 && (kind === 'thrust' || kind === 'charged' || kind === 'sweep' || kind === 'slash')) {
        if (!reduceMotion()) this.rt.game.hitstop = Math.min(0.07, Math.max(this.rt.game.hitstop || 0, 0.06));
        sfx('thud', 0.5 + 0.5 * mh);
        this.addShake(0.06 + 0.08 * mh);
        if (!reduceMotion()) { this.fovKick = Math.min(this.fovKick || 0, -1.5 * mh); this.pitch -= 0.012 * mh; }
        const fx = Math.sin(this.u.heading), fz = Math.cos(this.u.heading);
        for (const h of hits) if (h.u.alive && h.u.push && !h.u.isStruct) { h.u.push.x += fx * 4 * mh; h.u.push.z += fz * 4 * mh; h.u.stagger = Math.max(h.u.stagger || 0, 1.0); }
        this.hspd *= 1 - 0.08 * mh;
      }
      // 構えの上から受けられた：得物が弾かれて腕が浮き、半歩押し戻されて次の一手が遅れる（崩す技は別）
      if (blocked) {
        this.cd += 0.18;
        if (!reduceMotion()) this.rt.game.hitstop = Math.min(0.07, Math.max(this.rt.game.hitstop || 0, 0.04));
        if (!this.mounted) this.lunge = { x: -Math.sin(heading) * 0.22, z: -Math.cos(heading) * 0.22, t: 0.12 };
        this.addShake(0.05);
      }
      // 当たった刹那、目線が相手へわずかに吸い寄せられて戻る（重いほど深く。首の振られ＝camPush とは別）
      else if (!reduceMotion() && S.shake) this.camLean = { x: Math.sin(heading), z: Math.cos(heading), k: heavy ? 0.32 : blade ? 0.16 : 0.12, t: 0, dur: heavy ? 0.34 : 0.22 };
      if (hits.some((h) => h.res === 'hit' || h.res === 'armor')) {
        this.hitChain = (this.hitChain || 0) + 1; this.comboHitT = 1.6;
        if (this.hitChain >= 2) this.rt.hud.combo(this.hitChain);
      }
    }
  }

  // 鎌で引き倒す：相手を手前へ引き寄せ、足を払って倒す（2 秒ほど起きられない）。騎馬武者は馬から引き落とす（空馬が残る）
  hookDown(t) {
    const u = this.u, army = this.rt.army;
    const dx = u.pos.x - t.pos.x, dz = u.pos.z - t.pos.z, d = Math.hypot(dx, dz) || 1;
    t.atk = null; t.swing = null; t.cd = Math.max(t.cd || 0, 1.2);
    if (t.isPlayer || t.type === 'dummy') return;
    if (t.mounted) {
      // 騎馬武者：鎌を乗り手に掛けて鞍から引き落とす。乗り手は地に倒れ、馬は空馬になって残る
      if (t.horse && army.pullOff) { army.pullOff(t, u); this.rt.hud.flash('鎌を掛けて馬から引き落とした', 'gold'); return; }
      t.stagger = Math.max(t.stagger || 0, 1.3); t.charging = false;
      this.rt.hud.flash('鎌を鞍に掛けて引き崩した', 'gold');
      return;
    }
    // 引き寄せ：半歩ほど手前へ（押し合いの力で滑らかに）
    if (t.push && d > 1.4) { t.push.x += dx / d * 1.8; t.push.z += dz / d * 1.8; }
    t.hit = { kind: 'kneel', t: 0, dur: 2.2, from: 'front', side: Math.random() < 0.5 ? 1 : -1, part: 'leg', res: 'hit', heavy: true, wkind: 'hook', tumble: true };
    t.lastHit = t.hit; t.lastKneelT = army.time;
    t.stagger = Math.max(t.stagger || 0, 1.9);
    army.burst(t.pos.x, t.pos.y + 0.1, t.pos.z, 5, 'dust', -dx / d, -dz / d);
    sfx('thud', 0.8);
    if (!this.hookSaid) { this.hookSaid = true; this.rt.hud.flash('引き倒した。倒れた者は受けられない', 'gold'); }
  }

  rally() {
    const rt = this.rt;
    if (this.rallyCd > 0) { rt.hud.flash(`号令はあと${Math.ceil(this.rallyCd)}秒`, 'dim'); return; }
    this.rallyCd = 25;
    if (rt.squad.some((o) => o.alive && !o.woundOut)) {
      for (const g of rt.squadGroups) { if (!g.units.some((o) => o.alive && !o.woundOut)) continue; g.morale = Math.min(100, g.morale + 18); for (const s of g.units) s.confused = 0; }
      rt.say(this.G.name, ['者ども、続けぇっ！', '怯むな！踏みとどまれ！', '我らの槍を見せてやれ！'][Math.floor(Math.random() * 3)], 2.5);
      rt.hud.flash('組を励ました', 'gold');
    } else {
      rt.army.forNear(this.u.pos.x, this.u.pos.z, 12, (o) => { if (o.alive && !o.woundOut && o.team === this.u.team && o.group) o.group.morale = Math.min(100, o.group.morale + 3); });
      rt.say(this.G.name, 'えい、えい、おうっ！', 2);
    }
    sfx('taiko', 0.7);
    sfx('shout', 0.6);
    // 周りの味方が次々に槍を掲げて応え、鬨の声がうねって広がる（近い者から順に）
    const near = [];
    rt.army.forNear(this.u.pos.x, this.u.pos.z, 16, (o) => { if (o.alive && o.team === 0 && !o.isPlayer && !o.target && !o.atk) near.push(o); });
    near.sort((a, b) => Math.hypot(a.pos.x - this.u.pos.x, a.pos.z - this.u.pos.z) - Math.hypot(b.pos.x - this.u.pos.x, b.pos.z - this.u.pos.z));
    near.slice(0, 40).forEach((o, i) => rt.after(0.25 + i * 0.035 + Math.random() * 0.15, () => { if (o.alive && !o.atk) o.cheer = 0.9; }));
    if (near.length > 3) { rt.after(0.5, () => sfx('toki', 0.5 + Math.min(0.4, near.length / 60))); rt.after(1.6, () => sfx('shout', 0.35)); }
  }
}
