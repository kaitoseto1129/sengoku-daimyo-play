// 前半八戦の備え表。総数は史料・伝承の目安、各備の割り振りと位置は復元。
// 既存の組・本陣・遠景へ結び、台本の寄せ・退却を優先する。戦う兵は追加しない。
import { jinkeiBuild, jinkeiPoint } from './jinkei.js';
import { nobori } from './props.js';

export function battleJin(name, team, honjin, facing, rows, note, point = (x, z) => ({ x, z })) {
  const sn = Math.sin(facing), cs = Math.cos(facing);
  return { name, team, honjin, facing, note,
    sonae: rows.map(([id, role, general, soldiers, x, z, target, flag, mon, dir]) => {
      const p = point(x, z), dx = p.x - honjin.x, dz = p.z - honjin.z;
      return { id, role, general, soldiers, target, flag, mon: mon || flag,
        facing: dir ?? facing, at: { right: dx * cs - dz * sn, front: dx * sn + dz * cs },
        // 本陣も同じ表へ結ぶ。補充や遊軍の自動命令は使わず、戦ごとの台本に任せる。
        bind: (rt) => rt.flags.earlyJin?.[id] || null };
    }) };
}

const read = (rt, path) => path?.split('.').reduce((o, k) => o?.[k], rt.flags);
function connect(rt, s, at, plan) {
  const source = read(rt, s.target);
  if (!source) return null; // 後の段で出る組を前倒しで作らない。
  const mesh = source.m || (source.army ? source : null);
  const light = source.light || mesh;
  const group = source.units ? source : source.guard || source.real;
  const pos = source.pos || source.anchor || at;
  // 実兵数・士気・命令を変えず、史料上の目安を別に持つ。
  source.jinkeiSpec = s;
  if (group) {
    group.jinkeiSpec = s;
    if (s.general !== '名は伝わらない') group.name = s.general + 'の' + s.role;
    if (group.formation !== 'column') group.formation = group.units.some((u) => u.type === 'gun' || u.type === 'bow') ? 'line' : 'yari';
  }
  if (light?.army) {
    light.army.jinkeiSpec = s;
    light.army.team = plan.team;
    // 名が不明な備えを架空の武将で埋めない。総大将は既存の本陣が受け持つ。
    light.army.commanderName = s.general;
  }
  // 将の個人旗の使用時期までは確定しない。家の旗に、既存の家紋の旗を添える復元。
  if (s.mon !== s.flag && rt.world.walkable(pos.x + 3, pos.z + 3)) rt.scene.add(nobori(rt.world, pos.x + 3, pos.z + 3, s.mon, 5));
  return { pos, light, real: group, source, general: s.general, soldiers: s.soldiers, morale: 100 };
}

export function buildBattleJin(rt) {
  const bound = rt.flags.earlyJin = {};
  for (const plan of rt.def.jinkei) {
    jinkeiBuild(rt, plan, (s, at) => (bound[s.id] = connect(rt, s, at, plan)));
    // 本陣は jinkeiBuild が増設しないので、既存の床几・旗本へ直接結ぶ。
    for (let i = 0; i < plan.sonae.length; i++) {
      const s = plan.sonae[i];
      if (s.role === '本陣') bound[s.id] = connect(rt, s, jinkeiPoint(plan, s, i), plan);
    }
  }
}
