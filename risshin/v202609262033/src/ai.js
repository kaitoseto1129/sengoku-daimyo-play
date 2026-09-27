// 隊を動かす「大将の頭」：隊ごとに数秒に一度、敵と味方の強さ・向き・士気・間合いを見て動き方を決める
// （Total War の隊の AI にならう：正面で押し合い、手の空いた隊は横や後ろへ回り、崩れかけた隊は下がって控えと替わる）
//
// 戦の定義（battles.js・b_*.js）の下知は壊さない：
//   ・g.order が 'attack'（好きに戦え）の隊と、g.ai = true の隊だけを大きく動かす（寄せる・回り込む・下がる・助けに行く）
//     order は 'attack' のまま。動かす間は seekRange・fire を少しの間だけ変え、終われば元へ戻す
//   ・'hold'・'yari'（持ち場を守れ）の隊は、向き・槍衾だけを整える（柵や塀の内の隊は向きも変えない）
//   ・'move'・'path'・'assault'・'follow'・'retreat'・自分の組・g.focus のある隊には触らない
//   ・戦の定義が seekRange・fire・anchor・order を変えたら、そちらを正として大将の頭は手を引く
// 戦の定義から使える印：
//   g.ai = true（order を問わず大将の頭に任せる。order は 'attack' にする）・g.reserve = true（控え：自分からは出ず、味方が崩れかけたら出る）
//   g.noAI = true（この隊は動かさない）・def.noAI = true（この戦では使わない）・def.aiSkill = 'easy'|'normal'|'hard'（敵の上手さを戦ごとに決める）
//   g.guard = true（守る隊。本陣の旗本など。order が 'hold'・'yari' の間だけ：寄る敵に気づくと向き直って構え、
//     槍は槍衾、射手は撃ち、侍と槍は打って出て迎え撃つ。敵が離れれば持ち場へ戻る。大将は旗本の後ろへ下がる。
//     g.guardSight（気づく距離。既定 55m）・g.guardLeash（打って出る遠さ。既定 26m）で変えられる）
import { angleDiff } from './units.js';

// 上手さ：think＝判断の間（秒）、flank＝歩兵が横へ回る割合、cavFlank＝騎馬が回る割合、smart＝弱った敵・孤立した敵を選ぶ、
// withdraw＝崩れかけたら下がる回数、relieve＝控えを出す、cycle＝騎馬が斬り合いから離れて立て直すまでの秒、terrain＝高い所を好む強さ
const SKILL = {
  easy: { think: 4.5, flank: 0.2, cavFlank: 0.5, smart: 0, withdraw: 0, relieve: false, cycle: 0, terrain: 0.4, lane: false },
  normal: { think: 2.6, flank: 0.6, cavFlank: 0.9, smart: 1, withdraw: 1, relieve: true, cycle: 8, terrain: 1, lane: true },
  hard: { think: 1.5, flank: 0.9, cavFlank: 1, smart: 1.5, withdraw: 2, relieve: true, cycle: 6, terrain: 1.3, lane: true },
};
// 兵一人の重み（強さの見積もり）
const WEIGHT = { ashigaru: 1, bow: 0.8, gun: 1.1, samurai: 2.2, cavalry: 3, busho: 4, player: 3, porter: 0.3 };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const ang = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
const fwd = (h) => ({ x: Math.sin(h), z: Math.cos(h) });

function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return best;
}

export class Commander {
  constructor(rt) {
    this.rt = rt;
    this.army = rt.army;
    this.world = rt.world;
    this.S = new Map();
    this.scanT = 0;
    this.stats = { flank: 0, withdraw: 0, relieve: 0, support: 0, brace: 0, lane: 0, breach: 0, sally: 0, cycle: 0, unstick: 0 };
    this.off = !!(rt.def.noAI || rt.def.dojo || (typeof window !== 'undefined' && window.__noAI));
  }

  skillOf(team) {
    const D = this.rt.def.aiSkill || this.rt.G.difficulty || 'normal';
    return SKILL[team === 0 ? 'normal' : D] || SKILL.normal;
  }

  log(g, text) {
    const L = typeof window !== 'undefined' && window.__aiLog;
    if (L) { L.push(`${Math.round(this.rt.t)}s ${g.team === 0 ? '味' : '敵'}:${g.name || '隊'} ${text}`); if (L.length > 400) L.shift(); }
  }

  // ---------------- 毎コマ ----------------
  update(dt) {
    if (this.off) return;
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 0.5; this.scan(); }
    for (const g of this.army.groups) this.step(g, dt);
  }

  // 隊の様子をまとめる（半秒ごと。兵を一度なめるだけ）
  scan() {
    const S = this.S;
    S.clear();
    const tally = new Map();
    this.siege = new Map();   // 柵・門ごとに、取り付いている敵の数
    for (const g of this.army.groups) {
      let n = 0, x = 0, z = 0, str = 0, eng = 0, fx = 0, fz = 0, fn = 0, fleeT = 0, cav = 0, gun = 0, bow = 0, spear = 0;
      tally.clear();
      for (const u of g.units) {
        if (!u.alive || u.type === 'dummy' || u.noTarget) continue;
        n++; x += u.pos.x; z += u.pos.z;
        str += (WEIGHT[u.type] || 1) * Math.max(0.25, u.hp / u.maxHp);
        if (u.type === 'cavalry' || u.type === 'busho' && u.mounted) cav++;
        else if (u.type === 'gun') gun++;
        else if (u.type === 'bow') bow++;
        else if (u.type === 'ashigaru') spear++;
        const t = u.target;
        if (t && t.alive) {
          if (t.isStruct) { this.siege.set(t, (this.siege.get(t) || 0) + 1); continue; }
          if (Math.abs(t.pos.x - u.pos.x) + Math.abs(t.pos.z - u.pos.z) < 14) {
            eng++;
            if (t.fleeing) fleeT++;
            else { fx += u.pos.x; fz += u.pos.z; fn++; }
            if (t.group) tally.set(t.group, (tally.get(t.group) || 0) + 1);
          }
        }
      }
      if (!n) continue;
      let foe = null, fc = 0;
      for (const [k, v] of tally) if (v > fc) { fc = v; foe = k; }
      const kind = cav >= n * 0.5 ? 'cav' : gun >= n * 0.5 ? 'gun' : bow >= n * 0.5 ? 'bow' : 'melee';
      const h = g._face ?? g.facing;
      S.set(g, {
        g, key: g, team: g.team, n, c: { x: x / n, z: z / n }, str: str * (0.45 + Math.max(0, g.morale) / 180), kind, spear: spear >= n * 0.5,
        missile: kind === 'gun' || kind === 'bow', eng, fleeT, fight: fn ? { x: fx / fn, z: fz / fn } : null, foe, by: [],
        h, f: fwd(h), hw: g.halfWidth(), morale: g.morale, routed: g.routed || g.order === 'flee',
        yari: g.formation === 'yari' && (g.order === 'hold' || g.order === 'yari'),
      });
    }
    // 自分の組を持たない本人も、敵から見れば一つの的
    const P = this.army.playerUnit;
    if (P && P.alive && !this.rt.squadGroups.length) S.set(P, { g: null, key: P, team: P.team, n: 1, c: { x: P.pos.x, z: P.pos.z }, str: 3, kind: 'melee', missile: false, eng: 0, fleeT: 0, fight: null, foe: null, by: [], h: P.heading, f: fwd(P.heading), hw: 0.5, morale: 100, routed: false, yari: false, player: true });
    // どの隊がどの隊に斬りかかっているか
    for (const s of S.values()) if (s.foe && S.has(s.foe)) S.get(s.foe).by.push(s);
  }

  // その辺りの、ある側の強さ
  strNear(team, p, r, skip) {
    let k = 0;
    for (const s of this.S.values()) if (s.team === team && !s.routed && s.g !== skip && dist(s.c, p) < r) k += s.str;
    return k;
  }

  // ---------------- 地形 ----------------
  wet(x, z) {
    const d = this.world.def;
    if (d.paddy && d.paddy(x, z) > 0.3) return 1;
    for (const st of d.streams || []) if (distToPolyline(x, z, st.pts) < st.w * 1.4) return 1;
    const W = d.water;
    if (W && x > W.x - 1 && x < (W.x2 ?? 1e9) + 1 && this.world.heightAt(x, z) < W.level + 0.3) return 1;
    return 0;
  }
  inGrove(x, z) {
    for (const gv of this.world.def.groves || []) if (Math.hypot(x - gv.x, z - gv.z) < gv.r) return 1;
    return 0;
  }
  // 行き先の近くで、高くて乾いた所を選ぶ（射手は林の縁も好む）
  spot(p, s, sk, r = 7) {
    let best = p, bs = -Infinity;
    const h0 = this.world.heightAt(p.x, p.z);
    for (let i = -1; i < 8; i++) {
      const q = i < 0 ? p : { x: p.x + Math.sin(i * 0.785) * r, z: p.z + Math.cos(i * 0.785) * r };
      const sc = -dist(p, q) * 0.35 + (this.world.heightAt(q.x, q.z) - h0) * 1.2 * sk.terrain - this.wet(q.x, q.z) * 12 + (s.missile ? this.inGrove(q.x, q.z) * 2 : 0);
      if (sc > bs) { bs = sc; best = q; }
    }
    return best;
  }

  // ---------------- 隊ごと ----------------
  init(g) {
    const A = g._ai = { order: null, mode: null, t: Math.random() * 1.5, home: { x: g.anchor.x, z: g.anchor.z }, seekBase: g.seekRange, seekSet: null, fireSet: null, fire0: g.fire, ax: null, az: null, fset: null, f0: g.facing, formSet: null, wdCd: 0, engT: 0 };
    this.walls(g, A);
    return A;
  }
  // 自分の側の柵・塀がすぐそばにあれば、城や陣の内を守る隊（遠くまで追えと言われた隊＝seekRange が大きい隊は除く）
  walls(g, A) {
    let k = 0;
    A.fort = 0;
    const hw = g.halfWidth() + 8;
    for (const st of this.army.structs) {
      if (!st.alive || !st.seg || st.team !== g.team) continue;
      const d = Math.hypot((st.seg[0] + st.seg[2]) / 2 - g.anchor.x, (st.seg[1] + st.seg[3]) / 2 - g.anchor.z);
      if (d < 30) k++;
      if (d < hw) A.fort++;
    }
    A.walled = k >= 2;   // 城や陣の塀・柵の内（持ち場の隊は向きも陣形も変えない）
    A.garrison = A.walled && (g.seekRange ?? 45) < 40;
  }

  controls(g) {
    if (g.noAI || g.focus || g.isPlayerSquad || g === this.rt.hostGroup) return null;
    if (g.guard && (g.order === 'hold' || g.order === 'yari')) return 'guard';
    if (g.ai === true) return 'full';
    if (g.order === 'attack') return 'full';
    if (g.order === 'hold' || g.order === 'yari') return 'fine';
    return null;
  }

  step(g, dt) {
    const s = this.S.get(g);
    let A = g._ai;
    if (!s || g.routed || !g.count) { if (A && A.mode) this.release(g, A); return; }
    if (!A) A = this.init(g);
    // g.ai の隊は order を 'attack' にしておく（大将の頭が中で動かす）
    if (g.ai === true && g.order !== 'attack' && g.order !== 'flee' && !g.focus) { g.order = 'attack'; A.order = 'attack'; }
    const ctl = this.controls(g);
    // 戦の定義が下知を変えた：大将の頭は手を引き、新しい下知の中身を覚え直す
    if (A.order !== g.order) {
      if (A.mode) this.release(g, A);
      if (A.gd) this.unguard(g, A);
      A.order = g.order; A.ctl = ctl;
      A.home = { x: g.anchor.x, z: g.anchor.z };
      A.seekBase = g.seekRange; A.fire0 = g.fire; A.f0 = g.facing; A.fset = null; A.spot = null; A.sallied = false; A.waitT = 0;
      this.walls(g, A);
      A.t = Math.min(A.t, 0.6 + Math.random());
    }
    A.ctl = ctl;
    if (!ctl) return;
    // 戦の定義が中身を変えたか（seekRange・fire・anchor）
    if (A.seekSet !== null && g.seekRange !== A.seekSet) { A.seekBase = g.seekRange; A.seekSet = null; this.drop(g, A); }
    if (A.seekSet === null) A.seekBase = g.seekRange;
    if (A.fireSet !== null && g.fire !== A.fireSet) { A.fire0 = g.fire; A.fireSet = null; }
    if (A.fireSet === null) A.fire0 = g.fire;
    if (ctl === 'full' && A.ax !== null && (Math.abs(g.anchor.x - A.ax) > 1e-4 || Math.abs(g.anchor.z - A.az) > 1e-4)) {
      A.home = { x: g.anchor.x, z: g.anchor.z }; A.spot = null; this.drop(g, A);
    }
    const sk = this.skillOf(g.team);
    A.t -= dt;
    if (ctl === 'guard') { this.guard(g, A, s, sk, dt); return; }
    if (ctl === 'fine') {
      if (A.t <= 0) { A.t = sk.think * 0.6 * (0.8 + Math.random() * 0.4); this.fine(g, A, s, sk); }
      return;
    }
    // 斬り合っている間（騎馬の入れ替わりに使う）
    A.engT = s.eng >= Math.max(2, s.n * 0.3) ? A.engT + dt : Math.max(0, A.engT - dt * 2);
    if (A.t <= 0 || (A.arrived && A.mode && this.rt.t > (A.arrCd || 0))) {
      A.t = sk.think * (0.8 + Math.random() * 0.4);
      A.arrived = false; A.arrCd = this.rt.t + 0.6;
      this.decide(g, A, s, sk);
    }
    this.move(g, A, s, dt);
  }

  // 手を引く：借りていた seekRange・fire を戻す
  release(g, A) {
    if (A.seekSet !== null && g.seekRange === A.seekSet) g.seekRange = A.seekBase;
    if (A.fireSet !== null && g.fire === A.fireSet) g.fire = A.fire0;
    A.seekSet = null; A.fireSet = null;
    A.mode = null; A.goal = null; A.ax = null; A.tg = null;
  }
  drop(g, A) { this.release(g, A); }
  seek(g, A, v) {
    if (v === null) { if (A.seekSet !== null && g.seekRange === A.seekSet) g.seekRange = A.seekBase; A.seekSet = null; return; }
    if (A.seekSet === null) A.seekBase = g.seekRange;
    g.seekRange = v; A.seekSet = v;
  }
  hold(g, A, on) {
    // 射手が動く間は撃つのをやめる（撃ち始めると足が止まるので）
    if (on) { if (A.fireSet === null) A.fire0 = g.fire; if (A.fire0 === false) return; g.fire = false; A.fireSet = false; }
    else if (A.fireSet !== null) { if (g.fire === A.fireSet) g.fire = A.fire0; A.fireSet = null; }
  }
  setMode(g, A, mode, goal, spd, o = {}) {
    A.mode = mode; A.goal = goal; A.spd = spd; A.modeT = this.rt.t; A.tg = o.tg || null; A.stuckT = 0; A.last = null;
    A.until = o.until ?? this.rt.t + 30;
    this.seek(g, A, o.seek ?? null);
    this.hold(g, A, !!o.noFire);
  }

  // ---------------- 持ち場を守る隊：向きと槍衾だけ ----------------
  fine(g, A, s, sk) {
    const t = this.rt.t;
    // 戦の定義が向きを変えたら、それを元の向きとして覚える
    if (A.fset === null || Math.abs(g.facing - A.fset) > 1e-5) { A.f0 = g.facing; A.fset = null; }
    let near = null, nd = Infinity, cav = null, cd = Infinity;
    for (const o of this.S.values()) {
      if (o.team === g.team || o.routed) continue;
      const d = dist(o.c, s.c);
      if (d < nd) { nd = d; near = o; }
      if (o.kind === 'cav' && d < cd) { cd = d; cav = o; }
    }
    // 向き：斬り合っていなければ、近づく敵へ向き直る（元の向きから大きくは外さない。柵や塀の内の隊はそのまま）
    if (!A.fort && !A.walled && s.eng < s.n * 0.25 && s.n >= 3) {
      if (near && nd < (s.missile ? 70 : 60)) {
        const lim = nd < 22 ? 1.5 : 0.6;
        const want = A.f0 + Math.max(-lim, Math.min(lim, angleDiff(A.f0, ang(s.c, near.c))));
        if (Math.abs(angleDiff(g.facing, want)) > 0.12) { g.facing = want; A.fset = want; }
      } else if (A.fset !== null && Math.abs(angleDiff(g.facing, A.f0)) > 0.01) { g.facing = A.f0; A.fset = A.f0; }
    }
    // 槍衾：騎馬が寄せてくれば、槍の隊は穂先を揃えて構える
    if (s.spear && !A.fort && !A.walled && g.formation === 'line' && cav && cd < 48 && (A.cavD === undefined || cd < A.cavD - 1)) {
      A.form0 = g.formation; g.formation = 'yari'; A.formSet = 'yari'; A.braceT = t;
      this.stats.brace++; this.log(g, 'brace 騎馬に槍衾');
    }
    if (A.formSet && g.formation !== A.formSet) A.formSet = null;   // 戦の定義が陣形を変えた
    if (A.formSet && (!cav || cd > 70) && t - A.braceT > 15) { g.formation = A.form0; A.formSet = null; }
    else if (A.formSet && cav && cd < 70) A.braceT = t;
    A.cavD = cav ? cd : undefined;
  }

  // ---------------- 守る隊（本陣の旗本など）：寄る敵を迎え撃ち、離れたら持ち場へ ----------------
  guard(g, A, s, sk, dt) {
    const rt = this.rt, t = rt.t;
    let G = A.gd;
    if (!G) G = A.gd = { home: { x: g.anchor.x, z: g.anchor.z }, f0: g.facing, aggro0: g.aggro, form0: g.formation, on: false, seen: -99, goal: null, ax: null, az: null, aggroSet: null, fSet: null, formSet: null, t: 0 };
    // 戦の定義が持ち場・向き・間合い・陣形を変えたら、それを元として覚え直す
    if (G.ax !== null && (Math.abs(g.anchor.x - G.ax) > 1e-3 || Math.abs(g.anchor.z - G.az) > 1e-3)) { G.home = { x: g.anchor.x, z: g.anchor.z }; G.goal = null; }
    if (G.aggroSet !== null && g.aggro !== G.aggroSet) { G.aggro0 = g.aggro; G.aggroSet = null; }
    if (G.fSet !== null && Math.abs(g.facing - G.fSet) > 1e-5) { G.f0 = g.facing; G.fSet = null; }
    if (G.formSet && g.formation !== G.formSet) { G.form0 = g.formation; G.formSet = null; }
    if (G.fSet === null) G.f0 = g.facing;
    if (G.aggroSet === null) G.aggro0 = g.aggro;
    G.t -= dt;
    if (G.t <= 0) {
      G.t = 0.35 + Math.random() * 0.3;
      const sight = g.guardSight || 55, leash = g.guardLeash || 26;
      // 見える所（気づいた後は、声と足音で少し遠くまで）にいる敵。逃げる者は追わない
      const foe = this.army.nearestEnemy({ pos: { x: s.c.x, z: s.c.z }, team: g.team }, G.on ? sight * 1.25 : G.alertT > t ? sight * 1.5 : sight, (o) => !o.fleeing && o.type !== 'dummy');
      // 打たれた（兵が減った）のも気づくきっかけ
      const hurt = G.n0 !== undefined && s.n < G.n0;
      G.n0 = s.n;
      if (foe || (hurt && G.on)) G.seen = t;
      if (foe && !G.on) {
        G.on = true; g.guardOn = true;
        this.stats.alarm = (this.stats.alarm || 0) + 1;
        this.log(g, `guard 敵に気づく（${Math.round(dist(s.c, foe.pos))}m）、構えて向き直る`);
        this.army.play('eshout', s.c, 1.2);
        this.alarm(g, foe);
      }
      if (G.on && foe) {
        const fd = dist(G.home, foe.pos), a = ang(G.home, foe.pos);
        // 向き直る
        const want = ang(s.c, foe.pos);
        if (Math.abs(angleDiff(g.facing, want)) > 0.12) { g.facing = want; G.fSet = want; }
        // 槍の隊は穂先を揃える
        if (s.spear && fd < 45 && g.formation !== 'yari') { if (!G.formSet) G.form0 = g.formation; g.formation = 'yari'; G.formSet = 'yari'; }
        // 侍・槍は打って出る（持ち場から leash m まで）。射手はその場で撃つ
        if (!s.missile && fd < leash + 22) {
          const k = Math.max(0, Math.min(leash, fd - 3));
          G.goal = { x: G.home.x + Math.sin(a) * k, z: G.home.z + Math.cos(a) * k };
          const ag = Math.max(G.aggro0, 14);
          if (g.aggro !== ag) { g.aggro = ag; G.aggroSet = ag; }
        } else if (s.missile) {
          G.goal = null;
          if (g.fire === false && A.fire0 !== false) g.fire = true;
        }
      } else if (G.on && t - G.seen > 4) {
        // 敵が去った：持ち場へ戻り、元の構えに
        G.on = false; g.guardOn = false; G.goal = { ...G.home }; G.back = true; G.alertT = 0;
        if (G.aggroSet !== null && g.aggro === G.aggroSet) g.aggro = G.aggro0;
        G.aggroSet = null;
        this.log(g, 'guard 敵が去った、持ち場へ戻る');
      }
      if (!G.on && G.formSet && t - G.seen > 12) { if (g.formation === G.formSet) g.formation = G.form0; G.formSet = null; }
      if (!G.on && G.fSet !== null && !G.goal && t - G.seen > 6) { g.facing = G.f0; G.fSet = null; }
    }
    // 要を行き先へ動かす（兵が遅れていれば待つ）
    if (G.goal) {
      const dx = G.goal.x - g.anchor.x, dz = G.goal.z - g.anchor.z, d = Math.hypot(dx, dz);
      if (d > 0.3) {
        let sp = Math.max(2.4, g.speed * 1.2);
        if (dist(s.c, g.anchor) > s.hw + 6) sp *= 0.3;
        const k = Math.min(d, sp * dt);
        g.anchor = { x: g.anchor.x + dx / d * k, z: g.anchor.z + dz / d * k };
      } else if (G.back) { G.goal = null; G.back = false; }
      G.ax = g.anchor.x; G.az = g.anchor.z;
    } else { G.ax = g.anchor.x; G.az = g.anchor.z; }
  }
  // 使番：まわりの同じ側の守る隊・持ち場の隊へ知らせる（向き直らせ、守る隊は構えさせる）
  alarm(g, foe) {
    for (const h of this.army.groups) {
      if (h === g || h.team !== g.team || !h.count || h.routed || h.isPlayerSquad) continue;
      const c = h.anchor;
      if (dist(c, g.anchor) > 90) continue;
      const B = h._ai;
      if (h.guard && B && B.gd && !B.gd.on) { B.gd.t = Math.min(B.gd.t, 0.5 + Math.random()); B.gd.alertT = this.rt.t + 20; }
    }
    this.log(g, '使番が走る');
  }
  unguard(g, A) {
    const G = A.gd;
    if (G.aggroSet !== null && g.aggro === G.aggroSet) g.aggro = G.aggro0;
    if (G.formSet && g.formation === G.formSet) g.formation = G.form0;
    g.guardOn = false;
    A.gd = null;
  }

  // ---------------- 任された隊：数秒ごとの判断 ----------------
  decide(g, A, s, sk) {
    const rt = this.rt, t = rt.t;
    const base = A.seekBase || 30;
    const aware = A.garrison ? 42 : Math.max(55, base * 1.5);
    let leash = A.garrison ? 16 : Math.max(45, base * 1.3);
    const foes = [];
    for (const o of this.S.values()) {
      if (o.team === g.team || o.routed) continue;
      const d = dist(o.c, s.c);
      if (d < aware + o.hw && dist(o.c, A.home) < leash + base) foes.push({ o, d });
    }
    // 城兵：寄せ手が崩れかけていれば打って出る
    if (A.garrison) {
      const wk = foes.filter((q) => q.d < 60);
      const sally = wk.length > 0 && wk.every((q) => q.o.morale < 35) || (wk.length && this.strNear(1 - g.team, s.c, 45) < s.str * 0.45);
      if (sally) { leash = 60; if (!A.sallied) { A.sallied = true; this.stats.sally++; this.log(g, 'sally 寄せ手が崩れた、打って出る'); } }
    }

    // --- 続けている動き ---
    if (A.mode === 'rally') {
      if (g.morale >= 52 || t - A.modeT > 25 || s.eng >= s.n * 0.3) { this.release(g, A); }
      else return;
    }
    if (A.mode === 'withdraw' && !A.arrivedW) return;
    if (A.mode === 'reform') { if (t - A.modeT < 3) return; this.release(g, A); }
    if (A.mode === 'disengage' && t - A.modeT < 5) return;

    // --- 崩れかけ：下がって立て直し、控えを呼ぶ ---
    if (sk.withdraw && !A.garrison && g.morale < 38 && s.eng >= s.n * 0.25 && t > A.wdCd && s.n >= 3 && (A.wdN || 0) < sk.withdraw) {
      const foeS = s.by[0] || (s.foe && this.S.get(s.foe));
      const press = this.strNear(1 - g.team, s.c, 20);
      // 代わりに出る控えがいる時だけ下がる（いなければ踏みとどまって戦う）
      const relief = foeS && press > s.str * 0.8 && sk.relieve ? this.findRelief(g, foeS) : null;
      if (relief) {
        const away = this.away(s.c, foeS.c);
        const friends = this.friendCentroid(g, s.c, 80);
        let q = { x: s.c.x + away.x * 22, z: s.c.z + away.z * 22 };
        if (friends) q = { x: q.x * 0.6 + (friends.x - away.x * 6) * 0.4, z: q.z * 0.6 + (friends.z - away.z * 6) * 0.4 };
        q = this.spot(q, s, sk, 6);
        A.wdCd = t + 45; A.arrivedW = false; A.wdN = (A.wdN || 0) + 1;
        this.setMode(g, A, 'withdraw', q, Math.max(3.4, g.speed * 1.4), { seek: 2, noFire: s.missile, until: t + 20 });
        this.stats.withdraw++; this.log(g, `withdraw 士気${Math.round(g.morale)}、下がって立て直す`);
        this.callRelief(g, foeS, relief);
        return;
      }
    }

    // --- 城兵：破れ目と取り付かれた門へ ---
    if (A.garrison && leash < 60) {
      const br = this.breach(g, A, s);
      if (br) { this.setMode(g, A, 'breach', br, Math.max(2.8, g.speed * 1.3), { until: t + 20 }); return; }
    }

    // --- 深追いしない：逃げる敵を追って持ち場から離れすぎたら戻る ---
    const far = dist(s.c, A.home);
    if (far > leash + base * 0.5 && (!foes.length || (s.eng > 0 && s.fleeT >= s.eng * 0.6))) {
      if (A.mode === 'return') return;
      this.setMode(g, A, 'return', this.spot(A.home, s, sk), g.speed * 1.2, { seek: 4, noFire: s.missile, until: t + 30 });
      this.log(g, 'return 深追いせず戻る');
      return;
    }

    // --- 控えを呼ばれて出ている ---
    if (A.mode === 'relieve' && A.tg && this.S.has(A.tg) && t < A.until) { this.approach(g, A, s, sk, this.S.get(A.tg), 'relieve'); return; }

    if (s.missile) return this.missile(g, A, s, sk, foes);
    if (s.kind === 'cav') return this.cavalry(g, A, s, sk, foes);
    return this.melee(g, A, s, sk, foes);
  }

  // 鉄砲・弓：間合いを保ち、寄られたら味方の後ろへ、射界に味方がいれば横へずれる
  missile(g, A, s, sk, foes) {
    const t = this.rt.t;
    const range = s.kind === 'gun' ? 44 : 32 * (1 - 0.35 * (this.army.rain || 0));
    let tgt = null, td = Infinity, melee = null, md = Infinity;
    for (const { o, d } of foes) {
      if (d < td) { td = d; tgt = o; }
      if (!o.missile && d < md) { md = d; melee = o; }
    }
    if (!tgt) return this.idle(g, A, s, sk);
    // 寄られた：味方の槍の後ろへ下がる（斬り合いの最中は下がれない）
    if (melee && md < (s.kind === 'gun' ? 16 : 12) + melee.hw && s.eng < s.n * 0.4 && t > (A.skCd || 0)) {
      const fr = this.shield(g, s, melee);
      const away = this.away(s.c, melee.c);
      const q = fr ? { x: fr.c.x - fr.f.x * (fr.hw * 0.3 + 9), z: fr.c.z - fr.f.z * (fr.hw * 0.3 + 9) } : { x: s.c.x + away.x * 18, z: s.c.z + away.z * 18 };
      A.skCd = t + 14;
      this.setMode(g, A, 'skirmish', this.spot(q, s, sk, 5), 3.8, { seek: 3, noFire: true, until: t + 12 });
      this.log(g, `skirmish 寄られた、${fr ? '味方の後ろへ' : '下がる'}`);
      return;
    }
    // 射界に味方：横へずれて撃てる所へ
    if (sk.lane && td < range * 1.15 && t > (A.laneCd || 0) && this.blocked(s, tgt)) {
      const r = { x: Math.cos(ang(s.c, tgt.c)), z: -Math.sin(ang(s.c, tgt.c)) };
      let best = null;
      for (const k of [10, -10, 16, -16]) {
        const q = { x: s.c.x + r.x * k, z: s.c.z + r.z * k };
        if (!this.blocked({ ...s, c: q }, tgt) && !this.wet(q.x, q.z)) { best = q; break; }
      }
      A.laneCd = t + 9;
      if (best) {
        this.setMode(g, A, 'lane', best, 3.2, { seek: 3, noFire: true, until: t + 10 });
        this.stats.lane++; this.log(g, 'lane 射界の味方を避けて横へ');
        return;
      }
    }
    // 間合いの外：撃てる所まで寄る（高い所を選ぶ）
    if (td > range * 0.95) {
      const a = ang(tgt.c, s.c);
      const q = this.spot({ x: tgt.c.x + Math.sin(a) * range * 0.75, z: tgt.c.z + Math.cos(a) * range * 0.75 }, s, sk, 6);
      this.setMode(g, A, 'approach', q, g.speed, { tg: tgt.key, until: t + 25 });
      return;
    }
    // 撃てる所にいる：その場で撃つ（向きを敵へ）
    this.release(g, A);
    g.facing = ang(s.c, tgt.c);
  }

  // 騎馬：槍衾の正面を避け、横か後ろへ回ってから突く。長く斬り合えば離れて立て直す
  cavalry(g, A, s, sk, foes) {
    const t = this.rt.t;
    if (sk.cycle && A.engT > sk.cycle && s.eng > 0) {
      const foeS = s.foe && this.S.get(s.foe);
      if (foeS) {
        const away = this.away(s.c, foeS.c);
        const side = A.side || 1;
        const q = { x: s.c.x + away.x * 26 - away.z * side * 8, z: s.c.z + away.z * 26 + away.x * side * 8 };
        A.engT = 0;
        this.setMode(g, A, 'disengage', q, 7, { seek: 2, until: t + 8 });
        this.stats.cycle++; this.log(g, 'cycle 駆け抜けて離れ、立て直す');
        return;
      }
    }
    if (A.mode === 'disengage') { this.setMode(g, A, 'reform', null, 0, { seek: 5, until: t + 3 }); return; }
    if (s.eng >= s.n * 0.3) return this.engage(g, A, s);
    // 回り込みの途中なら、的を替えずに回り切る
    const cur = A.mode === 'flank' && A.tg && this.S.get(A.tg);
    if (cur && !cur.routed) return this.flank(g, A, s, sk, cur, 'cav');
    const tgt = this.pick(g, s, sk, foes, true);
    if (!tgt) return this.idle(g, A, s, sk);
    if (Math.random() < sk.cavFlank) return this.flank(g, A, s, sk, tgt, 'cav');
    this.approach(g, A, s, sk, tgt, 'approach');
  }

  // 槍・侍：横隊で押し合い、崩れた所へ詰める。手が空けば、味方と斬り合う敵の横へ回る
  melee(g, A, s, sk, foes) {
    if (s.eng >= s.n * 0.3) return this.engage(g, A, s);
    if (g.reserve && !foes.some((q) => q.d < (A.seekBase || 20) * 0.6)) return this.idle(g, A, s, sk);
    const tgt = this.pick(g, s, sk, foes, false);
    if (!tgt) return this.idle(g, A, s, sk);
    // 味方と斬り合っている敵なら、横へ回る（こちらが正面にいない時だけ回り道になる）
    if (tgt.by.length && s.n >= 5 && !tgt.player && Math.random() < sk.flank) return this.flank(g, A, s, sk, tgt, 'foot');
    // 自分より強く、ほかの味方と斬り合ってもいない敵へは、ひとりで出ない（高い所で待つ）。
    // ただし戦の定義が「攻めよ」と命じた隊は、長くは待たない（しばらく待って味方が来なければ出る）
    const waitMax = g.ai === true ? 60 : 12;
    if (sk.smart && tgt.str > s.str * 2 && !tgt.by.length && !tgt.player && (A.waitT || 0) < waitMax) {
      A.waitT = (A.waitT || 0) + sk.think;
      const home = this.spot(A.home, s, sk, 10);
      if (dist(home, s.c) > 3) this.setMode(g, A, 'wait', home, g.speed, { until: this.rt.t + 20 });
      else { this.release(g, A); g.facing = ang(s.c, tgt.c); }
      return;
    }
    this.approach(g, A, s, sk, tgt, 'approach');
  }

  // 的を選ぶ：近さ・弱り・味方と斬り合っているか・射手か（騎馬は射手を好む）・槍衾の正面は嫌う
  pick(g, s, sk, foes, cav) {
    let best = null, bs = -Infinity;
    for (const { o, d } of foes) {
      let sc = -d / 30;
      if (sk.smart) {
        if (o.morale < 40) sc += 0.8 * sk.smart;
        if (o.by.length) sc += 1.0;
        if (s.str > o.str * 1.3) sc += 0.4;
        if (o.str > s.str * 1.6 && !o.by.length) sc -= 1.2;
        // 味方を押している敵は叩く
        for (const b of o.by) if (b.morale < 50) sc += 0.8;
        if (cav && o.missile) sc += 1.2;
        if (cav && o.yari) sc -= 0.6;
        if (o.player) sc += 0.3;
      }
      if (sc > bs) { bs = sc; best = o; }
    }
    return best;
  }

  // 寄せる：敵の手前の、高くて乾いた所へ。着けば兵が自分で的を選んで斬りかかる
  approach(g, A, s, sk, tgt, mode) {
    const t = this.rt.t;
    const base = A.seekBase || 20;
    const d = dist(s.c, tgt.c);
    if (d < Math.min(base, 30) * 0.8 + tgt.hw) { this.engage(g, A, s, tgt); return; }
    const key = tgt.key;
    const goal = () => {
      const o = this.S.get(key);
      if (!o) return null;
      const a = ang(o.c, s.c);
      const r = Math.min(base, 26) * 0.5 + o.hw * 0.5;
      return { x: o.c.x + Math.sin(a) * r, z: o.c.z + Math.cos(a) * r };
    };
    const sp = mode === 'relieve' ? Math.max(3.2, g.speed * 1.3) : g.speed;
    if (A.mode !== mode || A.tg !== key) this.setMode(g, A, mode, goal, sp, { tg: key, until: t + (mode === 'relieve' ? 40 : 30) });
  }

  // 横・後ろへ回る：正面の前を横切らないよう、正面にいれば大きく外を回る
  flank(g, A, s, sk, tgt, kind) {
    const t = this.rt.t;
    const key = tgt.key;
    if (A.mode === 'flank' && A.tg === key) {
      // 横へ回り終えた：そこから突く
      const q = A.stage === 1 && typeof A.goal === 'function' ? A.goal() : null;
      if (q && dist(q, s.c) < 8) this.engage(g, A, s, tgt);
      return;
    }
    const rel = { x: s.c.x - tgt.c.x, z: s.c.z - tgt.c.z };
    const front = rel.x * tgt.f.x + rel.z * tgt.f.z;
    const right = { x: tgt.f.z, z: -tgt.f.x };
    const side = rel.x * right.x + rel.z * right.z >= 0 ? 1 : -1;
    // もう横か後ろにいる：そのまま突く
    if (front < -2 || Math.abs(rel.x * right.x + rel.z * right.z) > tgt.hw + 6 && front < 6) { this.approach(g, A, s, sk, tgt, 'approach'); return; }
    A.side = side; A.stage = front > 0 ? 0 : 1;
    const off = kind === 'cav' ? 12 : 7;
    const goal = () => {
      const o = this.S.get(key);
      if (!o) return null;
      const r = { x: o.f.z * A.side, z: -o.f.x * A.side };
      // 一つ目：横の外（正面より少し前）。二つ目：横の後ろ寄り
      if (A.stage === 0) {
        const q = { x: o.c.x + r.x * (o.hw + off + 10) + o.f.x * 4, z: o.c.z + r.z * (o.hw + off + 10) + o.f.z * 4 };
        const me = this.S.get(g);
        if (me && dist(me.c, q) < 7) A.stage = 1;
        return q;
      }
      return { x: o.c.x + r.x * (o.hw + off) - o.f.x * off * 0.7, z: o.c.z + r.z * (o.hw + off) - o.f.z * off * 0.7 };
    };
    this.setMode(g, A, 'flank', goal, kind === 'cav' ? 6.5 : Math.max(2.6, g.speed * 1.2), { tg: key, seek: kind === 'cav' ? 5 : 6, until: t + (kind === 'cav' ? 20 : 30) });
    this.stats.flank++; this.log(g, `flank ${tgt.g ? tgt.g.name || '敵' : '本人'}の${A.side > 0 ? '右' : '左'}へ回る（${kind === 'cav' ? '騎馬' : '徒'}）`);
  }

  // 斬り合い：隊の要を斬り合う兵の所へ寄せ、残りの兵も加わらせる。崩れかけの敵へは押し込む
  engage(g, A, s, tgt) {
    const t = this.rt.t;
    const key = s.foe || (tgt && (tgt.key)) || null;
    const goal = () => {
      const me = this.S.get(g);
      if (!me) return null;
      const o = key && this.S.get(key);
      if (o && !o.routed && o.morale < 35) return { x: o.c.x, z: o.c.z };   // 崩れかけた所へ詰める
      if (me.fight) return me.fight;
      if (o && !o.routed) return { x: o.c.x, z: o.c.z };
      return { x: g.anchor.x, z: g.anchor.z };   // 逃げる敵は追わず、その場で
    };
    if (A.mode !== 'engage' || A.tg !== key) this.setMode(g, A, 'engage', goal, Math.max(2, g.speed * 0.9), { tg: key, until: t + 60 });
  }

  // することのない隊：持ち場の近くの高い所で、敵へ向き直り、ときどき少し前後する
  idle(g, A, s, sk) {
    const t = this.rt.t;
    if (!A.spot) A.spot = A.garrison || A.fort ? { ...A.home } : this.spot(A.home, s, sk, 9);
    let near = null, nd = Infinity;
    for (const o of this.S.values()) if (o.team !== g.team && !o.routed) { const d = dist(o.c, s.c); if (d < nd) { nd = d; near = o; } }
    const face = near && nd < 250 ? ang(s.c, near.c) : g.facing;
    // 少し前後する（敵が見える所にいる時だけ。柵や塀の内ではしない）
    let q = A.spot;
    if (near && nd < 110 && !A.garrison && !A.fort) {
      if (t > (A.swayAt || 0)) { A.swayAt = t + 12 + Math.random() * 8; A.sway = A.sway ? 0 : (Math.random() < 0.5 ? 1.4 : -1.2); }
      const f = fwd(face);
      q = { x: A.spot.x + f.x * (A.sway || 0), z: A.spot.z + f.z * (A.sway || 0) };
    }
    if (dist(q, g.anchor) > 0.6) this.setMode(g, A, 'idle', q, Math.min(g.speed, 2), { until: t + 20 });
    else this.release(g, A);
    A.faceTo = face;
    if (Math.abs(angleDiff(g.facing, face)) > 0.15) g.facing = face;
  }

  // 控えを出す：崩れかけた味方の相手へ、手の空いた隊を向かわせる
  findRelief(g, foeS) {
    let best = null, bd = 110;
    for (const s of this.S.values()) {
      const h = s.g;
      if (!h || h === g || s.team !== g.team || s.routed || !h._ai || h._ai.ctl !== 'full' || s.n < 4 || h.morale < 55) continue;
      if (s.eng > s.n * 0.2 || h._ai.mode === 'withdraw' || h._ai.mode === 'rally' || h._ai.mode === 'relieve') continue;
      const d = dist(s.c, foeS.c);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }
  callRelief(g, foeS, best) {
    const B = best._ai, sB = this.S.get(best);
    const key = foeS.key;
    this.release(best, B);
    this.approach(best, B, sB, this.skillOf(best.team), foeS, 'relieve');
    B.tg = key;
    this.stats.relieve++; this.log(best, `relieve ${g.name || '味方'}に代わって出る`);
  }

  // 寄られた射手が隠れる味方の槍の隊
  shield(g, s, foe) {
    let best = null, bd = 45;
    for (const o of this.S.values()) {
      if (o.team !== g.team || o.g === g || o.routed || o.missile || o.n < 5 || o.player) continue;
      const d = dist(o.c, s.c);
      // 敵と自分の間にいる、か、敵から見て自分より遠くない所
      if (d < bd && dist(o.c, foe.c) < dist(s.c, foe.c) + 8) { bd = d; best = o; }
    }
    return best;
  }

  // 射界に味方がいるか（隊の真ん中から敵の真ん中へ、線の上に味方の兵が三人より多く立っていれば塞がれている）
  blocked(s, o) {
    const a = s.c, b = o.c, L = dist(a, b);
    let k = 0;
    for (let i = 1; i <= 5; i++) {
      const f = i / 6;
      if (L * f < 4 || L * (1 - f) < 5) continue;
      const px = a.x + (b.x - a.x) * f, pz = a.z + (b.z - a.z) * f;
      this.army.forNear(px, pz, 2.5, (u) => { if (u.alive && u.team === s.team && u.group !== s.g && !u.fleeing && Math.abs(u.pos.x - px) < 2.5 && Math.abs(u.pos.z - pz) < 2.5) k++; });
      if (k > 3) return true;
    }
    return false;
  }

  // 城兵：破れた塀・柵、取り付かれた門の内側へ
  breach(g, A, s) {
    let best = null, bs = Infinity;
    for (const st of this.army.structs) {
      if (!st.seg || st.team !== g.team) continue;
      const m = { x: (st.seg[0] + st.seg[2]) / 2, z: (st.seg[1] + st.seg[3]) / 2 };
      const dh = dist(m, A.home);
      if (dh > 55) continue;
      const hit = st.alive ? (this.siege.get(st) || 0) : 0;
      if (st.alive && hit < 3) continue;
      const enemy = this.strNear(1 - g.team, m, 30);
      if (!enemy) continue;
      const sc = dh - (st.alive ? 0 : 15) - hit;
      if (sc < bs) {
        bs = sc;
        // 内側：持ち場のある側
        const nx = st.nx ?? -(st.seg[3] - st.seg[1]), nz = st.nz ?? (st.seg[2] - st.seg[0]);
        const nl = Math.hypot(nx, nz) || 1;
        const sg = ((A.home.x - m.x) * nx + (A.home.z - m.z) * nz) >= 0 ? 1 : -1;
        best = { x: m.x + nx / nl * sg * (st.alive ? 5 : 3.5), z: m.z + nz / nl * sg * (st.alive ? 5 : 3.5), broken: !st.alive };
      }
    }
    if (best && (!A.lastBreach || dist(A.lastBreach, best) > 4)) { A.lastBreach = best; this.stats.breach++; this.log(g, best.broken ? 'breach 破れ目を塞ぐ' : 'breach 取り付かれた所の内へ'); }
    return best;
  }

  away(from, foe) {
    const dx = from.x - foe.x, dz = from.z - foe.z, d = Math.hypot(dx, dz) || 1;
    return { x: dx / d, z: dz / d };
  }
  friendCentroid(g, p, r) {
    let x = 0, z = 0, w = 0;
    for (const s of this.S.values()) if (s.team === g.team && s.g !== g && !s.routed && !s.player && dist(s.c, p) < r) { x += s.c.x * s.n; z += s.c.z * s.n; w += s.n; }
    return w ? { x: x / w, z: z / w } : null;
  }

  // ---------------- 毎コマの足：要（anchor）を行き先へ動かす ----------------
  move(g, A, s, dt) {
    if (!A.mode) { A.ax = null; return; }
    const t = this.rt.t;
    if (t > A.until) { this.release(g, A); A.t = 0.4; return; }
    const goal = typeof A.goal === 'function' ? A.goal() : A.goal;
    if (!goal) {
      if (A.mode !== 'reform' && A.mode !== 'rally') { this.release(g, A); A.t = 0.4; return; }
      if (A.mode === 'rally' && g.morale < 55 && !this.army.foeNear(g, 12)) g.morale += 0.9 * dt;
      A.ax = g.anchor.x; A.az = g.anchor.z;
      return;
    }
    const dx = goal.x - g.anchor.x, dz = goal.z - g.anchor.z, d = Math.hypot(dx, dz);
    if (d > 0.4) {
      let sp = A.spd || g.speed;
      // 隊が遅れていれば要を待たせる（兵を置き去りにしない）
      const lag = dist(s.c, g.anchor);
      if (lag > s.hw + 8) sp *= 0.3;
      const k = Math.min(d, sp * dt);
      g.anchor.x += dx / d * k; g.anchor.z += dz / d * k;
      if (A.mode === 'engage') { const o = A.tg && this.S.get(A.tg); if (o) g.facing = ang(s.c, o.c); }
      else if (A.mode === 'withdraw' || A.mode === 'skirmish') { /* 下がる間も敵へ向いたまま、兵は背を見せて走る */ }
      else if (d > 2) g.facing = Math.atan2(dx, dz);
    } else if (A.mode !== 'engage' && A.mode !== 'idle') A.arrived = true;
    if (A.mode === 'withdraw' && (d < 2 || t - A.modeT > 18)) {
      A.arrivedW = true;
      const foeS = s.foe && this.S.get(s.foe);
      if (foeS) g.facing = ang(s.c, foeS.c);
      this.setMode(g, A, 'rally', null, 0, { seek: 6, until: t + 32 });
      A.arrived = false;
    }
    // 下がって立て直している間は、少しずつ落ち着く（敵が寄っていなければ）
    if (A.mode === 'rally' && g.morale < 55 && !this.army.foeNear(g, 12)) g.morale += 0.9 * dt;
    // 行き先へ進めない（柵・塀・人に詰まった）：しばらく動かなければ、別の手を考える
    if (A.mode === 'approach' || A.mode === 'flank' || A.mode === 'relieve' || A.mode === 'breach') {
      A.stuckT = (A.stuckT || 0) + dt;
      if (A.stuckT > 4) {
        if (A.last && dist(A.last, s.c) < 1.2 && s.eng < 2 && lagOf(s, g) > 5) {
          // 要だけ先に行って兵が付いて来ない：要を兵の所へ戻して、考え直す
          g.anchor.x = s.c.x; g.anchor.z = s.c.z;
          this.release(g, A); A.t = 0.5;
          this.stats.unstick++; this.log(g, 'unstick 進めない、考え直す');
          return;
        }
        A.last = { ...s.c }; A.stuckT = 0;
      }
    }
    A.ax = g.anchor.x; A.az = g.anchor.z;
  }
}
const lagOf = (s, g) => Math.hypot(s.c.x - g.anchor.x, s.c.z - g.anchor.z);
