// ======================================================================
// 桶狭間 9〜12分：義元の近習と新手（本陣の幕の前の乱戦が厚くなる）
//   『信長公記』：義元は三百騎ほどに囲まれて退き、二度三度、四度五度と向き直って戦ったが、次第に五十騎ほどに減った。
//   織田勢が幕の前に入ると、陣の後ろで休んでいた義元の近習（侍まじり）と今川の新手が駆けつけて旗本の囲みを厚くする（敵兵が増える）。
//   近習・新手と組み合って四十秒たってから、旗本の囲みが開く（本体の guardOpened。新手が来なければ本体の時間どおり）。
// ======================================================================
import { sfx } from '../audio.js';

export function tick(rt) {
  const F = rt.flags, v = F.o15, C = v.C;
  if (v.kinjuT || rt.over || F.ending || F.enteredAt == null || rt.t - F.enteredAt < 10) return;
  v.kinjuT = rt.t;
  const mk = (name, x, z, list) => {
    const g = C.enemyGroup(rt, { fixed: true, noGuard: true, faction: 'imagawa', name, anchor: C.fieldPoint(x, z), facing: C.FIELD_TURN,
      formation: 'yari', spacing: 1.4, width: 6, morale: 90, aggro: 14, seekRange: 30, dmgMult: 0.45, noRout: true, fleeDir: C.fieldVector(0.3, -1) }, list);
    g.guard = false; g.order = 'attack';
    F.enemies?.push(g);
    return g;
  };
  v.kinjuGs = [mk('義元の近習', 8, -146, [{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 4 }])];
  // 二十五秒の後、陣の東の後ろから今川の新手（二の波）
  rt.after(25, () => {
    if (rt.over || F.ending || F.victory) return;
    v.kinjuGs.push(mk('今川の新手', 38, -144, [{ type: 'ashigaru', n: 8 }, { type: 'bow', n: 2 }]));
    v.kinju2T = rt.t;
    rt.army.playFar?.('toki', C.fieldPoint(38, -144), 1.2);
    rt.say('足軽', '東の後ろからも今川の新手じゃ！', 2.6);
  });
  // 崩れは近習の頭が討たれるか、半ば討たれた時（不死身にしない）
  rt.after(40, () => { for (const g of v.kinjuGs) g.noRout = false; });
  sfx('taiko', 0.8);
  rt.army.playFar?.('eshout', C.fieldPoint(18, -140), 1.3);
  rt.say('今川の侍', '御屋形様の御前ぞ！　近習衆、出あえ、出あえ！', 3);
  rt.after(3.4, () => {
    // 義元討死・討死中・再開後に、古い近習戦へ引き戻す声を出さない。
    if (rt.flags !== F || F.o15 !== v || rt.over || F.ending || F.victory || F.yoshiDown || rt.retryOpen || !rt.player.u.alive) return;
    if (!v.kinjuGs.some(g => !g.routed && g.units.some(u => u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget))) return;
    rt.say('組頭 源八', '幕の後ろから新手じゃ！　組から離れず、旗本の囲みを押せ！', 3.4);
  });
}
