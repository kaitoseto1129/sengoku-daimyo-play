// 太田城 ④ 9〜12分「堤が崩れる」：東の堤の一か所が水に押されて崩れ、水が溢れ出す。人夫は逃げ惑い、
// 雑賀衆がここぞと崩れた所へ打って出る。崩れた所を守り、人夫が土俵で塞ぐまで持ちこたえる。
import { P, SAIKA, porters } from './scene.js';
import { troops, reports, move, living, broken } from '../toyo15/kit.js';
import { sfx } from '../audio.js';

export default {
  goal: '崩れた東の堤を守り、人夫が塞ぐまで持ちこたえよ',
  pin: { ...P.breach, label: '東の堤' },
  enter(rt, F) {
    const W = rt.world;
    F.waterTo = -0.2; F.foesB = [];
    sfx('taiko', 0.6);
    rt.banner('堤が崩れた', '東の堤から水があふれる');
    W.addSmokeColumn?.(P.breach.x, W.heightAt(P.breach.x, P.breach.z) + 1, P.breach.z, { size: 2.5 });
    F.fixers = porters(rt, '堤を塞ぐ人夫', { x: 40, z: -70 }, 10);
    move(F.fixers, { x: P.breach.x - 3, z: P.breach.z - 6 });
    move(F.friends, { x: P.breach.x - 6, z: P.breach.z - 4 }, true);
    F.fix = 0;
    rt.say('人夫頭', '堤が崩れた！　水が出ていく！　土俵を持って東へ走れ！', 3.5);
    rt.after(4, () => rt.say('羽柴秀長', '崩れた所を守れ！　雑賀は必ずそこを突いてくる！', 3.5));
    const wave = (name, from, list) => () => { const g = troops(rt, false, name, from, list, SAIKA, { free: true, aggro: 18 }); move(g, P.breach, true); F.foesB.push(g); };
    reports(rt, [
      [15, '組頭', '城から打って出たぞ！　崩れ目へ来る！', wave('崩れ目へ寄せる雑賀衆', { x: 30, z: -10 }, [{ type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }, { type: 'samurai', n: 1 }])],
      [65, '組頭', '水の中を渡って来る！', wave('水を渡る雑賀衆', { x: 36, z: 12 }, [{ type: 'ashigaru', n: 9 }, { type: 'samurai', n: 2 }])],
      [100, '使番', '北と南の堤は持っております！　崩れたのはここだけ'],
      [120, '雑賀の頭', '堤を崩せ！　水を抜け！', wave('雑賀の頭の組', { x: 28, z: -26 }, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 6 }])],
    ]);
  },
  tick(rt, dt, t) {
    const F = rt.flags;
    const n = living(F.fixers);
    if (n < 3 && t < 150) { F.fixers = porters(rt, '堤を塞ぐ人夫', { x: 40, z: -70 }, 8); move(F.fixers, { x: P.breach.x - 3, z: P.breach.z - 6 }); }
    F.fix += dt * (n >= 4 ? 1 : 0.5);
    const quiet = F.foesB.length >= 3 && F.foesB.every((g) => broken(g, 0.35));
    if (!F.fixed && t > 150 && F.fix > 120 && (quiet || t > 190)) {
      F.fixed = t; F.waterTo = 0.45;
      rt.say('人夫頭', '塞いだぞ！　また水が溜まる！', 3);
    }
    return !!F.fixed && t - F.fixed > 6;
  },
  leave(rt, F) { for (const g of F.foesB) { g.noRout = false; g.morale = 0; move(g, { x: 0, z: 0 }); } },
  foes: (rt) => rt.flags.foesB,
  max: 260,
};
