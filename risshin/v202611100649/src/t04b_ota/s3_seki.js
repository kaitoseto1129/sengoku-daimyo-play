// 太田城 ③ 6〜9分「水を入れる」：堤が繋がり、出水の堰を開く。紀の川の水が回り、城の周りが水に沈んでいく。
// 日が暮れ、雑賀衆が小舟で水の上から堰を壊しに来る。堰を守る。
import { P, SAIKA } from './scene.js';
import { troops, reports, move, broken, near } from '../toyo15/kit.js';
import { sfx } from '../audio.js';

export default {
  goal: '出水の堰を開き、小舟で寄せる雑賀衆から堰を守れ',
  pin: { ...P.weir, label: '出水の堰' },
  enter(rt, F) {
    F.boats = [];
    move(F.friends, { x: P.weir.x - 6, z: P.weir.z - 6 }, true);
    rt.say('羽柴秀長', '堤は繋がった。堰へ行け。水を入れる', 3.5);
  },
  tick(rt, dt, t) {
    const F = rt.flags, W = rt.world;
    if (!F.opened && (near(rt, P.weir, 9) || t > 60)) {
      F.opened = t; F.waterTo = 0.25; F.weirLift = 0;
      F.weirSolid.yBot = W.heightAt(P.weir.x, P.weir.z) + 3;
      sfx('wood', 0.8);
      rt.say('人夫頭', '堰板を上げるぞ！　水が回る！', 3);
      if (W.setTime) { W.dayClock = null; W.setTime('dusk'); if (W.fade) W.fade.dur = 40; }
      reports(rt, [
        [20, '使番', '城の周りの田が水に沈んでいきます！'],
        [35, '足軽', '水の上に小舟じゃ！　雑賀の衆が堰を壊しに来る！', () => {
          const g = troops(rt, false, '小舟で寄せる雑賀衆', { x: -30, z: -26 }, [{ type: 'ashigaru', n: 9 }, { type: 'gun', n: 2 }], SAIKA, { free: true, aggro: 18 });
          move(g, P.weir, true); F.boats.push(g);
        }],
        [58, '使番', '城の中の井戸に水があふれ、雑賀の衆が騒いでおります'],
        [110, '人夫頭', '水はまだ上がる！　堰を閉じさせるな！'],
        [80, '足軽', 'また小舟が来る！　松明を持っておるぞ！', () => {
          const g = troops(rt, false, '松明を持つ雑賀衆', { x: -40, z: -14 }, [{ type: 'ashigaru', n: 8 }, { type: 'samurai', n: 2 }], SAIKA, { free: true, aggro: 18 });
          move(g, P.weir, true); F.boats.push(g);
        }],
      ]);
    }
    if (F.opened && F.weirLift < 2.4) { F.weirLift = Math.min(2.4, F.weirLift + dt * 0.8); F.weir.position.y = W.heightAt(P.weir.x, P.weir.z) + 1 + F.weirLift; }
    return !!F.opened && t - F.opened > 130 && F.boats.length >= 2 && (F.boats.every((g) => broken(g, 0.35)) || t - F.opened > 170);
  },
  leave(rt, F) { for (const g of F.boats) { g.noRout = false; g.morale = 0; move(g, { x: 0, z: -10 }); g.order = 'retreat'; } },
  foes: (rt) => rt.flags.boats,
  max: 260,
};
