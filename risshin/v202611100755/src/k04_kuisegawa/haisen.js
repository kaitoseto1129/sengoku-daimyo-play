// ======================================================================
// 杭瀬川　両軍の厚みと負け戦の締め（docs/toku15_plan_1108.md の 4）
//  ・0〜3分：川の向こう（大垣の側）に石田・宇喜多の備が先鋒→二陣→本陣と奥へ重なる。赤坂の側にも東軍の備（会戦はまだ）
//  ・東軍が有馬の陣へ逃げ込むと、左近は追うのを止める。西軍の勝鬨 →「杭瀬川　東軍敗北」→ その夜の陣固め
// 本物の兵は足さない。呼び方：setup で install(rt, ctx, { T, Y })、win で ctx.ending()（finish はその後 26 秒）
// ======================================================================
import { sfx } from '../audio.js';

export function install(rt, ctx) {
  const F = rt.flags, W = rt.world;
  // 川の向こう（大垣の側）：石田と宇喜多。前＝赤坂の側（局所の +x）
  // 川の向こうの石田・宇喜多の備と赤坂の側の東軍の備は、陣立ての表（b_k04_kuisegawa.js の depth・布陣図 docs/fujin/k04_kuisegawa.md）で置く
  // 三成の本陣は戦場外の大垣城。川べりに本人や陣幕を追加しない。
  // 締め：左近が追うのを止め、西軍が勝鬨。負けの札の後、その夜へ
  ctx.ending = () => {
    rt.after(12.4, () => {
      // 実兵だけでなく、まだ進んでいる西軍の備にも追撃停止を伝える。
      for (const b of F.blocks || []) if (b.team === 1 && !b.routedL) {
        b.light?.halt();
        b.cmd = { id: 'hold', to: null, target: null, form: 'line' };
      }
      for (const g of rt.army.groups) if (g.team === 1 && g.count && !g.routed) {
        const c = g.center?.();
        if (c) {
          // 待機では近接判断と鉄砲の通常射撃が続く。追撃を解き、隊列へ戻す。
          g.order = 'retreat'; g.dest = { x: c.x, z: c.z }; g.onArrive = null;
          g.focus = null; g.seekRange = 0; g.aggro = 0; g.fire = false;
        }
      }
      rt.say('島左近', '追うな。川を越えれば有馬の鉄砲が待つ。引き上げよ', 3.4);
    });
    rt.after(15.6, () => { rt.army.celebrate?.(1); sfx('sig_enemyToki', 0.8); });
    rt.after(16.4, () => rt.banner('杭瀬川　東軍敗北', '慶長五年九月十四日'));
    rt.after(21, () => { W.setTime?.('dusk', true); rt.banner('その夜', '赤坂の陣を固める東軍'); });
  };
  return ctx;
}
