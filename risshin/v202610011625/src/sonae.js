// 備（sonae.js）：docs/battle-system-plan.md 第1段・docs/battle-system-spec.md 2〜4 章。
// 備は butai.js の Butai を一つ包み、侍大将・第何線・左右の隣・後ろ・状態の字を持つ。
// 束1：形・隣の引き方・状態の字（0.5 秒ごと）・下知の遅れ（侍大将が健在 1.5 秒・いなければ 8 秒）・記録（senkyo.js）
// 束2 で副将の継承・混乱・再編を足す（S.fuku・S.confuseT・S.rallyT はその置き場だけ先に作る）
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
  stat() {
    return { id: this.id, name: this.name, team: this.team, line: this.line, slot: this.slot, 兵数: this.count(), 指揮官: this.commander() || 'なし', 士気: Math.max(0, Math.round(this.morale())), 状態: this.state, 本物: this.b.realCount() };
  }

  // ---- 下知：侍大将が健在なら 1.5 秒、いなければ 8 秒遅れて Butai へ（副将は束2）。混乱の間は受けない ----
  order(cmd) {
    if (this.state === '混乱' || this.state === '敗走') { logEvent(this.rt, 'orderLost', { team: this.team, who: this.id, v: cmd.id }); return false; }
    const delay = this.commander() ? 1.5 : 8;
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

  // ---- 0.5 秒ごと：侍大将の生死・状態の字 ----
  tick() {
    const rt = this.rt, b = this.b, g = b.real;
    const tu = b.taishoU;
    if (!this.taishoDead && tu && !tu.alive && !tu.gone) {
      this.taishoDead = true;
      logEvent(rt, 'taishoDown', { team: this.team, who: this.id, v: this.taisho });
    }
    if (this.confuseT > 0) this.confuseT = Math.max(0, this.confuseT - TICK);
    if (this.rallyT > 0) this.rallyT = Math.max(0, this.rallyT - TICK);
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
    if (b.aliveNominal() <= 0 || (g && g.routed) || m < 15) return '敗走';
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

export function sonaeById(rt, id) { return (rt.sonae || []).find((s) => s.id === id) || null; }

// 毎コマ（戦の定義の update から。butaiTick とは別に呼ぶ）。中は 0.5 秒ごと
export function sonaeTick(rt, dt) {
  if (!rt.sonae || !rt.sonae.length) return;
  rt._sonaeT = (rt._sonaeT || 0) - dt;
  if (rt._sonaeT > 0) return;
  rt._sonaeT = TICK;
  for (const S of rt.sonae) S.tick();
}
