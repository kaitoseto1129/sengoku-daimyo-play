// ======================================================================
// 三方ヶ原の戦い　終幕「浜松城の門」（最後の三十秒余りの余韻。結果の札へすぐ行かない）
// 城門を開け放って篝火を焚き、酒井忠次が太鼓を打つ（『三河物語』ほかに伝わる話）。追ってきた武田勢は門前で止まり、
// 罠を疑って台地へ引き揚げる。家康が城に入り、語りで締める。本人の視点と操作を保ったまま進む。
// ======================================================================
import { sfx } from '../audio.js';
import { campfire } from '../props.js';

const DUR = 36;

// ctx：{ HAMA, gone }
export function install(rt, ctx) {
  const F = rt.flags, H = ctx.HAMA;
  const alive = () => !rt.over;
  rt.after(5.5, () => {
    if (!alive()) return;
    rt.say('酒井忠次', '門を開け放て！　篝火を焚け！　退いてくる者を一人でも多く入れよ！', 3.6);
    // 門の内外に篝火（夜の城の口）
    try { for (const [dx, dz] of [[-5, -6], [5, -6], [-7, 2], [7, 2]]) { const x = H.x + dx, z = H.z + dz; rt.scene.add(campfire(rt.world, x, z)); rt.world.addFire?.(x, z, { h: 0.08, size: 0.8 }); } } catch (e) { console.warn('mikata hamamatsu fire', e); }
  });
  // 酒井の太鼓：間を置いて三度
  for (const t of [10, 12.5, 15]) rt.after(t, () => { if (alive()) sfx('taiko', 0.9); });
  rt.after(11, () => { if (alive()) rt.say('酒井忠次', '太鼓を打て！　城は落ち着いておると武田に聞かせよ！', 3.2); });
  rt.after(17.5, () => {
    if (!alive()) return;
    // 追手は門前で止まり、台地へ引き揚げる（走って退く）
    for (const g of F.chase || []) if (!ctx.gone(g)) {
      const c = g.center();
      g.order = 'path'; g.retreatOnly = true; g.speed = 4; g.seekRange = 0; g.aggro = 0;
      g.path = [[c.x, c.z - 30], [c.x, 40]]; g.pathIdx = 0; g.onArrive = (q) => { q.order = 'hold'; };
    }
    if (F.pursuit) { try { F.pursuit.visible = true; F.pursuit.moveTo(8, 60, 30); } catch (e) { /* 遠景が無くても進む */ } }
    rt.say('足軽', '武田が門の前で止まった……開いた門と篝火を怪しんどるがや', 3.4);
  });
  rt.after(22.5, () => { if (alive()) rt.say('徳川家康', '……この負け、生涯忘れまいぞ', 3.2); });
  rt.after(27, () => { if (alive()) rt.say('語り', '三方ヶ原は武田の大勝に終わった。平手汎秀は討ち死にし、家康は浜松城へ逃げ帰った', 5); });
  rt.after(DUR, () => {
    if (!rt.over) rt.finish({ scriptedEnd: true,
      ...(rt.tracker.main === false ? { failureReason: '浜松城へ帰着したが、途中の持ち場の務めを果たせなかった' } : {}),
    }, 0.2);
  });
}
