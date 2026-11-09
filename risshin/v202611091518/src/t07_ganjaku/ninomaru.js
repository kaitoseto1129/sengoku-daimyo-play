// ======================================================================
// 岩石城　④二の丸の曲輪（9〜12分）：門を抜けた先の狭い曲輪で城兵と乱戦。小屋に火が回り、煙の中で斬り合う
//   城兵（二の丸の城兵）は始めから曲輪の奥で構えている（setup の foe）。段に入ると打って掛かり、少しして矢倉の下から新手。
// 呼び方：go(4) で start(rt, K)、update の段4で update(rt, K) が true を返したら go(5)。
// ======================================================================
import { sfx } from '../audio.js';

export const NINO = { x: -32, z: 32 };   // 二の丸の曲輪の中ほど（門の内と本丸の口の間）

export function make(rt, K) {
  return K.foe('二の丸の城兵', NINO, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }], { aggro: 5, width: 5 });
}

export function start(rt, K) {
  const F = rt.flags, W = rt.world;
  F.n4 = { t0: rt.t };
  rt.obj('s4', K.TEXT[3], 'main');
  rt.marker('t07', NINO, '二の丸', { h: 3 });
  // 曲輪の小屋に火（攻め手が火を掛け、一気に畳みかけた伝え）
  for (const [i, [x, z, s]] of [[-42, 44, 2.6], [-24, 40, 2.2], [-38, 24, 2], [-20, 26, 1.8]].entries()) rt.after(i * 2.5, () => { try { W.addFire(x, z, { size: s, h: 0.3, blackSmoke: true }); } catch (e) { /* 飾り */ } });
  const g = F.nino;
  if (g && g.count) { g.order = 'attack'; g.aggro = 16; g.seekRange = 30; g.noRout = true; }
  rt.say('蒲生郷成', '二の丸じゃ！　小屋に火を掛けよ、煙に紛れて討ち払え！', 3.2);
  rt.after(6, () => { if (F.stage === 4) rt.say('蒲生の侍', '火が回るぞ！　煙を吸うな、低く進め！', 2.8); });
  // 矢倉の下から新手（四十秒）
  rt.after(40, () => {
    if (F.stage !== 4 || F.ending) return;
    F.nino2 = K.foe('矢倉の下の新手', { x: -22, z: 22 }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }], { aggro: 16, width: 4 });
    F.nino2.order = 'attack'; F.nino2.seekRange = 30; F.nino2.noFrontline = true; F.nino2.noRout = true;
    F.foes.push(F.nino2);
    rt.army.play('eshout', { x: -22, z: 22 }, 1.4);
    rt.say('蒲生の侍', '矢倉の下から新手じゃ！', 2.6);
  });
  sfx('taiko', 0.7);
}

export function update(rt, K) {
  const F = rt.flags, el = rt.t - F.n4.t0;
  const left = (F.nino ? K.fighting(F.nino) : 0) + (F.nino2 ? K.fighting(F.nino2) : 0);
  // 時間だけで「討ち払った」にしない。寄せ手と実際に斬り合ってから撤退の時を数える。
  if (F.n4.fightT == null) for (const g of [F.nino, F.nino2]) {
    if (!g) continue;
    for (const u of g.units) {
      if (!u.alive || u.fleeing || u.woundOut) continue;
      const target = rt.army.nearestEnemy(u, 6, (v) => !v.noTarget && !v.isStruct && !v.fleeing && Math.abs(v.pos.y - u.pos.y) < 3 && !rt.army.wallBetween(u.pos, -1, v.pos));
      if (target) { F.n4.fightT = rt.t; break; }
    }
    if (F.n4.fightT != null) break;
  }
  // 討ち減らされた時も、長引いた時も、残兵は本丸へ退く。少数だけ曲輪で戦い続けない
  // 新手が来て全員を討ったら、最低秒数のためだけに空の曲輪で待たせない。
  if ((F.nino2 && left === 0 && el > 120) || (el > 150 && left <= 3) || (F.n4.fightT != null && rt.t - F.n4.fightT > 185)) {
    for (const g of [F.nino, F.nino2]) if (g && !g.routed) { g.fire = false; g.noRout = false; g.order = 'retreat'; g.morale = 0; g.fleeSet = true; g.fleeDir = { x: 0.7, z: -0.7 }; }
    return true;
  }
  return false;
}
