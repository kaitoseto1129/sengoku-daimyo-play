// 戦ごとの備え表を共通の陣形へ渡す。兵数は史料の総数と、補完した持ち場の数を区別する。
import { jinkeiBuild } from './jinkei.js';

function bound(rt, path, home) {
  const keys = path.split('.');
  const read = () => {
    let b = rt.flags;
    for (const key of keys) b = b?.[key];
    return b;
  };
  // あとで出る護衛にも結ぶ。部隊・組・船の位置を借り、台本の下知を保つ。
  return {
    get pos() { const b = read(); return b?.anchor || b?.pos || b?.position || b || home; },
    get morale() { return read()?.morale ?? 100; },
    get fallen() { const b = read(); return !b || b.alive === false || b.fallen || b.routed || b.count === 0; },
    get routedL() { return !!read()?.routedL; },
    get light() { return read()?.light; },
    order(cmd) { const b = read(); if (typeof b?.order === 'function') b.order(cmd); },
  };
}

// 表の順：持ち場の印・役目・大将・兵数・横・奥・旗・家紋・描く兵数・補足。
// 横と奥は戦場座標。陣形の表では本陣から見た右と前へ直す（山城の曲輪にも使える）。
export function rosterPlan(name, team, honjin, facing, rows, source) {
  const sn = Math.sin(facing), cs = Math.cos(facing);
  const plan = { name, team, honjin, facing, source, numbers: '各備の兵数と細かな位置は遊びの補完', sonae: [] };
  plan.sonae = rows.map(([id, role, general, soldiers, x, z, flag, mon, count, opt = {}]) => {
    const home = { x, z };
    return {
      id, role, general, soldiers, flag, mon,
      at: { right: (x - honjin.x) * cs - (z - honjin.z) * sn, front: (x - honjin.x) * sn + (z - honjin.z) * cs },
      count, bindOnly: !count, ...opt,
      bind: (rt) => opt.bind ? bound(rt, opt.bind, home) : rt.flags.jinRoster?.[team]?.[id]?.binding || null,
    };
  });
  return plan;
}

// 新しい戦う兵は出さない。名のある小さな備えに、既存の軽い軍勢を置き換える。
// 作るのは戦の準備時だけ。前に鉄砲、中に槍、後ろに大将・旗・控えを揃える。
export function rosterBuild(rt, plans) {
  const hosts = rt.flags.jinRoster = {};
  for (const plan of plans) {
    hosts[plan.team] = jinkeiBuild(rt, plan, (s, at) => {
      const m = rt.world.addDistantArmy({ ...at, w: s.w || 14, d: s.d || 10, count: s.count,
        facing: s.facing ?? plan.facing, kind: s.kind || 'mixed', general: /不明/.test(s.general) ? undefined : s.general,
        team: plan.team, flag: s.flag, mon: s.mon, host: s.host, armor: s.armor ?? (plan.team ? 0x3a342c : 0x2b3140),
        seed: rt.world.def.seed + plan.team * 100 + plan.sonae.indexOf(s) });
      m.army.noWake = true;
      m.army.jinkeiGuard = true;
      // 陣形が借りる位置。前進・退き・崩れは元の軽い軍勢の仕組みで続ける。
      const pos = { x: at.x, z: at.z };
      m.binding = { get pos() {
        const off = m.army.off, f = s.facing ?? plan.facing;
        pos.x = at.x + off.x * Math.cos(f) + off.z * Math.sin(f);
        pos.z = at.z - off.x * Math.sin(f) + off.z * Math.cos(f);
        return pos;
      }, light: m, get morale() { return m.army.rout ? 0 : 100; }, get routedL() { return !!m.army.rout; } };
      return m;
    });
  }
  return hosts;
}
