// Player の手のうち「狙い・武器の持ち替え・鉄砲と弓・振りの跡」（player.js から分けた。中身は同じ。Player.prototype へ戻すのは player.js の終わり）
import { rangedSupply, renewGunPowder } from './weapon_reality.js';
import { weatherSees } from './weather_gameplay.js';
import * as THREE from 'three';
import { angleDiff, weaponMesh, RIDE } from './units.js';
import { WIND_STATE } from './world.js';
import { sfx, deafen } from './audio.js';
import { S, reduceMotion } from './settings.js';
import { isTouch } from './touch.js';
import { TRAIL_N, TRAIL_MAT, _tA, _tB, findInterveningAlly, GUN_RELOAD } from './player.js';

export class PlayerRanged {

  // 手傷を負わせた武将：知らせと戦功（+20「〇〇に手傷」）。戦の定義に onGeneralWounded があれば呼ぶ
  generalWounded(g, src) {
    const rt = this.rt, name = g.name || '敵の将';
    if (this.lock === g) { this.lock = null; this.wheelAcc = 0; }
    if (this.aimed === g) this.aimed = null;
    // 個々の手傷は短い知らせにする。任務の大見出しを待たせない。
    rt.bark(`${name}、手傷を負って退いた！`, g.team === this.u.team);
    const tr = rt.tracker;
    // 味方の負傷や、ほかの隊の一撃を本人の戦功に数えない。
    if (tr && g.team !== this.u.team && src?.team === this.u.team && (src.isPlayer || src.isSub)) {
      // 戦功の行に「敵武将に手傷」を足す（state.js の MeritTracker に行が無いので、この戦の tracker にだけ足す）
      if (!tr.wounds) {
        tr.wounds = [];
        const base = tr.lines.bind(tr);
        tr.lines = () => { const L = base(); for (const w of tr.wounds) L.push({ label: '敵武将に手傷', detail: w, pts: 20, cat: '武', big: true }); return L; };
      }
      rt.award((t) => t.wounds.push(name), `${name}に手傷`, g.pos);
    }
    if (rt.def && rt.def.onGeneralWounded) rt.def.onGeneralWounded(rt, g);
  }

  lockVisible(o) {
    const army = this.rt.army;
    return weatherSees(this.rt.world, this.u.pos, o.pos) && !army.hiddenBehind(this.u, o) &&
      !army.wallBetween(this.u.pos, this.u.team, o.pos) && !army.terrainBlocks(this.u.pos, o.pos);
  }

  // 自分と相手の間に味方が立っているか（乱戦で味方越しに斬りかからない）
  allyBetween(o) {
    const u = this.u, dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.8) return false;
    const fx = dx / d, fz = dz / d;
    this.allyBetweenHit = false; this.allyBetweenX = fx; this.allyBetweenZ = fz; this.allyBetweenDistance = d;
    this.rt.army.forNear((u.pos.x + o.pos.x) / 2, (u.pos.z + o.pos.z) / 2, d / 2 + 0.6, findInterveningAlly, this);
    return this.allyBetweenHit;
  }
  // 当て寄せの相手：近い順のうち、間に味方のいない者（照準の相手が入っていればそれを先に）
  assistPick(list) {
    const want = this.lock || this.aimed;
    if (want) for (const h of list) if (h.u === want && !this.allyBetween(h.u)) return h.u;
    for (const h of list) if (!this.allyBetween(h.u)) return h.u;
    return null;
  }

  // 狙い定めの相手を左右の隣の相手へ


  // 中断した押し込みは、指を放した攻撃として出さない。
  cancelAttack() {
    if (this.swingImpact) this.u.swing = null;
    this.swingImpact = null; this.assistImpact = null; this.bowHold = 0;
    this.pending = null; this.buffer = 0; this.chargeT = 0; this.charging = false; this.chargeCue = false;
    this.lunge = null; this.assist = null; this.u.pAtk = null; this.pressGrd = false;
    this.stickTo = null; this.stickT = 0;
    this.rangedIdle();
  }

  switchWeapon(w) {
    if (w === this.weapon || !this.weaponList().includes(w)) return;
    if (this.shot?.pan) { this.rt.hud.flash('火皿に火が移った。放ってから持ち替える', 'dim'); return; }
    const oldWeapon = this.weapon;
    const u = this.u;
    this.cancelAttack();
    this.combo = this.kCombo = this.comboT = 0;
    this.guardOn = this.guard = this.aiming = u.guard = false; this.guardOffT = -9; this.bowTrigger = this.bowPressed = false;
    this.cd = Math.max(this.cd, w === 'gun' || w === 'bow' ? 0.6 : 0.35);  // 持ち替えの隙
    u.hand.remove(u.wpn);
    u.wpn = { sword: this.swordMesh, gun: this.gunMesh, bow: this.bowMesh }[w] || this.spearMesh;
    u.hand.add(u.wpn);
    u.wpnKind = w;
    this.weapon = w;
    this.aimT = 0; this.aimed = this.lock || this.aimEnemy(14);
    if (this.gunReload > 0 && !this.gunLoaded && (w === 'gun' || oldWeapon === 'gun')) this.rt.hud.flash('鉄砲は弾込めの途中。持ち直すと自動で続ける', 'dim');
    this.reachT = 2;   // 足もとに間合いの輪を 2 秒（battle.js updateSquadAids）
    // 持ち替えの音：刀は鞘走り（しゃっ）、ほかは柄と具足の擦れる音。画面の音（ui）は鳴らさない
    sfx(w === 'sword' ? 'saya' : 'kozane', w === 'sword' ? 0.8 : 0.7);
    const teachW = !this.rt.teachOn || this.rt.teachOn();
    if (!teachW) { if (w === 'gun' || w === 'bow') this.rt.hud.flash(w === 'gun' ? '鉄砲に持ち替えた' : '弓に持ち替えた', 'dim'); }
    else if (w === 'gun') this.rt.hud.flash(isTouch ? '攻撃の釦を一度押して撃つ' : '左押しを一度押して撃つ', 'dim');
    else if (w === 'bow') this.rt.hud.flash('弓　攻撃を一度押すと射る', 'dim');
  }
  // 持っている武器の並び（持ち替えの順）
  weaponList() {
    const mask = (this.hasKatana ? 1 : 0) | (this.hasGun ? 2 : 0) | (this.hasBow ? 4 : 0);
    if (!this.weapons || this.weaponMask !== mask) {
      this.weaponMask = mask; this.weapons = ['spear'];
      if (this.hasKatana) this.weapons.push('sword');
      if (this.hasGun) this.weapons.push('gun');
      if (this.hasBow) this.weapons.push('bow');
    }
    return this.weapons;
  }

  // ---------------- 敵の鉄砲を拾う ----------------
  // 討たれた鉄砲足軽（または脇差を抜いて鉄砲を置いた者）の鉄砲が、2.4m 内にあれば拾える
  findGunPickup() {
    const rt = this.rt, army = rt.army, p = this.u.pos;
    let best = null, bd = 2.4;
    const look = (o) => {
      if (Math.abs(o.pos.y - p.y) > 2) return;
      if (o.type !== 'gun' || o.team === this.u.team || o.gunTaken || (this.hasGun && this.gunAmmo == null)) return;
      const w = o.alive ? (o.sidearm ? o.dropped : null) : (o.dropped || (o.wpnKind !== 'sword' ? o.wpn : null));
      if (!w || !w.parent) return;
      const d = Math.hypot(o.pos.x - p.x, o.pos.z - p.z);
      if (d < bd) { bd = d; best = o; }
    };
    for (const o of army.dead || []) look(o);
    for (const o of army.units) if (o.alive && o.sidearm) look(o);
    if (best === this.pickSrc) return;
    rt.uninteract('pickgun');
    this.pickSrc = best;
    if (best) rt.addInteract('pickgun', { x: best.pos.x, z: best.pos.z }, this.hasGun ? '鉄砲の弾と火薬を拾う' : '鉄砲を拾う', () => this.pickGun(best), { r: 2.6 });
  }
  pickGun(o) {
    const rt = this.rt;
    if (!o || o.gunTaken || this.mounted || this.u.climb || !this.u.alive || rt.over ||
        Math.hypot(o.pos.x - this.u.pos.x, o.pos.z - this.u.pos.z) > 2.6 ||
        Math.abs(o.pos.y - this.u.pos.y) > 2) return;
    o.gunTaken = true;
    const w = o.dropped && o.dropped.parent ? o.dropped : o.wpn;
    if (w && w.parent) w.parent.remove(w);
    if (o.dropped === w) o.dropped = null;
    rt.uninteract('pickgun'); this.pickSrc = null;
    sfx('kozane', 0.8);
    if (!this.hasGun) {
      // 拾った鉄砲は、この戦の間だけ使える。弾は込めてある一発と、胴乱の残り二発
      this.hasGun = true; this.gunPicked = true;
      this.gunMesh = weaponMesh('gun');
      this.u.gunRainCover = !!this.gunMesh.userData.rainCover;
      this.u.gunCordWet = o.gunCordWet || 0; this.u.gunPanWet = o.gunPanWet || 0; this.u.gunPowderWet = o.gunPowderWet || 0;
      this.gunLoaded = true; this.gunReload = 0; this.gunAmmo = 2;
      this.switchWeapon('gun');
      rt.hud.flash(`敵の鉄砲を拾った（込めてある一発と、弾 2）　${isTouch ? '持ち替えの丸で槍に戻せる' : '槍の持ち替え操作で戻せる'}`, 'gold');
    } else {
      if (this.gunAmmo != null) this.gunAmmo += 3;
      rt.hud.flash(this.gunAmmo != null ? `弾と火薬を拾った（弾 ${this.gunAmmo}）` : '弾と火薬を拾った', 'dim');
    }
  }

  // ---------------- 火縄銃・弓 ----------------
  // 飛び道具を手にしていない時：引きかけ・切りかけをやめ、札を隠す（弾込めは火縄銃を手にしている間だけ進む）
  rangedIdle() {
    const u = this.u;
    this.bowHold = 0; this.bowTrigger = false;
    this.aimK = 0; this.aimHoldT = 0; this.gunTrigger = false; this.gunRelease = false;
    if (!this.shot?.pan) this.shot = null;
    this.draw = 0;
    if (u.atk && (u.atk.ranged || u.atk.bow)) u.atk = null;
    if (u.reload) u.reload = null;
    const el = this.hasGun || this.hasBow ? document.getElementById('rangedui') : null;
    if (el && !el.hidden) el.hidden = true;
  }
  // 照準の先の敵（狙うほど細い円錐で探す）
  aimRanged(cone, maxD, nearestEnemy = false) {
    const cam = this.rt.camera;
    const dir = this._arDir || (this._arDir = new THREE.Vector3()); cam.getWorldDirection(dir);
    const v = this._arV || (this._arV = new THREE.Vector3());
    let best = null, bs = Infinity;
    for (const o of this.rt.army.units) {
      // 味方（team 0）は狙えないが、乗っている馬だけは別（自分の馬・味方の馬も撃つ・射ると討てるように。kaito 10/1）
      if (!o.alive || (o.team === 0 && !(o.mounted && o.horse && !o.isPlayer && !o.invuln)) || o.woundOut || o.type === 'dummy') continue;
      if (nearestEnemy && (o.team === this.u.team || o.fleeing || o.gone || o.civ)) continue;
      if (!weatherSees(this.rt.world, this.u.pos, o.pos)) continue;
      v.set(o.pos.x - cam.position.x, o.pos.y + (o.mounted ? 2.0 : 1.2) - cam.position.y, o.pos.z - cam.position.z);
      const d = v.length();
      if (d < 0.001 || d > maxD) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, v.dot(dir) / d)));
      // 近い敵ほど的の幅を広く取り、同じくらいの角なら近い方を選ぶ（近い敵に合わせやすく）。指の端末は少し広く
      const score = nearestEnemy ? d : ang + d * 0.0035;
      if (ang < (cone + 0.9 / d) * (isTouch ? 1.35 : 1) && score < bs) { bs = score; best = o; }
    }
    return best;
  }
  // 当てる的が無い時の見せかけの的（照準の先の地面）
  groundTarget() {
    const cam = this.rt.camera, v = this.rangedDir, t = this.rangedGround;
    cam.getWorldDirection(v);
    t.pos.x = cam.position.x + v.x * 70; t.pos.z = cam.position.z + v.z * 70;
    t.pos.y = this.rt.world.heightAt(t.pos.x, t.pos.z);
    return t;
  }
  rangedUpdate(dt, input) {
    const u = this.u, rt = this.rt, army = rt.army;
    u.gunAmmo = this.gunAmmo; u.arrowAmmo = this.bowAmmo;
    if (rangedSupply(army, u, army.time)) {
      this.gunAmmo = u.gunAmmo; this.bowAmmo = u.arrowAmmo;
      rt.hud.flash(this.weapon === 'gun' ? '中間から弾と火薬を受け取った' : '中間から矢を受け取った', 'dim');
    }
    this.aimHoldT = this.aiming && (this.weapon !== 'gun' || this.gunLoaded) ? this.aimHoldT + dt : 0;
    this.aimK += ((this.aiming ? 1 : 0) - this.aimK) * Math.min(1, dt * 8);
    // 照準の吸い付き：鉄砲・弓を構えている間、照準の近くの敵へ向きをゆっくり寄せる（強くは引かない。自分で外せば離れる）
    if (Math.abs(input.dx) + Math.abs(input.dy) > 1) { this.stickOffUntil = rt.t + 1.5; this.stickTo = null; }
    if (S.aimAssist !== false && !(this.stickOffUntil > rt.t) && this.aiming && (this.weapon === 'gun' || this.weapon === 'bow') && u.alive) {
      this.stickT = (this.stickT || 0) - dt;
      if (this.stickT <= 0) { this.stickT = 0.15; this.stickTo = this.aimRanged(isTouch && this.weapon === 'gun' ? 0.16 : 0.07, this.weapon === 'gun' ? 70 : 45, this.weapon === 'gun'); }
      const o = this.stickTo;
      if (o && o.alive && !o.woundOut && !o.fleeing && weatherSees(rt.world, u.pos, o.pos)) {
        const want = Math.atan2(o.pos.x - u.pos.x, o.pos.z - u.pos.z), df = angleDiff(this.yaw, want);
        if (Math.abs(df) < 0.25) {
          const k = Math.min(1, dt * (isTouch ? 3.2 : 2));
          this.yaw += df * k;
          if (isTouch && this.weapon === 'gun') {
            const cam = rt.camera, v = this.rangedDir;
            cam.getWorldDirection(v);
            const wantPitch = Math.atan2(o.pos.y + (o.mounted ? 2.0 : 1.2) - cam.position.y, Math.hypot(o.pos.x - cam.position.x, o.pos.z - cam.position.z));
            const viewPitch = Math.atan2(v.y, Math.hypot(v.x, v.z));
            this.pitch = Math.max(-0.5, Math.min(0.55, this.pitch + (wantPitch - viewPitch) * k));
          }
        }
      }
    } else this.stickTo = null;
    if (this.weapon === 'gun') {
      // 放った後は自動で込める。押し続けていても進め、込め終えたら構える。
      // 買った鉄砲も拾った鉄砲も、携えた弾と火薬だけ使える
      if (!this.gunLoaded && !this.shot && this.gunAmmo === 0) {
        u.reload = null;
        if (!(this.noAmmoT > rt.t)) { this.noAmmoT = rt.t + 8; rt.hud.flash(`弾が尽きた。倒れた鉄砲足軽から拾うか、${isTouch ? '持ち替えの丸' : '1'}で槍に戻せ`, 'dim'); }
      } else if (!this.gunLoaded && !this.shot) {
        const sp = Math.hypot(u.vel.x, u.vel.z);
        const r0 = this.gunReload;
        const sv = this.mounted ? Math.abs(this.hspd) : sp;
        if (sv < 3.5 && !(this.knockT > 0) && !(this.staggerT > 0)) this.gunReload += dt / (GUN_RELOAD * (sv > 0.6 ? 1.6 : 1));
        this.reloadPose.t = this.gunReload * GUN_RELOAD; u.reload = this.gunReload > r0 ? this.reloadPose : null;
        // 込めの手順の音：火薬を注ぐ・弾を落とす・込め矢で突き固める（とん、とん）・口薬を盛って火蓋を閉じる
        if (r0 < 0.12 && this.gunReload >= 0.12) sfx('hizara', 0.5);
        if (r0 < 0.25 && this.gunReload >= 0.25) sfx('tick', 0.8);
        if (r0 < 0.4 && this.gunReload >= 0.4) sfx('knock', 0.18);
        if (r0 < 0.5 && this.gunReload >= 0.5) sfx('knock', 0.18);
        if (r0 < 0.6 && this.gunReload >= 0.6) sfx('knock', 0.18);
        if (r0 < 0.72 && this.gunReload >= 0.72) sfx('hizara', 0.4);
        if (this.gunReload >= 1) { renewGunPowder(u); this.gunLoaded = true; this.gunReload = 0; u.reload = null; if (this.gunAmmo != null) this.gunAmmo--; if (input.left) this.aiming = true; sfx('click', 0.8); rt.hud.flash(this.gunAmmo != null ? `込め終えた（残りの弾 ${this.gunAmmo}）` : '込め終えた', 'dim'); }
      }
      // 構えている間は頬付けの姿（poseGun の「aim」）
      if (this.shot) {
        this.shot.t -= dt;
        const a = this.rangedPose; a.ranged = true; a.bow = false; a.t = this.shot.t; a.dur = this.shot.dur; a.target = this.groundTarget(); u.atk = a;
        // 引き金を落とすと、火挟みの火縄が火皿の口薬に落ちて先に光り（しゅっ）、一呼吸おいて筒の薬に移って放たれる
        if (this.shot.t <= 0.09 && !this.shot.pan) { this.shot.pan = true; rt.army.panFlash(u, true); }
        if (this.shot.t <= 0) { const aimed = this.shot.aimed, pan = this.shot.pan, held = this.shot.held; this.shot = null; u.atk = null; this.fireShot(aimed || this.aiming, pan, held); }
      } else if (this.aiming && this.gunLoaded) {
        const a = this.rangedPose; a.ranged = true; a.bow = false; a.dur = 2; a.t = 2 - Math.min(1, this.aimHoldT); a.target = this.groundTarget(); u.atk = a;
      }
      else if (u.atk && u.atk.ranged) u.atk = null;
      // 押したコマだけの短押しも受け取り、最短の構えを済ませてから一発だけ放つ。
      if (!this.shot && this.gunLoaded && (input.left || input.leftPressed)) { this.gunTrigger = true; if (input.left) this.gunRelease = false; }
      if (this.gunTrigger && !input.left) { this.gunTrigger = false; this.gunRelease = true; }
      if (this.gunRelease && this.gunLoaded && this.aimHoldT >= 0.2 && this.cd <= 0 && !this.shot) {
        this.gunRelease = false;
        const dur = 0.3;
        this.shot = { t: dur, dur: dur + 1.0, aimed: true, held: this.aimHoldT, target: null };
        this.inCombatT = 3;
        // 火蓋を切る音（かちり）。火皿の口薬が光るのは放つ直前
        sfx('click', 0.55);
      }
    } else {
      // 弓は押した一回を受け取り、引き絞ったら一本放つ。
      if ((input.leftPressed || input.left && !this.bowPressed) && this.cd <= 0 && this.bowAmmo > 0) this.bowTrigger = true;
      this.bowPressed = !!input.left;
      u.relT = Math.max(0, (u.relT || 0) - dt);
      if (input.left && this.bowAmmo <= 0) {
        this.draw = 0; this.bowHold = 0; this.bowTrigger = false; u.atk = null;
        if (!(this.noArrowT > rt.t)) { this.noArrowT = rt.t + 8; rt.hud.flash('矢が尽きた。槍に持ち替える', 'dim'); }
      } else if (this.bowTrigger && this.cd <= 0) {
        this.draw = Math.min(2.2, this.draw + dt);
        this.bowHold = this.draw >= 2 ? (this.bowHold || 0) + dt : 0;
        if (this.draw >= 2) {
          this.sta = Math.max(0, this.sta - (4 + Math.min(8, this.bowHold)) * dt); this.staDelay = 0.4;
          if (this.sta <= 0) {
            this.draw = 0; this.bowHold = 0; this.bowTrigger = false; u.atk = null; this.cd = 0.5;
            if (!(this.bowTiredUntil > rt.t)) { this.bowTiredUntil = rt.t + 8; rt.hud.flash('腕が疲れた。弓を緩めて休む', 'dim'); }
          }
        }
        // 番える・打ち起こす・引き分けるまで二秒ほどかける
        const e = Math.min(2.2, this.draw);
        if (this.draw > 0) { const a = this.rangedPose; a.bow = true; a.ranged = false; a.t = 10 - e; a.dur = 10; a.target = this.groundTarget(); u.atk = a; }
        this.inCombatT = 3;
      }
      if (this.bowTrigger && this.draw >= 2) {
        this.bowTrigger = false;
        this.draw = 0; u.atk = null;
        this.looseArrow();
        this.bowHold = 0; this.cd = 0.5;
      }
    }
    this.updateRangedUi();
  }
  // 技の名を初めて出した時だけ、小さく知らせる（押し方の覚え書き）
  techNote(k) {
    // 自動で選ぶ技に、追加の入力説明を出さない。
  }

  // 狙いの先（照準の向き）に、壊せる敵の門・柵・逆茂木・竹束があれば返す（生きた敵がいない時だけ調べる）
  aimStruct(maxD) {
    const cam = this.rt.camera, u = this.u;
    const dir = this._asDir || (this._asDir = new THREE.Vector3()); cam.getWorldDirection(dir);
    const v = this._asV || (this._asV = new THREE.Vector3());
    let best = null, bs = Infinity;
    for (const st of this.rt.army.structs) {
      if (!st.alive || st.team === u.team || (st.maxHp || 0) > 1e8) continue;
      const p = st.seg ? { x: (st.seg[0] + st.seg[2]) / 2, z: (st.seg[1] + st.seg[3]) / 2 } : { x: st.x, z: st.z };
      const y = this.rt.world.heightAt(p.x, p.z) + 1.2;
      v.set(p.x - cam.position.x, y - cam.position.y, p.z - cam.position.z);
      const d = v.length();
      if (d < 0.001 || d > maxD) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, v.dot(dir) / d)));
      if (ang < 0.05 + 1.6 / d && ang < bs) { bs = ang; best = st; }
    }
    return best;
  }
  // 肩越しの照準と筒先・矢の出所のずれを合わせる。落ちと風はここでは補わない。
  rangedVelocity(t, speed) {
    const u = this.u, cam = this.rt.camera, v = this.rangedDir;
    const gun = this.weapon === 'gun', f = gun ? 1.3 : 0.6, r = gun ? 0.1 : -0.12;
    const sx = u.pos.x + Math.sin(this.yaw) * f + Math.cos(this.yaw) * r;
    const sz = u.pos.z + Math.cos(this.yaw) * f - Math.sin(this.yaw) * r;
    const sy = u.pos.y + (u.mounted ? RIDE.y : 0) + (gun ? 1.46 : 1.5);
    const d = Math.max(3, Math.hypot(t.pos.x - cam.position.x, t.pos.y + 1.2 - cam.position.y, t.pos.z - cam.position.z));
    cam.getWorldDirection(v).multiplyScalar(d).add(cam.position);
    v.x -= sx; v.y -= sy; v.z -= sz;
    return v.normalize().multiplyScalar(speed);
  }
  // 火縄銃を放つ：狙う相手は照準の先（構えて狙えば細く正確に、腰だめでは外れやすい）
  fireShot(aimed, panDone = false, held = 0) {
    const u = this.u, rt = this.rt, army = rt.army;
    if (!u.alive || rt.over || !this.gunLoaded || (!panDone && (u.climb || this.knockT > 0 || rt.flags?.carry))) return;
    u.heading = this.yaw;
    const t = this.aimRanged(aimed ? 0.055 : 0.13, 70);
    const tgt = t && (aimed || Math.random() < 0.7) ? t : this.groundTarget();
    const d0 = u.dmg;
    u.dmg = 42; // 的の身分で弾の威力を変えない。
    if (!panDone) army.panFlash(u, true);
    this.rangedVelocity(tgt, 160);
    const steady = aimed ? Math.min(1, Math.max(this.aimHoldT, held) / 1.2) : 0;
    const wound = 1 - u.hp / u.maxHp;
    const scatter = (0.004 + (1 - steady) * 0.012) * (1 + wound * 0.8 + (rt.world.rainLevel || 0) * 0.4 + (this.gunHurtT > 0 ? 0.8 : 0));
    this.rangedDir.x += (Math.random() - 0.5) * 160 * scatter; this.rangedDir.y += (Math.random() - 0.5) * 160 * scatter; this.rangedDir.normalize().multiplyScalar(160);
    const ok = army.fireGun(u, tgt, this.rangedDir);
    u.dmg = d0;
    if (!ok) {
      if (!(this.misfireTipT > rt.t)) { this.misfireTipT = rt.t + 8; rt.hud.flash(army.lastGun?.reason === 'muzzle' ? '筒先が塞がっている。壁から離れる' : army.lastGun?.reason === 'wet' ? '火縄や火薬が湿った。雨を避けて込め直す' : '放てなかった。構えと射線を確かめる', 'red'); }
      if (army.lastGun?.reason !== 'muzzle') { this.gunLoaded = false; this.gunReload = 0; } this.cd = 0.8; return;
    }
    this.gunLoaded = false; this.gunReload = 0;
    this.cd = 0.8;
    // 当たり外れをはっきり知らせる：当たれば照準に印と手応えの音、倒せば「討ち取った」
    this.addShake(0.22);
    deafen(0.3);   // 頬のそばの火薬の破裂で、耳が少し遠くなる
    this.pitch = Math.min(0.55, this.pitch + (reduceMotion() ? 0 : 0.035));   // 反動で筒先が跳ねる
    rt.game.vibrate(0.7, 140);
  }
  gunResult(L) {
    const rt = this.rt;
    if (rt.over || !this.u.alive) return;
    const victim = L.victim;
    if (victim && (L.res === 'hit' || L.res === 'armor')) {
      rt.hud.hitMarker(); sfx('hit', 0.9);
      rt.hud.flash(L.armor ? '鎧で弾かれた' : victim.alive ? (victim.name ? `${victim.name}に命中` : '命中') : (victim.name ? `${victim.name}を撃ち倒した` : '撃ち倒した'), victim.alive ? 'dim' : 'gold');
    } else rt.hud.flash(L.blocked ? '弾は遮られた' : '外れた', 'dim');
  }
  // 矢を射る
  looseArrow() {
    const u = this.u, rt = this.rt, army = rt.army;
    if (!u.alive || rt.over || u.climb || this.knockT > 0 || rt.flags?.carry) return;
    u.heading = this.yaw;
    const t = this.aimRanged(this.aiming ? 0.05 : 0.1, 45) || this.groundTarget();
    const d0 = u.dmg;
    if (this.bowAmmo <= 0) { if (!(this.noArrowT > rt.t)) { this.noArrowT = rt.t + 8; rt.hud.flash('矢が尽きた。槍に持ち替える', 'dim'); } return; }
    this.bowAmmo--;
    u.dmg = 24; // 的の身分で矢の威力を変えない。
    this.rangedVelocity(t, 36);
    const fatigue = Math.max(0, (this.bowHold || 0) - 3), spread = Math.min(0.05, fatigue * 0.003 + Math.max(0, 0.3 - this.sta / this.maxSta) * 0.04);
    if (spread > 0) { this.rangedDir.x += (Math.random() - 0.5) * 36 * spread; this.rangedDir.y += (Math.random() - 0.5) * 36 * spread; this.rangedDir.normalize().multiplyScalar(36); }
    if (!army.hooks.onPlayerArrow) army.hooks.onPlayerArrow = (victim, result) => {
      if (!this.u.alive || this.rt.over) return;
      if (result === 'hit' || result === 'armor') {
        this.rt.hud.hitMarker();
        this.rt.hud.flash(result === 'armor' ? '矢は鎧で弾かれた' : victim?.alive ? '矢が命中した' : '矢で倒れたようだ', victim?.alive || result === 'armor' ? 'dim' : 'gold');
      } else if (result === 'cover') this.rt.hud.flash('矢は遮られた', 'dim');
    };
    if (!army.shoot(u, t, this.rangedDir)) rt.hud.flash('矢の出所が塞がっている。壁から離れる', 'dim');
    u.dmg = d0;
    u.relT = 0.55;
    this.addShake(0.04);
    // 弓の手応え：弦が返る音と、弓手が押し返されてわずかに左へ振れる（鉄砲の重い反動とは違う軽い離れ）
    if (!reduceMotion()) { this.yaw += 0.01; this.pitch = Math.min(0.55, this.pitch + 0.008); }
  }
  // 照門（一人称で構えた時）と、弾込め・引きの様子の小さな札。戦の後は battle.js の dispose が消す
  updateRangedUi() {
    let el = document.getElementById('rangedui');
    if (!el) {
      el = document.createElement('div');
      el.id = 'rangedui';
      el.setAttribute('aria-live', 'off');
      el.innerHTML = `<style>
        #rangedui { position: fixed; inset: 0; pointer-events: none; z-index: 12; }
        #rangedui .st { position: absolute; left: 50%; bottom: calc(150px + env(safe-area-inset-bottom)); transform: translateX(-50%); padding: 6px 14px; min-height: 32px; box-sizing: border-box;
          background: rgba(20,18,15,.82); color: #ece4d2; border: 1px solid rgba(236,228,210,.2); border-radius: 4px; font-size: 14px; letter-spacing: .06em; white-space: normal; width: max-content; max-width: calc(100vw - env(safe-area-inset-left) - env(safe-area-inset-right) - 32px); line-height: 1.6; display: flex; gap: 10px; align-items: center; }
        #rangedui .st i { display: inline-block; width: 90px; flex-shrink: 0; height: 6px; background: #2c2821; position: relative; }
        #rangedui .st i[hidden] { display: none; }
        #rangedui .st i b { position: absolute; inset: 0; right: auto; background: #c2a25a; }
        @media (max-height: 500px) { #rangedui .st { bottom: calc(84px + env(safe-area-inset-bottom)); font-size: 13px; } }
        #rangedui .flight { position: absolute; left: 50%; bottom: calc(128px + env(safe-area-inset-bottom)); transform: translateX(-50%); padding: 2px 8px; font-size: 12px; color: #ece4d2; background: rgba(20,18,15,.82); max-width: 44vw; text-align: center; line-height: 1.4; }
        @media (max-height: 500px) { #rangedui .flight { bottom: calc(62px + env(safe-area-inset-bottom)); } }
        #rangedui .sight { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 260px; height: 160px; }
      </style><div class="sight" hidden><svg viewBox="0 0 260 160" width="260" height="160" aria-hidden="true">
        <path d="M0 96 H108 V78 Q130 92 152 78 V96 H260 V160 H0 Z" fill="rgba(18,14,10,.92)"/>
        <path d="M108 78 Q130 92 152 78" stroke="#6a5436" stroke-width="2" fill="none"/>
        <rect x="127" y="58" width="6" height="26" fill="#1a1510"/><circle cx="130" cy="58" r="3.4" fill="#3a2c1c"/>
      </svg></div><div class="st" aria-live="off"><span class="label"></span><i aria-hidden="true"><b></b></i></div><div class="flight" hidden></div><span class="spoken" role="status" aria-live="polite" style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)"></span>`;
      document.body.appendChild(el);
      el._sight = el.querySelector('.sight');
      el._st = el.querySelector('.st');
      el._label = el.querySelector('.label'); el._bar = el.querySelector('.st i'); el._fill = el.querySelector('.st i b'); el._spoken = el.querySelector('.spoken');
      el._flight = el.querySelector('.flight');
    }
    const on = this.weapon === 'gun' || this.weapon === 'bow';
    // 一時停止・上空視点（rts.js）の上には残さない（rts.js の import は循環するので b._rts.on を直に見る。touch.js の touchFrame と同じやり方）
    el.hidden = !on || !this.u.alive || this.rt.over || (this.rt.game && (this.rt.game.paused || this.rt.game.photo || this.rt.game.helpOpen || this.rt.game.deployment || this.rt.game.hud?.introWaiting)) || !!(this.rt._rts && this.rt._rts.on);
    if (el.hidden) return;
    const sight = el._sight;
    sight.hidden = !(this.weapon === 'gun' && this.aiming && this.fpK > 0.6);
    const st = el._st;
    const fire = isTouch ? '攻撃の釦' : '左押し';
    const progress = Math.round((this.weapon === 'gun' ? this.gunReload : Math.min(1, this.draw / 2)) * 100);
    el._bar.hidden = this.weapon === 'gun' ? this.gunLoaded || this.gunAmmo === 0 : this.draw <= 0 || this.bowAmmo <= 0;
    if (el._progress !== progress) { el._fill.style.width = progress + '%'; el._progress = progress; }
    let txt;
    if (this.weapon === 'gun') {
      if (this.gunLoaded && (this.u.gunCordWet > 0.3 || this.u.gunPowderWet > 0.3)) txt = '火縄や火薬が湿っている。雨を避けて扱う';
      else if (this.gunLoaded) txt = this.shot ? '火蓋を切る…' : this.aiming
        ? (this.aimHoldT < 0.8 ? '鉄砲　構えている…' : `鉄砲　${fire}を離して撃つ`)
        : `${fire}を押し続けて狙い、離して撃つ`;
      else if (this.gunAmmo === 0) txt = '弾がない。倒れた鉄砲足軽から拾う';
      else {
        const f = this.gunReload, sp = Math.hypot(this.u.vel.x, this.u.vel.z);
        const step = f < 0.06 ? '筒を立てる' : f < 0.22 ? '火薬を注ぐ' : f < 0.32 ? '弾を入れる' : f < 0.66 ? '込め矢で固める' : f < 0.88 ? '口薬を盛る' : '火縄を合わせる';
        const wait = this.mounted && Math.abs(this.hspd) >= 3.5 ? '馬を緩めて込める' : this.knockT > 0 || this.staggerT > 0 ? '体勢を戻して込める' : !this.mounted && sp >= 3.5 ? '歩みを緩めて込める' : `あと${Math.ceil((1 - f) * GUN_RELOAD)}秒`;
        txt = `弾込め中　${step}　${wait}`;
      }
      if (this.gunLoaded && this.gunAmmo != null) txt += `（弾 ${this.gunAmmo + 1}）`;
    } else txt = this.bowAmmo <= 0 ? '矢が尽きた。槍に持ち替える' : this.draw > 0
      ? (this.draw < 0.6 ? '弓　矢を番える' : progress < 100 ? '弓　引き絞る' : this.bowHold > 3 ? '弓　射る' : '弓　射る')
      : '弓　攻撃を一度押すと射る';
    if (this.weapon === 'bow' && this.bowAmmo > 0) txt += `（矢 ${this.bowAmmo}）`;
    if (st._t !== txt) {
      el._label.textContent = txt; st._t = txt;
      const spoken = txt.replace(/あと\d+秒/g, '').replace(/（(?:弾|矢) \d+）/g, '').trim();
      if (el._spoken.textContent !== spoken) el._spoken.textContent = spoken;
    }
    const hint = el._flight;
    hint.hidden = !(this.aiming || this.draw > 0) || (this.weapon === 'gun' && !this.gunLoaded);
    if (!hint.hidden) {
      const side = WIND_STATE.dirX * Math.cos(this.yaw) - WIND_STATE.dirZ * Math.sin(this.yaw);
      const strength = Math.abs(side) * WIND_STATE.gust;
      const wind = strength < 0.2 ? '横風は弱い' : `${strength < 0.7 ? '弱い' : strength < 1.3 ? 'やや強い' : '強い'}横風 ${side > 0 ? '右へ →' : '← 左へ'}`;
      if (!(this.flightAt > this.rt.t)) { this.flightAt = this.rt.t + 0.2; this.flightTarget = this.aimRanged(0.06, this.weapon === 'gun' ? 100 : 60); }
      const target = this.stickTo || (this.flightTarget?.alive ? this.flightTarget : null);
      const distance = target ? Math.hypot(target.pos.x - this.u.pos.x, target.pos.z - this.u.pos.z) : 0;
      const flight = this.weapon === 'bow' ? distance > 25 ? '遠い的は上を狙う。矢は落ちる' : '矢は風下へ流れる' : distance > 50 ? '遠い的は少し上を狙う。弾も散る' : '弾は近い的をよく狙う';
      const assist = S.aimAssist === false ? '手で狙う' : '照準の補助あり';
      const msg = `${wind}　${flight}　${assist}`;
      if (hint.textContent !== msg) hint.textContent = msg;
    }
  }

  // 刃の軌跡：振りの中ほどだけ、刃先の通った跡を薄い帯で短く残す（一本の帯を使い回す。毎コマ new しない）
  //   刃先と、そこから手元へ寄った点の二つを一組にして、古い組ほど暗く（足し合わせの光なので暗い＝透ける）
  trailTick(dt) {
    if (this.rt.def.hideWeaponTrail) {
      if (this.trail) { this.trail.mesh.visible = false; this.trail.n = 0; }
      return;
    }
    const u = this.u, w = u.wpn;
    let T = this.trail;
    if (!T) {
      const N = TRAIL_N, g = new THREE.BufferGeometry();
      const pos = new Float32Array(N * 6), col = new Float32Array(N * 6), idx = [];
      for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
      g.setIndex(idx);
      const mesh = new THREE.Mesh(g, TRAIL_MAT);
      mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.visible = false;
      this.rt.scene.add(mesh);
      T = this.trail = { mesh, pos, col, age: new Float32Array(N).fill(9), n: 0 };
    }
    const sw = u.swing, blade = this.weapon === 'spear' || this.weapon === 'sword';
    const on = blade && w && w.parent && u.alive && sw && sw.t > sw.dur * 0.18 && sw.t < sw.dur * 0.72 && sw.kind !== 'butt';
    for (let i = 0; i < TRAIL_N; i++) T.age[i] += dt;
    if (on) {
      // 組をひとつ後ろへずらし、先頭に今の刃先を入れる
      T.pos.copyWithin(6, 0, (TRAIL_N - 1) * 6); T.age.copyWithin(1, 0, TRAIL_N - 1);
      const spear = this.weapon === 'spear', tip = spear ? (w.userData.tip || 2.2) : 0.8;
      const narrow = this.rt.world.def.battleKey === 'shigisan' || this.rt.def.narrowWeaponTrail;
      _tA.set(0, spear ? 0 : 0.07, tip); _tB.set(0, spear ? 0 : 0.03, tip - (narrow ? 0.04 : spear ? 0.12 : 0.1));
      w.updateWorldMatrix(true, false); w.localToWorld(_tA); w.localToWorld(_tB);
      // 技の切り替えや武器の持ち替えで離れた二点を結ばない。
      // 古い刃先へ長い白い板を張らず、今の振りから帯を作り直す。
      if (T.age[0] > 0.06 || (_tA.x - T.pos[6]) ** 2 + (_tA.y - T.pos[7]) ** 2 + (_tA.z - T.pos[8]) ** 2 > 2.25) T.n = 0;
      T.pos[0] = _tA.x; T.pos[1] = _tA.y; T.pos[2] = _tA.z; T.pos[3] = _tB.x; T.pos[4] = _tB.y; T.pos[5] = _tB.z;
      if (!T.n) for (let i = 1; i < TRAIL_N; i++) { T.pos.copyWithin(i * 6, 0, 6); T.age[i] = 9; }
      T.age[0] = 0; T.n = TRAIL_N;
    } else if (!T.n) return;
    // 突きは一筋の光に見えるので薄く、薙ぎ・斬りははっきり
    const narrow = this.rt.world.def.battleKey === 'shigisan' || this.rt.def.narrowWeaponTrail;
    const k0 = (sw && (sw.kind === 'thrust' || sw.kind === 'tsuki') ? 0.32 : 0.6) * (this.fpK > 0.5 ? 0.6 : 1) * (narrow ? 0.3 : 1);
    let live = false;
    for (let i = 0; i < TRAIL_N; i++) {
      const f = Math.max(0, 1 - T.age[i] / (narrow ? 0.045 : 0.085)) * (1 - i / TRAIL_N) * k0;
      if (f > 0) live = true;
      const o = i * 6;
      T.col[o] = 0.78 * f; T.col[o + 1] = 0.82 * f; T.col[o + 2] = 0.86 * f;
      T.col[o + 3] = 0.08 * f; T.col[o + 4] = 0.09 * f; T.col[o + 5] = 0.1 * f;
    }
    if (!live) { T.n = 0; T.mesh.visible = false; return; }
    T.mesh.visible = true;
    const G = T.mesh.geometry;
    G.attributes.position.needsUpdate = true; G.attributes.color.needsUpdate = true;
  }
}
