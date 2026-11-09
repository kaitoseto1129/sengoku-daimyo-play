// ======================================================================
// 刀根坂の戦い　終幕「一乗谷の火」（最後の三十秒の余韻。結果の札へすぐ行かない）
// 奥の道を守り通した後、燃える城下に朝倉の旗が倒れ、勝家と組の者が谷を見下ろす。語りで朝倉家の滅びを伝えて締める。
// ======================================================================
import { sfx } from '../audio.js';

const DUR = 30;

export function install(rt) {
  const F = rt.flags;
  const alive = () => !rt.over;
  rt.after(5, () => { if (alive()) { sfx('kane', 0.5); rt.say('組頭', '朝倉の兵は谷の奥へ逃げ散った……もう寄せては来ぬ', 3.2); } });
  rt.after(10, () => {
    if (!alive()) return;
    // 谷の奥の残りの朝倉の兵は走って奥へ退く
    for (const g of [F.innerG, F.townG]) if (g && g.count && !g.routed) { g.noRout = false; g.morale = 0; }
    rt.say('柴田勝家', '百年続いた朝倉の谷が燃えておる……', 3.2);
  });
  rt.after(15, () => { if (alive()) { sfx('horagai', 0.6); rt.say('柴田勝家', '勝鬨を上げよ！', 2.4); } });
  rt.after(18, () => { if (alive()) sfx('kachidoki', 0.8); });
  rt.after(21, () => { if (alive()) rt.say('語り', '義景は大野へ逃れたが、従兄の景鏡に背かれて自害した。朝倉家はここに滅ぶ', 5); });
  rt.after(DUR, () => { if (!rt.over) rt.finish({ scriptedEnd: true }, 0.2); });
}
