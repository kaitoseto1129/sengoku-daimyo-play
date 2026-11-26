// 千石堀城 ⑥（K652② 11/25 Sanae）「焼けた蔵の裏」：煙硝蔵が燃え上がった後も、本丸の奥の塀の際に根来の鉄砲衆が籠って撃ち続ける。
// 史実の流れ：千石堀城は煙硝蔵に火が入って落ちたが、城兵は降らず、ほとんどが討死した（最後の一人まで撃った）。煙の中で奥の手を討つ段。
import { P, NEGORO } from './scene.js';
import { troops, reports, move, broken, smoke, living, breath } from '../toyo15/kit.js';

const BACK = { x: -12, z: 40 };   // 本丸の奥・西の塀の際（燃える蔵 9,33 から二十歩離す）
export default {
  goal: '燃える蔵の裏で、籠った根来の鉄砲衆を討て',
  pin: { ...BACK, label: '本丸の奥' },
  enter(rt, F) {
    breath(rt, 0.3);
    F.kura = troops(rt, false, '本丸の奥の根来衆', BACK, [{ type: 'gun', n: 3 }, { type: 'ashigaru', n: 6 }, { type: 'samurai', n: 2 }], NEGORO, { aggro: 16, seek: 26, facing: Math.PI });
    F.kura.order = 'attack';
    for (const g of [F.friends, F.follow, F.hori, F.hase]) if (g && g.count > 0) {
      move(g, { x: -4, z: 34 }, true);
      g.onArrive = (q) => { q.onArrive = null; if (F.step === 6) { q.order = 'attack'; q.seekRange = Math.max(q.seekRange || 0, 30); } };
    }
    rt.say('組頭', '蔵の裏の塀際から、まだ撃って来る！　煙に紛れて寄れ！', 3.5);
    reports(rt, [
      [14, '足軽', '根来の者は降らぬのか……。蔵が燃えても撃って来るぞ'],
      [34, '羽柴秀次', '一人も残すな。ここで残せば、根来寺で同じ鉄砲に撃たれる'],
    ]);
  },
  tick(rt, dt, t) {
    const F = rt.flags;
    smoke(rt, Math.max(0.3, 0.6 - t * 0.003));
    // 二の手：蔵の脇の塀の陰に伏せていた者が、煙の中から斬り込む（一の手が崩れかけた時）
    if (!F.kura2 && t > 20 && broken(F.kura, 0.5)) {
      F.kura2 = troops(rt, false, '蔵の陰の根来衆', { x: -18, z: 44 }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 5 }], NEGORO, { free: true, aggro: 20, seek: 30 });
      F.kura2.order = 'attack';
      rt.say('組頭', '塀の陰にまだおる！　斬り込んで来るぞ！', 3);
    }
    if (rt.objProgress) rt.objProgress('main', `本丸の根来衆 あと${living(F.kura) + living(F.kura2)}人`);
    return t > 45 && broken(F.kura, 0.25) && !!F.kura2 && broken(F.kura2, 0.25);
  },
  leave(rt, F) { for (const g of [F.kura, F.kura2]) if (g) { g.noRout = false; g.morale = 0; } },
  foes: (rt) => [rt.flags.kura, rt.flags.kura2],
  botR: 26, botLeash: 34,
  max: 220,
};
