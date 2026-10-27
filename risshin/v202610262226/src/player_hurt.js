// Player の手のうち「体力・傷・手当て・当たりの手応え（受ける側）」（player.js から分けた。中身は同じ。Player.prototype へ戻すのは player.js の終わり）
import { bindWound } from './wounds.js';
import * as THREE from 'three';
import { ITEMS } from './state.js';
import { angleDiff, bloodLv } from './units.js';
import { POST } from './post.js';
import { sfx, deafen } from './audio.js';
import { S, DIFFICULTY, reduceMotion } from './settings.js';
import { isTouch } from './touch.js';
import { findPlayerTell } from './player.js';

export class PlayerHurt {


  get pos() { return this.u.pos; }

  spearDmg() {
    const it = ITEMS[this.G.equip.weapon];
    return 14 * it.mult * (1 + 0.1 * (this.G.stats.spear - 1));
  }

  addShake(v) { if (S.shake && !reduceMotion()) this.shake = Math.min(0.5, this.shake + v); }
  recoilPitch(v) {
    const floor = this.rt.def.recoilPitchMin ?? -Infinity;
    this.pitch = Math.max(Math.min(this.pitch, floor), this.pitch - v);
  }
  // 受け流しの間（秒）：打刀は長い。指の端末は押す遅れの分だけ少し広く
  parryWin() { return (this.weapon === 'sword' ? 0.3 : 0.22) * (isTouch ? 1.25 : 1); }

  // 打ち込みの前の知らせ：自分を狙う敵の一撃が、受け流しの間に入る少し前に、刃が光り「きん」と鳴る
  //   光ってから構えれば、ちょうど受け流しの間に入る（人の手の遅れ 0.2 秒を見込む）。一つの打ち込みに一度だけ
  updateTells(dt) {
    const u = this.u, rt = this.rt;
    const lead = this.parryWin() + 0.2;
    this.tellBest = null; this.tellLead = lead;
    rt.army.forNear(u.pos.x, u.pos.z, 4.5, findPlayerTell, this);
    const best = this.tellBest;
    const t = rt.tut || rt.tutPause?.t;
    const practice = !!rt.def.dojo && !!(t?.auto && !t.ok && t.items.find((it) => !it.done)?.id === 'c_guard');
    let s = this.tellActive || this.tellSprite();
    if (best) {
      s.visible = false;
      s = this.tellActive = this.tellSprite(practice);
      this.tellPractice = practice;
      const dx = u.pos.x - best.pos.x, dz = u.pos.z - best.pos.z, d = Math.hypot(dx, dz) || 1;
      s.position.set(best.pos.x + (practice ? 0 : dx / d * 0.55), (best.pos.y || 0) + (practice ? 2.4 : 1.5), best.pos.z + (practice ? 0 : dz / d * 0.55));
      this.tellT = practice ? lead : 0.18; s.visible = true;
      sfx('kin', 0.45);
      if ((best.atk.heavy || best.type === 'busho' || best.type === 'samurai') && !(this.tellAdviceT > rt.t)) {
        this.tellAdviceT = rt.t + 12;
        rt.bark(best.atk.heavy ? '大きく振りかぶったぞ。敵を向いて構え、味方の列へ下がれ' : '刃が光った。敵を向いて構え、槍の列を離れるな', true);
      }
    }
    if (this.tellT > 0) {
      this.tellT -= dt;
      const k = Math.max(0, this.tellT / 0.18);
      // 動きを減らす時は大きさを変えず、薄れるだけ
      const sc = this.tellPractice ? 0.7 : reduceMotion() ? 0.25 : 0.12 + Math.sin(k * Math.PI) * 0.18;
      s.scale.set(sc, sc, 1); s.material.opacity = this.tellPractice ? 1 : reduceMotion() ? k : Math.min(1, k * 2);
      if (this.tellT <= 0) s.visible = false;
    }
  }
  // 刃の光と練習の「！」は、それぞれ一枚を使い回す。
  tellSprite(practice = false) {
    const cached = practice ? this.tellCoachS : this.tellS;
    if (cached) return cached;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    if (practice) {
      g.fillStyle = '#14120f'; g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#ece4d2'; g.lineWidth = 3; g.stroke();
      g.fillStyle = '#ece4d2'; g.font = 'bold 48px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('！', 32, 34);
    } else {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,248,1)'); gr.addColorStop(0.12, 'rgba(255,238,196,0.45)'); gr.addColorStop(1, 'rgba(255,220,160,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      g.fillStyle = 'rgba(255,250,236,0.85)'; g.fillRect(2, 31, 60, 2); g.fillRect(31, 2, 2, 60);
    }
    const m = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false, depthWrite: false, blending: practice ? THREE.NormalBlending : THREE.AdditiveBlending });
    const s = new THREE.Sprite(m);
    s.visible = false; s.renderOrder = 999;
    this.rt.scene.add(s);
    if (practice) this.tellCoachS = s; else this.tellS = s;
    return s;
  }

  // 率いる組は、自分を打った敵へ助けに来る（遠すぎる組・退かせた組・ほかの敵に掛かっている組は除く）
  // 鉄砲・弓で撃たれた時も：撃った者が組から 60m の内なら、組がその射手へ駆ける（遠い射手は届かないので、伏せろと言うだけ）
  callHelp(src) {
    const u = this.u;
    if (!src || src.isStruct || !src.alive || src.team === u.team || !this.rt.squadGroups) return;
    const shotKind = this.lastHit?.t === this.rt.t ? this.lastHit.kind : null;
    const arrow = shotKind === 'arrow' || !shotKind && src.type === 'bow';
    const ranged = shotKind === 'gun' || arrow || src.type === 'gun';
    let came = false, tooFar = false;
    for (const g of this.rt.squadGroups) {
      if (!g.count || g.order === 'retreat' || g.pending || (g.focus && g.focus.alive)) continue;
      const c = g.center(); if (Math.hypot(c.x - u.pos.x, c.z - u.pos.z) > 35) continue;
      const ds = Math.hypot(src.pos.x - c.x, src.pos.z - c.z);
      if (ranged && ds > 60) { tooFar = true; continue; }
      g.order = 'attack'; g.focus = src; g.seekRange = ranged ? Math.min(70, ds + 10) : 20; came = true;
    }
    if ((this.helpBarkT ?? -99) + 8 >= this.rt.t) return;
    // 組が半分より減ると、助けに来る声も弱く、怯えている
    if (came) { this.helpBarkT = this.rt.t; const few = this.rt.squadFear && this.rt.squadFear() > 0.5; this.rt.bark(few ? `組の者「お、お助けを……いや、お助けいたす……！」` : ranged ? `組の者「お助けいたす！　あの${arrow ? '射手' : '鉄砲'}を潰せ！」` : '組の者「お助けいたす！」'); }
    else if (tooFar) { this.helpBarkT = this.rt.t; this.rt.bark(arrow ? '組の者「矢は遠くから来る！　陰へ退かれよ！」' : '組の者「鉄砲は遠い！　身を低くなされ！」'); }
  }
  // 敵の攻撃を受けたとき（受け流し・防御・回避・具足）
  meleeDamage(amount, src) {
    const rt = this.rt, u = this.u, grace = rt.def.meleeGrace;
    if (!grace || rt.D === DIFFICULTY.hard || !src || src.isStruct || src.team === u.team) return amount;
    const cap = u.maxHp * grace.burst;
    const pool = Math.min(cap, (this.meleePool ?? cap) + Math.max(0, rt.t - (this.meleePoolAt ?? rt.t)) * u.maxHp * grace.rate);
    const taken = Math.min(amount, pool);
    this.meleePool = pool - taken; this.meleePoolAt = rt.t;
    if (taken > 0) this.meleeGraceUntil = rt.t + grace.interval;
    return taken;
  }
  takeDamage(amount, src) {
    if (!Number.isFinite(amount) || amount <= 0) { this.u.hitKind = null; this.u.hitHorse = false; return 0; }
    // 決着の後（各戦が invuln を立てる）は、操作できない終わりの演出の間に追手の槍で倒れない。
    if (this.u.invuln) { this.u.hitKind = null; this.u.hitHorse = false; return 0; }
    // 合図のない最初の一撃は通さず、逃げる向きを先に知らせる。馬にも同じ猶予を使う。
    if (this.rt.t < (this.rt.def.openingSafe || 0) || src?.playerOpeningBlocked) {
      this.u.hitKind = null; this.u.hitHorse = false; return 0;
    }
    if (this.rt.def.attackWarningDelay && src?.pos && !src.isStruct && src.team !== this.u.team) {
      if (src.attackWarnAt == null || this.rt.t - (src.attackWarnLast ?? -99) > 8) {
        src.attackWarnAt = this.rt.t; src.attackWarnLast = this.rt.t;
        this.rt.hud.damageFrom(Math.atan2(src.pos.x - this.u.pos.x, src.pos.z - this.u.pos.z) - this.yaw);
        this.rt.bark(this.u.hitKind === 'arrow' ? '矢が来る！　印の向きの物陰へ退け' : this.u.hitKind === 'gun' ? '鉄砲だ！　印の向きに気をつけよ' : '敵が迫る！　印の向きを向いて構えよ', true);
      }
      if (this.rt.t - src.attackWarnAt < this.rt.def.attackWarningDelay) { this.u.hitKind = null; this.u.hitHorse = false; return 0; }
    }
    const missile = this.u.hitKind === 'gun' || this.u.hitKind === 'arrow';
    // 重なった槍でよろめき続けない。矢玉・火傷は別の危険として残す。
    if (!missile && this.rt.def.meleeGrace && this.rt.D !== DIFFICULTY.hard && src && !src.isStruct && src.team !== this.u.team && this.meleeGraceUntil > this.rt.t) {
      this.u.hitKind = null; this.u.hitHorse = false; return 0;
    }
    if (this.u.hitHorse && this.mounted) {
      const gun = this.u.hitKind === 'gun'; this.u.hitHorse = false; this.u.hitKind = null;
      this.horseHurt(this.horseMax * Math.min(1.2, Math.max(0, amount) / 34 * (gun ? 0.8 : 0.4)));
      return 0;
    }
    if (this.rt.def.softOpen && this.rt.t < this.rt.def.softOpen) amount *= 0.5;
    const u = this.u;
    // 矢玉も早戻りの前に記録する。倒れた原因と受けた向きを近接攻撃で上書きしない。
    if (src && !src.isStruct && src.pos) {
      const dx = u.hitIncoming ? -u.hitIncoming.x : src.pos.x - u.pos.x, dz = u.hitIncoming ? -u.hitIncoming.z : src.pos.z - u.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const dot = (dx * Math.sin(u.heading) + dz * Math.cos(u.heading)) / d;
      this.rt.hud.damageFrom(Math.atan2(dx, dz) - this.yaw, amount);
      const hit = this.lastHit || (this.lastHit = {});
      hit.source = src; hit.x = src.pos.x; hit.y = src.pos.y; hit.z = src.pos.z;
      hit.kind = u.hitKind; hit.type = src.type; hit.name = src.name || null; hit.mounted = !!src.mounted;
      hit.weapon = src.wpnKind || src.lookWeapon || src.weapon; hit.mobbed = !!u.mobbed;
      hit.blocked = false; hit.amount = 0;
      hit.guard = this.guard; hit.guardBroken = this.guardBroken > 0; hit.exhausted = this.sta <= 0;
      hit.back = dot < -0.35; hit.side = Math.abs(dot) <= 0.35; hit.ranged = missile; hit.t = this.rt.t;
      // 被弾時だけ記録する。走る馬と、実際に近くにいる味方の槍の位置を残す。
      hit.charging = !!(src.charging || src.swing?.charging);
      hit.speed = Math.hypot(src.mv?.x || 0, src.mv?.z || 0);
      hit.chargeSeconds = hit.charging ? Math.max(0, this.rt.army.time - (src.chargeT ?? this.rt.army.time)) : 0;
      hit.spearDistance = -1; hit.spearBehind = false;
      // 馬で先行した距離は被弾時だけ調べる。攻撃してきた敵の側を前とする。
      hit.allyLeadDistance = null;
      if (this.mounted && !missile) {
        let front = -Infinity;
        for (const o of this.rt.army.units) {
          if (o.isPlayer || !o.alive || o.team !== u.team || o.fleeing || o.woundOut || o.gone || o.noTarget || o.civ || o.group?.routed) continue;
          const ax = o.pos.x - u.pos.x, az = o.pos.z - u.pos.z;
          if (ax * ax + az * az > 10000 || Math.abs(ax * dz - az * dx) / d > 12) continue;
          front = Math.max(front, (ax * dx + az * dz) / d);
        }
        if (Number.isFinite(front)) hit.allyLeadDistance = Math.max(0, -front);
      }
      if (hit.mounted || src.type === 'cavalry') for (const g of this.rt.army.groups) {
        if (g.team !== u.team || g.routed || g.formation !== 'yari') continue;
        for (const o of g.units) {
          if (!o.alive || o.fleeing || o.woundOut || o.noTarget || (o.wpnKind || o.lookWeapon) !== 'spear') continue;
          const sx = o.pos.x - u.pos.x, sz = o.pos.z - u.pos.z, sd = Math.hypot(sx, sz);
          if (sd > 12 || (hit.spearDistance >= 0 && sd >= hit.spearDistance)) continue;
          hit.spearDistance = sd; hit.spearBehind = sx * dx + sz * dz < 0;
        }
      }
    }
    // 甲冑で止めた矢弾は浅い打撲だけ。知らせと傷の記録は通常と同じ経路を通す。
    if (u.hitArmor) { u.hitKind = null; this.inCombatT = 4; this.feelHit(amount, src); return amount; }
    // 鉄砲の弾：構えでは受けられず、一発で体力の大半を持っていかれる。しばらくよろめき、足が重くなる（出血）
    const arrowHit = u.hitKind === 'arrow';
    const gunHit = u.hitKind === 'gun'; u.hitKind = null;
    if (gunHit) { this.callHelp(src); return this.takeBullet(amount, src); }
    if (arrowHit) {
      this.callHelp(src);
      const taken = amount * (1 - this.def * 0.2);
      if (taken > 0 && this.rt.world.def.waterSlow && this.rt.world.waterFootDepthAt(u.pos.x, u.pos.z, u.pos.y) > 0.15) this.staggerT = Math.max(this.staggerT || 0, 1);
      this.inCombatT = 4; this.feelHit(taken, src);
      return taken;
    }
    const hud = this.rt.hud;
    if (src && !src.isStruct) {
      const dx = src.pos.x - u.pos.x, dz = src.pos.z - u.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const dot = (dx * Math.sin(u.heading) + dz * Math.cos(u.heading)) / d;
      this.callHelp(src);
      if (dot < -0.35 && Math.random() < 0.35 && (this.backWarnT ?? -99) + 10 < this.rt.t) { this.backWarnT = this.rt.t; this.rt.bark('後ろだ！', true); }
      const rearFirst = src.rearParryUntil > this.rt.army.time;
      if (this.guard && this.sta > 0 && (dot > 0.25 || rearFirst)) {
        // 構えた直後なら受け流し（相手の体勢を崩し、反撃の好機）。打刀は猶予が長い
        // 囲まれている時（u.mobbed）は、受け流しの間が半分・構えの減りが倍（四方からの槍に受けが追いつかない）
        const win = rearFirst ? 0.6 : this.parryWin() * (u.mobbed ? 0.7 : 1);
        if (this.guardT < win) {
          this.rt.stats.parries++;
          this.rt.tutMark('parry');
          // 見切り：打ち込みの寸前に構える。槍は短い止めで弾き、すぐ反撃へ戻す
          const perfect = this.guardT < win * 0.45;
          if (this.weapon === 'spear') u.yariParryUntil = this.rt.army.time + 0.3;
          // 既存の火花と材質に合う音を使う。弾かれた姿勢はこの下で見切りの強さに合わせる。
          this.rt.army.clashAt(src, u);
          sfx('parry', perfect ? 1.15 : 1);
          // 受け流しの手応え：刃が弾き合う一瞬の止めと小さな揺れ、視野がわずかに開く
          this.rt.game.hitstop = Math.min(0.06, Math.max(this.rt.game.hitstop || 0, this.weapon === 'spear' ? (perfect ? 0.05 : 0.035) : perfect ? 0.16 : 0.07));
          this.addShake(perfect ? 0.13 : 0.09);
          if (!reduceMotion() && S.shake) this.fovKick = perfect ? 2.6 : 1.8;
          // 別の敵がすぐ差し込まず、受け流した一手を打ち返せる間を作る。
          this.rt.army.playerCounterUntil = this.rt.army.time + 0.75;
          src.stagger = perfect ? 1.6 : 1.1; src.atk = null; src.swing = null; src.cd = perfect ? 1.8 : 1.3;
          src.hit = { kind: 'side', t: 0, dur: perfect ? 0.85 : 0.6, side: this.weapon === 'spear' ? 1 : -1, amp: perfect ? 1.4 : 1, heavy: perfect, res: 'block' };
          src.slipT = 0.3;
          if (!src.mounted && src.push) {
            const kick = perfect ? 1.7 : 1.2;
            src.push.x += dx / d * 0.5 - dz / d * kick;
            src.push.z += dz / d * 0.5 + dx / d * kick;
          }
          this.counterT = perfect ? 1.8 : 1.3;
          this.counterPerfect = perfect;
          this.rt.game.slowmo = this.weapon === 'spear' ? (perfect ? 0.18 : 0.1) : perfect ? 0.6 : 0.35;
          this.sta = Math.min(this.maxSta, this.sta + (perfect ? 18 : 10));
          hud.flash(perfect ? '見切り' : '受け流し', 'gold');
          this.rt.hint('counter');
          return 0;
        }
        this.sta -= amount * 1.3 * (u.mobbed ? 1.5 : 1);
        src.cd = Math.max(src.cd || 0, 0.9);
        src.playerMeleeUntil = Math.max(src.playerMeleeUntil || 0, this.rt.army.time + 0.9);
        this.staDelay = 0.8;
        this.rt.stats.blocks++;
        if (this.lastHit?.t === this.rt.t) this.lastHit.blocked = true;
        sfx('block', 1);
        if (this.weapon === 'spear') {
          sfx('wood', 0.35);
          this.rt.game.hitstop = Math.min(0.06, Math.max(this.rt.game.hitstop || 0, 0.025));
        }
        if (this.rt.game.haptic) this.rt.game.haptic('block', Math.min(1, amount / 30));
        hud.hurt(0.1);
        this.addShake(0.05);
        if (this.sta <= 0) {
          this.sta = 0; this.guardBroken = 1.1;
          hud.flash('気力が尽き、構えが崩れた', 'red');
          if (this.lastHit?.t === this.rt.t) this.lastHit.guardBroken = true;
        } else if (!(this.blockNoticeT > this.rt.t)) {
          this.blockNoticeT = this.rt.t + 8;
          hud.flash('正面を受けた。浅い傷と気力の減り', 'dim');
        }
        return this.meleeDamage(amount * 0.12, src);
      }
    }
    this.inCombatT = 4;
    // ---- 一撃の重さ：侍・武将・騎馬・背後からの一撃ほど重い（傷も手応えも） ----
    const rt = this.rt;
    const back = !!(this.lastHit && this.lastHit.back && this.lastHit.t === rt.t);
    const cav = !!(src && !src.isStruct && (src.mounted || src.type === 'cavalry'));
    let mult = !src || src.isStruct ? 1 : cav ? 1.4 : src.type === 'busho' ? 1.35 : src.type === 'samurai' ? 1.2 : 1;
    // 背からの一撃は重い。囲まれている時はなお重い（逃げ場のない背を突かれる）
    if (back) mult *= this.u.mobbed ? 1.3 : 1.15;
    mult = Math.min(this.u.mobbed ? 1.5 : 1.35, mult);
    // def.foeHit：戦ごとの敵の打ち込みの重さ（楽すぎる戦を締める。無ければ 1）
    // 初陣から森部の槍組へは段階を踏む。三人の槍を浴び続ければ深手になる。
    const stage = rt.army.combatStage || 0;
    const novice = rt.firstBattle && rt.D === DIFFICULTY.normal && !rt.G.lord && (rt.G.rank || 0) === 0;
    const learning = rt.def.learningFight && rt.D === DIFFICULTY.normal && !rt.G.lord && (rt.G.rank || 0) <= 1;
    const weight = rt.def.dojo || novice ? 0.72 : rt.firstBattle ? 0.95 : learning ? 1 : (1.65 + stage * 0.55) * (1 + 0.2 * (rt.army.tier || 0));
    let taken = amount * mult * (1 - this.def) * this.D.taken * (rt.def.foeHit || 1) * weight;
    // def.playerTaken：その戦だけ自分の受ける傷を軽く（稲生は六割。テストプレイの声 10/24「序盤で厳しい」）
    if (rt.def.playerTaken) taken *= rt.def.playerTaken;
    // 一秒内の四本目以降だけ少し緩める。記録の入れ物を毎回作り直さない。
    const hits = this.recentHits, now = rt.t;
    while (hits.length && now - hits[0] >= 1) hits.shift();
    if (!rt.def.strictHits && hits.length >= 3 && rt.D !== DIFFICULTY.hard) taken *= u.mobbed ? 0.9 : 0.8;
    hits.push(now);
    // 一撃で体力の四割を超えて削らない（見えない所からの一撃死をなくす。背後からはさらに三割まで）
    if (src && !src.isStruct) taken = Math.min(taken, u.maxHp * (back ? 0.3 : 0.35));
    // 侍・武将の重い一撃のあと二秒余りは、次の重い一撃を一割強までにする（続けての突きで前触れなく三割を削らない）。
    if (src && (src.type === 'samurai' || src.type === 'busho')) {
      if (now - (this.heavyHitT ?? -99) < 2.2) taken = Math.min(taken, u.maxHp * 0.12);
      else if (taken >= u.maxHp * 0.15) this.heavyHitT = now;
    }
    // 矢玉を含む連続被害の上限は、部位の倍率の後で軍勢の共通処理が確かめる。
    taken = this.meleeDamage(taken, src);
    if (!(taken > 0)) return 0;
    this.feelHit(taken, src, { back, cav });
    // 馬上では、傷の一部を馬が受ける
    if (this.mounted) { this.horseHurt(taken * 0.5); taken *= 0.65; }
    return taken;
  }

  // 弾を食らった：部位と威力で深手を決める。よろめき・構えが崩れ、深手で足が重くなる
  takeBullet(amount, src) {
    const u = this.u, rt = this.rt;
    this.inCombatT = 4;
    // 弾の重さと部位で深手を決める。最終的な傷は共通処理で一発三割五分まで。
    const k = Math.max(0.2, Math.min(1.8, amount / 34));
    const part = u.hitPart;
    const severity = part === 'head' || part === 'neck' ? 1.2 : part === 'torso' ? 0.8 : 0.4;
    let taken = Math.min(u.maxHp * 0.35, u.maxHp * severity * k * (1 - this.def * 0.2));
    // 有岡の出陣直後だけ、部位による最大一・四倍を含めて一発を四割までにする。
    // 続けて当たっても二割を残し、味方の後ろへ退けるようにする。
    if (rt.t < (rt.def.openingGunGrace || 0)) taken = Math.min(taken, u.maxHp * 0.4 / 1.4, Math.max(0, u.hp - u.maxHp * 0.2) / 1.4);
    if (this.lastHit) this.lastHit.ranged = true;
    if (rt.world.def.waterSlow && rt.world.waterFootDepthAt(u.pos.x, u.pos.z, u.pos.y) > 0.15) this.knockT = Math.max(this.knockT || 0, 1);
    this.gunHurtT = 8;
    this.staggerT = Math.max(this.staggerT || 0, 1.1); this.knockT = Math.max(this.knockT || 0, 0.5);
    this.guardBroken = Math.max(this.guardBroken || 0, 1.0);
    // 鉄砲に当たった時は特に重く：耳が強く遠のいて耳鳴りが残り、視界の端が暗くすぼまる（動きを減らす設定では暗みだけ弱く）
    deafen(0.95);
    POST.dark = Math.max(POST.dark || 0, reduceMotion() ? 0.5 : 1);
    this.addShake(0.2);
    this.feelHit(Math.max(taken, 30), src, { back: false, cav: false });
    rt.hud.flash('撃たれた', 'red');
    return taken;
  }

  // 打たれた時の手応え：一瞬の止め・よろめき・画面・音・振動。重い一撃（侍・武将・騎馬・背後）ほど強い
  feelHit(taken, src, o = {}) {
    const rt = this.rt, hud = rt.hud, u = this.u;
    const w = Math.max(0.25, Math.min(1, taken / 22 + (o.cav ? 0.35 : 0) + (o.back ? 0.15 : 0)));
    const heavy = w > 0.6;
    const calm = reduceMotion();
    // ① 一瞬の止め（0.06〜0.1 秒）
    rt.game.hitstop = Math.min(0.06, Math.max(rt.game.hitstop || 0, 0.05 + 0.05 * w));
    // ② よろめき：打たれた向きへ体が押される。槍の突きは半歩下がり、刀の斬りは体がねじれ、騎馬の突きは倒される
    let dx = 0, dz = 0;
    if (src && !src.isStruct && src.pos) { dx = u.hitIncoming ? u.hitIncoming.x : u.pos.x - src.pos.x; dz = u.hitIncoming ? u.hitIncoming.z : u.pos.z - src.pos.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d; }
    const kind = src && !src.isStruct ? ((src.swing && src.swing.kind) || (src.atk && src.atk.kind) || 'thrust') : 'thrust';
    // 実際に傷を受けた時だけ、打たれた向きへ短く押される。揺れを切れば出さない。
    if (!calm && S.shake && (dx || dz)) {
      const k = 0.06 + 0.08 * w;
      this.camPush = { x: dx * k, z: dz * k, t: 0.18 };
    }
    if (!this.mounted) {
      if (o.cav) {
        this.vel.x += dx * 7; this.vel.z += dz * 7;
        this.staggerT = Math.max(this.staggerT || 0, 1.2); this.knockT = 1.2;
        this.guardBroken = Math.max(this.guardBroken, 1.2);
      } else if (/kesa|gyaku|yoko|sweep|slash/.test(kind)) {
        this.vel.x += dx * 2; this.vel.z += dz * 2;
        if (!calm) this.twist = (Math.random() < 0.5 ? -1 : 1) * (0.1 + 0.12 * w);
        this.staggerT = Math.max(this.staggerT || 0, 0.35 + 0.3 * w);
      } else {
        this.vel.x += dx * (2.6 + 2.4 * w); this.vel.z += dz * (2.6 + 2.4 * w);
        this.staggerT = Math.max(this.staggerT || 0, 0.3 + 0.3 * w);
      }
    }
    if (this.knockT > 0 || this.staggerT > 0.5) this.cancelAttack();
    // ③ 画面：縁が赤く脈打ち、一瞬白く飛び、視野がすぼまり、カメラが強く揺れて戻る
    hud.hurt(0.3 + 0.6 * w);
    this.addShake(0.1 + 0.32 * w);
    // 血の霧：打たれた所（胸の高さ）にふっと赤い霧が立つ。設定の blood（on／low／off）に従う
    // （体の陰に隠れないよう、カメラの側へ 0.6m、横へ少しずらして置く）
    { const lv = bloodLv(); if (lv && rt.world.bloodMist) {
      const c = rt.camera ? rt.camera.position : u.pos, cx = c.x - u.pos.x, cz = c.z - u.pos.z, cl = Math.hypot(cx, cz) || 1, sd = (Math.random() - 0.5) * 0.6;
      rt.world.bloodMist(u.pos.x + cx / cl * 0.6 - cz / cl * sd, u.pos.y + 1.3, u.pos.z + cz / cl * 0.6 + cx / cl * sd, (lv === 2 ? 1 : 0.5) * (0.6 + 0.4 * w));
    } }
    if (heavy) POST.dark = Math.max(POST.dark || 0, 0.45 * w);
    this.fovKick = calm || !S.shake ? 0 : -(2.5 + 5 * w);
    // 白く飛ぶのは一瞬だけ：続けて打たれても重ねない（乱戦で画面が白いままにならないように）
    if (!calm && heavy && (POST.exp || 1) < 1.15 && !(this.flashT > rt.t)) { this.flashT = rt.t + 1.5; POST.exp = (POST.exp || 1) + 0.15 + 0.2 * w; }
    // ④ 音：鈍い打撃・具足の鳴り・自分のうめき・重い時は耳鳴り
    sfx('hit', 0.8 + 0.7 * w); sfx(heavy ? 'yoroi' : 'kozane', 0.5 + 0.5 * w);
    if (heavy || Math.random() < 0.5) sfx('umeki', 0.4 + 0.5 * w);
    if (heavy) deafen(0.25 + 0.45 * w);
    // ⑤ 振動（ゲームパッド・スマホ）
    rt.game.vibrate(0.35 + 0.65 * w, Math.round(80 + 170 * w));
    // 話す場面（brief）の最中は手ほどきを出さない。実戦で打たれた時へ寄せる
    if (rt.phase !== 'brief') {
      if (this.lastHit && this.lastHit.ranged && this.lastHit.t === rt.t) {
        if (!(this.missileHintT > rt.t)) {
          this.missileHintT = rt.t + 8;
          rt.bark(this.lastHit.type === 'bow' ? '矢が当たった！　構えでは防げない。塀や屋敷の陰へ退け' : '鉄砲で撃たれた！　構えでは防げない。塀や屋敷の陰へ退け', true);
        }
      } else if (this.lastHit && this.lastHit.t === rt.t && !(this.meleeHintT > rt.t)) {
        this.meleeHintT = rt.t + 8;
        const hit = this.lastHit;
        const who = hit.name || (hit.mounted ? '騎馬の敵' : hit.type === 'busho' ? '敵の武将' : hit.type === 'samurai' ? '敵の侍' : '敵の兵');
        const why = hit.back ? 'に後ろから打たれた。敵に向き直って構えよ' : hit.side ? 'に横から打たれた。敵に向き直って構えよ' :
          hit.exhausted || hit.guardBroken ? 'に打たれた。気力を戻すため、味方の後ろへ退け' : 'に打たれた。味方と肩を並べ、囲まれる前に下がれ';
        rt.bark(who + why, true);
      } else rt.hint('guard');
    }
  }

  // 倒れた札へ渡す最後の傷。向きは本人の体を基準にする。
  downCause(maxAge = 6) {
    const h = this.lastHit;
    if (!h || this.rt.t - h.t >= maxAge) return '';
    if (h.kind === 'fall') return '高い所から落ちて傷を負った。';
    if (h.kind === 'fire') return '広間の火で傷を負った。控えの間へ退け。';
    const from = h.back ? '後ろ' : h.side ? '横' : '正面';
    const weapon = h.kind === 'gun' ? '鉄砲' : h.kind === 'arrow' ? '矢' : h.weapon === 'sword' ? '刀' : h.weapon === 'spear' ? '槍' : '打ち込み';
    const cav = h.mounted || h.type === 'cavalry';
    const horse = cav && !h.ranged ? `${h.charging ? '駆け込む騎馬' : '馬上の敵'}の一撃。${h.charging ? `助走は約${h.chargeSeconds.toFixed(1)}秒。` : ''}${h.spearDistance < 0 ? '十二歩以内に味方の槍の列はいなかった。' : `味方の槍の列まで約${Math.ceil(h.spearDistance)}歩。${h.spearBehind ? '列より敵側へ出ていた。' : '列のそばでも、敵へ向いて受ける必要がある。'}`}` : '';
    return `${from}から${weapon}を受けた。${horse}${h.blocked ? '構えで受けたが、傷が重なった。' : !h.ranged && (h.guardBroken || h.exhausted) ? '気力が足りず、構えで受けられなかった。' : ''}${h.mobbed ? '敵に囲まれていた。' : ''}`;
  }

  treatmentSafe() {
    const u = this.u, rt = this.rt;
    if (!u.alive || rt.over || this.mounted || u.climb || rt.flags?.carry || u.lastHitT <= 6 || this.inCombatT > 0 ||
      this.pending || u.pAtk || u.swing || this.shot || this.aiming || this.draw > 0 || this.chargeT > 0 ||
      this.dodgeT > 0 || u.stagger > 0 || this.staggerT > 0 || this.knockT > 0 || Math.hypot(u.vel.x, u.vel.z) >= 0.3) return false;
    return this.treatmentShelter(u.pos);
  }

  // 行き先の印も、実際の手当てと同じ敵・護衛・壁の条件で確かめる。
  treatmentShelter(pos) {
    const u = this.u, rt = this.rt;
    // 霧や夜で見えない敵も、すぐそばなら手当てを妨げる。配列を読むだけで近傍用の入れ物を作らない。
    let foe = null, nearest = 45 * 45;
    for (const o of rt.army.units) {
      if (!o.alive || o.team === u.team || o.fleeing || o.civ || o.noTarget || o.isStruct || o.type === 'dummy' || o.type === 'porter') continue;
      const dx = o.pos.x - pos.x, dz = o.pos.z - pos.z, d = dx * dx + dz * dz;
      // 判定を変え得る敵だけ壁を調べる。遠い兵まで毎回調べない。
      if (d >= nearest || Math.abs(o.pos.y - pos.y) > 3 || rt.army.wallBetween(pos, -1, o.pos)) continue;
      if (d < 8 * 8) return false;
      if (d < nearest) { nearest = d; foe = o; }
    }
    // 後方で、戦える味方が敵との間に立っていること。人足・敗走・深手の者は護衛に数えない。
    for (const o of rt.army.units) {
      if (o === u || !o.alive || o.team !== u.team || o.fleeing || o.civ || o.noTarget || o.farSim || o.woundOut ||
        o.type === 'dummy' || o.type === 'porter' || o.group?.routed || o.stagger > 0 || o.hp < o.maxHp * 0.35) continue;
      const dx = o.pos.x - pos.x, dz = o.pos.z - pos.z;
      if (dx * dx + dz * dz >= 36 || Math.abs(o.pos.y - pos.y) > 2.5 ||
          o.rearWound || o.downed || o.group?.hidden || rt.army.wallBetween(pos, -1, o.pos)) continue;
      if (!foe || dx * (foe.pos.x - pos.x) + dz * (foe.pos.z - pos.z) > 0) return true;
    }
    return false;
  }

  treatWounds(fraction = 0.05, ceiling = 1) {
    const u = this.u;
    if (!Number.isFinite(fraction) || fraction <= 0 || !Number.isFinite(ceiling) || ceiling <= 0 || ceiling > 1) return false;
    if (this.treatmentLeft <= 0 || this.treatmentNext > this.rt.t ||
        u.hp >= u.maxHp * ceiling && !(u.wounds?.bleed > 0.0001) || !this.treatmentSafe()) return false;
    this.treatmentLeft--;
    this.bandaged = true;
    this.treatmentNext = this.rt.t + 45;
    bindWound(u);
    if (u.wounds) u.wounds.bleed = 0;
    // 二枚の布で一度に一割五分まで持ち直す。骨と矢の傷は残る。
    u.hp = Math.max(u.hp, Math.min(u.maxHp * ceiling, u.hp + u.maxHp * Math.min(0.15, fraction)));
    return true;
  }

  updateTreatment(dt) {
    const rt = this.rt, u = this.u;
    this.treating = this.treatmentReady = false;
    if (!u.alive || rt.over || rt.def.town || rt.def.dojo) { this.treatmentNearFlag = false; return; }
    // def.playerRegen：戦っていない間（四秒当たらず、自分も打っていない）はゆっくり戻る（稲生。1秒に最大の命のこの割合）
    if (rt.def.playerRegen && u.lastHitT > 4 && !(this.inCombatT > 0) && u.hp < u.maxHp)
      u.hp = Math.min(u.maxHp, u.hp + u.maxHp * rt.def.playerRegen * dt);
    this.treatmentCheckT -= dt;
    if (this.treatmentCheckT <= 0) {
      this.treatmentCheckT = 0.2;
      const cue = rt.hud.retreatGuide;
      const guide = rt.missionGuide;
      const flag = cue?.active && cue.valid ? cue : guide?.marker?.guideArea === 'retreat' ? guide.pos : null;
      const radius = Math.max(3, flag && flag === cue ? cue.radius : guide?.marker?.guideRadius || 3);
      const point = this.treatmentPoint;
      if (flag) { point.x = flag.x; point.z = flag.z; point.y = flag.y ?? rt.world.heightAt(flag.x, flag.z); }
      this.treatmentNearFlag = !!flag && Math.hypot(flag.x - u.pos.x, flag.z - u.pos.z) < radius &&
        Math.abs(point.y - u.pos.y) < 2.5 &&
        !rt.army.wallBetween(u.pos, -1, point);
      if (this.treatmentNearFlag) for (const foe of rt.army.units) {
        if (!foe.alive || foe.team === u.team || foe.fleeing || foe.civ || foe.noTarget || foe.isStruct ||
            foe.type === 'dummy' || foe.type === 'porter') continue;
        if (Math.abs(foe.pos.y - u.pos.y) < 3 && Math.hypot(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z) < 8 &&
            !rt.army.wallBetween(u.pos, -1, foe.pos)) { this.treatmentNearFlag = false; break; }
      }
    }
    if (!this.treatmentNearFlag || u.lastHitT <= 6 || this.inCombatT > 0 || u.climb || rt.flags?.carry ||
        this.pending || u.pAtk || u.swing || this.shot || this.aiming || this.draw > 0 || this.chargeT > 0 ||
        u.stagger > 0 || this.staggerT > 0 || this.knockT > 0) return;
    if (u.wounds?.bleed > 0.0001) { bindWound(u); u.wounds.bleed = 0; this.bandaged = true; }
    u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.025 * dt);
  }

  // 供：すぐ後ろ（二間ほど）について歩き、主に斬りかかる敵を先に迎え撃つ。
  updateTomo(dt) {
    const g = this.rt.tomoGroup, u = this.u;
    if (!g || !g.count) return;
    const back = 2.4;
    const want = { x: u.pos.x - Math.sin(u.heading) * back, z: u.pos.z - Math.cos(u.heading) * back };
    g.anchor.x += (want.x - g.anchor.x) * Math.min(1, dt * 3);
    g.anchor.z += (want.z - g.anchor.z) * Math.min(1, dt * 3);
    g.facing += angleDiff(g.facing, u.heading) * Math.min(1, dt * 2);
    this.tomoT = (this.tomoT || 0) - dt;
    if (this.tomoT > 0) return;
    this.tomoT = 0.4;
    // 主に斬りかかっている敵がいれば、その者を狙う
    if (!g.focus || !g.focus.alive) {
      const foe = this.rt.army.nearestEnemy(u, 6, (o) => o.target === u);
      g.focus = foe || null;
    }

  }
}
