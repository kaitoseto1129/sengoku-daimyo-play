// ======================================================================
// 小谷城の戦い　始まりの段「清水谷から見上げる小谷城」（0〜3分の導入。kaito 11/8 夜・docs/oda15_plan_1108.md 15）
// 秀吉に話した後、谷道の岩場へ上がって尾根の城を見上げる。着くと京極丸・本丸の篝火が灯り、秀吉が「京極丸を取れば父子は二つに切れる」と策を明かす。
// 歩く間も、南の大手の鬨・使番の知らせで戦況を見せる。出発は止めず、物見は登りながら見届ける。
// ======================================================================
import { sfx } from '../audio.js';

const WAIT = 55;

// ctx：{ at（物見の場）, fires（篝火を灯す所の並び）, next }
export function install(rt, ctx) {
  const F = rt.flags, MI = ctx.at;
  // 五つの目標と登り口への印を保ち、物見を出発待ちの条件にしない。
  F.odaMonomiActive = true;
  const t0 = rt.t;
  const live = () => !F.ending && !rt.over && F.step <= 1 && F.odaMonomiActive;
  rt.after(9, () => { if (live()) { sfx('far', 0.6); rt.say('使番', '大手の南の尾根で、柴田・丹羽の手が鬨を上げました。城の目は南へ向いております', 3.8); } });
  rt.after(20, () => { if (live()) rt.say('竹中半兵衛', '谷は暗く、城からは見えませぬ。声を落とされよ', 3); });
  let done = false;
  const go = () => {
    if (done) return; done = true;
    F.odaMonomiActive = false;
  };
  const report = () => {
    if (F.odaMonomiDone) return;
    F.odaMonomiDone = true;
    // 尾根の曲輪に篝火が一つずつ灯る
    ctx.fires.forEach((p, i) => rt.after(i * 1.2, () => { if (!live()) return; try { rt.world.addFire(p.x, p.z, { h: 1.3, size: 0.7 }); } catch (e) { console.warn('小谷の物見の火', e); } }));
    // 清水谷を忍んで登る間は太鼓を鳴らさず、攻めかかる下知まで静かに進む。
    rt.banner('小谷城', '尾根に京極丸・小丸・本丸の篝火が並ぶ');
    rt.award((t) => { t.side.push('清水谷から小谷城の曲輪を見届けた'); }, '小谷城の曲輪を見届けた', MI);
    rt.say('羽柴秀吉', 'よう見よ。真ん中の京極丸を取れば、北の小丸の久政と南の本丸の長政は二つに切れる', 4.2);
    rt.after(4.6, () => { if (live()) rt.say('羽柴秀吉', '父子を分ければ、この大きな城も一夜で割れる。登るぞ！', 3.2); });
    rt.after(8.5, go);
  };
  const tick = () => {
    if (done || F.ending || rt.over || F.step > 1) { go(); return; }
    const u = rt.player?.u;
    // 出発直後に岩場を通っても見届ける。十四秒の待ちで通過を取り逃さない。
    if (u && Math.hypot(u.pos.x - MI.x, u.pos.z - MI.z) < 6) { report(); return; }
    if (rt.t - t0 > WAIT) { go(); return; }
    rt.after(0.4, tick);
  };
  ctx.next();
  tick();
}
