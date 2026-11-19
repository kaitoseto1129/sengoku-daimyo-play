// ======================================================================
// 手取川の戦い　南岸の殿の段「上杉の物頭の名乗り」（b_tedorigawa.js の fordTick から毎秒一度）
// 11/18 クラウド 手取川の持ち主（act bot「簡単すぎる・もっと強い奴と斬り合いたい」・名のある将 本人0）：
//   浅瀬を渡って来た上杉の新手の先頭の物頭（実名は作らない・役目の名だけ）が、隊ごと本人へ寄せ、三十六歩で名乗って一騎打ちを挑む。
//   道明寺の薄田兼相（b_domyoji.js の namedDuel）と同じ型。本人が深手（命が四割半を切る）なら挑まない。七十秒で寄れなければやめる。
// ======================================================================
const NAME = '上杉の物頭';
const LINE = '織田の殿か！　上杉の物頭、この瀬で首を貰い受ける！';

export function monogashiraDuel(rt) {
  const F = rt.flags, P = rt.player.u, A = rt.army;
  // 段が「南の退き口へ退け」に替わっても勝負が続き、物頭が退き口まで本人に付いて来た（11/18 19:57 act bot・七十五秒の勝負）。段が替われば解く
  if (F.monoOn && F.monoU && (F.step !== 4 || F.ending || rt.over)) {
    if (A.duel && A.duel.foe === F.monoU) A.duelEnd(false, '');
    F.monoOn = 0; F.monoCall = 0; F.monoU.duelOpponent = false;
    const g0 = F.monoU.group; if (g0 && P && g0.focus === P) g0.focus = null;
    return;
  }
  if (F.step !== 4 || F.ending || rt.over || !P) return;
  let u = F.monoU;
  if (!u) {
    u = F.monoU = A.units.find((o) => o.name === NAME && o.team !== P.team);
    if (!u) return;
    // 着せる時の質の倍で命が二百八十を超えていた（描かずの照らし）。鬼小島（百七十）より下の、並の侍の倍に揃える
    if (u.hp >= u.maxHp) { u.maxHp = 150; u.hp = 150; }
    u.tedoNoDrown = true;   // 名乗る前に深みで溺れると一騎打ちが無くなる（b_tedorigawa.js の息の減り）
  }
  const g = u.group;
  const d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z);
  const drop = () => { F.monoCall = 0; F.monoOn = 0; u.duelOpponent = false; if (g && g.focus === P) g.focus = null; };
  if (F.monoOn) {
    if (u.alive && P.alive && d < 40 && (A.duel || rt.t - F.monoOn < 6)) {
      if (!A.duel) g.focus = P;
      // 名乗った物頭は浅瀬で味方の槍列に止まり、本人の三十歩前で一騎打ちが立ち消えた（11/18 描かずの照らし）。勝負の間は物頭だけ本人へ歩ませる
      else if (A.duel.foe === u) u.target = P;   // 歩みは毎コマの monogashiraWalk
      return;
    }
    if (A.duel && A.duel.foe === u) A.duelEnd(false, '');
    drop(); return;
  }
  if (F.monoCall) {
    // 南岸へ上がって本人の三十六歩まで来たら名乗る（一騎打ちの見せ方が間合いを詰める）（川の中で名乗ると見届けの輪が濁流に出来る）。
    //   描かずの照らしで、物頭は味方の槍列の前（本人の十八歩）で止まり、十二歩では一度も名乗らなかった
    if (!u.alive || !P.alive || !g || g.routed || rt.t - F.monoCall > 70) { drop(); return; }
    // 段の寄せの下知が隊の狙いを毎回置き直すので、名乗るまで本人を狙い直す
    g.focus = P;
    // 隊の持ち場（anchor）が北岸の寄せ口のままだと、攻めの下知でも持ち場へ引かれ物頭が北岸（z -35）へ戻った（11/18 19:50 act bot）。持ち場を本人へ
    if (g.anchor) { g.anchor.x = P.pos.x; g.anchor.z = P.pos.z; }
    //   11/18 17:50 描かずの照らし：物頭は水際（z -6〜-7・本人の三十五〜三十七歩）で槍列に止められ、z>-6 も三十六歩も満たさず名乗らなかった。
    //   続けての照らしでは浅瀬の中（z 0〜2・本人の二十七〜三十三歩）で味方の列と六十秒斬り合い、岸へ上がらなかった。
    //   膝までの浅瀬（深さ0.7未満）なら四十四歩で名乗る（間合いは一騎打ちの見せ方が詰める。濁流の深みでは名乗らない）
    if (d < 44 && !A.duel && u.pos.z > -12 && rt.world.waterDepthAt(u.pos.x, u.pos.z) < 0.7) {
      F.monoOn = rt.t; u.duelOpponent = true;
      rt.say(NAME, LINE, 3.5);
      // 11/18 22:50 act bot の記録：名乗った後、段の下知が隊の狙いを置き直して六秒の内に勝負が始まらず、名乗りだけで消えた回があった。名乗ればその場で勝負に入る
      if (!A.duel && A.duelStart) { g.noRout = true; g.focus = P; A.duelStart(u); }
    }
    return;
  }
  // 11/18 19:30 act bot 3回とも名のある将 本人0：act は北岸の火と渡りで手負いのまま南岸へ着き、命が三分の二を超えず物頭が寄せなかった。
  //   命四割半まで挑み、寄せ始めの間合いも六十歩に（playbot の照らしでは七割で名乗り四十秒の勝負で討てた）
  if (F.monoDone || !u.alive || u.fleeing || !g || g.routed || !g.tedoActive || !P.alive || P.hp < P.maxHp * 0.45 || A.duel) return;
  // 11/18 22:40 持ち主：描かずの記録で物頭の隊は段4の四十秒過ぎまで本人の六十歩より遠く（z -52→-35）、名のある将 本人0 が三回。
  //   段に入って二十秒過ぎれば、百二十歩までなら挑みに出る（寄せは monogashiraWalk が先頭を切って浅瀬へ歩ませる）
  if (d > 60 && !(d < 120 && rt.t - (F.stepT || rt.t) > 20)) return;
  F.monoDone = true; F.monoCall = rt.t;
  g.focus = P; g.noRout = true; g.order = 'attack'; g.seekRange = 50;
  if (g.anchor) { g.anchor.x = P.pos.x; g.anchor.z = P.pos.z; }
}

// 一騎打ちの間、名乗った物頭だけを毎コマ本人へ歩ませる（毎秒の下知だけでは浅瀬の槍列に止まり、三十歩前で勝負が立ち消えた）
//   11/18 19:45 act bot：寄せの下知の後も物頭が北岸の水際（z -28・本人の五十五歩）で渡りの順を三十秒待ち、七十秒で名乗りが消えた回があった（名のある将 本人0）。
//   寄せの間も、本人の四十二歩より遠ければ物頭だけ先に浅瀬へ歩ませる（先頭を切って渡る物頭）
export function monogashiraWalk(rt, dt) {
  const F = rt.flags, A = rt.army, u = F.monoU, P = rt.player.u;
  if (!u || !u.alive || !P || !P.alive || u.fleeing) return;
  const duel = F.monoOn && A.duel && A.duel.foe === u;
  const calling = F.monoCall && !F.monoOn && !A.duel;
  if (!duel && !calling) return;
  const dx = P.pos.x - u.pos.x, dz = P.pos.z - u.pos.z, d = Math.hypot(dx, dz);
  const stop = duel ? 6 : 42;
  if (d <= stop) return;
  const s = Math.min(d - stop, (duel ? 2.4 : 1.8) * dt) / d;
  u.pos.x += dx * s; u.pos.z += dz * s;
  A.collide(u, dt);
  u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z);
}
