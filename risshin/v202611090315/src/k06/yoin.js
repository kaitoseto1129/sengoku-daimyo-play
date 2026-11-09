// ======================================================================
// 関ヶ原の余韻（kaito 11/8：docs/toku15_plan_1108.md の 6「最後に家康本陣・首実検へ。その前に逃げる兵・倒れた旗・晴れた霧の戦場を10〜20秒」）
//   勝った直後に札へ行かない。霧の晴れた野に西軍の幟が倒れ、逃げる兵（軽い大軍の総崩れ・jindate.js）を見せ、
//   本人が向けた視点で野を見渡し、勝鬨と首実検の支度の言葉の後に「関ヶ原　東軍勝利」で締める。
// 入れ方：win で start(rt, P) を一度。終わりに rt.finish を呼ぶ。
// ======================================================================
import { nobori } from '../props.js';
import { sfx } from '../audio.js';
import { nm } from '../bhelp.js';

export function start(rt, P) {
  const F = rt.flags, W = rt.world;
  if (F.yoin) return;
  F.yoin = { t0: rt.t };
  const u = rt.player.u.pos;
  // 倒れた西軍の幟：本人の前の野と、宇喜多・石田の陣の前に（竿ごと地に伏せる）
  const spots = [[u.x - 14, u.z - 6, 'ukita', 0.3], [u.x - 22, u.z + 9, 'ishida', -0.8], [u.x - 9, u.z + 16, 'ukita', 2.1], [u.x - 30, u.z - 14, 'konishi', 1.2],
    [P.UKITA_F.x + 6, P.UKITA_F.z + 4, 'ukita', 0.6], [P.UKITA_F.x - 4, P.UKITA_F.z - 10, 'ukita', -1.4], [P.SAKON.x + 8, P.SAKON.z, 'ishida', 2.6], [P.KONISHI.x + 10, P.KONISHI.z + 2, 'konishi', 0.1]];
  for (const [x, z, f, r] of spots) {
    try {
      const g = nobori(W, x, z, f, 5);
      g.rotation.set(0, r, 1.42);   // 竿の根元を軸に横倒し
      g.position.y = W.heightAt(x, z) + 0.15;
      rt.scene.add(g);
    } catch (e) { /* 幟が無くても締めは進む */ }
  }
  const say = (t, f) => rt.after(t, () => { if (!rt.over) f(); });
  say(1.5, () => rt.say('徳川家康', '皆の者、大儀。勝って兜の緒を締めよ。まだ佐和山が残っておる', 3.5));
  say(5.5, () => rt.say('井伊直政', `${nm(rt)}、ようやった。徳川の先陣の槍、見事であった`, 3));
  say(9.5, () => { sfx('toki', 1); rt.say('足軽', 'えい、えい、おう！', 2.5); });
  say(13, () => rt.say('使番', '殿、陣場野にて首実検の支度、整いましてござる', 3.2));
  say(16.5, () => rt.banner('関ヶ原　東軍勝利', '慶長五年九月十五日'));
  rt.after(20.5, () => { try { P.done?.(); } catch (e) { /* 手柄が付かなくても締める */ } rt.finish({ scriptedEnd: true }, 4); });
}

