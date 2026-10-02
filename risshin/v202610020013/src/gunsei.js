// 一軍の頭（gunsei.js）：docs/battle-system-plan.md 第1段・docs/battle-system-spec.md 6〜9・13・14・15・16・62・65 章（束4・束5）
// makeGunsei(rt, { team, sonae, honjin, taisho })。gunseiTick(rt, dt) を戦の定義の update から毎コマ呼ぶ（中は 0.5 秒ごとに回す）。
// 束4：士気の上下（knows で知っている事だけ）・連鎖崩壊（隣が崩れると側面が露出）・敗走兵の押し・負け（6割潰走 or 本陣崩れ）。
// 束5：後詰（崩れた場へ denrei.sendOrder）・本陣危機（旗本前へ→後詰→下げる→退く）・追撃（緩い陣形・伏兵のくじ）・lineRestored。
// 総大将の扱い（討死・退却・捕縛・本陣放棄）は taisho.js の def.taisho.b.fate。
import { logEvent } from './senkyo.js';
import { knows, spread, sendOrder, setRunnerSpeed } from './denrei.js';
import { sonaeById } from './sonae.js';

const TICK = 0.5;
const ROUTED_FRAC = 0.6;      // 備の 6 割が潰走で負け
const TAISHO_NEAR_R = 60;     // 総大将が近いと見なす距離
const TAISHO_NEAR_SEC = 10;   // この秒ごとに +3
const PUSH_CAP = 10;          // 敗走兵の押し：一つの潰走で士気 -10 まで
const NEWS_STALE = 90;        // 知らせを待ちきれず諦める秒
const GOTSUME_HOLD = 60;      // 後詰：最初のこの秒は出さない
const GOTSUME_NEAR = 35;      // 後詰が「着いた」と見なす距離（LINE_HOLD_R と同じ、備一つ分くらい）
const GOTSUME_BONUS = 15;     // 後詰の到着で味方へ +15
const HONJIN_DANGER_R = 60;   // 本陣危機：敵がこの内に入ったら
const HONJIN_FRONT_SEC = 8;   // 旗本を前へ→この秒で次（後詰）
const HONJIN_STEP_SEC = 15;   // 後詰待ち→下げる、下げる→退くを繰り返す、の間
const HONJIN_FALL_DIST = 40;  // 本陣を下げる距離
const HONJIN_SLOW_MUL = 0.6;  // 下げる間の使番の足
const HONJIN_SLOW_SEC = 20;   // 使番が遅くなる秒
const PURSUIT_FRAC = 0.5;     // 敵の備の過半が潰走したら追撃
const PURSUIT_FAR = 60;       // これを越えて追うと、くじの対象
const PURSUIT_AMBUSH_SEC = 10;// くじを引く間隔
const PURSUIT_AMBUSH_P = 0.10;// 伏兵・反撃のくじ
const PURSUIT_STOP_SEC = 40;  // 追撃は 40 秒で止めて集める
const LINE_RESTORE_SEC = 20;  // 崩れた場をこの秒持てば lineRestored
const LINE_HOLD_R = 35;       // 崩れた場を「持っている」と見なす広さ（備一つ分くらい）

class Gunsei {
  constructor(rt, o) {
    this.rt = rt;
    this.team = o.team;
    this.sonae = o.sonae || (rt.sonae || []).filter((s) => s.team === this.team);
    this.honjin = o.honjin || this.sonae.find((s) => s.line === 'honjin') || null;
    this.taisho = o.taisho || null;
    this.broken = false;
    this._logIdx = 0;
    this._pending = [];       // 知らせ待ち：{ key, delta, applied:Set, t0 }
    this._flankLogged = new Set();
    this._pushCap = new Map();
    this._nearT = 0;
    // 束5
    this._gotsume = undefined;    // 後詰の備（探す前は undefined、無ければ false）
    this._gotsumeBusy = false;
    this._gotsumeTarget = null;   // { id, pos, honjin }
    this._sentFor = new Set();    // すでに後詰を送った崩れの id（'honjin' も入る）
    this._breakPos = new Map();   // 崩れの id -> その場（lineRestored の基準）
    this._restored = new Set();
    this._holdSince = new Map();
    this._arrived = new Set();    // 後詰が着いた崩れの id（lineRestored はこの後だけ）
    this._honjinCrisisActive = false;
    this._honjinStage = 0;
    this._honjinStageT = 0;
    this._pursuing = new Map();   // sonae id -> { t0, origin, ambushT }
  }

  tick() {
    if (this.broken) return;
    this._scanEvents();
    this._applyKnowledge();
    this._chainCollapse();
    this._routPush();
    this._taishoNear();
    this._honjinCrisis();
    this._reinforce();
    this._pursuit();
    this._lineRestore();
    this._checkBroken();
  }

  // ---- 敵の出来事（退けた・侍大将を討った）を、自分の軍の knows へ登録 ----
  _scanEvents() {
    const rt = this.rt, L = (rt.senkyo && rt.senkyo.log) || [];
    const enemy = this.team === 0 ? 1 : 0;
    for (; this._logIdx < L.length; this._logIdx++) {
      const e = L[this._logIdx];
      if (e.team !== enemy || e.who == null) continue;
      if (e.k === 'rout') {
        const S = sonaeById(rt, e.who);
        if (S) this._noteEvent(`enemyRout:${e.who}`, 10, S.b.pos, e.who);
      } else if (e.k === 'taishoDown') {
        const S = sonaeById(rt, e.who);
        if (S) this._noteEvent(`enemyTaishoDown:${e.who}`, 12, S.b.pos, e.who);
      }
    }
  }
  _noteEvent(key, delta, atPos, srcId) {
    if (this._pending.some((p) => p.key === key)) return;
    spread(this.rt, this.team, key, atPos, { src: srcId ?? null });
    this._pending.push({ key, delta, applied: new Set(), t0: this.rt.t || 0 });
  }
  // ---- 知らせが届いた備から、少しずつ士気を上げ下げ（本陣は 'honjin' として） ----
  _applyKnowledge() {
    const rt = this.rt;
    for (let i = this._pending.length - 1; i >= 0; i--) {
      const P = this._pending[i];
      let allDone = true;
      for (const S of this.sonae) {
        if (S.b.aliveNominal() <= 0 || P.applied.has(S.id)) continue;
        if (knows(rt, this.team, P.key, S.id) != null) { S.addMorale(P.delta); P.applied.add(S.id); }
        else allDone = false;
      }
      if (this.honjin && !P.applied.has('honjin')) {
        if (knows(rt, this.team, P.key, 'honjin') != null) { this.honjin.addMorale(P.delta); P.applied.add('honjin'); }
        else allDone = false;
      }
      if (allDone || (rt.t || 0) - P.t0 > NEWS_STALE) this._pending.splice(i, 1);
    }
  }

  // ---- 連鎖崩壊（15 章）：隣が後退・潰走した側は「露出」。40m 内に敵がいれば士気を削る。後ろの線も対象に ----
  _chainCollapse() {
    const broke = new Map();   // id -> Set('flankL'|'flankR'|'rear')
    const mark = (S, tag) => { if (!S) return; const s = broke.get(S.id) || new Set(); s.add(tag); broke.set(S.id, s); };
    for (const S of this.sonae) {
      if (S.state !== '敗走') continue;   // 15 章：中央備「敗走」で穴ができる（後退中はまだ持ちこたえている）
      mark(S.left(), 'flankR');    // 自分の左にいた備が崩れた → その備の右側が露出
      mark(S.right(), 'flankL');   // 右の備が崩れた → その備の左側が露出
      mark(S.behind(), 'rear');    // 前が崩れた→その後ろの線（後詰・本陣）も露出
    }
    for (const [id, tags] of broke) {
      const S = this.sonae.find((s) => s.id === id);
      if (!S || S.b.aliveNominal() <= 0 || S.state === '敗走') continue;
      if (!this._enemyWithin(S.b.pos, 40)) { this._flankLogged.delete(id); continue; }
      let rate = 0;
      if (tags.has('flankL')) rate += 2;
      if (tags.has('flankR')) rate += 2;
      if (tags.has('rear')) rate += 4;
      if (tags.has('flankL') && tags.has('flankR')) rate += 3;   // 囲まれた
      S.addMorale(-rate * TICK);
      if (!this._flankLogged.has(id)) { this._flankLogged.add(id); logEvent(this.rt, 'flankOpen', { team: this.team, who: id, v: [...tags].join(',') }); }
    }
    for (const id of [...this._flankLogged]) if (!broke.has(id)) this._flankLogged.delete(id);
  }
  _enemyWithin(p, r) {
    for (const S of this.rt.sonae || []) {
      if (S.team === this.team || S.state === '敗走' || S.b.aliveNominal() <= 0) continue;
      if (Math.hypot(S.b.pos.x - p.x, S.b.pos.z - p.z) < r) return true;
    }
    return false;
  }

  // ---- 敗走兵の押し（62 章）：逃げる兵が味方の備の 4m 内を通ると 1 秒足止め・士気 -1/人（一つの潰走で上限 -10） ----
  _routPush() {
    const rt = this.rt;
    for (const S of this.sonae) {
      const g = S.b.real;
      if (g && g._pushHalt != null && (rt.t || 0) >= g._pushHalt) { g.speed = g._origSpeed ?? g.speed; g._pushHalt = null; }
      if (S.state === '敗走' || S.b.aliveNominal() <= 0) continue;
      const c = g && g.count ? g.center() : S.b.pos;
      const byFrom = new Map();
      for (const u of rt.army.units) {
        if (!u.alive || !u.fleeing || u.isPlayer || u.team !== this.team) continue;
        if (Math.hypot(u.pos.x - c.x, u.pos.z - c.z) >= 4) continue;
        const fromS = u.group && u.group.butai && u.group.butai.sonae;
        const key = fromS ? fromS.id : '?';
        byFrom.set(key, (byFrom.get(key) || 0) + 1);
      }
      if (!byFrom.size) continue;
      if (g) {
        if (g._pushHalt == null) g._origSpeed = g.speed;
        g.speed = 0; g._pushHalt = (rt.t || 0) + 1;
      }
      let total = 0;
      for (const [from, cnt] of byFrom) {
        const key = `${from}>${S.id}`;
        const applied = this._pushCap.get(key) || 0;
        const want = Math.min(PUSH_CAP - applied, cnt);
        if (want > 0) { this._pushCap.set(key, applied + want); total += want; }
      }
      if (total > 0) S.addMorale(-total);
    }
  }

  // ---- 総大将が近い：+3/10 秒（本陣の場所を基準に） ----
  _taishoNear() {
    this._nearT -= TICK;
    if (this._nearT > 0) return;
    this._nearT = TAISHO_NEAR_SEC;
    const hp = this.honjin && this.honjin.b.aliveNominal() > 0 ? this.honjin.b.pos : null;
    if (!hp) return;
    for (const S of this.sonae) {
      if (S === this.honjin || S.b.aliveNominal() <= 0) continue;
      if (Math.hypot(S.b.pos.x - hp.x, S.b.pos.z - hp.z) < TAISHO_NEAR_R) S.addMorale(3);
    }
  }

  // ---- 一番近い敵の場所（本陣を下げる向きを決めるため） ----
  _nearestEnemyPos(p) {
    let best = null, bd = Infinity;
    for (const S of this.rt.sonae || []) {
      if (S.team === this.team || S.state === '敗走' || S.b.aliveNominal() <= 0) continue;
      const d = Math.hypot(S.b.pos.x - p.x, S.b.pos.z - p.z);
      if (d < bd) { bd = d; best = S.b.pos; }
    }
    return best;
  }

  // ---- 後詰（9 章）：崩れた場（翼の後退・中央の破れ・本陣危機）を探し、後詰を denrei.sendOrder で送る ----
  _findBreak() {
    if (this._honjinCrisisActive && this.honjin && this.honjin.b.aliveNominal() > 0 && !this._sentFor.has('honjin')) {
      return { id: 'honjin', pos: { x: this.honjin.b.pos.x, z: this.honjin.b.pos.z }, honjin: true };
    }
    for (const S of this.sonae) {
      if (S.line === 'honjin' || S.line === 'gotsume') continue;
      if (S.state === '敗走' && !this._sentFor.has(S.id)) {
        // 本陣が崩れ（敗走）を知った後だけ後詰を出す（知らせが届く前は動かない）
        if (knows(this.rt, this.team, `rout:${S.id}`, 'honjin') == null) continue;
        return { id: S.id, pos: { x: S.b.pos.x, z: S.b.pos.z } };
      }
    }
    return null;
  }
  _reinforce() {
    if ((this.rt.t || 0) < GOTSUME_HOLD) return;
    if (this._gotsume === undefined) this._gotsume = this.sonae.find((s) => s.line === 'gotsume') || false;
    const G = this._gotsume;
    if (!G || G.b.aliveNominal() <= 0) return;
    if (this._gotsumeBusy) { this._gotsumeCheckArrive(); return; }
    const target = this._findBreak();
    if (target) this._sendGotsume(target);
  }
  _sendGotsume(target) {
    const G = this._gotsume, rt = this.rt;
    this._sentFor.add(target.id);
    this._breakPos.set(target.id, target.pos);
    this._gotsumeBusy = true;
    this._gotsumeTarget = target;
    logEvent(rt, 'gotsumeSent', { team: this.team, who: target.id });
    const from = this.honjin ? this.honjin.b.pos : G.b.pos;
    sendOrder(rt, from, G, { id: 'move', to: target.pos }, { team: this.team, name: G.name, who: target.id })
      .onLost(() => {
        rt.after(20, () => {
          logEvent(rt, 'resend', { team: this.team, who: target.id });
          this._gotsumeBusy = false;
          this._sentFor.delete(target.id);
        });
      });
  }
  _gotsumeCheckArrive() {
    const G = this._gotsume, t = this._gotsumeTarget;
    if (!G || !t) { this._gotsumeBusy = false; return; }
    // 後詰は崩れた「場」へ向かう。敗走して動く備自体を追いかけない（本陣だけは生きている間その位置）
    const pos = t.honjin && this.honjin && this.honjin.b.aliveNominal() > 0 ? this.honjin.b.pos : (this._breakPos.get(t.id) || t.pos);
    if (G.b.aliveNominal() <= 0) { this._gotsumeBusy = false; return; }
    if (Math.hypot(G.b.pos.x - pos.x, G.b.pos.z - pos.z) < GOTSUME_NEAR) {
      logEvent(this.rt, 'gotsumeArrive', { team: this.team, who: t.id });
      this._noteEvent(`gotsumeArrive:${t.id}`, GOTSUME_BONUS, pos, G.id);
      this._arrived.add(t.id);
      this._gotsumeBusy = false;
    }
  }

  // ---- 本陣危機（8 章）：旗本を前へ → 残りの後詰を入れる → 本陣を 40m 下げる → 退く、の順に選ぶ ----
  _honjinFrontGuard() {
    const T = this.rt.taisho; if (!T) return;
    const e = this.team === 0 ? T.a : T.b;
    if (e && e.state === 'on' && e.g) { e.g.aggro = Math.max(e.g.aggro || 0, 20); e.g.seekRange = Math.max(e.g.seekRange || 0, 30); }
  }
  _honjinFallback() {
    const H = this.honjin, rt = this.rt;
    if (!H || H.b.aliveNominal() <= 0) return;
    const enemy = this._nearestEnemyPos(H.b.pos);
    let dx = H.b.pos.x - (enemy ? enemy.x : H.b.pos.x), dz = H.b.pos.z - (enemy ? enemy.z : H.b.pos.z);
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    H.order({ id: 'retreat', to: { x: H.b.pos.x + dx * HONJIN_FALL_DIST, z: H.b.pos.z + dz * HONJIN_FALL_DIST } });
    setRunnerSpeed(rt, this.team, HONJIN_SLOW_MUL);
    rt.after(HONJIN_SLOW_SEC, () => setRunnerSpeed(rt, this.team, 1));
    if (!this._honjinFellBackOnce) { this._honjinFellBackOnce = true; for (const S of this.sonae) S.addMorale(-5); }
    logEvent(rt, 'honjinFallback', { team: this.team });
  }
  _honjinCrisis() {
    const H = this.honjin;
    if (!H || H.b.aliveNominal() <= 0) return;
    const danger = this._enemyWithin(H.b.pos, HONJIN_DANGER_R);
    if (!danger) { this._honjinCrisisActive = false; this._honjinStage = 0; return; }
    const rt = this.rt;
    if (!this._honjinCrisisActive) {
      this._honjinCrisisActive = true; this._honjinStage = 0; this._honjinStageT = rt.t || 0;
      logEvent(rt, 'honjinDanger', { team: this.team });
    }
    this._honjinFrontGuard();   // ずっと：旗本を前へ
    const held = (rt.t || 0) - this._honjinStageT;
    if (this._honjinStage === 0 && held > HONJIN_FRONT_SEC) { this._honjinStage = 1; this._honjinStageT = rt.t || 0; }
    else if (this._honjinStage === 1 && held > HONJIN_STEP_SEC) { this._honjinFallback(); this._honjinStage = 2; this._honjinStageT = rt.t || 0; }
    else if (this._honjinStage >= 2 && held > HONJIN_STEP_SEC) { this._honjinFallback(); logEvent(rt, 'honjinRetreat', { team: this.team }); this._honjinStageT = rt.t || 0; }
    // stage1 の間は、_reinforce が崩れの一つとして本陣を優先して後詰を送る（_findBreak）
  }

  // ---- 追撃（16 章）：敵の備の過半が潰走したら追う。60m を越えて追うと伏兵・反撃のくじ。40 秒で止めて集める ----
  _pursuit() {
    const rt = this.rt, enemyTeam = this.team === 0 ? 1 : 0;
    const line = (rt.sonae || []).filter((s) => s.team === enemyTeam && s.line !== 'honjin' && s.line !== 'gotsume');
    const routedN = line.filter((s) => s.state === '敗走').length;
    const majorRouted = line.length > 0 && routedN / line.length >= PURSUIT_FRAC;
    for (const S of this.sonae) {
      if (S.line === 'honjin' || S.b.aliveNominal() <= 0 || S.state === '敗走' || S.state === '混乱') continue;
      if (majorRouted && !this._pursuing.has(S.id)) {
        this._pursuing.set(S.id, { t0: rt.t || 0, origin: { x: S.b.pos.x, z: S.b.pos.z }, ambushT: PURSUIT_AMBUSH_SEC });
        S.b.setForm('loose');
        logEvent(rt, 'pursuit', { team: this.team, who: S.id });
      }
      const P = this._pursuing.get(S.id);
      if (!P) continue;
      const t = (rt.t || 0) - P.t0;
      if (t > PURSUIT_STOP_SEC) {
        this._pursuing.delete(S.id);
        S.b.setForm('line');
        logEvent(rt, 'pursuitStop', { team: this.team, who: S.id });
        continue;
      }
      const dist = Math.hypot(S.b.pos.x - P.origin.x, S.b.pos.z - P.origin.z);
      if (dist > PURSUIT_FAR) {
        P.ambushT -= TICK;
        if (P.ambushT <= 0) {
          P.ambushT = PURSUIT_AMBUSH_SEC;
          if (Math.random() < PURSUIT_AMBUSH_P) { S.addMorale(-15); logEvent(rt, 'ambush', { team: this.team, who: S.id }); }
        }
      }
    }
  }

  // ---- lineRestored：崩れた場を味方が 20 秒持ち、隣が潰走していない時 ----
  _neighborsOkFor(id) {
    const S = sonaeById(this.rt, id);
    if (!S) return true;
    for (const n of [S.left(), S.right()]) if (n && n.state === '敗走') return false;
    return true;
  }
  _lineRestore() {
    const rt = this.rt;
    for (const id of this._sentFor) {
      if (id === 'honjin' || this._restored.has(id) || !this._arrived.has(id)) continue;
      const orig = this._breakPos.get(id);
      if (!orig) continue;
      const held = this.sonae.some((s) => s.b.aliveNominal() > 0 && s.state !== '敗走' && Math.hypot(s.b.pos.x - orig.x, s.b.pos.z - orig.z) < LINE_HOLD_R);
      if (held && this._neighborsOkFor(id)) {
        if (this._holdSince.get(id) == null) this._holdSince.set(id, rt.t || 0);
        if ((rt.t || 0) - this._holdSince.get(id) >= LINE_RESTORE_SEC) {
          this._restored.add(id);
          logEvent(rt, 'lineRestored', { team: this.team, who: id });
        }
      } else this._holdSince.delete(id);
    }
  }

  // ---- 負け（14 章）：備の 6 割が潰走、または本陣が崩れたら「戦えない」 ----
  _checkBroken() {
    const line = this.sonae.filter((s) => s.line !== 'honjin');
    const routedN = line.filter((s) => s.state === '敗走').length;
    const honjinBroken = this.honjin && (this.honjin.state === '敗走' || this.honjin.b.aliveNominal() <= 0);
    if ((line.length && routedN / line.length >= ROUTED_FRAC) || honjinBroken) {
      this.broken = true;
      logEvent(this.rt, 'armyBroken', { team: this.team });
    }
  }
}

export function makeGunsei(rt, o) {
  rt.gunsei = rt.gunsei || [];
  const G = new Gunsei(rt, o);
  rt.gunsei.push(G);
  return G;
}
export function gunseiOf(rt, team) { return (rt.gunsei || []).find((g) => g.team === team) || null; }

// 毎コマ（戦の定義の update から呼ぶ）。中は 0.5 秒ごとに回す
export function gunseiTick(rt, dt) {
  if (!rt.gunsei || !rt.gunsei.length) return;
  rt._gunseiT = (rt._gunseiT || 0) - dt;
  if (rt._gunseiT > 0) return;
  rt._gunseiT = TICK;
  for (const G of rt.gunsei) G.tick();
}
