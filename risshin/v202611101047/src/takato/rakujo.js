// ======================================================================
// 高遠城　落城の余韻（14〜15分・docs/oda15_plan_1108.md 30「盛信最期・落城・武田領崩壊」）
// 元の勝ち（win）の台詞の後、すぐ結果へ行かず、落城・傷ある者の手当て・信忠の入城・
// 「次は甲府、新府」の伏線を、合わせて二十秒余り見せる。
// 入れ方：b_takato.js で wrap(takato, K) を一度。def.win を包む。
// ======================================================================
import { k15Off, k15Afterglow } from '../oda15_kit.js';
import { sfx } from '../audio.js';
import { canWinTakato } from '../b_takato_siege.js';

export function wrap(def, K) {
  const win = def.win;
  def.win = function (r) {
    const F = r.flags;
    if (!k15Off(r) && !F.k15glow && canWinTakato(r)) {
      F.k15glow = true;
      k15Afterglow(r, [
        // 落城の札は本体の勝利処理で出る。一秒後に同じ札を重ねない。
        [1, () => {}],
        [4, () => r.say('足軽', '傷ある者を集めよ。手当てを急げ', 3.5)],
        [4, () => {
          // 入城の道順を出しただけでは、門を通り終えたことにしない。
          const p = F.nobutada?.pos;
          if (p && F.nobutada.real?.units.some(u => u.alive && !u.fleeing && !u.woundOut) &&
              F.C.kuruwa.hon.test(p.x, p.z))
            r.say('使番', '中将様、搦手より本丸へ入られた', 4.5);
        }],
        [5, () => { sfx('kachidoki', 0.3); r.say('森長可', '皆、よう戦った。組の者を確かめよ', 3); }],
        [4, () => r.say('森長可', '仁科五郎、敵ながら見事であった。次は甲府じゃ。武田四郎は新府を捨てて逃げよう', 5)],
        [5.5, () => {}],
      ]);
    }
    return win.call(this, r);
  };
}
