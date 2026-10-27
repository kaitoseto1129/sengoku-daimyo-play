// 部隊（butai.js）：攻城・砦・山岳戦の RTS 指揮で使う「部隊」の土台。
// docs/siege-plan.md 2 章・6 章 S1。ほかの筋（rts.js・gunbai.js など）は、この形を触らず
// makeButai と B.order・B.stat だけを使う（筋 B の持ち場。ほかのファイルは直さない）。
//
// 部隊は名目の兵数（nominal）を持ち、見た目は二つの形を行き来する：
//   ・本物（real）：rt.army の Group（今までの Unit・戦い）。討たれると名目が減る
//   ・軽い（light）：world.addDistantArmy の大軍（数だけで押し合う）。近く・戦っている部隊だけ本物にする
// 本物の兵の合計は BUTAI_REAL_CAP（235）まで。切り替えは light.take/give で同じ場所の兵を入れ替えるだけなので、
// 兵が消えたり増えたりしない（名目の数はいつも real.count + lightCount() に等しい）。

export const BUTAI_REAL_CAP = 235;

// 部隊の兵科 → 軽い大軍（addDistantArmy）の種類
const LIGHT_KIND = { ashigaru: 'spear', samurai: 'spear', busho: 'spear', cavalry: 'cavalry', gun: 'gun', bow: 'bow' };
const MIX_KEYS = ['ashigaru', 'samurai', 'gun', 'bow', 'cavalry'];

// o.mix（{ ashigaru, samurai, gun, bow, cavalry } の割合）を足して 1 になる形に。無い・空なら null（今までどおり一つの兵種）
function normMix(m) {
  if (!m) return null;
  let t = 0;
  for (const k of MIX_KEYS) t += Math.max(0, m[k] || 0);
  if (t <= 0) return null;
  const o = {};
  for (const k of MIX_KEYS) o[k] = Math.max(0, m[k] || 0) / t;
  return o;
}

function realTotal(rt) {
  let n = 0;
  for (const b of rt.butai || []) if (b.real) n += b.real.count;
  return n + (rt.__perchReal || 0);   // 櫓の上の守り（perch.js）の本物も枠に数える
}

let nextId = 1;

export class Butai {
  constructor(rt, o = {}) {
    this.rt = rt;
    this.id = nextId++;
    this.name = o.name || '';
    this.general = o.general || null;
    this.kind = o.kind || 'ashigaru';
    this.mix = normMix(o.mix);     // 本物の兵種を割合で混ぜる（備。sonae.js）。無ければ kind 一つ
    this.nearReal = o.nearReal ?? 60;   // 近い・戦っている時の本物の数（備は 40）
    this.farReal = o.farReal ?? 12;     // 遠い時の本物の数
    this.sonae = null;             // 備（sonae.js）が包む時、その備。外から状態を読む
    this.taishoU = null;           // 侍大将の本物（u.keep。shrinkReal で戻さない）
    this._clashAt = -99;           // lightClash で最後に当たった時（備の「交戦中」）
    this.team = o.team ?? 0;
    this.faction = o.faction || (this.team === 0 ? 'oda' : 'takeda');
    this.armor = o.armor || 0;
    this.flag = o.flag || this.faction;
    this.look = o.look || null;    // 兵の見た目の上書き（鉢巻・僧兵など。o に混ぜる）
    this.nominal = Math.max(1, Math.round(o.nominal || 100));
    this.lost = 0;                 // 討ち減らされた数（名目 - lost = 今いる数）
    this.morale = o.morale ?? 100;   // 撤退中の部隊など初めから士気が低い備は o.morale で渡す（既定は今までどおり100）
    this.fatigue = o.fatigue ?? 0;   // 0〜1（既定は今までどおり0）
    this.pos = { x: (o.at && o.at.x) || 0, z: (o.at && o.at.z) || 0 };
    this.facing = o.facing || 0;
    this.route = o.route || null;  // [{x,z}, …]（castle_plan.js の道。今は持つだけ）
    this.routeIdx = 0;
    this.cmd = { id: 'hold', to: null, target: null, form: 'line' };
    this.real = null;              // 本物の Group（rt.army）
    this.light = null;             // 軽い大軍（world.addDistantArmy の戻り値）
    this.state = 'light';
    this._swT = 0;
    this._prevRealAlive = 0;
    // 軽い兵は道を譲って地図の端を越すことがある。本物へ替える前に置き場を確かめる。
    this._canSpawn = (x, z) => {
      const W = this.rt.world, lim = (W.def.moveLim || 176) - 1;
      return Math.abs(x) <= lim && Math.abs(z) <= lim && W.walkable(x, z);
    };
    this.maxReal = o.maxReal ?? null;   // 本物にしてよい数の上限（null なら今まで通り 近い時 60・遠い時 12）
    this.noSwitch = !!o.noSwitch;       // true なら本物⇄軽いを自分で切り替えない（adoptGroup で組を預けた部隊）
    this.wantReal = o.wantReal ?? null; // 束28：juten.js の重点が目指す本物の数（数か null。null なら今まで通り）

    this.lightWidth = o.lightWidth; this.lightDepth = o.lightDepth; // 山道などの備えの幅・奥行き。指定がなければ従来どおり。
    this._spawnLight();
    const cap = Math.max(0, BUTAI_REAL_CAP - realTotal(rt));
    const want = Math.max(0, Math.min(o.real ?? Math.min(this.nominal, 40), this.nominal, cap));
    if (want > 0) this.growReal(want);
  }

  // ---- 数 ----
  aliveNominal() { return Math.max(0, this.nominal - this.lost); }
  realCount() { return this.real ? this.real.count : 0; }
  lightCount() {
    if (!this.light) return 0;
    const A = this.light.army;
    return Math.max(0, (A.n || 0) - (A.took || 0));
  }

  // ---- 軽い（全員ぶんの土台）を置く ----
  _spawnLight() {
    const n = this.aliveNominal();
    if (n <= 0) { this.light = null; return; }
    this.light = this.rt.world.addDistantArmy({
      x: this.pos.x, z: this.pos.z,
      w: this.lightWidth ?? Math.max(8, Math.min(46, Math.sqrt(n) * 3)), d: this.lightDepth ?? 8,
      count: n, facing: this.facing, armor: this.armor || 0x2b3140, flag: this.flag,
      seed: this.id * 97 + 3, kind: this.mix ? 'mixed' : (LIGHT_KIND[this.kind] || 'mixed'), host: false,
    });
    this.light.army.butai = true;   // world.shyTick：近づかれても消さず、下がって間を取るだけ
  }

  // ---- 本物⇄軽いの切り替え（235 の枠を守る。同じ場所の兵を入れ替えるだけで数は変わらない） ----
  growReal(k) {
    const rt = this.rt;
    k = Math.max(0, Math.min(Math.round(k), this.aliveNominal() - this.realCount()));
    if (k <= 0) return 0;
    const room = BUTAI_REAL_CAP - realTotal(rt);
    k = Math.min(k, Math.max(0, room));
    if (k <= 0) return 0;
    // 崩れて逃げた本物の組へは足さない（足した兵もすぐ逃げて消え、名目が勝手に減り続ける）。
    // 皆いなくなっていれば、新しい組として出し直す。まだ逃げている者がいる間は待つ
    if (this.real && (this.real.routed || this.real.order === 'flee')) {
      if (this.real.count) return 0;
      this.real.butai = null; this.real = null; this._named = false;
    }
    let pts = this.light ? this.light.take(this.pos.x, this.pos.z, k, 1e9, null, this._canSpawn) : [];
    // 場外の軽い兵を出してから引き戻さない。替えられる兵だけを同じ場所に出す。
    if (this.light) { k = pts.length; if (!k) return 0; }
    const need = k - pts.length;
    for (let i = 0; i < need; i++) {
      pts.push({ x: this.pos.x + (Math.random() - 0.5) * 3, z: this.pos.z + (Math.random() - 0.5) * 3, yaw: this.facing, i: -1 });
    }
    if (!this.real) {
      this.real = rt.army.addGroup({
        team: this.team, faction: this.faction, name: this.name, order: 'hold', formation: 'line',
        anchor: { x: this.pos.x, z: this.pos.z }, facing: this.facing, morale: this.morale,
      });
      this.real.butai = this;
      // 出したての本物の組は、ここまでの下知（assault・attack 等）を知らず常に 'hold' で始まる。
      // 下知を出した時に本物がまだ居なかった隊（遠くで軽いまま号令を受けた）が、本物に替わっても
      // 'hold' のまま・g.assault も付かずに立ち尽くす（確かめで見つけた「道があるのに20秒動かない兵」）。
      // 今の下知（this.cmd）をここで本物の組にも掛け直す
      this.order(this.cmd);
    }
    // 将の名は部隊の一人だけに付ける（全員に付くと皆が名のある武将になる）
    // mix がある時は、今の本物の兵種の数と割合の差がいちばん大きい兵種から順に出す（侍大将は busho）
    let cnt = null;
    if (this.mix) { cnt = {}; for (const u of this.real.units) if (u.alive) cnt[u.type] = (cnt[u.type] || 0) + 1; }
    let tot = cnt ? this.real.count : 0;
    const pickType = () => {
      if (!this.mix) return this.kind;
      let best = 'ashigaru', bd = -1e9;
      for (const k of MIX_KEYS) { const d = this.mix[k] * (tot + 1) - (cnt[k] || 0); if (this.mix[k] > 0 && d > bd) { bd = d; best = k; } }
      cnt[best] = (cnt[best] || 0) + 1; tot++;
      return best;
    };
    let gi = -1;
    const list = pts.map((p, i) => {
      const named = i === 0 && this.general && !this._named;
      if (named) gi = i;
      return {
        type: named && this.mix ? 'busho' : pickType(), n: 1,
        o: { ...(this.look || {}), x: p.x, z: p.z, heading: p.yaw ?? this.facing, armor: this.armor || undefined, flag: this.flag, name: named ? this.general : undefined },
      };
    });
    if (this.general && list.length) this._named = true;
    const made = rt.army.spawn(this.real, list);
    made.forEach((u, i) => { if (this.light && pts[i] && pts[i].i >= 0) u.wkFrom = { A: this.light, i: pts[i].i }; });
    // 侍大将は本物から外さない（遠くでも軽い兵へ戻さない）。備（mix）は旗持ちも
    if (gi >= 0 && made[gi]) { made[gi].keep = true; this.taishoU = made[gi]; }
    if (this.mix) for (const u of made) if (u.banner) u.keep = true;
    if (!this.real.leader) {
      const lead = this.real.units.find((u) => u.type === 'busho') || this.real.units.find((u) => u.type === 'samurai');
      if (lead) this.real.leader = lead;
    }
    this.state = 'real';
    this._prevRealAlive = this.real.count;
    return made.length;
  }

  shrinkReal(k) {
    if (!this.real) return 0;
    const P = this.rt.player && this.rt.player.u;
    const alive = this.real.units.filter((u) => u.alive && !u.isPlayer && !u.keep);
    k = Math.min(Math.round(k), alive.length);
    if (k <= 0) return 0;
    // 自分から遠い者から軽いへ戻す（近くの戦いは崩さない）
    alive.sort((a, b) => {
      const da = P ? Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z) : 0;
      const db = P ? Math.hypot(b.pos.x - P.pos.x, b.pos.z - P.pos.z) : 0;
      return db - da;
    });
    let n = 0;
    for (let i = 0; i < k; i++) {
      const u = alive[i];
      if (u.wkFrom && u.wkFrom.A === this.light && u.wkFrom.A.give) u.wkFrom.A.give(u.wkFrom.i);
      this.rt.army.despawn(u);
      n++;
    }
    if (!this.real.count) this.state = this.light ? 'light' : 'gone';
    this._prevRealAlive = this.real.count;
    return n;
  }

  // ---- 軽い部隊どうしの数の戦い（正面で押し合う二つの部隊を、毎コマ少しずつ減らす） ----
  static lightClash(a, b, dt, k = 1) {
    if (!a || !b) return;
    const an = a.aliveNominal(), bn = b.aliveNominal();
    if (an <= 0 || bn <= 0) return;
    const ra = Math.max(0.15, (a.morale / 100) * (1 - a.fatigue * 0.4));
    const rb = Math.max(0.15, (b.morale / 100) * (1 - b.fatigue * 0.4));
    const pa = ra * Math.sqrt(an), pb = rb * Math.sqrt(bn);
    const rate = 0.6 * k * dt;
    const da = Math.min(an, rate * (pb / (pa + pb)) * an * 0.08);
    const db = Math.min(bn, rate * (pa / (pa + pb)) * bn * 0.08);
    a.lost = Math.min(a.nominal, a.lost + da); b.lost = Math.min(b.nominal, b.lost + db);
    // 千人の備が十人失うのと、十人の組が一人失うのを同じ損にしない。
    const ma = 85 * da / a.nominal, mb = 85 * db / b.nominal;
    a.morale = Math.max(5, a.morale - ma); b.morale = Math.max(5, b.morale - mb);
    if (a.real && a.real.count) a.real.morale = Math.max(5, a.real.morale - ma);
    if (b.real && b.real.count) b.real.morale = Math.max(5, b.real.morale - mb);
    a._clashAt = b._clashAt = a.rt.t || 0;
  }

  // ---- 下知 ----
  order(cmd) {
    this.cmd = { id: cmd.id, to: cmd.to || null, target: cmd.target || null, form: cmd.form || this.cmd.form };
    const g = this.real, L = this.light;
    const id = cmd.id;
    if (id === 'move' || id === 'charge') {
      const to = cmd.to;
      if (to) {
        const face = Math.atan2(to.x - this.pos.x, to.z - this.pos.z);
        if (g) {
          g.dest = { x: to.x, z: to.z }; g.facing = face;
          // 持ち場の隊（g.siegeAI。siege_ai.js の下知）は ai.js の頭を持たない（F4）。
          // 'attack' のままだと dest が使われず、出撃の下知のまま道の途中で動かなくなる
          // （確かめで見つけた「行き先があるのに20秒動かない兵」）。'move' の歩みで寄せ、着いたら 'attack' にする
          if (id === 'charge' && g.siegeAI) {
            g.order = 'move'; g.speed = Math.max(g.speed || 3, 3.4);
            g.onArrive = (gg) => { gg.order = 'attack'; gg.aggro = Math.max(gg.aggro || 0, 8); gg.seekRange = Math.max(gg.seekRange || 0, 45); };
          } else {
            g.order = id === 'charge' ? 'attack' : 'move';
            g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x: to.x, z: to.z }; };
          }
        }
        if (L) L.moveTo(to.x, to.z, undefined, { charge: id === 'charge' });
      }
    } else if (id === 'attack') {
      if (g) { g.order = 'attack'; g.aggro = Math.max(g.aggro || 0, 8); g.seekRange = Math.max(g.seekRange || 0, 45); }
    } else if (id === 'assault') {
      // 塀・門ごしで敵に届かない（wallBetween）間、立ち尽くさず門・柵を打ちに掛かる（army_think.js の g.assault 任せ）
      if (g) { g.order = 'assault'; g.aggro = Math.max(g.aggro || 0, 8); g.seekRange = Math.max(g.seekRange || 0, 45); g.assault = this.assault || null; }
    } else if (id === 'hold') {
      if (g) { g.order = 'hold'; g.dest = null; g.anchor = { x: this.pos.x, z: this.pos.z }; }
      if (L) L.halt();
    } else if (id === 'retreat') {
      const to = cmd.to;
      if (g) { g.order = 'move'; g.dest = to || { x: this.pos.x, z: this.pos.z }; g.speed = Math.max(g.speed || 3, 3.2); }
      if (L) { if (to) L.moveTo(to.x, to.z, undefined, { back: true }); else L.retreat(12); }
    }
    if (cmd.form) this.setForm(cmd.form);
  }
  setForm(f) {
    if (this.real) this.real.formation = f;
    this.cmd.form = f;
  }

  // ---- 毎コマ ----
  update(dt) {
    const rt = this.rt;
    if (this.real && this.real.count) {
      const aliveN = this.real.count;
      const diedNow = Math.max(0, this._prevRealAlive - aliveN);
      this.lost = Math.min(this.nominal, this.lost + diedNow);
      this._prevRealAlive = aliveN;
      this.morale = this.real.morale;
      const c = this.real.center();
      this.pos.x = c.x; this.pos.z = c.z; this.facing = this.real.facing;
    } else if (this.real) {
      this._prevRealAlive = 0;
    }

    // 疲れ：move/attack/charge の間は増え、hold で休めば戻る
    const busy = this.cmd.id === 'move' || this.cmd.id === 'attack' || this.cmd.id === 'charge' || this.cmd.id === 'assault';
    this.fatigue = Math.max(0, Math.min(1, this.fatigue + dt * (busy ? 1 / 70 : -1 / 35)));

    this._autoSwitch(dt);
  }

  // 235 の枠の中で、戦っている・自分の近くの部隊を優先して本物にする
  _autoSwitch(dt) {
    this._swT -= dt;
    if (this._swT > 0) return;
    this._swT = 1.2;
    if (this.noSwitch || this.aliveNominal() <= 0) return;
    const near = this._isNear();
    // 備の本物の数：近い時は nearReal、遠い時は farReal。戦が maxReal を決めていれば、それを上限に
    const cap = this.maxReal ?? Infinity;
    // 束28：wantReal（数か null）があれば、juten.js の重点がそれを目指す。null なら今のまま
    const want = this.wantReal != null
      ? Math.min(this.aliveNominal(), this.wantReal, cap)
      : Math.min(this.aliveNominal(), near ? Math.min(this.nearReal, cap) : Math.min(this.farReal, cap));
    const have = this.realCount();
    if (want > have) {
      const room = BUTAI_REAL_CAP - realTotal(this.rt);
      if (room > 0) this.growReal(Math.min(6, want - have, room));
    } else if (have > want) {
      this.shrinkReal(Math.min(6, have - want));
    }
  }
  _isNear() {
    const busy = this.cmd.id === 'attack' || this.cmd.id === 'charge' || this.cmd.id === 'assault';
    const P = this.rt.player && this.rt.player.u;
    if (!P || !P.alive) return busy;
    return busy || Math.hypot(this.pos.x - P.pos.x, this.pos.z - P.pos.z) < 70;
  }

  stat() {
    return {
      name: this.name, 兵力: this.aliveNominal(), 士気: Math.round(this.morale), 疲れ: Math.round(this.fatigue * 100),
      状態: this.state, 本物: this.realCount(), 軽い: this.lightCount(),
    };
  }
}

export function makeButai(rt, o) {
  rt.butai = rt.butai || [];
  const b = new Butai(rt, o);
  rt.butai.push(b);
  return b;
}

// 今ある組（enemyGroup などで作った、兵の種類が混じった組）を、部隊の本物として預ける。
// 部隊の軽い大軍から同じ数を隠すので「名目＝本物＋軽い」は崩れない。預けた部隊は自分で本物を増やさない（noSwitch）
export function adoptGroup(b, g) {
  if (!b || !g) return b;
  b.real = g; g.butai = b;
  b.state = 'real'; b.noSwitch = true;
  b._prevRealAlive = g.count;
  if (b.light && g.count) b.light.take(b.pos.x, b.pos.z, g.count);
  return b;
}

// 軽い部隊どうしの数の戦い（正面で当てた二つの部隊を毎コマ少しずつ減らす）
export function lightClash(a, b, dt, k = 1) { Butai.lightClash(a, b, dt, k); }

// 毎コマ、全部の部隊を進める（戦の定義の update から呼ぶ）
export function butaiTick(rt, dt) {
  for (const b of rt.butai || []) b.update(dt);
}
