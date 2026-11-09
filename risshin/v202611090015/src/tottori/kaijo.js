// ======================================================================
// 鳥取城　開城の余韻（14〜15分・docs/oda15_plan_1108.md 29「経家切腹・開城」）
// 元の勝ち（win）の台詞の後、すぐ結果へ行かず、木戸が開いて痩せた城兵が出て来る・城の旗が下りる・勝鬨・
// 秀吉が経家を惜しむ・次の戦への伏線を、合わせて二十秒余り見せる。
// 入れ方：b_tottori.js で定義の後に wrap(def, K) を一度。def.win を包む。
// ======================================================================
import { k15Off, k15Afterglow } from '../oda15_kit.js';
import { sfx } from '../audio.js';

export function wrap(def, K) {
  const win = def.win;
  def.win = function (r) {
    const F = r.flags;
    if (k15Off(r) || F.ending || F.k15glow) return win.call(this, r);
    const G = K.GATE;
    k15Afterglow(r, [
      [1, () => {
        r.banner('木戸が開く', '痩せ衰えた城兵が、槍を捨てて坂を下りる');
        for (const g of [...(F.sallies || []), ...(F.k15walls || [])]) {
          if (!g.units.some((u) => u.alive && !u.gone)) continue;
          g.noAI = false; g.order = 'path'; g.path = [[G.x, G.z + 10], [G.x, K.FENCE_Z - 4]]; g.pathIdx = 0; g.aggro = 0;
          for (const u of g.units) { u.noTarget = true; u.target = null; u.atk = null; }
        }
      }],
      [5, () => r.say('足軽', 'あれが……　百日籠もった者たちか', 3.5)],
      [4, () => { r.banner('城の旗が下りる', '吉川の旗が、久松山から消えた'); sfx('kane', 0.4); }],
      [4, () => { sfx('kachidoki', 0.8); r.say('組頭', '勝鬨じゃ。えい、えい！', 3); }],
      [3.5, () => r.say('羽柴秀吉', '式部少輔、見事な最期であった。城の者には粥を、少しずつ与えよ', 5)],
      [5.5, () => {}],
    ]);
    F.k15glow = true;
    return win.call(this, r);
  };
}
