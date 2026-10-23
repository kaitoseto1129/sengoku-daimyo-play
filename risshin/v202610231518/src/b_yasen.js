// ======================================================================
// 野戦の部隊の小道具（束6：三方ヶ原・刀根坂。quality-upgrade-plan.md 2 章 F4・F7）
// butai.js の部隊を「軽い作り中心」で使う。味方はごちゃごちゃさせない（本物を出さず、遠くの軽い大軍どうしで
// 押し合う）。敵は自分がすぐそばまで寄った時だけ、数人を本物にする（軽い兵を素通りさせない）。
// butai.js は触らず、部隊ごとの _autoSwitch と update を、この戦の作りに合わせて差し替えるだけ。
//   fieldButai(rt, o)        … makeButai に realMax（本物の上限。既定 0）を足した物
//   fieldTick(rt, dt, o)     … 正面で触れた敵味方の部隊を数で押し合わせ、崩れた敵の備を退かせて集まり直させる（F7）
// ======================================================================
import { makeButai, lightClash } from './butai.js';

// 本物の兵の合計（自分・組・台本の隊も入れた全部）
export function aliveReal(rt) {
  let n = 0;
  for (const u of rt.army.units) if (u.alive && !u.gone && !u.isStruct) n++;
  return n;
}
const REAL_ROOM = 215;   // この数を超えていれば、部隊は本物を増やさない（台本の隊と合わせて 250 まで）

// 軽い大軍の今の真ん中（advance・retreat で動いた分も入れる）
export function lightPos(b) {
  if (!b.light) return b.pos;
  const A = b.light.army;
  const p = b._lightPos;
  p.x = A.cx + A.off.x; p.z = A.cz + A.off.z;
  return p;
}

export function fieldButai(rt, o) {
  const b = makeButai(rt, { real: 0, ...o });
  b._lightPos = { x: b.pos.x, z: b.pos.z };
  b.realMax = o.realMax ?? 0;
  b.home = { x: b.pos.x, z: b.pos.z };
  // 軽い大軍は KIT の wake（近づくと本物に替える）に任せない：部隊の数（名目）と食い違わないように
  if (b.light) b.light.army.noWake = true;
  b._autoSwitch = function (dt) {
    this._swT -= dt;
    if (this._swT > 0) return;
    this._swT = 1.2;
    if (this.aliveNominal() <= 0) return;
    const P = rt.player && rt.player.u;
    const near = this.realMax > 0 && !this.routedL && P && P.alive && Math.hypot(this.pos.x - P.pos.x, this.pos.z - P.pos.z) < 40;
    const want = near ? Math.min(this.realMax, this.aliveNominal()) : 0;
    const have = this.realCount();
    if (want > have) {
      const room = REAL_ROOM - aliveReal(rt);
      if (room > 0) this.growReal(Math.min(4, want - have, room));
    }
    else if (have > want && !near) this.shrinkReal(Math.min(4, have - want));
  };
  const up = b.update.bind(b);
  b.update = (dt) => {
    up(dt);
    if (!b.realCount() && b.light) { const p = lightPos(b); b.pos.x = p.x; b.pos.z = p.z; }
  };
  return b;
}

// 崩れる：軽い大軍を崩し、本物は士気を落とす
export function routButai(b, hideAfter = 30) {
  if (!b || b.routedL) return;
  b.routedL = true;
  b.morale = 0;
  if (b.light) b.light.rout({ hideAfter });
  if (b.real && b.real.count) { b.real.noRout = false; b.real.morale = 0; }
}

// 毎コマ：
//   o.list     … 押し合わせる部隊（敵味方まぜて）
//   o.reach    … この内に入った敵味方の部隊は、正面で押し合う（数の戦い）
//   o.k        … 押し合いの強さ
//   o.regroup  … 敵の備が崩れかけたら（士気 25 未満）退いて集まり直す（F7）。{ team, back, wait, onBack(b), onRegroup(b) }
//   o.routAt   … 名目がこの割合を切った部隊は崩れる
export function fieldTick(rt, dt, o = {}) {
  const L = o.list;
  if (!L) return;
  const reach = o.reach ?? 26, k = o.k ?? 1;
  for (let i = 0; i < L.length; i++) {
    for (let j = i + 1; j < L.length; j++) {
      const a = L[i], c = L[j];
      if (!a || !c || a.routedL || c.routedL || a.aliveNominal() <= 0 || c.aliveNominal() <= 0) continue;
      if (a.team === c.team || a.regroupT || c.regroupT) continue;
      if (Math.hypot(a.pos.x - c.pos.x, a.pos.z - c.pos.z) > reach) continue;
      lightClash(a, c, dt, k);
      a.engagedT = c.engagedT = rt.t;
    }
  }
  const routAt = o.routAt ?? 0.22;
  for (const b of L) {
    if (!b || b.routedL || b.aliveNominal() <= 0) continue;
    if (b.aliveNominal() < b.nominal * routAt) { routButai(b); if (o.onRout) o.onRout(b); continue; }
    const R = o.regroup;
    if (!R || b.team !== R.team) continue;
    // 崩れかけた備は、一度だけ（二度まで）退いて集まり直す
    if (!b.regroupT && b.morale < 25 && (b.rgN || 0) < 2) {
      b.regroupT = rt.t; b.rgN = (b.rgN || 0) + 1;
      if (b.light) b.light.retreat(R.back ?? 22, 9);
      if (b.real && b.real.count) { b.real.order = 'move'; b.real.dest = { x: b.home.x, z: b.home.z }; }
      if (R.onBack) R.onBack(b);
    } else if (b.regroupT && rt.t - b.regroupT > (R.wait ?? 24)) {
      b.regroupT = 0;
      b.morale = Math.max(b.morale, 55);
      if (b.real && b.real.count) { b.real.morale = b.morale; b.real.order = 'hold'; b.real.anchor = { x: b.pos.x, z: b.pos.z }; }
      if (R.onRegroup) R.onRegroup(b);
    }
  }
}
