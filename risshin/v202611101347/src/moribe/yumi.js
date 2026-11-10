// ======================================================================
// 森部 8〜10分：左の畦の斎藤の弓・鉄砲衆（遠い兵の集まり・味方の隊と合流）
//   槍の押し合いが続く間に、斎藤勢は左（西）の畦に弓と鉄砲を集め、前備の列の横を射すくめる。
//   森可成の隊が横から寄るのに合わせて、組を連れて左の畦へ回り、弓・鉄砲衆を討つ。済んだら本体の反撃（両将の旗本へ）。
//   射手が実際に討たれるか退くまで、時間だけで果たした事にしない。
// ======================================================================
import { sfx } from '../audio.js';

const ready = (u) => !!u && u.alive && u.hp > 0 && !u.dying && !u.downed && !u.gone && !u.fleeing && !u.woundOut && !u.rearWound && !u.noTarget;
// 隊の敗走印だけで済みにしない。まだ射る兵がいれば、実際に討つか退かせる。
const live = (g) => g && g.units.some(ready);

export function prepare(rt, C) {
  const v = rt.flags.m15;
  if (v.yumiGs) return;
  // 西の畦の射手も開戦時に置き、下知で射撃を始める。
  const at = [{ x: -40, z: 2 }, { x: -50, z: -6 }];
  v.yumiGs = at.map((q, i) => {
    const g = C.enemyGroup(rt, { faction: 'saito', name: '斎藤の弓・鉄砲衆', fixed: true, anchor: q, facing: 0.5, fleeDir: { x: -0.4, z: -1 }, aggro: 4, speed: 2,
      noRout: true, formation: 'line' }, i ? [{ type: 'gun', n: 4 }, { type: 'ashigaru', n: 2 }] : [{ type: 'samurai', n: 1 }, { type: 'bow', n: 5 }]);
    g.fire = false; g.order = 'hold'; g.noAI = true;
    return g;
  });
}

export function tick(rt) {
  const F = rt.flags, v = F.m15, C = v.C;
  if (v.yumiDone || rt.over || F.ending) return;
  if (!v.yumiT) {
    if (F.stage !== 'hold' || rt.t - (F.holdStart ?? rt.t) < 30) return;
    v.yumiT = rt.t; v.ph = 'yumi';
    prepare(rt, C);
    for (const g of v.yumiGs) { g.noAI = false; g.fire = true; g.order = 'hold'; }
    rt.marker('yumi', () => (v.yumiGs.find(live)?.center() || null), '左の畦の弓・鉄砲衆', { red: true });
    sfx('taiko', 0.7);
    rt.say('足軽', '左の畦に斎藤の弓と鉄砲が集まったぞ！　横から射すくめられる！', 3.4);
    rt.after(3.6, () => {
      // 射手が討たれた後や退却した後は、古い攻め先を告げない。
      if (!rt.over && !F.ending && !v.yumiDone && v.ph === 'yumi' && v.yumiGs.some(live))
        rt.say('森可成', '三左衛門の隊が横へ回る！　源八の組も西の畦へ続け、射手を討て！', 3.6);
    });
    const Y = F.Y; if (Y && Y.units.some(ready)) { Y.order = 'move'; Y.dest = { x: -36, z: 12 }; Y.speed = 2.6; Y.onArrive = (q) => { q.order = 'attack'; q.seekRange = 30; }; }
    return;
  }
  const t = rt.t - v.yumiT;
  if (!v.yumiGs.some(live) && t > 20) {
    v.yumiDone = true; v.ph = null;
    rt.unmark('yumi');
    // 射手が皆退いた時は live が偽なので、同じ判定で後始末を飛ばさない。
    for (const g of v.yumiGs) { g.fire = false; g.noRout = false; g.order = 'retreat'; g.morale = 0; g.fleeSet = true; g.fleeDir = { x: -0.4, z: -1 }; }
    rt.say('組頭 源八（げんぱち）', '射手を退けたぞ！　列へ戻れ、反撃の太鼓を待て！', 3.2);
    if (t <= 100) rt.award((tr) => tr.side.push('左の畦で斎藤の弓・鉄砲衆を討った'), '左の畦で斎藤の弓・鉄砲衆を討った');
  }
}
export function target(rt) {
  const v = rt.flags.m15, P = rt.player.u.pos;
  let best = null, bd = Infinity;
  for (const g of v.yumiGs || []) for (const u of g.units) { if (!ready(u)) continue; const d = (u.pos.x - P.x) ** 2 + (u.pos.z - P.z) ** 2; if (d < bd) { bd = d; best = u; } }
  return best;
}
