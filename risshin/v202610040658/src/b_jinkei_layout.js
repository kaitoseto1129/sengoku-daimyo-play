// 八戦の既存の備を陣形へ結ぶ。人数は史料の目安、細かな割り振りは復元。
// 戦う兵を足さず、初めの遠景の旗・大将と、既存の隊の並びだけを整える。
import { jinkeiPoint, jinkeiBuild } from './jinkei.js';
import { flagTexture } from './textures.js';

// 魚鱗の備えは先鋒を狭く、後ろほど広く厚くする。兵数は復元の目安。
// 名目の人数・本物の兵・備えの位置は変えず、軽い後詰めだけを足す。
export function jinkeiDistantLayout(plan, s) {
  if (plan.name !== '魚鱗' || s.role === '本陣') return { w: 14, d: 14 };
  const front = s.at?.front || 0;
  const rear = 1 - Math.min(1, front / Math.max(1, ...plan.sonae.map((v) => v.at?.front || 0)));
  return { w: 22 + rear * 10, d: 18, host: Math.max(140, Math.min(300, Math.round((s.soldiers || 2000) / 14))) };
}

// 行：名、持ち場、大将、参考兵数、場所、旗、家紋、既存の隊を読む関数。
// 不明な兵数は null。大将不明の持ち場へ実在の将を当てはめない。
export function battleJin(name, team, honjin, facing, rows, note) {
  const sn = Math.sin(facing), cs = Math.cos(facing);
  return { name, team, honjin, facing, note, sonae: rows.map(([id, role, general, soldiers, pos, flag, mon, get, extra = {}]) => {
    const dx = pos.x - honjin.x, dz = pos.z - honjin.z;
    return { id, role, general, soldiers, flag, mon, at: { right: dx * cs - dz * sn, front: dx * sn + dz * cs },
      get, bindOnly: true, ...extra };
  }) };
}

export function installBattleJinkei(def, plans, options = {}) {
  def.jinkei = plans;
  // 川や山道で既存の台本が決めた移動を優先。八陣の陣名を史実として付けない。
  const setup = def.setup;
  def.setup = function (rt) {
    const W = rt.world, add = W.addDistantArmy, slots = [];
    const activePlans = options.reverse?.(rt) ? plans.map((p) => ({ ...p, team: 1 - p.team })) : plans;
    rt.def.jinkei = activePlans;
    const bound = rt.flags.jinkeiBound = {};
    for (const p of activePlans) for (const s of p.sonae) slots.push({ p, s, at: jinkeiPoint(p, s) });
    // 同じ遠景を作る時に名と旗を渡す。作った後で描き直したり、兵を重ねない。
    W.addDistantArmy = function (o) {
      const q = slots.find((v) => !bound[v.s.id] && Number.isFinite(o.x) && Number.isFinite(o.z)
        && Math.hypot(o.x - v.at.x, o.z - v.at.z) < 0.5 && (o.team === undefined || o.team === v.p.team));
      if (!q) return add.call(this, o);
      const { s, p } = q;
      const visual = add.call(this, { ...o, team: p.team, mon: s.mon || o.mon, flag: s.flag || o.flag,
        flagTex: s.flag ? flagTexture(s.flag) : o.flagTex,
        general: s.named === false || s.get ? o.general : s.general,
        secondGeneral: s.secondGeneral || o.secondGeneral });
      bound[s.id] = visual;
      return visual;
    };
    try { setup.call(this, rt); } finally { W.addDistantArmy = add; }
    // 明記した足りない控えだけを軽い兵で置く。山寺では既存の守兵を使い、非戦の群衆を結ばない。
    for (const p of activePlans) jinkeiBuild(rt, { ...p, sonae: p.sonae.filter((s) => s.draw && !bound[s.id]).map((s) => ({ ...s, bindOnly: false })) }, (s, at) => {
      const v = add.call(W, { ...at, w: s.w || 12, d: s.d || 8, count: s.count || 60, facing: s.facing ?? p.facing,
        team: p.team, armor: p.team ? 0x3a342c : 0x2b3140, flag: s.flag || 'maru', mon: s.mon || undefined,
        general: s.named === false ? undefined : s.general, seed: 10030 + slots.findIndex((q) => q.s.id === s.id), kind: 'mixed', host: false });
      v.army.noWake = true;
      bound[s.id] = v;
      return v;
    });
    for (const p of plans) for (const s of p.sonae) {
      const b = s.get?.(rt), g = b?.real || (b?.anchor ? b : null);
      if (g && g.order === 'hold') g.formation = s.form || g.formation || (g.isGun ? 'line' : 'yari');
      if (b) b.jinkeiSpec = s;
    }
  };
  // 隊は後の段で出ることもある。参照は一度だけ作り、毎秒の陣形処理でも物を作らない。
  for (const p of plans) for (const s of p.sonae) s.bind = (rt) => {
    const home = jinkeiPoint(p, s);
    const get = () => s.get?.(rt) || rt.flags.jinkeiBound?.[s.id];
    const b = get();
    if (b && typeof b.order === 'function' && b.pos) return b;
    return {
      get pos() {
        const v = get();
        if (v?.anchor || v?.pos || v?.position) return v.anchor || v.pos || v.position;
        if (v?.army) { home.x = v.army.cx + v.army.off.x; home.z = v.army.cz + v.army.off.z; }
        return home;
      },
      get morale() { return get()?.morale ?? 100; },
      get routedL() { const v = get(); return !!(v?.routed || v?.routedL || v?.army?.rout); },
      get fallen() { const v = get(); return !!(v?.fallen || (v?.count === 0)); },
      order() {}, // 台本の隊と遠景には、陣形処理から直進の下知を掛けない。
    };
  };
}
