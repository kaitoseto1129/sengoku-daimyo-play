// 太田城 ② 3〜6分「築堤の護衛」：城から雑賀衆が何度も打って出て人夫を狙う。人夫を守り切れば堤が積み上がる。
import { P, SAIKA, porters } from './scene.js';
import { troops, reports, move, living, broken, near } from '../toyo15/kit.js';
import { workTick } from './s1_hoi.js';

export default {
  goal: '出水の堤で、打って出る雑賀衆から人夫を守れ',
  pin: { ...P.work, label: '出水の堤' },
  enter(rt, F) {
    F.workGuard = 0; F.waves = []; F.workerReliefs = 0; F.workerReliefAt = 0;
    move(F.friends, { x: P.work.x + 4, z: P.work.z + 2 }, true);
    rt.say('羽柴秀長', '堤ができれば城は終わりじゃ。雑賀もそれを分かっておる。人夫を一人も討たせるな', 4);
    const wave = (name, from, list) => () => { const g = troops(rt, false, name, from, list, SAIKA, { free: true, aggro: 18 }); move(g, P.work, true); F.waves.push(g); };
    reports(rt, [
      [12, '組頭', '土橋を渡って来るぞ！　槍を揃えよ！', wave('土橋を渡る雑賀衆', { x: 0, z: -44 }, [{ type: 'ashigaru', n: 10 }, { type: 'gun', n: 3 }])],
      [70, '組頭', '西の田の畦から回り込んで来る！', wave('畦を回る雑賀衆', { x: -56, z: -20 }, [{ type: 'ashigaru', n: 8 }, { type: 'samurai', n: 2 }])],
      [110, '使番', '東の堤では、蜂須賀の手が雑賀の打ち出しを追い返しました'],
      [125, '組頭', 'また来た！　人夫を後ろへ下げよ！', wave('雑賀の鉄砲衆', { x: 8, z: -46 }, [{ type: 'gun', n: 5 }, { type: 'ashigaru', n: 6 }])],
    ]);
  },
  tick(rt, dt, t) {
    const F = rt.flags;
    // 交代は二組まで。残った人夫を資材置き場へ戻し、隊を増やし続けない。
    if (living(F.workers) < 3 && F.workerReliefs < 2 && t >= F.workerReliefAt) {
      move(F.workers, P.pile);
      F.workers = porters(rt, '新しい人夫', P.pile, 8);
      F.workerReliefs++; F.workerReliefAt = t + 30;
      rt.say('人夫頭', '代わりの人夫が来ました。土を運べ！', 2.5);
    }
    if (near(rt, P.work, 26)) F.workGuard += dt;
    workTick(rt, dt);
    const quiet = F.waves.length >= 3 && F.waves.every((g) => broken(g, 0.35));
    return t > 160 && F.workGuard >= 5 && F.waves.length >= 3 && (quiet || t > 210);
  },
  leave(rt, F) { for (const g of F.waves) { g.noRout = false; g.morale = 0; move(g, { x: 0, z: -10 }); g.order = 'retreat'; } F.dug = Math.max(F.dug, 0.9); },
  foes: (rt) => rt.flags.waves,
  max: Infinity,
};
