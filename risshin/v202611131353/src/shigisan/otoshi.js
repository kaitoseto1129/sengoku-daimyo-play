// ======================================================================
// 信貴山城の戦い　登りの段の出来事「尾根道の石落とし」（約3〜5分。b_shigisan.js の climb から入れる）
// 史実：信貴山城は尾根に曲輪を連ねた山城で、寄せ手は細い尾根道を登るしかなかった（城の縄張り）。石落としの細かな場所は遊びの補完。
// 遊び：伏兵を退けて登る途中、上の切岸から松永の足軽が石と丸太を落として来る。上の段の石落としの組を払うまで、大手の木戸の段（tower）へ進まない。
//   払うか約百秒で先へ。字は出さない：落ちる音・赤い印で分からせる。
// ======================================================================
import { enemyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';
import { siegeFighter } from '../siege_zones.js';

export function install(rt, ctx) {
  const F = rt.flags;
  const { dress, MATSU, ROAD, CLIMB_END } = ctx;
  const t0 = rt.t;
  let G = null, done = false, tick = 0;
  rt.after(20, () => {
    if (done || F.ending || rt.over || !rt.player.u.alive) return;
    const a = ROAD[Math.max(0, CLIMB_END - 1)], b = ROAD[CLIMB_END];
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1;
    const ahead = Math.min(8, len * 0.4);
    // 折り返しの横へ広がる五人横隊は切岸に詰まる。道の上で麓を向く二列にする。
    // 隊の自動判断で向きや持ち場を変えず、各兵の迎撃と射撃は続ける。
    G = enemyGroup(rt, { fixed: true, noAI: true, faction: 'matsunaga', name: '切岸の石落としの組', anchor: { x: a[0] + dx / len * ahead, z: a[1] + dz / len * ahead }, facing: Math.atan2(-dx, -dz), formation: 'column', colW: 2, width: 2, order: 'hold', guard: true, guardLeash: 6, aggro: 20, seekRange: 26, morale: 80, fleeDir: { x: 0, z: -1 } },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 3 }, { type: 'bow', n: 1 }], MATSU));
    sfx('crash', 0.9); rt.after(1.4, () => { if (!F.ending && !rt.over && rt.player.u.alive) sfx('crash', 0.7); });
    rt.say('足軽', '上から石じゃ！　丸太も落として来よる！', 3.5);
    rt.after(4, () => { if (!F.ending && !rt.over && rt.player.u.alive) rt.say('組頭', '上の切岸の石落としを払え！　あれを黙らせねば木戸へ寄れぬ！', 4); });
    rt.obj('otoshi', '尾根道の上の、石落としの組を払え', 'order');
    rt.marker('otoshiG', () => (G.units.some(siegeFighter) ? G.center() : null), '石落としの組', { red: true, group: G });
  });
  return {
    update(dt) {
      if (done || F.ending || rt.over || !rt.player.u.alive) return;
      if ((tick -= dt) > 0) return;
      tick = 0.5;
      const el = rt.t - t0;
      if (!G) return;
      let n = 0;
      for (const u of G.units) if (siegeFighter(u)) n++;
      rt.objProgress('otoshi', n ? `石落としの組 ${n}人` : '');
      if ((!n && el > 65) || el > 120) {
        done = true; F.otoshiDone = true;
        rt.unmark('otoshiG');
        if (!n) { rt.objDone('otoshi'); rt.award((t) => t.side.push('尾根道の上の石落としの組を払った'), '石落としの組を払った'); }
        else { rt.objRemove('otoshi'); for (const u of G.units) if (u.alive) { u.fleeing = true; u.moraleFleeDir = { x: 0, z: -1 }; } }
      }
    },
  };
}
