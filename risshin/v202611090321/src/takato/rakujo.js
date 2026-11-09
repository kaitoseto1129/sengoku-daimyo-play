// ======================================================================
// 高遠城　落城の余韻（14〜15分・docs/oda15_plan_1108.md 30「盛信最期・落城・武田領崩壊」）
// 元の勝ち（win）の台詞の後、すぐ結果へ行かず、本丸の旗が倒れる・主殿に火・信忠が本丸へ入る・勝鬨・
// 「次は甲府、新府」の伏線を、合わせて二十秒余り見せる。
// 入れ方：b_takato.js で wrap(takato, K) を一度。def.win を包む。
// ======================================================================
import { k15Off, k15Afterglow } from '../oda15_kit.js';
import { sfx } from '../audio.js';

export function wrap(def, K) {
  const win = def.win;
  def.win = function (r) {
    const F = r.flags;
    if (!k15Off(r) && !F.ending && !F.k15glow && (F.keep?.down || F.keepFell) && r.player.u.alive) {
      F.k15glow = true;
      const H = K.GATE_HON;
      k15Afterglow(r, [
        [1, () => { r.banner('本丸の旗が倒れる', '武田菱の旗が、崖の上から落ちた'); sfx('crash', 0.5); }],
        [4, () => { try { r.world.addFire(H.x - 14, H.z + 4, { size: 3, smoke: true }); } catch (e) { /* 火が置けない所でも続ける */ } r.say('足軽', '主殿に火が回った……', 3.5); }],
        [4, () => r.say('使番', '中将様、搦手より本丸へ入られた。城の内の首は四百余りと', 4.5)],
        [5, () => { sfx('kachidoki', 0.8); r.say('森長可', '勝鬨を上げよ！　えい、えい！', 3); }],
        [4, () => r.say('森長可', '仁科五郎、敵ながら見事であった。次は甲府じゃ。武田四郎は新府を捨てて逃げよう', 5)],
        [5.5, () => {}],
      ]);
    }
    return win.call(this, r);
  };
}
