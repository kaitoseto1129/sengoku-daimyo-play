// ======================================================================
// 桶狭間 13〜14分：引き揚げの道（移動も出来事に）
//   義元の首が挙がり、今川勢は西の深田へ崩れた。首を持って谷の出口の旗へ引き揚げる道の脇から、
//   逃げ場を失った今川の残兵が死に物狂いで斬り込んで来る（『信長公記』：深田へ逃げ入った者を追い討った）。
//   組と一緒に払い、旗へ戻る。払わなくても四十秒で深田へ逃げ去る（物語は進む）。
// ======================================================================
const ready = (u) => !!u && u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget;

export function tick(rt) {
  const F = rt.flags, v = F.o15, C = v.C;
  if (v.kaeriDone || rt.over || F.ending || !F.victory || F.returnT == null) return;
  if (!v.kaeriT) {
    if (rt.t - F.returnT < 9) return;
    v.kaeriT = rt.t;
    const P = rt.player.u.pos, q = F.returnPin || P;
    // 主人公と旗の間の道の脇（西の深田の側）
    const mx = (P.x + q.x) / 2, mz = (P.z + q.z) / 2;
    const side = C.fieldVector(-14, 6), anchor = { x: mx + side.x, z: mz + side.z };
    v.kaeriG = C.enemyGroup(rt, { faction: 'imagawa', name: '今川の残兵', anchor, facing: C.FIELD_TURN, width: 3, morale: 70, aggro: 18, seekRange: 26,
      dmgMult: 0.35, noRout: true, fleeDir: C.fieldVector(-0.862, 0.507) }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 4 }]);
    v.kaeriG.order = 'attack'; v.kaeriG.focus = rt.player.u;
    rt.army.playFar?.('eshout', anchor, 1.3);
    rt.say('今川の侍', '御屋形様の仇じゃ！　せめて一人でも道連れに！', 3);
    // 残兵を先に払った時や再開後は、帰還の下知を古い迎撃の声で覆わない。
    rt.after(3.2, () => {
      if (rt.flags !== F || F.o15 !== v || rt.over || rt.retryOpen || F.ending ||
          !F.victory || v.kaeriDone || !rt.player.u.alive ||
          v.kaeriG.routed || !v.kaeriG.units.some(ready)) return;
      rt.say('組頭 源八', '深田へ逃げ損ねた残兵じゃ。首を守って払え！', 3);
    });
    return;
  }
  const g = v.kaeriG, t = rt.t - v.kaeriT;
  if (!g.units.some(ready) || t > 40) {
    v.kaeriDone = true;
    g.order = 'retreat'; g.noRout = false; g.morale = 0; g.fleeSet = true; g.fleeDir = C.fieldVector(-0.862, 0.507);
    // 逃げ始めた者も ready から外れる。生存者がいる時は全滅と知らせない。
    const survivors = g.units.some((u) => u.alive && !u.gone);
    rt.say('組頭 源八', survivors ? '残兵は深田へ退く。旗へ戻れ！' : '払ったぞ。旗へ戻れ！', 2.4);
  }
}
