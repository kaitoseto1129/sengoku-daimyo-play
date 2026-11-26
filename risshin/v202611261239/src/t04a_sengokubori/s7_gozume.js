// 千石堀城 ⑦（K652② 11/25 Sanae）「後詰」：本丸が落ちかけた所へ、近くの積善寺城・畠中城に籠る根来衆の一手が、二の丸を抜けて本丸の門へ駆け込む。
// 史実の流れ：千石堀・積善寺・畠中・沢の城は同じ日に攻められ、積善寺の根来衆は降らず、畠中は自ら火を掛けて退いた。落ちる城へ駆け付けた者を本丸の門で迎え撃つ段（一手の動きは描き足し）。
import { NEGORO } from './scene.js';
import { troops, reports, move, broken, smoke, living, breath } from '../toyo15/kit.js';

const GATE = { x: 0, z: 12 };   // 本丸の門の内
export default {
  goal: '本丸の門で、駆け付けた根来の後詰を迎え撃て',
  pin: { ...GATE, label: '本丸の門' },
  enter(rt, F) {
    breath(rt, 0.3);
    F.gozume = troops(rt, false, '積善寺から駆け付けた根来衆', { x: 0, z: -24 }, [{ type: 'ashigaru', n: 10 }, { type: 'samurai', n: 3 }, { type: 'gun', n: 3 }], NEGORO, { free: true, aggro: 18, seek: 30, facing: 0 });
    move(F.gozume, { x: 0, z: 10 }, true);
    F.gozume.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; };
    for (const g of [F.friends, F.follow, F.hori, F.hase]) if (g && g.count > 0) {
      move(g, { x: 0, z: 16 }, true);
      g.onArrive = (q) => { q.onArrive = null; if (F.step === 7) { q.order = 'attack'; q.seekRange = Math.max(q.seekRange || 0, 30); } };
    }
    rt.army.play('toki', { x: 0, z: -20 }, 1);
    rt.say('使番', '積善寺の方から根来衆の一手！　二の丸を抜けて本丸へ来まする！', 3.8);
    reports(rt, [
      [10, '組頭', '門を背にするな！　門の内で槍を揃えて受けよ！'],
      [30, '使番', '畠中の城は、根来衆が自ら火を掛けて退いた由！'],
      [52, '羽柴秀次', '押し返せ。これで千石堀は終いじゃ'],
    ]);
  },
  tick(rt, dt, t) {
    const F = rt.flags;
    smoke(rt, Math.max(0.25, 0.45 - t * 0.002));
    // 二の手：一の手が崩れかけた所へ、鉄砲の組が二の丸の塀の上から撃ちかけ、槍が続く
    if (!F.gozume2 && t > 22 && broken(F.gozume, 0.5)) {
      F.gozume2 = troops(rt, false, '後詰の二の手', { x: -8, z: -22 }, [{ type: 'gun', n: 3 }, { type: 'ashigaru', n: 8 }], NEGORO, { free: true, aggro: 18, seek: 30 });
      move(F.gozume2, { x: -2, z: 8 }, true); F.gozume2.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; };
      rt.say('組頭', '二の手じゃ！　二の丸からまた来るぞ！', 3);
    }
    if (rt.objProgress) rt.objProgress('main', `根来の後詰 あと${living(F.gozume) + living(F.gozume2)}人`);
    return t > 50 && broken(F.gozume, 0.25) && !!F.gozume2 && broken(F.gozume2, 0.25);
  },
  leave(rt, F) { for (const g of [F.gozume, F.gozume2]) if (g) { g.noRout = false; g.morale = 0; move(g, { x: -34, z: -46 }); } },
  foes: (rt) => [rt.flags.gozume, rt.flags.gozume2],
  botR: 26, botLeash: 40,
  max: 220,
};
