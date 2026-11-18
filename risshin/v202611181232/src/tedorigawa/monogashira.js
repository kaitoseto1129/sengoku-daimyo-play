// ======================================================================
// 手取川の戦い　南岸の殿の段「上杉の物頭の名乗り」（b_tedorigawa.js の fordTick から毎秒一度）
// 11/18 クラウド 手取川の持ち主（act bot「簡単すぎる・もっと強い奴と斬り合いたい」・名のある将 本人0）：
//   浅瀬を渡って来た上杉の新手の先頭の物頭（実名は作らない・役目の名だけ）が、隊ごと本人へ寄せ、三十六歩で名乗って一騎打ちを挑む。
//   道明寺の薄田兼相（b_domyoji.js の namedDuel）と同じ型。本人が手負い（命が三分の二を切る）なら挑まない。七十秒で寄れなければやめる。
// ======================================================================
const NAME = '上杉の物頭';
const LINE = '織田の殿か！　上杉の物頭、この瀬で首を貰い受ける！';

export function monogashiraDuel(rt) {
  const F = rt.flags, P = rt.player.u, A = rt.army;
  if (F.step !== 4 || F.ending || rt.over || !P) return;
  let u = F.monoU;
  if (!u) {
    u = F.monoU = A.units.find((o) => o.name === NAME && o.team !== P.team);
    if (!u) return;
    // 着せる時の質の倍で命が二百八十を超えていた（描かずの照らし）。鬼小島（百七十）より下の、並の侍の倍に揃える
    if (u.hp >= u.maxHp) { u.maxHp = 150; u.hp = 150; }
  }
  const g = u.group;
  const d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z);
  const drop = () => { F.monoCall = 0; F.monoOn = 0; u.duelOpponent = false; if (g && g.focus === P) g.focus = null; };
  if (F.monoOn) {
    if (u.alive && P.alive && d < 40 && (A.duel || rt.t - F.monoOn < 6)) { if (!A.duel) g.focus = P; return; }
    if (A.duel && A.duel.foe === u) A.duelEnd(false, '');
    drop(); return;
  }
  if (F.monoCall) {
    // 南岸へ上がって本人の三十六歩まで来たら名乗る（一騎打ちの見せ方が間合いを詰める）（川の中で名乗ると見届けの輪が濁流に出来る）。
    //   描かずの照らしで、物頭は味方の槍列の前（本人の十八歩）で止まり、十二歩では一度も名乗らなかった
    if (!u.alive || !P.alive || !g || g.routed || rt.t - F.monoCall > 70) { drop(); return; }
    // 段の寄せの下知が隊の狙いを毎回置き直すので、名乗るまで本人を狙い直す
    g.focus = P;
    if (d < 36 && !A.duel && u.pos.z > -6) {
      F.monoOn = rt.t; u.duelOpponent = true;
      rt.say(NAME, LINE, 3.5);
    }
    return;
  }
  if (F.monoDone || !u.alive || u.fleeing || !g || g.routed || !g.tedoActive || !P.alive || P.hp < P.maxHp * 0.65 || A.duel) return;
  if (d > 50) return;
  F.monoDone = true; F.monoCall = rt.t;
  g.focus = P; g.noRout = true; g.order = 'attack'; g.seekRange = 50;
}
