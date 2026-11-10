// ======================================================================
// 桶狭間 3〜4分：雨の谷の途中（移動も出来事に）
//   『信長公記』：山際まで寄せた所で急な雨。石氷を投げ打つようで、楠の大木が東へ倒れた。
//   谷を下る途中、雷とともに道の脇の大木が倒れる音がし、雨に紛れて道の脇の藪にうずくまっていた今川の物見五人が飛び出す。
//   主人公が九m に寄るか、二十秒たつと立ち上がって斬りかかる。組の列は止まらず谷の出口へ歩く（本体の行軍）。
// ======================================================================
import { sfx } from '../audio.js';

const ready = (u) => !!u && u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget;

export function tick(rt) {
  const F = rt.flags, v = F.o15, C = v.C;
  if (v.taniDone || rt.over || F.ending) return;
  if (!v.taniT) {
    if (rt.phase !== 'march' || rt.t - (F.marchBegan ?? rt.t) < 6) return;
    v.taniT = rt.t;
    sfx('thunder', 1);
    rt.after(0.7, () => sfx('thunder', 0.9));
    rt.say('弥七', 'うわっ、雷じゃ！　大木が倒れたぞ！', 2.6);
    const g = v.taniG = C.enemyGroup(rt, { fixed: true, noGuard: true, faction: 'imagawa', name: '今川の物見', anchor: C.fieldPoint(-30, -14), facing: C.FIELD_TURN + Math.PI * 0.4,
      formation: 'line', width: 3, morale: 60, aggro: 0, seekRange: 12, dmgMult: 0.4, fleeDir: C.fieldVector(0.5, -1), ambush: true }, [{ type: 'ashigaru', n: 4 }, { type: 'samurai', n: 1 }]);
    g.order = 'hold';
    return;
  }
  const g = v.taniG, P = rt.player.u.pos;
  if (!v.taniUp) {
    const near = g.units.some((u) => ready(u) && Math.hypot(u.pos.x - P.x, u.pos.z - P.z) < 9);
    if (near || rt.t - v.taniT > 20) {
      v.taniUp = rt.t;
      g.order = 'attack'; g.aggro = 14; g.focus = rt.player.u.alive && !rt.G.lord ? rt.player.u : null;
      rt.army.playFar?.('eshout', g.center(), 1.2);
      rt.say('組頭 源八', '藪に物見が潜んでおった！　討て、声を上げさせるな！', 3);
    }
  } else if (!g.units.some(ready) || rt.t - v.taniUp > 60) {
    v.taniDone = true;
    if (g.units.some(ready)) { g.order = 'retreat'; g.noRout = false; g.morale = 0; }
    if (rt.t - v.taniUp <= 60) rt.say('組頭 源八', 'よし。今川はまだ気付いておらぬ。旗について谷を下れ！', 3);
  }
}
