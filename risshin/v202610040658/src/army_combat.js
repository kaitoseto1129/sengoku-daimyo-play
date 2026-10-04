import { officerBroken } from './officer.js';
// Army の手法：当たりと打ち合い（damage・strike・landSwing・kill・手傷・得物を落とす・落馬）
// （units.js から分けた。中身は元のまま。外の係は今までどおり units.js から import してよい）
import { WOUND_FLOOR, bloodLv, HOUSE_NAME, SWING } from './units.js';
import { RIDE, bodyGeometry, MAT, makeWeapon, flexSpear, setBowDraw, kickSpear } from './units_model.js';
import { lookKey, headOf } from './units_look.js';
import { lodSwap } from './units_flags.js';
import * as THREE from 'three';
import { moraleDeath } from './army_morale.js';
import { GENERALS, TYPES } from './units_data.js';
import { INTERIOR_WALLS, interiorBlocked, interiorSwingScale } from './shironaka.js';
import { markArmor } from './armor_wear.js';
import { yariMatch, yariClash } from './yari_awase.js';

// 地形で列が乱れている間は、槍をそろえた隊の強みを使えない。
function formationReady(g, time) { return g.formLoose == null || time - g.formLoose >= 1.5; }

// Army の手法（units.js の class Army に足す）
export const ArmyCombat = {

  // ---------------- ダメージ ----------------
  // opts：kind 技（thrust 突き・slam 叩き・sweep 払い・kesa/gyaku/yoko 斬り・tsuki 刀の突き・charge 騎馬の突き・butt 台尻・arrow 矢・gun 弾）、
  //       pierce 構えで防げない、out 振りの記録（res に 'hit'|'armor'|'block' を書く）、y 当たった高さ、d 撃った遠さ
  damage(t, amount, src, opts = {}) {
    if (!t?.alive || t.gone || !Number.isFinite(amount) || amount <= 0) { if (opts.out) opts.out.res = 'miss'; return; }
    if (!t.isStruct && src?.pos && !src.isStruct) {
      const kind = opts.kind || 'thrust';
      const spear = kind === 'thrust' && (src.wpnKind || src.lookWeapon || src.weapon) === 'spear';
      // 矢弾は飛ぶ線で壁に当たる。上下の階の近接制限を撃ち下ろしには使わない。
      const ranged = kind === 'arrow' || kind === 'gun';
      if (!ranged && !opts.yaguraDrop && (((src.naka || t.naka) && Math.abs(src.pos.y - t.pos.y) > 1.8) || interiorBlocked(INTERIOR_WALLS, src.pos, t.pos, spear))) {
        if (opts.out) opts.out.res = 'miss';
        return;
      }
      if (!ranged && !opts.yaguraDrop) amount *= interiorSwingScale(INTERIOR_WALLS, src, kind);
    }
    // 同じ側の人には、矢玉も近接の一撃も通さない。選んで打つ味方の馬だけは別。
    if (!t.isStruct && src && !src.isStruct && src.team === t.team && src !== t) {
      const kind = opts.kind || 'thrust';
      if (!t.isPlayer && t.mounted && t.horse && !t.invuln && kind !== 'gun' && kind !== 'arrow') {
        this.horseDamage(t, amount, src, kind); if (opts.out) opts.out.res = 'hit';
      } else if (opts.out) opts.out.res = 'miss';
      return;
    }
    // 本陣前の備えが残る間は、旗本が大将への一撃を防ぐ。史実の手傷とは別に扱う。
    if (t.campProtected) { if (opts.out) opts.out.res = 'armor'; return; }
    // 見届けの輪の外からの一撃は、二人の勝負へ割り込ませない。
    if (this.duel && (t === this.duel.foe || t === this.playerUnit) && src && src !== this.duel.foe && src !== this.playerUnit) { if (opts.out) opts.out.res = 'miss'; return; }
    const out = opts.out;
    if (t.isStruct) {
      // 束22：柵（柵・木戸）は、手に斧・掛矢を持つ兵（u.weapon が'axe'か、o.axeShare の割で決まる兵）が打つと損2倍
      let mul = 1;
      if (src && /柵|木戸/.test(t.name || '')) {
        const isAxe = src.weapon === 'axe' || (t.axeShare > 0 && ((src.id || 0) % 100) < t.axeShare * 100);
        if (isAxe) mul = 2;
      }
      t.hp -= amount * mul * (1 - (t.armor || 0));
      t.hitT = this.time;
      if (out) out.res = 'hit';
      // 門は丸太の重い音（wood）、柵・塀は乾いた打つ音（knock）
      if (Math.random() < 0.5) this.play(/門/.test(t.name || '') ? 'wood' : 'knock', t.seg ? { x: (t.seg[0] + t.seg[2]) / 2, z: (t.seg[1] + t.seg[3]) / 2 } : { x: t.x, z: t.z }, /門/.test(t.name || '') ? 1 : 0.8);
      if (this.hooks.onStructHit) this.hooks.onStructHit(t, src);
      if (src && src.pos) t.hitFrom = { x: src.pos.x, z: src.pos.z };
      this.structWear(t);
      if (t.hp <= 0) { t.alive = false; t.hp = 0; this.structFall(t); if (this.hooks.onStructDestroyed) this.hooks.onStructDestroyed(t); }
      return;
    }
    // 史実で生き延びる武将（invuln）：遊び手の一撃だけは通る。ただし体力は最大の 35% で止まり、そこで手傷を負って退く。
    // 味方の兵や筋書きの弾は今まで通り甲冑で弾く（勝手に史実が崩れないように）
    if (t.invuln && !this.mayWound(t, src)) { if (out) out.res = 'armor'; return; }
    // 切岸を登る間・堀の底は受ける損が増える（堀の底は打つ者が 1.5m 以上高い時だけ。army_move の steer が置く。束21）
    if (t._tdef > 1 && (!t._tdefHigh || (src && src.pos && src.pos.y - t.pos.y >= 1.5))) amount *= t._tdef;
    const kind = opts.kind || 'thrust';
    // 自分の組の形の強み。並び直し中・潰走中には効かない。射撃には突撃の力を乗せない。
    const sg = src && src.group, tg = t.group;
    const melee = kind !== 'gun' && kind !== 'arrow';
    // 地面の高低だけを見る。馬上の高さを坂の利に数えない。
    if (melee && src?.pos && !src.isStruct) {
      const rise = src.naka || t.naka ? src.pos.y - t.pos.y : this.world.heightAt(src.pos.x, src.pos.z) - this.world.heightAt(t.pos.x, t.pos.z);
      amount *= 1 + Math.max(-0.22, Math.min(0.3, rise * 0.16));
    }
    if (melee && sg && formationReady(sg, this.time) && sg.isPlayerSquad && sg.formation === 'gyorin' && sg.order === 'attack' && !sg.routed && !src.fleeing && !(sg._reformT > this.time)) amount *= 1.2;
    if (melee && tg && formationReady(tg, this.time) && tg.isPlayerSquad && tg.formation === 'ring' && tg.order === 'hold' && !tg.routed && !t.fleeing && tg.morale >= 45 && !(tg._reformT > this.time)) amount *= 0.75;

    // どちらから打たれたか（打たれた者の向きから見て）。side：右から 1、左から -1
    let from = 'front', side = Math.random() < 0.5 ? 1 : -1;
    if (src && src.pos) {
      const dx = src.pos.x - t.pos.x, dz = src.pos.z - t.pos.z, d = Math.hypot(dx, dz) || 1;
      const fw = (dx * Math.sin(t.heading) + dz * Math.cos(t.heading)) / d;
      const rt = (dx * Math.cos(t.heading) - dz * Math.sin(t.heading)) / d;
      side = rt >= 0 ? 1 : -1;
      from = fw > 0.5 ? 'front' : fw < -0.45 ? 'back' : side > 0 ? 'right' : 'left';
    }
    // 長柄の正面同士は、体より先に柄を叩く。押し下げられた後の一撃は通常の傷になる。
    if (kind === 'slam' && !opts.pierce && yariClash(this, src, t, out)) {
      kickSpear(src.wpn, 4); kickSpear(t.wpn, -4);
      return;
    }
    // 受けが続き過ぎない：正面から2回連ねて受けたら、3回目は受けない（横・後ろからは受けられない。連ねた数は当たれば0に戻る）
    const blkOk = from === 'front' && !(t._blkStreak >= 2);
    // 一騎打ち：敵将は受けて打ち合い、ときに鍔迫り合いになる。隙を突いた一撃は深く入る（正面からだけ。横・後ろは素通し）
    if (this.duel && t === this.duel.foe && src && src.isPlayer && kind !== 'gun' && kind !== 'arrow' && blkOk) {
      const D = this.duel;
      if (D.openT > this.time) {
        amount *= 1.7; D.openT = 0;
        if (this.time > (D.cheerT || 0)) { D.cheerT = this.time + 4; this.play('shout', src.pos, 0.7); }
      } else if (!opts.pierce && !t.atk && !t.swing && !D.bind && this.time > D.naT && !(t.stagger > 0)) {
        if (this.time > D.bindCd && Math.random() < 0.25) {
          // 鍔迫り合い：刃と刃が噛み合い、押し合う（0.9 秒。押し勝った方が相手を崩す）
          D.bindCd = this.time + 6; D.bind = { t: 0.9 };
          t.atk = null; t.swing = null; t.stagger = 0.9;
          this.clashAt(src, t); this.play('parry', t.pos, 1);
          if (out) out.res = 'block';
          t._blkStreak = (t._blkStreak || 0) + 1;
          return;
        }
        if (this.time > D.blockCd && Math.random() < 0.3) {
          // 受け：打ち合いの金の音と火花。半歩下がる
          D.blockCd = this.time + 1.1; t.guardFlash = 0.3; t.guarding = 0.6; t.cd = Math.min(t.cd, 0.35);
          this.clashAt(src, t); this.play('clash', t.pos, 0.8);
          const dx = t.pos.x - src.pos.x, dz = t.pos.z - src.pos.z, dl = Math.hypot(dx, dz) || 1;
          t.push.x += dx / dl * 1.4; t.push.z += dz / dl * 1.4;
          if (out) out.res = 'block';
          t._blkStreak = (t._blkStreak || 0) + 1;
          return;
        }
      }
    }
    // 騎馬武者を狙った弾・矢・穂先が、大きな的の馬に当たることがある：馬の体力が減り、尽きれば倒れて
    // 乗り手は生きたまま投げ出される（本人は除く。名のある武将も馬を失えば落馬する）
    if (t.mounted && t.horse && !t.isPlayer && !t.invuln) {
      const hc = (kind === 'gun' || kind === 'arrow') && opts.y != null ? (opts.y < t.pos.y + RIDE.y ? 1 : 0) : this.horseHitChance(t, src, kind);
      if (hc > 0 && Math.random() < hc) {
        if (out) out.horse = t.horse;
        this.horseDamage(t, amount, src, kind);
        if (out) out.res = 'hit';
        return;
      }
    }
    const missile = kind === 'gun' || kind === 'arrow';
    if (t.isPlayer && t.mounted && missile && opts.y != null && opts.y < t.pos.y + RIDE.y && this.hooks.playerDamage) {
      if (out) out.horse = t.horse;
      t.hitHorse = true; t.hitKind = kind; this.hooks.playerDamage(amount, src);
      if (out) out.res = 'hit';
      return;
    }
    const missileZone = missile ? this.hitZone(t, kind, src, opts) : null;
    // 本人の甲冑にも矢と弾は止まる。止まった弾は小さな打撲だけ。
    if (t.isPlayer && missileZone && missileZone.res === 'armor') {
      t.hp = Math.max(0, t.hp - Math.min(amount * 0.08, t.maxHp * 0.04)); t.lastHitT = 0;
      if (out) out.res = 'armor';
      this.armorSpark(t, src, missileZone.part, kind);
      return;
    }
    if (t.isPlayer && this.hooks.playerDamage) {
      t.hitPart = missileZone ? missileZone.part : null;
      t.hitKind = kind;   // 何で打たれたか（player.js の takeDamage が弾の重さを見る）
      // 構えて受けた：刃と刃（柄）が当たって火花
      if (t.guard && from === 'front' && src && !src.isStruct && kind !== 'gun' && kind !== 'arrow') { this.clashAt(src, t); if (out) out.res = 'block'; }
      amount = this.hooks.playerDamage(amount, src);
      if (amount <= 0) return;
    }
    // 敵も正面からの攻撃は構えて防ぐことがある（薙ぎ・溜め突き・反撃・背後からは防げない）
    // 総大将・殿（isTaisho）は、配下（isSub・isTomo）の攻撃にも受けて応じる（旗本だけでなく本人も手強い）
    const bossVsAlly = (t.isTaisho || t.isOfficer) && src && (src.isSub || src.isTomo);
    if (!missile && src && (src.isPlayer || bossVsAlly) && !t.isPlayer && !opts.pierce && t.type !== 'dummy' && !(t.stagger > 0) && !t.atk && !t.fleeing) {
      // 構えの姿勢をとっている敵は防ぎやすく、そうでない敵は防ぎにくい
      // （構えていても受けるのは半分まで。侍が構えると八割を越えて受けていて、突いても突いても通らなかった）
      // 総大将・殿は本人が手強く、構えていなくても打ち合いに応じる（易しさで弱めは taisho.js の hp 側で調整）
      const cap = t.isTaisho || t.isOfficer ? 0.68 : 0.5;
      const base = t.isTaisho || t.isOfficer ? 0.62 : ({ ashigaru: 0.18, samurai: 0.38, busho: 0.5, bow: 0.05 }[t.type] || 0);
      let chance = Math.min(cap, base * (t.guarding > 0 ? 2.2 : t.isTaisho ? 1.1 : 0.6) * (t.group && t.group._reformT > this.time ? 0.3 : 1));
      if (bossVsAlly) chance *= 0.65;   // 配下の数で押し切れるよう、旗本相手よりは受けにくくする
      if (blkOk && Math.random() < chance) {
        // 足軽も構えの初めに槍先を外す。受け続けず、二度まで・正面だけ。
        const parry = t.type === 'ashigaru' && t.guarding > 0.45 && kind !== 'gun' && kind !== 'arrow' && !opts.guardBreak;
        amount *= parry ? 0.05 : 0.2;
        if (parry) {
          this.play('parry', t.pos, 0.7);
          t.guarding = 0; t.cd = Math.min(t.cd || 0, 0.12);
        }
        t.guardFlash = 0.35;
        t._blkStreak = (t._blkStreak || 0) + 1;
        // 構えを崩す技（叩き下ろし・上段の斬り下ろし）は、受けられても相手の構えを崩してよろめかせる
        if (opts.guardBreak) { t.guarding = 0; t.stagger = Math.max(t.stagger || 0, 0.8); t.atk = null; t.cd = Math.max(t.cd || 0, 0.9); }
        this.clashAt(src, t);
        if (out) out.res = 'block';
        if (this.hooks.onBlocked) this.hooks.onBlocked(t);
        t.hp -= amount; this.officerStand(t); t.lastHitT = 0;
        // 返し技：受けた総大将・殿は、すぐに打ち返す構えに入る（間合いが保てていれば次の一振りが速い）
        if (t.isTaisho || t.isOfficer) t.cd = Math.min(t.cd ?? 0.5, 0.15);
        if (t.invuln && !this.playerMayKill(t, src) && t.hp <= t.maxHp * WOUND_FLOOR) { t.hp = t.maxHp * WOUND_FLOOR; this.generalWounded(t, src); return; }
        if (t.hp <= 0) this.kill(t, src);
        return;
      }
    }
    // 当たった所と甲冑：甲冑に当たれば弾かれて浅手、隙間に通れば深手
    let z = missileZone || (t.isPlayer ? { part: 'torso', res: 'flesh' } : this.hitZone(t, kind, src, opts));
    // 鎧を抜いた弾は部位に応じた深手。名前で耐える回数を決めない。
    if (kind === 'gun' && z.res !== 'armor' && !t.isPlayer && t.type !== 'dummy') {
      const severity = z.part === 'head' || z.part === 'neck' ? 1.1 : z.part === 'torso' ? 0.8 : 0.4;
      amount = Math.max(amount * (severity / 0.8), t.maxHp * severity);
    } else if (z.res === 'armor' && missile) amount *= 0.08;
    else if (z.res === 'armor') amount *= kind === 'slam' ? 0.5 : src && src.isPlayer && t.name ? 0.45 : 0.22;
    else if (z.res === 'gap') amount *= 1.3;
    else if (z.part === 'head' || z.part === 'neck') amount *= 1.4;
    // 横や背を突かれた：すぐそばの手の空いた味方（三人まで）が振り返って迎える
    if (from !== 'front' && !t.isPlayer && t.group && src && src.alive && !src.isStruct && src.pos) {
      // 遊び手に突かれた時は一人だけ（三人が一度に向かってくると、横槍が割に合わなくなる）
      let k = src.isPlayer ? 2 : 0;
      this.forNear(t.pos.x, t.pos.z, 3.5, (o) => {
        if (k < 3 && o !== t && o.alive && o.group === t.group && !t.group.routed && !o.isPlayer && !o.fleeing && !o.atk && !(o.target && o.target.alive) && o.type !== 'gun' && o.type !== 'bow') { o.target = src; k++; }
      });
    }
    // 背を打たれた者は深手になりやすい（逃げる背はなお。追い討ちの怖さ）。飛び道具は向きで変えない
    if (from === 'back' && !t.isPlayer && !t.isSub && kind !== 'gun' && kind !== 'arrow') amount *= t.fleeing ? 1.5 : 1.3;   // 自分の組の兵は除く（組が横から突かれて一度に崩れないように）
    if (out) out.res = z.res === 'armor' ? 'armor' : 'hit';
    t._blkStreak = 0;
    t.hp -= amount;
    if (kind === 'kesa' || kind === 'gyaku' || kind === 'yoko' || kind === 'sweep') markArmor(t, 'scar', src, this.hideBlood);
    if (this.hooks.onMeritHit) this.hooks.onMeritHit(t, src, kind, amount);
    this.officerStand(t);
    if (missile && z.res !== 'armor' && t.type !== 'dummy') t.rangedWound = Math.max(t.rangedWound || 0, Math.min(0.65, amount / t.maxHp));
    // 遊び手の一撃が名のある将に当たった：甲冑の音か肉を打つ音、小さくよろめく（当たったと分かるように）
    if (src && src.isPlayer && t.name && kind !== 'gun' && kind !== 'arrow') {
      this.play(z.res === 'armor' ? 'clank' : 'hit', t.pos, 1.1);
      t.stagger = Math.max(t.stagger || 0, z.res === 'armor' ? 0.2 : 0.35);
    }
    // 討たれない武将は下限で止まる（最後に手傷の知らせ）
    const woundNow = t.invuln && !this.playerMayKill(t, src) && t.hp <= t.maxHp * WOUND_FLOOR;
    if (woundNow) t.hp = t.maxHp * WOUND_FLOOR;
    t.lastHitT = 0;
    t.hitFlash = 0.15;
    // 渡河中の矢・弾は足場を乱す。隊の動揺は一秒に一度までに抑える。
    const crossingShot = (kind === 'arrow' || kind === 'gun') && amount > 0 && this.world.def.waterSlow && this.world.waterDepthAt(t.pos.x, t.pos.z) > 0.15;
    if (crossingShot) {
      t.stagger = Math.max(t.stagger || 0, 0.8); t.charging = false;
      if (t.group) {
        t.group.formLoose = this.time;
        if (!(t.group._riverShotT > this.time)) {
          t.group._riverShotT = this.time + 1;
          t.group.morale = Math.max(0, t.group.morale - 4);
        }
      }
      this.world.spray(t.pos.x, t.pos.z, 5);
    }
    if (t.isSub && t.hp > 0 && t.hp < t.maxHp * 0.3 && !t.woundedWarned && this.hooks.onSubWounded) { t.woundedWarned = true; this.hooks.onSubWounded(t); }
    if (t.isSub && src && !src.isStruct && t.group && this.hooks.onSquadFlanked) {
      const f = t.group.forward();
      const dx = src.pos.x - t.pos.x, dz = src.pos.z - t.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      if ((dx * f.x + dz * f.z) / d < -0.3) this.hooks.onSquadFlanked(t.group);
    }
    // 体の崩れ：甲冑で止まれば小さく怯むだけ。脚をやられれば膝をつく。前からはのけぞり、横からは横へ、後ろからは前へよろける
    const heavy = amount >= t.maxHp * 0.28 || kind === 'charge' || (kind === 'gun' && z.res !== 'armor');
    let hk;
    if (z.res === 'armor') hk = 'flinch';
    else if ((z.part === 'leg' || z.part === 'thigh') && (heavy || Math.random() < 0.45)) hk = 'kneel';
    else if (from === 'back') hk = 'stumble';
    else if (from === 'left' || from === 'right') hk = 'side';
    else hk = heavy && Math.random() < 0.45 ? 'kneel' : 'recoil';
    if (crossingShot && z.res !== 'armor') hk = t.mounted || t.isPlayer ? 'recoil' : 'kneel';
    // 長柄で上から叩かれると、甲冑の上からでも膝が折れやすい。頭を叩かれた者は陣笠が飛ぶ
    if (kind === 'slam' && hk !== 'kneel' && Math.random() < 0.3) hk = 'kneel';
    if (kind === 'slam' && z.part === 'head' && !t.isPlayer && !t.mounted && Math.random() < 0.5) this.dropHat(t);
    if ((t.mounted || t.isPlayer) && hk === 'kneel') hk = 'recoil';
    // 馬上の者に弾が当たると、馬が驚いて竿立ちになることがある（しばらく動けない）
    if (kind === 'gun' && t.mounted && !t.isPlayer && t.horse && t.horse.userData.horse && Math.random() < 0.3) {
      t.horse.userData.horse.rear = 0.8; t.stagger = Math.max(t.stagger || 0, 1.1); t.charging = false;
      this.play('neigh', t.pos, 0.8);
    }
    // 膝をつくほど崩れた者は、四人に一人ほど陣笠を落とし、拾わずに戦い続ける
    if (hk === 'kneel' && !t.isPlayer && Math.random() < 0.25) this.dropHat(t);
    // 大きな崩れ（膝をつく）は 2.5 秒に一度まで（一人を延々と封じ込めない）
    if (hk === 'kneel' && t.lastKneelT > this.time - 2.5) hk = 'recoil';
    // 泥・急な坂では、よろけた者が足を取られて転ぶことがある（2〜2.6 秒かけて手をついて起き上がる。遊び手と馬上の者は除く）
    let tumble = 0;
    if ((hk === 'stumble' || hk === 'side' || hk === 'kneel') && !t.isPlayer && !t.mounted && t.type !== 'dummy' && !(t.lastKneelT > this.time - 2.5)) {
      const W = this.world, e = 0.8, p = t.pos;
      const sl = Math.hypot(W.heightAt(p.x + e, p.z) - W.heightAt(p.x - e, p.z), W.heightAt(p.x, p.z + e) - W.heightAt(p.x, p.z - e)) / (2 * e);
      const mud = (W.def && W.def.muddy) || (this.rain > 0.3);
      if ((mud || sl > 0.25) && Math.random() < 0.3) { hk = 'kneel'; tumble = 2 + Math.random() * 0.6; }
    }
    const HD = { flinch: 0.25, recoil: 0.5, side: 0.55, stumble: 0.55, kneel: 1.3 };
    const severity = Math.min(1, Math.max(0, amount / t.maxHp) / 0.45);
    const amp = (0.55 + severity * 1.05) * (0.9 + Math.random() * 0.2);
    t.hit = { kind: hk, t: 0, dur: tumble || HD[hk] * (0.8 + severity * 0.4), amp, severity, from, side, part: z.part, res: z.res, heavy, wkind: kind, tumble: !!tumble };
    if (kind !== 'gun' && kind !== 'arrow' && src && t.type !== 'dummy') this.contactStop(src, t, z.res === 'armor' ? 0.04 : 0.035 + severity * 0.035);
    // 槍の突きには、踏み直す半歩を残す。毎コマの位置の跳びを避け、押し合いで戻されないようにする。
    if (kind === 'thrust' && z.res !== 'armor' && src && src.pos && !t.mounted && !t.isPlayer && t.type !== 'dummy') {
      const dx = t.pos.x - src.pos.x, dz = t.pos.z - src.pos.z, d = Math.hypot(dx, dz) || 1;
      t.hit.stepX = dx / d * 0.42; t.hit.stepZ = dz / d * 0.42; t.hit.step = 0;
    }
    t.lastHit = t.hit;
    if (hk === 'kneel') markArmor(t, 'mud', src, this.hideBlood);
    if (!t.isPlayer && t.type !== 'dummy') {
      const stg = hk === 'kneel' ? 1.2 : hk === 'flinch' ? 0.1 : 0.32;
      if (hk === 'kneel') t.lastKneelT = this.time;
      // 振りかぶっていた技は崩れて出せない（弓も引き直し）
      if (stg > 0.3 && t.atk && !t.atk.ranged) { t.atk = null; t.cd = Math.max(t.cd, 0.6); }
      if (!(t.stagger > stg)) t.stagger = stg;
      if (tumble) t.stagger = Math.max(t.stagger, tumble - 0.3);
      // 打たれた勢いでわずかに押される（吹き飛ばしはしない）
      if (src && src.pos) {
        const dx = t.pos.x - src.pos.x, dz = t.pos.z - src.pos.z, d = Math.hypot(dx, dz) || 1;
        const push = hk === 'flinch' ? 0.25 : hk === 'kneel' ? 0.5 : kind === 'charge' ? 1.8 : 0.65 + severity;
        t.push.x += dx / d * push; t.push.z += dz / d * push;
        t.slipT = Math.max(t.slipT || 0, 0.12 + severity * 0.12);
        // 騎馬の突きは重い：大きく押し込み（押し合いの力で滑らかに）、すぐ隣の者も巻き込んで膝をつかせる
        if (kind === 'charge' && src.mounted) {
          t.push.x += dx / d * 5; t.push.z += dz / d * 5;
          this.forNear(t.pos.x, t.pos.z, 1.4, (o) => {
            if (o !== t && o.alive && o.team === t.team && !o.isPlayer && !o.mounted && Math.random() < 0.35 && Math.hypot(o.pos.x - t.pos.x, o.pos.z - t.pos.z) < 1.4) { o.stagger = Math.max(o.stagger || 0, 0.9); o.push.x += dx / d * 3; o.push.z += dz / d * 3; }
          });
        }
      }
    }
    // 自分の攻撃が当たった手応え（怯みは連続しない）
    if (src && src.isPlayer && !t.isPlayer) {
      if (!(t.lastStagT > this.time - 1.4)) { t.stagger = Math.max(t.stagger || 0, 0.28); t.lastStagT = this.time; }
      if (this.hooks.onPlayerLanded) this.hooks.onPlayerLanded(t, amount);
    }
    if (z.res === 'armor') this.armorSpark(t, src, z.part, kind);
    else if (t.type === 'dummy' || t.maxHp > 9000) { this.burst(t.pos.x, this.partY(t, z.part), t.pos.z, 4, t.type === 'dummy' ? 'wood' : 'cloth', 0, 0, t.pos.y); this.play(kind === 'gun' ? 'bulletHit' : 'hit', t.pos, 0.7); }   // 藁人形・稽古の相手は血を出さない
    else { this.bleed(t, src, kind, amount / t.maxHp, z.part); this.play(kind === 'gun' ? 'bulletHit' : 'hit', t.pos, kind === 'arrow' ? 0.6 : 1); }
    // 側面・背面の判定（自分の組による攻撃のみ）
    if (src && !src.isStruct && t.group && t.team !== 0 && (src.isPlayer || src.isSub)) {
      const g = t.group;
      const dx = src.pos.x - t.pos.x, dz = src.pos.z - t.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const f = g.forward();
      const dot = (dx * f.x + dz * f.z) / d;
      if (dot < 0.2 && !g.routed) {
        g.flankHits++;
        g.morale -= 1.2;
        if (this.hooks.onFlank) this.hooks.onFlank(g, src);
        if (this.hooks.onFlankHit) this.hooks.onFlankHit(g);
      }
    }
    if (woundNow) { this.generalWounded(t, src); return; }
    if (t.hp <= 0) {
      // プレイヤーの重傷処理は Battle 側で行う
      if (t.isPlayer) { t.hp = 0; return; }
      this.kill(t, src);
    }
  },

  // 討たれない指定は本人の攻撃でも守り、手傷で退かせる。
  playerMayKill(t, src) { return !!(src && src.isPlayer && !t.invuln && !t.mustLive && !t.onWound && t.type !== 'dummy'); },

  // 遊び手の一撃が、討たれない武将（invuln）に通るか。手傷を負って退いた後は通らない
  mayWound(t, src) {
    // 筋書きが許した武将（allyOk：桶狭間の義元など）は、味方の兵の一撃も通る
    if (t.allyOk && src && src.alive !== undefined && t.team !== src.team && !t.woundOut) return true;
    return !!(src && src.isPlayer && !t.isPlayer && t.team !== src.team && !t.woundOut && t.type !== 'dummy' && t.type !== 'porter');
  },

  // 手傷を負わせた：武将はよろめき、近くの旗本が割って入り、武将は自陣の奥へ退く（馬なら駆け去る）。
  // 以後この戦では狙えない（noTarget）。知らせと戦功は woundQ を見た player.js が出す
  generalWounded(t, src) {
    if (t.woundOut) return;
    // 戦の定義が手傷の後を自分で書く者（桶狭間の義元など）は、退かせずに任せる
    if (t.onWound) { t.onWound(src); return; }
    const g = t.group;
    const sp = src && src.pos ? src.pos : t.pos;
    // 打った者から見た向き（p）と、退く向き（a：打った者から離れ、隊の後ろへ）
    let px = sp.x - t.pos.x, pz = sp.z - t.pos.z, pd = Math.hypot(px, pz);
    if (pd < 0.01) { px = Math.sin(t.heading); pz = Math.cos(t.heading); pd = 1; }
    px /= pd; pz /= pd;
    let ax = -px, az = -pz;
    if (g) { const f = g.forward(); ax = ax * 0.6 - f.x; az = az * 0.6 - f.z; }
    const ad = Math.hypot(ax, az) || 1; ax /= ad; az /= ad;
    const far = t.mounted ? 30 : 16, lim = (this.world.def.moveLim || 176) - 0.5;
    const to = { x: Math.max(-lim, Math.min(lim, t.pos.x + ax * far)), z: Math.max(-lim, Math.min(lim, t.pos.z + az * far)) };
    t.woundOut = { t: this.time + (t.mounted ? 12 : 18), to };
    t.noTarget = true;
    t.target = null; t.atk = null; t.swing = null; t.charging = false; t.aiT = 0;
    // よろめく（徒歩なら膝をつき、馬上なら仰け反って馬が竿立ち）
    t.hit = { kind: t.mounted ? 'recoil' : 'kneel', t: 0, dur: t.mounted ? 0.6 : 1.2, from: 'front', side: 1, part: 'torso', res: 'gap', heavy: true, wkind: 'thrust' };
    t.lastHit = t.hit; t.lastKneelT = this.time;
    t.stagger = Math.max(t.stagger || 0, t.mounted ? 0.5 : 1.0);
    if (t.mounted && t.horse && t.horse.userData.horse) t.horse.userData.horse.rear = 0.6;
    // 近くの旗本（槍・刀の者を三人まで）が、武将と打った者の間に割って入る
    const near = [];
    this.forNear(t.pos.x, t.pos.z, 9, (o) => {
      if (o === t || !o.alive || o.team !== t.team || o.isPlayer || o.fleeing || o.invuln || o.type === 'dummy' || o.type === 'porter' || o.type === 'gun' || o.type === 'bow' || o.stdHeld || o.woundOut || o.rearWound || o.climb || o.perch || o.dragging || Math.abs(o.pos.y - t.pos.y) > 1.8 || this.wallBetween(t.pos, -1, o.pos)) return;
      near.push([Math.hypot(o.pos.x - t.pos.x, o.pos.z - t.pos.z), o]);
    });
    near.sort((a, b) => a[0] - b[0]);
    near.slice(0, 3).forEach(([, o], i) => {
      const k = (i - 1) * 1.1;
      o.cover = { t: this.time + 5, x: t.pos.x + px * 1.4 - pz * k, z: t.pos.z + pz * 1.4 + px * k };
      o.confused = 0; o.aiT = 0;
      // 徒歩の武将には、割って入った後の二人が左右から肩を貸して一緒に退く（u.escort）
      if (!t.mounted && i >= 1) o.escort = { u: t, s: i === 1 ? 1 : -1 };
    });
    if (g) g.morale -= 10;   // 大将の手傷に隊が揺らぐ
    this.play('eshout', t.pos, 1.3);
    this.play('yoroi', t.pos, 1);
    (this.woundQ || (this.woundQ = [])).push({ u: t, src });
  },

  // どこに当たり、甲冑がそれを止めたか：{ part: head|neck|shoulder|torso|arm|thigh|leg, res: armor 弾かれた|gap 隙間に通った|flesh 素肌・布 }
  hitZone(t, kind, src, opts) {
    const r = Math.random();
    let part;
    if (opts.y != null) {
      const h = opts.y - t.pos.y - (t.mounted ? RIDE.y : 0);
      part = h > 1.52 ? 'head' : h > 1.36 ? (r < 0.4 ? 'neck' : 'shoulder') : h > 0.95 ? (r < 0.8 ? 'torso' : 'arm') : h > 0.5 ? 'thigh' : 'leg';
    } else if (kind === 'slam' || kind === 'kesa') part = r < 0.4 ? 'head' : r < 0.8 ? 'shoulder' : 'arm';
    else if (kind === 'gyaku') part = r < 0.4 ? 'arm' : r < 0.75 ? 'torso' : 'thigh';
    else if (kind === 'sweep' || kind === 'yoko') part = r < 0.35 ? 'arm' : r < 0.7 ? 'torso' : r < 0.82 ? 'neck' : 'thigh';
    else if (t.mounted && src && !src.mounted) part = r < 0.45 ? 'thigh' : r < 0.85 ? 'torso' : 'arm';   // 下から馬上の者を突く
    else part = r < 0.08 ? 'head' : r < 0.15 ? 'neck' : r < 0.6 ? 'torso' : r < 0.7 ? 'arm' : r < 0.88 ? 'thigh' : 'leg';
    if (t.type === 'dummy' || t.type === 'porter') return { part, res: 'flesh' };
    const L = t.look || {}, T = L.tier || 0;
    const kab = !t.hatOff && !!(L.hat && L.hat.startsWith('kabuto')), jin = !t.hatOff && !!(L.hat && L.hat.startsWith('jingasa'));
    // 覆われている割合：足軽は胴と陣笠、侍は籠手・佩楯・臑当まで
    const cover = L.kosode ? 0 : { head: kab ? 0.85 : jin ? 0.6 : 0, neck: T >= 1 ? 0.45 : 0.1, shoulder: L.sode ? 0.85 : 0.35, torso: 0.92, arm: T >= 1 ? 0.7 : 0.25, thigh: T >= 1 ? 0.65 : 0.2, leg: T >= 1 ? 0.75 : 0.35 }[part];
    // 甲冑に止められやすさ（技ごと）。弾は近ければ胴も抜く
    let stop = { thrust: 0.42, charge: 0.25, tsuki: 0.4, kesa: 0.55, gyaku: 0.55, yoko: 0.55, slam: 0.3, sweep: 0.5, arrow: 0.55, gun: 0.06, butt: 0.6 }[kind] ?? 0.45;
    if (kind === 'gun' && opts.d) stop += Math.min(0.35, opts.d / 150);
    if (T >= 2) stop *= 1.15;
    if (src && src.isPlayer && kind !== 'gun' && kind !== 'arrow') stop *= opts.pierce ? 0 : 0.55;   // 自分の槍は隙間を狙って突く
    if (Math.random() < cover * stop) return { part, res: 'armor' };
    return { part, res: cover > 0.5 ? 'gap' : 'flesh' };
  },

  // 当たった所の高さ（体の座標）
  partY(t, part) { return t.pos.y + (t.mounted ? RIDE.y : 0) + ({ head: 1.58, neck: 1.46, shoulder: 1.42, arm: 1.15, torso: 1.15, thigh: 0.78, leg: 0.42 }[part] || 1.15); },

  // 甲冑に弾かれた：小さな火花と、小札に当たる乾いた音
  armorSpark(t, src, part, kind) {
    let nx = 0, nz = 0;
    if (src && src.pos) { nx = src.pos.x - t.pos.x; nz = src.pos.z - t.pos.z; const d = Math.hypot(nx, nz) || 1; nx /= d; nz /= d; }
    if (kind !== 'slam' && kind !== 'butt') this.spark(t.pos.x + nx * 0.25, this.partY(t, part), t.pos.z + nz * 0.25, kind === 'gun' ? 5 : 3);
    // 弾が胴や兜で弾かれた時は、高い金の音（ちゅいん）
    this.play(kind === 'gun' ? 'bulletArmor' : 'yoroi', t.pos, kind === 'arrow' ? 0.6 : kind === 'gun' ? 0.9 : 1);
  },

  // 当たった二人だけを数コマ止める。遠景の打ち合いで戦全体を止めない。
  contactStop(a, b, dur) {
    // 遊び手の打ち合いは、既存の全体の短い止めに任せる（二重に延ばさない）。
    if (a.isPlayer || b.isPlayer) return;
    if (Math.min(a.camD ?? Infinity, b.camD ?? Infinity) > 35) return;
    if (!a.isPlayer) a.contactStopT = Math.max(a.contactStopT || 0, dur);
    if (!b.isPlayer) b.contactStopT = Math.max(b.contactStopT || 0, dur);
  },

  // 刃と刃・柄が打ち合う：二人の間の、受けた側の少し前で火花と金の音
  clashAt(a, b) {
    const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z, d = Math.hypot(dx, dz) || 1;
    const k = Math.min(0.9, d * 0.35);
    // 刀・槍の刃が噛み合う位置に、小さな火花を二つ三つ。
    const aw = a.wpnKind || a.lookWeapon, bw = b.wpnKind || b.lookWeapon;
    this.contactStop(a, b, aw === 'sword' || bw === 'sword' ? 0.065 : 0.045);
    if (!b.isPlayer && !b.mounted) b.slipT = Math.max(b.slipT || 0, 0.22);
    // 受け流された得物に肩と腰が引かれ、片足を踏み直す。
    if (!a.isPlayer && !a.mounted && a.type !== 'dummy') {
      const side = Math.sin(a.heading) * dz - Math.cos(a.heading) * dx >= 0 ? 1 : -1;
      a.hit = { kind: 'side', t: 0, dur: 0.42, side, amp: 0.75, heavy: false, res: 'block' };
      a.stagger = Math.max(a.stagger || 0, 0.18); a.slipT = Math.max(a.slipT || 0, 0.18);
      a.push.x += dz / d * side * 0.7; a.push.z -= dx / d * side * 0.7;
    }
    // 槍同士でも穂先の受けは金属音。石突き・鉄砲の柄は木の音。
    if ((aw !== 'sword' && aw !== 'spear') || (bw !== 'sword' && bw !== 'spear') || a.swing?.kind === 'butt') { this.play('wood', b.pos, 0.7); return; }
    this.spark(b.pos.x + dx / d * k, b.pos.y + (b.mounted ? RIDE.y : 0) + 1.3, b.pos.z + dz / d * k, 2 + (Math.random() < 0.5 ? 1 : 0));
    this.play('kin', b.pos, 1);
  },

  // 血：小さな飛沫と、地面の小さな染み（控えめ。設定で「控えめ」「なし」にできる）
  bleed(t, src, kind, sev, part = 'torso') {
    const lv = this.hideBlood ? 0 : bloodLv();
    if (lv > 0 && sev > 0) {
      markArmor(t, 'blood', src, this.hideBlood);
      if (src && kind !== 'arrow' && kind !== 'gun' && this.distTo(t, src) < 2.8) markArmor(src, 'blood', t, this.hideBlood);
    }
    let nx = 0, nz = 0;
    if (src && src.pos) { nx = t.pos.x - src.pos.x; nz = t.pos.z - src.pos.z; const d = Math.hypot(nx, nz) || 1; nx /= d; nz /= d; }
    const y = this.partY(t, part);
    if (lv === 0) { this.burst(t.pos.x + nx * 0.15, y, t.pos.z + nz * 0.15, 3, 'cloth', nx, nz, t.pos.y); return; }
    const n = Math.round((lv === 2 ? 3 : 1) + Math.min(1, sev) * (lv === 2 ? 5 : 2));
    this.burst(t.pos.x + nx * 0.15, y, t.pos.z + nz * 0.15, n, 'blood', nx, nz, t.pos.y);
    if (Math.random() < (lv === 2 ? 0.65 : 0.3)) this.stain(t.pos.x + nx * (0.3 + Math.random() * 0.6), t.pos.z + nz * (0.3 + Math.random() * 0.6), (0.1 + Math.random() * 0.12) * (lv === 2 ? 1.3 : 1), 60);
  },

  noticeFallen(t) {
    this.forNear(t.pos.x, t.pos.z, 6, (o) => {
      if (!o.alive || o.team !== t.team || o.isPlayer || o.mounted || o.fleeing || o.atk || o.swing || o.hit || o.stagger > 0 || o.fallenLookCd > this.time) return;
      const dx = t.pos.x - o.pos.x, dz = t.pos.z - o.pos.z;
      if (dx * dx + dz * dz > 36 || Math.abs(o.pos.y - t.pos.y) > 1.8 || this.wallBetween(o.pos, -1, t.pos) || (o.target && o.target.alive && this.distTo(o, o.target) < 2.5) || Math.random() >= 0.45) return;
      o.fallenLookX = t.pos.x; o.fallenLookZ = t.pos.z;
      o.fallenLookLeft = 0.65; o.fallenLookCd = this.time + 5;
      o.stagger = Math.max(o.stagger || 0, 0.25);
    });
  },

  // 整った隊の近習が武将を退かせる。崩れた後は討ち取りの機会が生まれる。
  officerStand(t) {
    if (!t.isOfficer || t.isTaisho || (this.duel && !this.duel.auto && this.duel.foe === t) || officerBroken(t) || t.hp > t.maxHp * 0.35) return;
    t.hp = t.maxHp * 0.35; t.officerBackUntil = this.time + 8;
  },

  kill(t, src) {
    if (!t.alive || t.gone) return;
    if (src && t.isOfficer && !t.isTaisho && !(this.duel && !this.duel.auto && this.duel.foe === t) && !officerBroken(t)) { this.officerStand(t); return; }
    if (this.duel && t === this.duel.foe) this.duelEnd(true);
    t.alive = false;
    if (t.dragging?.death?.helper === t) {
      const d = t.dragging; d.death.helper = null; d.death.dx = Math.sin(d.heading); d.death.dz = Math.cos(d.heading); t.dragging = null;
    }
    if (t.blob) t.blob.visible = false;
    t.hp = 0;
    t.deadT = 0;
    t.atk = null; t.swing = null; t.reload = null; t.target = null; t.bind = null;
    if (t.loopP) this.freeSama(t);
    t.fall = (Math.random() < 0.5 ? 1 : -1);
    t.fallAxis = Math.random() < 0.3 ? 'z' : 'x';
    // 倒れ方：打たれた向きと所で決める。多くは膝から力が抜けて崩れる
    const L = t.lastHit || {};
    const r = Math.random();
    let kind;
    // 乗り手の死だけでは生きた馬を倒さない。主を失えば空馬になって逃げる。
    if (t.mounted) kind = t.horse && (t.horseHp === undefined || t.horseHp > 0) ? 'unhorse' : 'horse';
    else if (L.from === 'back') kind = r < 0.65 ? 'forward' : 'crumple';
    else if (L.from === 'left' || L.from === 'right') kind = r < 0.55 ? 'side' : 'crumple';
    else if (L.wkind === 'gun' || L.wkind === 'charge' || (L.heavy && (L.wkind === 'thrust' || L.wkind === 'tsuki'))) kind = r < 0.55 ? 'back' : 'crumple';
    else if (L.part === 'leg' || L.part === 'thigh') kind = 'crumple';
    else if (L.severity < 0.3) kind = 'crumple';
    else if (L.severity > 0.7 && (L.wkind === 'kesa' || L.wkind === 'gyaku' || L.wkind === 'yoko')) kind = L.wkind === 'yoko' ? 'side' : 'forward';
    else kind = r < 0.5 ? 'crumple' : r < 0.7 ? 'forward' : r < 0.9 ? 'back' : 'side';
    // 横へは、打たれた側と反対へ倒れる
    t.death = { kind, side: L.side ? -L.side : t.fall, t: 0, fwd: Math.random() < 0.6, pace: 1.1 - (L.severity ?? 0.5) * 0.3 + Math.random() * 0.1 };
    // 戦力から外れた深手の兵だけ、短く這う。既存の死体枠の中で四人まで、救助は二組まで。
    if (!t.mounted && !t.isPlayer && !t.name && t.type !== 'dummy' && !t.perch && !t.climb && !t.downed && Math.abs(t.pos.y - this.world.heightAt(t.pos.x, t.pos.z)) < 0.35 && !L.heavy && L.part !== 'head' && L.part !== 'neck' && Math.random() < 0.3) {
      let wounded = 0, pairs = 0;
      for (const d of this.dead) if (!d.gone && d.death && d.death.aid) { wounded++; if (d.death.helper) pairs++; }
      if (wounded < 4) {
        const D = t.death;
        D.kind = 'forward'; D.fwd = true; D.aid = true; D.aidT = 0; D.aidDur = 5 + Math.random() * 2;
        D.dx = -Math.sin(t.heading); D.dz = -Math.cos(t.heading); t.heading += Math.PI;
        if (pairs < 2 && t.group && !t.group.routed) {
          let helper = null, best = 2.5;
          for (const o of t.group.units) {
            if (o === t || !o.alive || o.isPlayer || o.isSub || o.name || o.mounted || o.farSim || o.fleeing || o.atk || o.swing || o.reload || o.dragging || o.climb || o.perch || o.downed || o.woundOut || o.noTarget || o.type === 'dummy' || o.type === 'porter' || o.stagger > 0 || o.confused > 0 || o.lastHitT < 0.6 || (o.target && o.target.alive)) continue;
            const d = Math.hypot(o.pos.x - t.pos.x, o.pos.z - t.pos.z);
            if (d > 0.7 && d < best) { best = d; helper = o; }
          }
          if (helper) {
            D.gap = best; D.helper = helper; helper.dragging = t; helper.target = null; helper.vel.x = helper.vel.z = 0;
            D.dx = (helper.pos.x - t.pos.x) / best; D.dz = (helper.pos.z - t.pos.z) / best;
            helper.heading = Math.atan2(-D.dx, -D.dz); t.heading = helper.heading;
          }
        }
      }
    }
    // 倒れる向きと所を人ごとにばらす（列のまま同じ向き・同じ間で並んで倒れないように）。よろめいて半歩ずれる
    if (!t.mounted && !t.isPlayer) {
      const sa = Math.random() * 6.283, sr = 0.15 + Math.random() * 0.35;
      Object.assign(t.death, { tw: (Math.random() - 0.5) * 1.2, sx: Math.sin(sa) * sr, sz: Math.cos(sa) * sr });
      // 急な坂（勾配 0.3 より急）で倒れた者は、坂の下へ 1〜3m ずり落ちる・転がる
      const W = this.world, e = 0.8, p = t.pos;
      const gx = (W.heightAt(p.x + e, p.z) - W.heightAt(p.x - e, p.z)) / (2 * e), gz = (W.heightAt(p.x, p.z + e) - W.heightAt(p.x, p.z - e)) / (2 * e);
      const sl = Math.hypot(gx, gz);
      if (sl > 0.3 && !t.death.aid) { const k = Math.min(3, (sl - 0.2) * 5) * (0.7 + Math.random() * 0.5); t.death.roll = { x: -gx / sl * k, z: -gz / sl * k }; }
    }
    if (t.death.aid) { t.death.tw = 0; t.death.sx = 0; t.death.sz = 0; }
    // 馬上で弾・矢に倒れた者は、駆ける勢いのまま前へ投げ出される（横へずり落ちず）
    if (kind === 'unhorse' && (L.wkind === 'gun' || L.wkind === 'arrow') && Math.hypot(t.vel.x, t.vel.z) > 3) t.death.throwF = true;
    if (kind === 'unhorse') this.unhorse(t);
    // 馬ごと倒れる者は、手の武器をすぐ落とす（徒歩の者は倒れながら落とす）
    if (kind === 'horse') this.dropWeapon(t);
    const g = t.group;
    if (g) {
      g.morale -= (100 / Math.max(6, g.initial + (g.reserveCount || 0))) * 1.15;
      if (t === g.leader) {
        g.morale -= 30;
        if (this.hooks.onLeaderKilled) this.hooks.onLeaderKilled(g, src);
        // 部隊長の死：一定確率で混乱
        for (const o of g.units) if (o.alive && Math.random() < 0.45) o.confused = 4 + Math.random() * 4;
      }
    }
    if (t.type === 'busho') {
      // 周りの隊は、隊ごとに一度だけ揺らぐ（兵一人ごとに下げると、一度に潰走してしまう）
      const seen = new Set();
      this.forNear(t.pos.x, t.pos.z, 30, (o) => { if (o.team === t.team && o.group) seen.add(o.group); });
      for (const og of seen) og.morale -= 6;
    }
    if (t.tag === 'flag' && g) g.morale -= 15;
    moraleDeath(this, t);
    // 隣の兵が倒れた瞬間、顔をそちらへ向ける。目の前の敵を迎えている者・敗走中の者は振り返らない
    if (!t.isPlayer) this.noticeFallen(t);
    // 前の段が倒れたら、同じ列の後ろの者が前へ出て穴を埋める（槍・侍の横陣と槍衾。鉄砲の段は gunRotate、騎馬の混じる隊は塊のまま）
    //   自分の組も、横に並んで持ち場を守る時（待て・槍衾・かかれ）は同じように穴を埋める
    if (g && !g.isGun && !(g.cavShare > 0.1) && (g.formation === 'line' || g.formation === 'yari') && !g.marching && (!g.isPlayerSquad || g.order === 'hold' || g.order === 'yari' || g.order === 'attack')) {
      const { cols } = g.layout(g.initial);
      for (let s = t.slot + cols; s < g.initial; s += cols) {
        const o = g.units.find((x) => x.slot === s);
        if (o && o.alive && !o.fleeing && !o.isPlayer && !o.name && o !== g.leader && !o.stdHeld && !o.woundOut && !o.rearWound && !o.climb && !o.perch && !o.mounted && o.type !== 'porter') { o.slot = t.slot; t.slot = s; break; }
      }
    }
    // 叫び：一撃で倒れた者（重い一撃・弾）はほとんど声を上げず、じわじわ削られた者はうめく
    if (Math.random() < (L.heavy || L.wkind === 'gun' ? 0.1 : 0.4)) this.play(L.heavy || Math.random() < 0.5 ? 'cry' : 'umeki', t.pos, 0.7);
    // 自分が名のある武将を討った：まわりの味方が「ようやった」と声を上げ、得物を突き上げる
    if (t.type === 'busho' && src && src.isPlayer) {
      this.forNear(src.pos.x, src.pos.z, 22, (o) => { if (o.alive && o.team === src.team && !o.isPlayer && !o.target && !o.fleeing && !o.group?.routed && !o.woundOut && !o.rearWound && !o.downed && !(o.pinT > this.time) && !(o.stagger > 0) && !o.atk && !o.swing && !o.dragging && !o.climb && !o.bind && Math.random() < 0.6) o.cheer = 1 + Math.random() * 0.6; });
      this.play('shout', src.pos, 0.8);
    }
    this.dead.push(t);
    t.killedAt = this.time;
    this.corpseAt(t, 1);
    this.trimCorpses();
    // 討った者は一呼吸（0.5〜1 秒）止まって息をつく
    if (src && !src.isPlayer && src.alive && src.pos) src.pauseT = this.time + 0.5 + Math.random() * 0.5;
    if (this.hooks.onKill) this.hooks.onKill(t, src);
  },

  // 倒れた体のある所（2m の升ごとの数）。生きた兵はその上をゆっくり歩く
  corpseAt(t, k) {
    const C = this.corpses || (this.corpses = new Map());
    const key = k > 0 ? (t.corpseKey = (Math.floor(t.pos.x / 2) + 20000) * 40000 + Math.floor(t.pos.z / 2) + 20000) : t.corpseKey;
    const n = (C.get(key) || 0) + k;
    if (n > 0) C.set(key, n); else C.delete(key);
  },
  // 陣笠を頭から落とす：頭の形を顔だけにし、笠だけの形を頭の先の地面に置く（骨の体は humans.js が u.hatOff を見て頭の笠を隠す）
  dropHat(u) {
    if (u.hatOff) return;
    const L = u.look;
    if (!L || !(L.hat === 'jingasa' || L.hat === 'jingasa_n') || !u.head || u.isPlayer) return;
    const key = lookKey(L);
    const g = bodyGeometry(key, L, true, 'head');
    if (!g) return;
    u.head.geometry = headOf(L, true);
    lodSwap(u.head, u.head.geometry, headOf(L, false));
    // 頭のてっぺんの先 0.3m ほど、少し横へ。笠は上を向いて地面に伏せる（少し傾く）
    u.mesh.updateMatrixWorld(true);
    const hp = new THREE.Vector3(0, 1.62, 0).applyMatrix4(u.head.matrixWorld);
    const tp = new THREE.Vector3(0, 1.9, 0).applyMatrix4(u.head.matrixWorld);
    const dx = tp.x - hp.x, dz = tp.z - hp.z, dl = Math.hypot(dx, dz) || 1;
    const sd = (u.id * 0.37) % 1 - 0.5;
    const x = hp.x + dx / dl * 0.3 - dz / dl * sd * 0.5, z = hp.z + dz / dl * 0.3 + dx / dl * sd * 0.5;
    const y = this.world.heightAt(x, z);
    const m = new THREE.Mesh(g, MAT);
    m.castShadow = true;
    // 形は立ち姿の体の座標（縁の高さ 約 1.64）。縁が地面に着くよう下げる
    m.position.set(x, y - 1.63, z);
    m.rotation.set(0, u.id * 2.4, 0);
    const tilt = 0.12 + ((u.id * 0.61) % 1) * 0.15;
    m.rotateOnWorldAxis(new THREE.Vector3(Math.cos(u.id), 0, Math.sin(u.id)), tilt);
    // 傾けた分、縁の低い側が沈まないよう少し持ち上げる
    m.position.y += Math.sin(tilt) * 0.4;
    // 回した中心が笠の真ん中になるよう、回す前の中心（0, 1.66, 0）の分を戻す
    const c0 = new THREE.Vector3(0, 1.66, 0).applyQuaternion(m.quaternion);
    m.position.x += -c0.x; m.position.z += -c0.z; m.position.y += 1.66 - c0.y;
    this.scene.add(m);
    u.hatOff = m;
    this.keepLitter(m);
  },

  // 脇差を抜く：鉄砲は足もとに置き、短い刀で斬り合う（撃つのはやめる）
  drawSidearm(u) {
    this.dropWeapon(u);
    const w = makeWeapon('sword');
    w.scale.setScalar(0.72);   // 脇差（打刀より短い）
    u.hand.add(w); u.wpn = w; u.wpnKind = 'sword'; u.sidearm = true;
    u.range = 0; u.cdBase = 1.7; u.cd = Math.min(u.cd, 0.6); u.windup = 0.5; u.dmg = 9; u.reach = 1.25; u.reload = null; u.atk = null; u.swing = null;
    if (u.camD < 30) this.play('swing', u.pos, 0.3);
  },
  // 手の武器を地面に落とす（地面の傾きに沿わせる）
  dropWeapon(t) {
    const w = t.wpn;
    if (!w || !w.parent || t.isPlayer || t.dropped) return;
    w.parent.remove(w);
    flexSpear(w, 0, false, 0);
    const B = w.userData.bow;
    if (B) { setBowDraw(w, 0, null); B.ar.visible = false; }
    if (w.userData.ember) w.userData.ember.visible = false;
    const a = t.heading + (Math.random() - 0.5) * 1.5 + (B ? Math.PI / 2 : 0);
    const x = t.pos.x + Math.sin(a + 1.2) * 0.45, z = t.pos.z + Math.cos(a + 1.2) * 0.45;
    const L = (w.userData.tip || 1) - (w.userData.butt || -0.3);
    const y0 = this.world.heightAt(x - Math.sin(a) * L * 0.4, z - Math.cos(a) * L * 0.4), y1 = this.world.heightAt(x + Math.sin(a) * L * 0.6, z + Math.cos(a) * L * 0.6);
    w.position.set(x, (y0 + y1) / 2 + 0.03, z);
    // 急な岸や川底でも、柄が地面に突き立って見えないよう傾きは 20° までに
    w.rotation.set(-Math.max(-0.35, Math.min(0.35, Math.atan2(y1 - y0, L))), a, B ? Math.PI / 2 : 0, 'YXZ');
    this.scene.add(w);
    t.dropped = w;
    this.keepLitter(w);
  },

  // 落馬：討たれた乗り手が鞍から横へずり落ち、主を失った馬は駆け去る
  unhorse(t) {
    const h = t.horse;
    const spd = Math.hypot(t.vel.x, t.vel.z);
    this.dropWeapon(t);
    this.setMounted(t, false);
    if (h) {
      if (h.parent) h.parent.remove(h);
      h.position.copy(t.mesh.position); h.rotation.set(0, t.heading, 0);
      this.scene.add(h);
      const L = this.looseHorses || (this.looseHorses = []);
      // 元の乗り手の家・名と、馬の速さ・体力（プレイヤーが捕らえて乗るときに使う）
      const gname = t.name ? t.name.replace(/^.* /, '') : '';
      const from = {
        team: t.team, house: HOUSE_NAME[t.group && t.group.faction] || '', name: GENERALS[gname] ? gname : '',
        speed: Math.max(0.9, Math.min(1.12, (t.run || 8.5) / 8.5)), hp: t.horseHp ?? Math.round((t.maxHp || 110) * 1.3), maxHp: t.horseMax ?? Math.round((t.maxHp || 110) * 1.3), hfat: t.hfat || 0,
      };
      L.push({ h, heading: t.heading + (Math.random() - 0.5) * 0.9, spd: Math.max(spd, 4), t: 0, from });
      // 多すぎる時は古い空馬から消す（プレイヤーが置いた馬は残す）
      // 空馬は 20 頭まで（戦場を駆け回る馬を見せる）。多すぎる時は、置いた馬を除いて本人から一番遠い馬から消す
      if (L.length > 20) { const P = this.playerUnit; let k = -1, bd = -1; L.forEach((o, j) => { if (o.kept) return; const d = P ? Math.hypot(o.h.position.x - P.pos.x, o.h.position.z - P.pos.z) : j; if (d > bd) { bd = d; k = j; } }); if (k >= 0) this.scene.remove(L.splice(k, 1)[0].h); }
      if (h.userData.horse) h.userData.horse.spook = 1;
      this.play('neigh', t.pos, 0.7);
    }
    t.death.vx = spd * 0.5;
  },
  // 馬を狙った一撃が、乗り手でなく馬に当たる見込み（弾・矢は的が大きく当たりやすい。槍衾に突っ込んだ馬は脚や胴を狙われやすい）
  horseHitChance(t, src, kind) {
    const named = t.type === 'busho' || !!t.name;
    if (kind === 'gun') return named ? 0.14 : 0.08;
    if (kind === 'arrow') return named ? 0.05 : 0.08;
    if (kind === 'thrust' || kind === 'tsuki' || kind === 'charge' || kind === 'slam' || kind === 'sweep' || kind === 'yoko' || kind === 'kesa' || kind === 'gyaku') {
      let c = named ? 0.05 : 0.08;
      // 槍衾（槍の構え）で待ち受ける隊へ突っ込んだ馬は、狙われやすい
      if (src && src.group && src.group.formation === 'yari' && (src.group.order === 'yari' || src.group.order === 'hold') && (t.charging || kind === 'charge')) c += 0.3;
      return Math.min(0.55, c);
    }
    return 0;
  },
  // 馬に手傷を負わせる：体力が尽きれば倒れる（horseShot）。尽きなければ驚いて竿立ちになり、少し動けなくなる
  horseDamage(t, amount, src, kind) {
    if (t.horseHp === undefined) { t.horseMax = Math.round((t.maxHp || 110) * 1.3); t.horseHp = t.horseMax; }
    // 馬の傷も一撃の重さに応じる。弱い弾でも必ず即死、という扱いをやめる
    const force = Math.max(0, amount) / 34;
    const hAmt = t.horseMax * Math.min(1.2, force * (kind === 'gun' ? 0.8 : kind === 'arrow' ? 0.4 : 0.3));
    t.horseHp = Math.max(0, t.horseHp - hAmt);
    const h = t.horse, H = h && h.userData.horse;
    if (H) H.rear = Math.min(1, (H.rear || 0) + (kind === 'gun' ? 0.8 : 0.5));
    if (t.horseHp <= 0) { this.horseShot(t, src); return; }
    t.stagger = Math.max(t.stagger || 0, kind === 'gun' ? 1.1 : 0.5);
    t.charging = false;
    if (Math.random() < (kind === 'gun' ? 0.9 : 0.5)) this.play('neigh', t.pos, kind === 'gun' ? 0.8 : 0.6);
  },
  // 馬が討たれた（乗り手は生きている）：馬は前へ崩れて横倒しに。乗り手は前へ投げ出されるか、四割ほどは馬の下敷きになって
  //   しばらく動けず（3〜4 秒）、這い出してから徒歩の侍として戦い続ける
  horseShot(t, src) {
    const h = t.horse, H = h && h.userData.horse;
    const spd = Math.hypot(t.vel.x, t.vel.z);
    this.setMounted(t, false);
    t.horse = null; t.charging = false; t.atk = null; t.swing = null; t.target = null;
    if (h) {
      if (h.parent) h.parent.remove(h);
      h.position.copy(t.mesh.position); h.rotation.set(0, t.heading, 0);
      this.scene.add(h);
      if (H) { H.dead = true; H.deadT = 0; }
      (this.fallenHorses || (this.fallenHorses = [])).push({ h, t: 0 });
      this.play('neigh', t.pos, 0.9);
    }
    // 徒歩になった乗り手：侍の足と間合いで戦う
    // 徒歩になった武将は武将のまま（名乗り・手柄の数えを変えない）。騎馬の兵は侍に
    const S = t.type === 'busho' ? TYPES.busho : TYPES.samurai;
    if (t.type !== 'busho') t.type = 'samurai';
    t.speed = S.speed; t.run = S.run; t.reach = Math.max(S.reach, (t.reach || 2.7) * 0.95);   // 槍はそのまま持つ
    const pinned = Math.random() < 0.4;
    const fx = Math.sin(t.heading), fz = Math.cos(t.heading);
    if (pinned) {
      // 下敷き：馬の脇に倒れ、脚を抜こうともがく
      t.pinT = this.time + 3 + Math.random();
      t.pos.x += Math.cos(t.heading) * 0.7; t.pos.z -= Math.sin(t.heading) * 0.7;
      t.hit = { kind: 'kneel', t: 0, dur: 3.6, from: 'front', side: 1, part: 'leg', res: 'hit', heavy: true, wkind: 'gun' };
      t.stagger = 3.6;
    } else {
      // 投げ出される：駆けていた勢いで前へ 1.5〜3m
      const k = Math.min(3, 1.2 + spd * 0.2);
      t.pos.x += fx * k; t.pos.z += fz * k;
      t.hit = { kind: 'kneel', t: 0, dur: 1.4, from: 'front', side: 1, part: 'torso', res: 'hit', heavy: true, wkind: 'gun' };
      t.stagger = 1.4;
    }
    t.pos.y = this.world.heightAt(t.pos.x, t.pos.z);
    t.lastHit = t.hit; t.lastKneelT = this.time; t.mv.x = t.mv.z = 0;
    // 落ちた乗り手も無傷ではない（体力の四割半から六割を失う。尽きればその場で討たれる）
    t.hp -= t.maxHp * (0.45 + Math.random() * 0.15); t.lastHitT = 0;
    if (t.hp <= 0) { this.kill(t, src); return; }
    if (t.group) t.group.morale -= 2;
    this.burst(t.pos.x, t.pos.y + 0.1, t.pos.z, 6, 'dust', fx, fz);
  },
  // 引き落とし（十文字槍の鎌を乗り手に掛けて手前へ引く）：乗り手は生きたまま、引いた者の側へ鞍からずり落ちて地に倒れ、
  //   しばらく伏せてから起き上がり、徒歩の侍として戦う。主を失った馬は空馬になって逃げる（手綱を取れれば捕らえられる）
  pullOff(t, src) {
    const h = t.horse;
    this.setMounted(t, false);
    t.horse = null; t.charging = false; t.atk = null; t.swing = null; t.target = null;
    if (h) {
      if (h.parent) h.parent.remove(h);
      h.position.copy(t.mesh.position); h.rotation.set(0, t.heading, 0);
      this.scene.add(h);
      const L = this.looseHorses || (this.looseHorses = []);
      const gname = t.name ? t.name.replace(/^.* /, '') : '';
      const from = {
        team: t.team, house: HOUSE_NAME[t.group && t.group.faction] || '', name: GENERALS[gname] ? gname : '',
        speed: Math.max(0.9, Math.min(1.12, (t.run || 8.5) / 8.5)), hp: t.horseHp ?? Math.round((t.maxHp || 110) * 1.3), maxHp: t.horseMax ?? Math.round((t.maxHp || 110) * 1.3), hfat: t.hfat || 0,
      };
      // 主を振り落とした馬は、そのまま戦場から逃げる。
      L.push({ h, heading: t.heading + (Math.random() - 0.5) * 1.2, spd: 3.5, t: 0, from });
      if (L.length > 20) { const P = this.playerUnit; let k = -1, bd = -1; L.forEach((o, j) => { if (o.kept || o.h === h) return; const d = P ? Math.hypot(o.h.position.x - P.pos.x, o.h.position.z - P.pos.z) : j; if (d > bd) { bd = d; k = j; } }); if (k >= 0) this.scene.remove(L.splice(k, 1)[0].h); }
      if (h.userData.horse) { h.userData.horse.spook = 1; h.userData.horse.rear = 0.8; }
      this.play('neigh', t.pos, 0.8);
    }
    // 徒歩になった武将は武将のまま（名乗り・手柄の数えを変えない）。騎馬の兵は侍に
    const S = t.type === 'busho' ? TYPES.busho : TYPES.samurai;
    if (t.type !== 'busho') t.type = 'samurai';
    t.speed = S.speed; t.run = S.run; t.reach = Math.max(S.reach, (t.reach || 2.7) * 0.95);
    // 引いた者の側（馬の脇）へ落ちる：着く所へ置き、見た目は鞍の所から滑らせる（army_anim の u.downed）
    const rx = Math.cos(t.heading), rz = -Math.sin(t.heading);   // 乗り手の右
    const side = src && ((src.pos.x - t.pos.x) * rx + (src.pos.z - t.pos.z) * rz) < 0 ? -1 : 1;
    const k = 1.1;
    t.pos.x += rx * side * k; t.pos.z += rz * side * k;
    t.pos.y = this.world.heightAt(t.pos.x, t.pos.z);
    const dur = 2.6 + Math.random() * 0.8;
    t.downed = { t: 0, dur, side: -side, ox: -rx * side * k, oz: -rz * side * k };
    t.stagger = Math.max(t.stagger || 0, dur); t.mv.x = t.mv.z = 0;
    t.hit = null; t.lastKneelT = this.time;
    t.hp -= t.maxHp * 0.15; t.lastHitT = 0;
    if (t.hp <= 0) { t.downed = null; this.kill(t, src); return; }
    if (t.group) t.group.morale -= 3;
    this.burst(t.pos.x, t.pos.y + 0.1, t.pos.z, 8, 'dust', rx * side, rz * side);
    this.play('thud', t.pos, 0.9);
  },

  // 間合いに入った相手を打つ（当たり外れと倍率）。sw は振りの記録（当たり・甲冑・受け・空振りを書く）
  strike(u, t, near, mult = 1, sw = null) {
    const g = u.group;
    let dmg = u.dmg * (g.dmgMult ?? 1) * (0.8 + Math.random() * 0.4) * mult;
    if (u.type === 'gun' && !u.sidearm) dmg *= 0.2;  // 鉄砲足軽の白兵は弱い
    if (!g.routed && !u.fleeing && !u.dropped && !(g._reformT > this.time) && formationReady(g, this.time) && (u.wpnKind || u.lookWeapon) === 'spear' && g.formation === 'yari' && (g.order === 'yari' || g.order === 'hold')) dmg *= 1.35;
    if (t.group && formationReady(t.group, this.time) && t.group.formation === 'yari' && (t.group.order === 'hold' || t.group.order === 'yari') && !t.isStruct && !t.fleeing && !t.dropped && !(t.group._reformT > this.time) && !(t.yariOpenUntil > this.time) && !t.group.routed) dmg *= 0.75;
    if (t.group && t.group.defMult) dmg /= t.group.defMult;
    if (t.isPlayer) dmg *= 0.9;
    const kind = sw ? sw.kind : 'thrust';
    if (kind === 'butt' && (u.wpnKind || u.lookWeapon) === 'spear') dmg *= 0.65;
    // 当たる率：正面で構えている相手には当たりにくく、横や背からは当たりやすい。逃げる背・崩れた者にはよく当たる
    let pHit = 0.72;
    if (!t.isPlayer && !t.isStruct) {
      const dx = u.pos.x - t.pos.x, dz = u.pos.z - t.pos.z, dl = Math.hypot(dx, dz) || 1;
      const fw = (dx * Math.sin(t.heading) + dz * Math.cos(t.heading)) / dl;
      pHit = fw > 0.5 ? (t.guarding > 0 || t.guardFlash > 0 ? 0.5 : 0.66) : fw < -0.45 ? 0.9 : 0.82;
      if (t.fleeing || t.stagger > 0.3) pHit = Math.max(pHit, 0.9);
      if (t.group && t.group._reformT > this.time) pHit = Math.min(0.95, pHit + 0.12);
    }
    if ((kind === 'slam' && yariMatch(u, t, this.time)) || Math.random() < (t.isPlayer || t.isStruct ? 0.9 : pHit)) this.damage(t, dmg, u, { kind, out: sw });
    else if (t.isStruct) { if (sw) sw.res = 'miss'; }
    else if (!t.fleeing && (!t.dropped || t.sidearm) && !t.downed && !(t.pinT > this.time) && !(t.stagger > 0.3) && !this.behindOf(t, u) && Math.random() < 0.6) {
      // 受けられた：刃と刃・柄と柄が打ち合う
      if (sw) sw.res = 'block';
      t.guardFlash = 0.3;
      if (near) this.clashAt(u, t);
      // 受けた側は勢いに押されて半歩下がる
      if (!t.isPlayer) { const dx = t.pos.x - u.pos.x, dz = t.pos.z - u.pos.z, dl = Math.hypot(dx, dz) || 1; t.push.x += dx / dl * 1.6; t.push.z += dz / dl * 1.6; }
      // 刀どうしは時々、鍔迫り合い（0.6 秒押し合い、押し勝った方が相手を崩す）
      const sword = (o) => (o.wpnKind || o.lookWeapon) === 'sword';
      if (sword(u) && sword(t) && !t.isPlayer && !u.mounted && !t.mounted && Math.random() < 0.3) {
        u.stagger = Math.max(u.stagger || 0, 0.6); t.stagger = Math.max(t.stagger || 0, 0.6);
        u.bind = { o: t, t: 0.6 };
      }
    } else {
      // かわされた：穂先・刃は体の脇を抜ける
      if (sw) sw.res = 'miss';
      if (near) this.play('swing', u.pos, 0.5);
    }
  },
  // o が t の背の側（後ろ 110° ほど）にいるか
  behindOf(t, o) {
    const dx = o.pos.x - t.pos.x, dz = o.pos.z - t.pos.z, d = Math.hypot(dx, dz) || 1;
    return (dx * Math.sin(t.heading) + dz * Math.cos(t.heading)) / d < -0.35;
  },
  // 振り出す：技ごとの長さ（秒）と、穂先・刃が届く時（割合）
  startSwing(u, kind, t) {
    const S_ = SWING[kind] || SWING.thrust;
    u.lastMeleeKind = kind;
    u.swing = { kind, t: 0, dur: S_[0], at: S_[1], target: t, done: false, res: null, d: t ? this.distTo(u, t) : 0, charging: u.charging, side: Math.random() < 0.5 ? 1 : -1 };
    u.strikeT = 0.2;
    if (kind === 'slam') { u.slamT = S_[0]; kickSpear(u.wpn, -2.5); }
    if (kind === 'sweep') u.sweepT = S_[0];
    if (u.camD < 30) this.play(kind === 'thrust' || kind === 'tsuki' ? 'thrust' : kind === 'slam' || kind === 'butt' ? 'swing' : 'slash', u.pos, 0.45);
  },
  // 届いた時：まだ間合いにいて、前にいれば打つ。離れていれば空を切る（遠すぎる所や横の者には当たらない）
  landSwing(u, s, near) {
    const t = s.target;
    if (!t || !t.alive || t.gone || t.opened || t.team === u.team || !t.isStruct && t.noTarget && !(this.duel && this.duel.foe === t)) { s.res = 'miss'; return; }
    const d = this.distTo(u, t);
    s.d = d;
    const sword = (u.wpnKind || u.lookWeapon) === 'sword';
    const short = s.kind === 'butt' && (u.wpnKind || u.lookWeapon) === 'spear';
    const lim = short ? 1.55 : u.reach + (t.isStruct ? 0.4 : sword ? 0.15 : 0.3);
    let front = 1;
    if (!t.isStruct) { const dx = t.pos.x - u.pos.x, dz = t.pos.z - u.pos.z; front = (dx * Math.sin(u.heading) + dz * Math.cos(u.heading)) / (Math.hypot(dx, dz) || 1); }
    // 塀・柵の向こうの者には届かない
    if (d > lim || front < (s.kind === 'sweep' || s.kind === 'yoko' ? 0.2 : 0.55) || (!t.isStruct && this.wallBetween(u.pos, u.team, t.pos, s.kind === 'thrust' && (u.wpnKind || u.lookWeapon || u.weapon) === 'spear'))) { s.res = 'miss'; if (near) this.play('swing', u.pos, 0.4); this.duelOpen(u, t, s.heavy ? 1 : s.fast ? 0.8 : 0.5); return; }
    const mult = s.charging ? 1.8 : s.heavy ? 1.65 : 1;
    if (s.charging) { u.charging = false; u.chargeCd = this.time + 5; }
    const hp0 = t.hp;
    this.strike(u, t, near, mult, s);
    // 詰められた槍兵は石突きで押して間を作る。体力を削るより押し返す一手
    if (short && s.res && s.res !== 'miss' && t.alive && !t.isPlayer && !t.mounted && !t.isStruct && t.push) {
      const dx = t.pos.x - u.pos.x, dz = t.pos.z - u.pos.z, dl = Math.hypot(dx, dz) || 1;
      t.push.x += dx / dl * 2; t.push.z += dz / dl * 2;
    }
    // 一騎打ち：敵将の大振りが受けられ・外れると、体が流れて隙ができる
    if (t.alive && t.hp >= hp0) this.duelOpen(u, t, s.heavy ? 1 : s.fast ? 0.6 : 0.4);
    // 穂先が止まった勢いで柄が撓む（甲冑・受けで止まれば強く）
    if (s.res && s.res !== 'miss') kickSpear(u.wpn, s.kind === 'slam' ? 5 : s.res === 'hit' ? 1.6 : 3);
  }
};
