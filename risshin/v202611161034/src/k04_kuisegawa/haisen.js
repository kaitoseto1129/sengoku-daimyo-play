// ======================================================================
// 杭瀬川　両軍の厚みと負け戦の締め（docs/toku15_plan_1108.md の 4）
//  ・0〜3分：川の向こう（大垣の側）に石田・宇喜多の備が先鋒→二陣→本陣と奥へ重なる。赤坂の側にも東軍の備（会戦はまだ）
//  ・東軍が有馬の陣へ逃げ込むと、左近は追うのを止める。西軍の勝鬨 →「杭瀬川　東軍敗北」→ その夜の陣固め
// 本物の兵は足さない。呼び方：setup で install(rt, ctx, { T, Y })、win で ctx.ending()（finish はその後 26 秒）
// ======================================================================
import { sfx } from '../audio.js';

export function install(rt, ctx, { T, L }) {
  const F = rt.flags, W = rt.world;
  // 川の向こう（大垣の側）：石田と宇喜多。前＝赤坂の側（局所の +x）
  // 川の向こうの石田・宇喜多の備と赤坂の側の東軍の備は、陣立ての表（b_k04_kuisegawa.js の depth・布陣図 docs/fujin/k04_kuisegawa.md）で置く
  // 三成の本陣は戦場外の大垣城。川べりに本人や陣幕を追加しない。
  // 締め：左近が追うのを止め、西軍が勝鬨。負けの札の後、その夜へ
  const stopChase = () => {
    // 帰還を果たした時点で止める。台詞まで十二秒待つと、
    // 生還の札を出した後も手勢が撃たれてしまう。
    // 実兵だけでなく、まだ進んでいる西軍の備にも追撃停止を伝える。
    for (const b of F.blocks || []) if (b.team === 1 && !b.routedL) {
      b.light?.halt();
      b.k04March = null;
      b.cmd = { id: 'hold', to: null, target: null, form: 'line' };
    }
    for (const g of rt.army.groups) if (g.team === 1 && g.count && !g.routed) {
      const c = g.center?.();
      if (c) {
        // その場に残すと、生還後も討てない将が斬り合いの中に残る。
        // 大垣の側へ実際に引き上げ、主人公と距離を取る。
        const l = L(c);
        g.order = 'retreat'; g.dest = T(Math.min(-60, l.x - 36), l.z); g.onArrive = null;
        g.focus = null; g.seekRange = 0; g.aggro = 0; g.fire = false;
        // 務めの決着後は交戦を終える。生存する将を狙い続けて、
        // 傷の付かない相手と締めの間じゅう斬り合わないようにする。
        for (const u of g.units) if (u.alive) {
          u.noTarget = true; u.target = null; u.atk = null; u.swing = null;
        }
      }
    }
  };
  ctx.ending = () => {
    stopChase();
    rt.after(12.4, () => {
      // 締めの間に別の下知が入っても、左近の引き上げを実際の隊へ伝える。
      stopChase();
      rt.say('島左近', '追うな。川を越えれば有馬の鉄砲が待つ。引き上げよ', 3.4);
    });
    rt.after(15.6, () => { rt.army.celebrate?.(1); sfx('sig_enemyToki', 0.8); });
    rt.after(16.4, () => rt.banner('杭瀬川　東軍敗北', '慶長五年九月十四日'));
    rt.after(21, () => { W.setTime?.('dusk', true); rt.banner('その夜', '赤坂の陣を固める東軍'); });
  };
  return ctx;
}
