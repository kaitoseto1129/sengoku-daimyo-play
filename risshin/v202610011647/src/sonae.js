// 備（sonae.js）：docs/battle-system-plan.md 第1段・docs/battle-system-spec.md 2〜4 章。
// 備は butai.js の Butai を一つ包み、侍大将・第何線・左右の隣・後ろ・状態の字を持つ。
// 束1：形・隣の引き方・状態の字（0.5 秒ごと）・下知の遅れ（侍大将が健在 1.5 秒・いなければ 8 秒）・記録（senkyo.js）
// 束2：侍大将の討死（本物は 0.25 秒ごとに見る・軽い備は名目の損 10% ごとに 4% のくじ）→ 混乱 8〜15 秒 →
//   副将がいれば継ぐ（再編中→待機、下知の遅れ 4 秒）／いなければ 後退 → 名目の 15% が逃げる → 士気 22 未満で潰走。
//   重要武将（S.major）の討死は隣の備も士気 −8。潰走した備は、指揮官が生きていて敵が 45m 外・士気 30 以上で再編（与える損 0.8 倍）
import { makeButai } from './butai.js';
import { logEvent } from './senkyo.js';

export const SONAE_STATES = ['待機', '前進中', '交戦中', '動揺', '混乱', '後退中', '敗走', '再編中', '予備待機'];
const LINE_ORDER = [1, 2, 'gotsume', 'honjin'];
const SLOT_X = { left: -1, center: 0, right: 1 };
const TICK = 0.5;

class Sonae {
  constructor(rt, o) {
    this.rt = rt;
    this.id = o.id;
    this.name = o.name || o.id;
    this.team = o.team ?? 0;
    this.line = o.line ?? 1;
    this.slot = o.slot || 'center';
    this.taisho = o.taisho || null;
    this.fuku = o.fuku || null;          // 副将（束2）
    this.major = !!o.major;              // 重要武将（束2：討たれると隣の士気も下がる）
    this.state = this._reserveLine() ? '予備待機' : '待機';
    this.taishoDead = false;
    this.confuseT = 0;                   // 混乱の残り（束2）
    this.rallyT = 0;                     // 再編の残り（束2）
    this.moveTo = null;
    this.lowSaid = false;
    this.pending = null;                 // 遅れて届く下知
    this.phase = null;                   // 討死の後の流れ：'confused'（混乱）→ 'withdraw'（後退）／継げば null
    this.succeeded = false;              // 副将が継いだ（下知の遅れ 4 秒）
    this.forceRout = false;              // 軽い備の潰走（本物の Group は army_groups.js が士気 22 未満で崩す）
    this.rallied = false;                // 再編した（与える損 0.8 倍）
    this._deadU = null;                  // 討死を見届けた本物の将
    this._lossStep = 0;                  // 軽い備のくじ：名目の損の 10% の段
    const kind = o.kind || dominantKind(o.mix);
    this.b = makeButai(rt, {
      name: this.name, general: this.taisho, kind, mix: o.mix, team: this.team, faction: o.faction, armor: o.armor, flag: o.flag,
      nominal: o.nominal, at: o.at, facing: o.facing, real: o.real ?? 12, nearReal: o.nearReal ?? 40, farReal: o.farReal ?? 12,
    });
    this.b.sonae = this;
  }
  _reserveLine() { return this.line === 'gotsume' || this.line === 'honjin'; }

  // ---- 隣・後ろ ----
  mates() { return (this.rt.sonae || []).filter((s) => s !== this && s.team === this.team); }
  neighbor(side) {
    const want = SLOT_X[this.slot] + (side === 'left' ? -1 : 1);
    return this.mates().find((s) => s.line === this.line && SLOT_X[s.slot] === want) || null;
  }
  left() { return this.neighbor('left'); }
  right() { return this.neighbor('right'); }
  behind() {
    const i = LINE_ORDER.indexOf(this.line);
    for (let j = i + 1; j < LINE_ORDER.length; j++) {
      const L = this.mates().filter((s) => s.line === LINE_ORDER[j]);
      if (!L.length) continue;
      return L.find((s) => s.slot === this.slot) || L.find((s) => s.slot === 'center') || L[0];
    }
    return null;
  }

  // ---- 数 ----
  count() { return Math.round(this.b.aliveNominal()); }
  morale() { return this.b.morale; }
  commander() {
    if (!this.taishoDead && this.taisho) return this.taisho;
    return null;
  }
  // 指揮官が本物でいるなら、その者（逃げ去った・討たれた者は外す）
  commanderU() {
    const u = this.b.taishoU;
    return !this.taishoDead && u && u.alive && !u.gone ? u : null;
  }
  stat() {
    return { id: this.id, name: this.name, team: this.team, line: this.line, slot: this.slot, 兵数: this.count(), 指揮官: this.commander() || 'なし', 士気: Math.max(0, Math.round(this.morale())), 状態: this.state, 本物: this.b.realCount() };
  }

  // ---- 下知：侍大将が健在なら 1.5 秒、いなければ 8 秒遅れて Butai へ（副将は束2）。混乱の間は受けない ----
  order(cmd) {
    if (this.state === '混乱' || this.state === '敗走') { logEvent(this.rt, 'orderLost', { team: this.team, who: this.id, v: cmd.id }); return false; }
    const delay = this.commander() ? (this.succeeded ? 4 : 1.5) : 8;
    const tag = this.pending = { cmd };
    logEvent(this.rt, 'order', { team: this.team, who: this.id, v: cmd.id });
    this.rt.after(delay, () => {
      if (this.pending !== tag) return;   // あとの下知に上書きされた
      this.pending = null;
      if (this.state === '敗走') return;
      this.b.order(cmd);
      this.moveTo = (cmd.id === 'move' || cmd.id === 'charge' || cmd.id === 'retreat') && cmd.to ? { x: cmd.to.x, z: cmd.to.z } : null;
    });
    return true;
  }

  // ---- 士気：本物の Group と Butai の両方へ（Butai.update は本物がいる間 Group の士気を写す） ----
  addMorale(d) {
    const b = this.b, g = b.real;
    if (g && g.count) g.morale = Math.max(0, Math.min(100, g.morale + d));
    b.morale = Math.max(0, Math.min(100, b.morale + d));
  }

  // ---- 0.25 秒ごと：本物の侍大将（Group.leader）の死を見る。軽い備は名目の損 10% ごとに 4% のくじ ----
  watch() {
    if (this.taishoDead || !this.taisho) return;
    const b = this.b, g = b.real, u = b.taishoU;
    if (u) {
      if (!u.alive && !u.gone && u !== this._deadU) { this._deadU = u; sonaeTaishoDown(this, u.lastHit && u.lastHit.src || null); }
      else if (u.alive && g && !g.leader) g.leader = u;
      return;
    }
    const step = Math.floor((b.lost / b.nominal) * 10);
    while (this._lossStep < step) {
      this._lossStep++;
      if (Math.random() < 0.04) { sonaeTaishoDown(this, null); return; }
    }
  }

  // 混乱が明けた：副将が継ぐか、後退して一部が逃げる
  _afterConfuse() {
    const rt = this.rt, b = this.b, g = b.real;
    if (this.fuku) {
      const name = this.fuku;
      this.fuku = null;
      this.taisho = name; this.taishoDead = false; this.succeeded = true; this.phase = null;
      b.general = name; b._named = true;
      // 本物の一人を新しい将に（備の後ろ寄りにいる侍を先に。遊び手は外す）。副将は並の兵より手強い（体力 2 倍）
      if (g) {
        const L = g.units.filter((o) => o.alive && !o.isPlayer && !o.gone);
        const c = g.count ? g.center() : b.pos, fx = Math.sin(b.facing), fz = Math.cos(b.facing);
        const back = (o) => (o.pos.x - c.x) * fx + (o.pos.z - c.z) * fz + (o.type === 'samurai' || o.type === 'busho' ? -6 : 0) + (o.banner ? 4 : 0);
        L.sort((p, q) => back(p) - back(q));
        const nu = L[0];
        if (nu) { nu.name = name; nu.keep = true; nu.maxHp *= 2; nu.hp = Math.min(nu.maxHp, nu.hp * 2); g.leader = nu; b.taishoU = nu; this._deadU = null; }
        else b.taishoU = null;
      } else b.taishoU = null;
      this._lossStep = Math.floor((b.lost / b.nominal) * 10);
      // 副将が兵をまとめる：士気 +10（崩れかけでも 40 までは持ち直す）。敵と揉み合っていれば 12m 下がって並び直す（再編中）
      this.addMorale(10);
      if (b.morale < 40) this.addMorale(40 - b.morale);
      if (this._engaged(g) || this._foeWithin(g && g.count ? g.center() : b.pos, 25)) {
        const f = b.facing;
        b.order({ id: 'retreat', to: { x: b.pos.x - Math.sin(f) * 12, z: b.pos.z - Math.cos(f) * 12 } });
        if (g) g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x: gg.dest ? gg.dest.x : b.pos.x, z: gg.dest ? gg.dest.z : b.pos.z }; b.cmd = { ...b.cmd, id: 'hold', to: null }; };
      }
      this.rallyT = 6;
      logEvent(rt, 'succeed', { team: this.team, who: this.id, v: name });
      return;
    }
    // 副将なし：持ち場から後ろへ下がる。名目の 15% が逃げ散る（軽い兵から減らす）
    this.phase = 'withdraw';
    if (this.state === '敗走') return;          // 混乱の間にもう崩れた（逃げ散るのは潰走が受け持つ）
    const back = 35, f = b.facing;
    const to = { x: b.pos.x - Math.sin(f) * back, z: b.pos.z - Math.cos(f) * back };
    b.order({ id: 'retreat', to });
    this.moveTo = null;
    const flee = Math.min(Math.round(b.nominal * 0.15), Math.max(0, b.aliveNominal() - b.realCount()));
    b.lost = Math.min(b.nominal, b.lost + flee);
    this.addMorale(-12);
    logEvent(rt, 'withdraw', { team: this.team, who: this.id, v: flee });
  }

  // 潰走した備の再編（63 章）：指揮官が生きている・敵が 45m 外・士気 30 以上
  _tryRally() {
    const rt = this.rt, b = this.b, g = b.real;
    if (!this.commander()) return;
    const cu = this.commanderU();
    if (b.taishoU && !cu) return;               // 本物の将が逃げ去った
    const c = g && g.count ? g.center() : b.pos;
    if (this._foeWithin(c, 45)) return;
    // 敵が離れれば、将が兵をまとめて士気が戻っていく
    if (b.morale < 30) { this.addMorale(1.6 * TICK); if (b.morale < 30) return; }
    this.forceRout = false; this.phase = null; this.rallied = true;
    if (g) {
      g.routed = false; g.rallied = true; g.order = 'hold'; g.focus = null; g.dest = null; g.path = null; g.marching = false;
      g.anchor = { x: c.x, z: c.z };
      if (g.fleeDir) { g.facing = Math.atan2(-g.fleeDir.x, -g.fleeDir.z); g._face = g.facing; }
      g.morale = Math.max(g.morale, 30); g.wavered = false;
      g.dmgMult = (g.dmgMult || 1) * 0.8;
      for (const u of g.units) if (u.alive && !u.isPlayer && !u.dropped) { u.fleeing = false; u.routIn = undefined; u.target = null; u.atk = null; u.confused = 0; }
    }
    b.dmgMult = 0.8;
    b.order({ id: 'hold' });
    if (b.light && b.light.halt) b.light.halt();
    this.rallyT = 6;
    logEvent(rt, 'rally', { team: this.team, who: this.id, v: Math.round(b.morale) });
  }
  _foeWithin(c, r) {
    for (const s of this.rt.sonae || []) {
      if (s.team === this.team || s.state === '敗走' || s.b.aliveNominal() <= 0) continue;
      if (Math.hypot(s.b.pos.x - c.x, s.b.pos.z - c.z) < r) return true;
    }
    let foe = false;
    const A = this.rt.army;
    if (A && A.forNear) A.forNear(c.x, c.z, r, (o) => { if (!foe && o.alive && o.team !== this.team && !o.fleeing && !o.noTarget && !o.isStruct && Math.hypot(o.pos.x - c.x, o.pos.z - c.z) < r) foe = true; });
    return foe;
  }

  // ---- 0.5 秒ごと：侍大将の生死・状態の字 ----
  tick() {
    const rt = this.rt, b = this.b, g = b.real;
    // 備の本物の Group は、army_groups.js の再集結（味方だけ・指揮官を見ない）に任せず、ここで再編する
    if (g && !g.noRally) g.noRally = true;
    if (this.confuseT > 0) {
      this.confuseT = Math.max(0, this.confuseT - TICK);
      if (this.confuseT === 0 && this.phase === 'confused') this._afterConfuse();
    }
    if (this.rallyT > 0) this.rallyT = Math.max(0, this.rallyT - TICK);
    // 指揮官のいない備は、交戦中・後退中に士気が削れていく
    if (!this.commander() && this.phase !== 'confused' && this.state !== '敗走' && (this.phase === 'withdraw' || this._engaged(g))) this.addMorale(-0.6 * TICK);
    if (this.phase === 'withdraw' && b.morale < 22 && !this.forceRout) {
      this.forceRout = true;
      if (b.light && b.light.retreat) b.light.retreat(30);
    }
    if (this.state === '敗走' && b.aliveNominal() > 0) this._tryRally();
    const m = b.morale;
    if (!this.lowSaid && m < 40) { this.lowSaid = true; logEvent(rt, 'moraleLow', { team: this.team, who: this.id, v: Math.round(m) }); }
    else if (this.lowSaid && m >= 55) this.lowSaid = false;
    const s = this._decide(g, m);
    if (s !== this.state) {
      const prev = this.state;
      this.state = s;
      logEvent(rt, 'state', { team: this.team, who: this.id, v: s });
      if (s === '敗走' && prev !== '敗走') logEvent(rt, 'rout', { team: this.team, who: this.id });
    }
  }
  _decide(g, m) {
    const b = this.b;
    if (b.aliveNominal() <= 0 || (g && g.routed) || this.forceRout || m < 15) return '敗走';
    if (this.confuseT > 0) return '混乱';
    if (this.rallyT > 0) return '再編中';
    if (b.cmd.id === 'retreat') return '後退中';
    if (this._engaged(g)) return '交戦中';
    if (m < 50) return '動揺';
    if (this.moveTo && Math.hypot(b.pos.x - this.moveTo.x, b.pos.z - this.moveTo.z) > 5) return '前進中';
    if (this.pending && (this.pending.cmd.id === 'move' || this.pending.cmd.id === 'charge')) return this.state;   // 下知が届くまでは今のまま
    return this._reserveLine() ? '予備待機' : '待機';
  }
  _engaged(g) {
    if ((this.rt.t || 0) - this.b._clashAt < 1.5) return true;
    if (!g) return false;
    for (const u of g.units) {
      if (!u.alive || !u.target || !u.target.alive || u.target.team === u.team || u.target.isStruct) continue;
      if (Math.hypot(u.pos.x - u.target.pos.x, u.pos.z - u.target.pos.z) < 6) return true;
    }
    return false;
  }
}

function dominantKind(mix) {
  if (!mix) return 'ashigaru';
  let best = 'ashigaru', v = -1;
  for (const k in mix) if ((mix[k] || 0) > v) { v = mix[k]; best = k; }
  return best;
}

// 備を作る：{ id, name, team, faction, flag, armor, line: 1|2|'gotsume'|'honjin', slot: 'left'|'center'|'right', taisho, fuku, nominal, mix, at, facing }
export function makeSonae(rt, o) {
  rt.sonae = rt.sonae || [];
  const S = new Sonae(rt, o);
  rt.sonae.push(S);
  logEvent(rt, 'sonae', { team: S.team, who: S.id, v: S.count() });
  return S;
}

// 侍大将の討死（本物が討たれた時・軽い備のくじ・戦の定義から）：混乱 8〜15 秒。継ぐ・退くは混乱が明けてから（tick）
export function sonaeTaishoDown(S, killer) {
  if (!S || S.taishoDead) return;
  const rt = S.rt, b = S.b, g = b.real, u = b.taishoU;
  const name = S.taisho;
  S.taishoDead = true;
  S.phase = 'confused';
  S.pending = null;
  b._named = true;   // 軽い所から新しく本物を出しても、討たれた将の名をもう付けない
  logEvent(rt, 'taishoDown', { team: S.team, who: S.id, v: name });
  // 士気の急な下げ：本物の将が Group.leader なら kill で −30 済み。それ以外（軽い・leader でない）はここで
  if (!(u && g && g.leader === u && !u.alive)) S.addMorale(-25);
  // 混乱：その場で止まり、下知を受けない（本物は army_combat.js の kill で何人かが confused になっている）
  S.confuseT = 8 + Math.random() * 7;
  if (g) { g.order = 'hold'; g.dest = null; g.anchor = { x: b.pos.x, z: b.pos.z }; }
  if (b.light && b.light.halt) b.light.halt();
  b.cmd = { ...b.cmd, id: 'hold', to: null };
  S.moveTo = null;
  logEvent(rt, 'confused', { team: S.team, who: S.id, v: Math.round(S.confuseT) });
  // 重要武将は隣の備も揺らぐ
  if (S.major) for (const n of [S.left(), S.right()]) if (n) n.addMorale(-8);
  if (killer && killer.team !== S.team) logEvent(rt, 'taishoKilledBy', { team: S.team, who: S.id, v: killer.name || killer.type || null });
}

export function sonaeById(rt, id) { return (rt.sonae || []).find((s) => s.id === id) || null; }

// 毎コマ（戦の定義の update から。butaiTick とは別に呼ぶ）。将の生死は 0.25 秒ごと、状態は 0.5 秒ごと
export function sonaeTick(rt, dt) {
  if (!rt.sonae || !rt.sonae.length) return;
  rt._sonaeW = (rt._sonaeW || 0) - dt;
  if (rt._sonaeW <= 0) { rt._sonaeW = 0.25; for (const S of rt.sonae) S.watch(); }
  rt._sonaeT = (rt._sonaeT || 0) - dt;
  if (rt._sonaeT > 0) return;
  rt._sonaeT = TICK;
  for (const S of rt.sonae) S.tick();
}
