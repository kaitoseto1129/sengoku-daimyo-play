// 軍の頭を全戦へ（armyhead.js）：battle.js の毎コマから armyHeadTick(rt, dt) を一行で呼ぶ。
// MVP・城の備（sonae.js が自分で作る戦）・別の係が持つ戦（SKIP）以外では、本物の組（rt.army.groups）を
// 備として包み（makeSonae の o.butai に薄い入れ物を渡す。軽い大軍は作らない）、gunsei.js を team ごとに一つ回す。
// 効くのは士気の上下・連鎖崩壊・敗走兵の押し・負けの知らせ・使番の知らせ（senkyo.js）まで。
// 下知（後詰・本陣を下げる）は組へ出さない（筋書きの段が組を動かすので、頭は士気だけ触る）。討死のくじも引かない。
import { makeSonae, sonaeTick } from './sonae.js';
import { makeGunsei, gunseiTick } from './gunsei.js';
import { BATTLES } from './state.js';

// 係が別に直している戦。つなぐ一行は後でメインが足す（armyHeadOn(rt) を呼べば SKIP を越えて入る）
const SKIP = new Set(['takato_siege',
  'dojo', 'castle', 'yasen']);
const MIN = 10, MAX_PER_TEAM = 10, SCAN = 4;

function stub(g, name) {
  const c = g.center();
  return {
    adopted: true, name, general: null, team: g.team, real: g, light: null, sonae: null,
    pos: { x: c.x, z: c.z }, facing: g.facing || 0, morale: g.morale, nominal: g.count, lost: 0,
    cmd: { id: 'hold', to: null, target: null, form: 'line' }, taishoU: null, _clashAt: -99, _named: true, dmgMult: 1,
    aliveNominal() { return Math.max(0, this.nominal - this.lost); },
    realCount() { return g.count; },
    order(cmd) { this.cmd = { id: cmd.id, to: cmd.to || null, target: null, form: this.cmd.form }; },   // 組は動かさない
    setForm() {},
    sync() {
      if (g.count > this.nominal) this.nominal = g.count;
      this.lost = Math.max(this.lost, this.nominal - g.count);
      this.morale = g.morale;
      if (g.count) { const p = g.center(); this.pos.x = p.x; this.pos.z = p.z; this.facing = g.facing || this.facing; }
    },
  };
}

function usable(g) {
  return (g.team === 0 || g.team === 1) && g.count >= MIN && !g.isRunner && !g.people && !g.isPlayerSquad && g.units && g.units.length;
}

export function armyHeadOn(rt) {
  if (!rt._head) rt._head = { t: 0, arr: [[], []], seen: new Set(), gun: [] };
}

function scan(rt) {
  const H = rt._head;
  for (const team of [0, 1]) {
    const list = rt.army.groups.filter((g) => g.team === team && !H.seen.has(g) && usable(g)).sort((a, b) => b.count - a.count);
    for (const g of list) {
      if (H.arr[team].length >= MAX_PER_TEAM) break;
      H.seen.add(g);
      const nm = g.name || (team === 0 ? '味方の備' : '敵の備');
      const S = makeSonae(rt, {
        id: `g${team}_${H.seen.size}`, name: nm, team, line: 1, slot: 'center',
        taisho: g.leader && g.leader.name ? g.leader.name : '組頭', nominal: g.count, butai: stub(g, nm), faction: g.faction,
      });
      S.b.sonae = S;
      H.arr[team].push(S);
    }
    if (H.arr[team].length && !H.gun[team]) H.gun[team] = makeGunsei(rt, { team, sonae: H.arr[team] });
    // 左・中・右（敵の重心へ向いた時の横の並び）
    const A = H.arr[team].filter((S) => S.b.aliveNominal() > 0);
    const foe = rt.army.groups.filter((g) => g.team !== team && (g.team === 0 || g.team === 1) && g.count > 0);
    if (A.length && foe.length) {
      let fx = 0, fz = 0; for (const g of foe) { const c = g.center(); fx += c.x; fz += c.z; }
      fx /= foe.length; fz /= foe.length;
      let ax = 0, az = 0; for (const S of A) { ax += S.b.pos.x; az += S.b.pos.z; }
      ax /= A.length; az /= A.length;
      const d = Math.hypot(fx - ax, fz - az) || 1, rx = (fz - az) / d, rz = -(fx - ax) / d;
      const lat = A.map((S) => ({ S, v: (S.b.pos.x - ax) * rx + (S.b.pos.z - az) * rz })).sort((p, q) => p.v - q.v);
      lat.forEach((e, i) => { e.S.slot = i < lat.length / 3 ? 'left' : (i >= lat.length * 2 / 3 ? 'right' : 'center'); });
    }
  }
}

export function armyHeadTick(rt, dt) {
  if (rt.over || !rt.army) return;
  if (!rt._head) {
    const id = BATTLES[rt.index] && BATTLES[rt.index].id;
    if (rt.gunsei || (rt.sonae && rt.sonae.length) || (id && SKIP.has(id)) || rt.t < 3) return;
    armyHeadOn(rt);
  }
  const H = rt._head;
  H.t -= dt;
  if (H.t <= 0) { H.t = SCAN; scan(rt); }
  for (const S of rt.sonae || []) if (S.b.adopted) S.b.sync();
  sonaeTick(rt, dt);
  gunseiTick(rt, dt);
}
