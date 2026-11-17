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
    // K355（センゴク外伝 桶狭間戦記 5巻 第37話・docs/books/okehazama_manga.md）：義元の討死の後、海の服部左京の船手が熱田の湊へ寄せて
    //   火を掛け上がろうとし、熱田の町人が駆け出して追い返した（信長公記）。引き揚げの道から西の空に煙と遠い喊声だけ見せる（軽い大軍・本物の兵は増やさない）
    rt.after(7, () => {
      if (rt.flags !== F || F.o15 !== v || rt.over || F.ending || !rt.world.addClash) return;
      try {
        const p = C.fieldPoint(-150, 70);
        v.atsuta = rt.world.addClash({ rt, play: (k, q, vv) => rt.army.play?.(k, q, vv), smoke: (x, y, z, fx, fz) => rt.army.smoke?.(x, y, z, fx, fz),
          x: p.x, z: p.z, facing: C.FIELD_TURN, w: 24, gap0: 10, seed: 1561, noRout: true, noWake: true,
          A: { flag: 'none', armor: 0x5a4c3c, count: 60 }, B: { flag: 'imagawa', armor: 0x3f2a24, count: 50 } });
        rt.after(1, () => v.atsuta?.go());
        rt.after(14, () => { v.atsuta?.push('A', 0.8); v.atsuta?.rout('B', { from: 0, hideAfter: 25 }); });
        rt.army.smoke?.(p.x, 2, p.z, 0, 0);
        rt.army.playFar?.('toki', p, 1.1);
      } catch (e) { v.atsuta = null; }
      rt.after(2, () => { if (rt.flags === F && !rt.over && !F.ending) rt.say('組頭 源八', '西の空に煙……熱田の湊じゃ。町の衆が今川の船手を追い返しておる', 3.4); });
    });
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
