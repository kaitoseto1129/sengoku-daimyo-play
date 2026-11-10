// ======================================================================
// 山中城　諸将と北条氏勝（二巡・docs/generals_toyo_toku_1108.md の 12）
//   北条氏勝（玉縄の援兵）は間宮康俊の勧めで城を落ちる（史実）。出丸の戦の前に、三の丸から北の箱根道へ退く手を見せ、物見が知らせる。
//   周りの尾根に徳川家康の旗（箱根の別の道を攻める家康の手）と、細川忠興・池田輝政・福島正則の名を使番の知らせで（同じ虎口には入れない）。
// 呼び方：setup で install(rt)、出陣の段の間に update(rt)。
// ======================================================================
import { enemyGroup } from '../bhelp.js';
import { flagTexture } from '../textures.js';

export function install(rt) {
  const F = rt.flags, W = rt.world;
  // 徳川の旗（北東の外の尾根。軽い作り・本物にならない）
  try {
    const g = W.addDistantArmy({ x: 310, z: -40, w: 40, d: 70, count: 500, facing: -Math.PI / 2, farFill: true, armor: 0x2b2723, team: 0, flagTex: flagTexture('tokugawa'), mon: 'tokugawa', seed: 15931 });
    if (g?.army) g.army.noWake = true;
  } catch (e) { /* 飾り */ }
  const say = (t, who, s, d = 3.4) => rt.after(t, () => { if (!F.ending) rt.say(who, s, d); });
  say(18, '物見', '三の丸から北へ、三つ鱗の旗の一手が退いていきます。北条氏勝の手かと', 3.6);
  say(80, '使番', '細川忠興様・池田輝政様・福島正則様の手も、後ろの尾根に揃いました', 3.6);
  // 氏勝の手：三の丸から東の尾根を通り、北へ（討てない・戦わない）
  rt.after(12, () => {
    if (F.ending || F.ujikatsu) return;
    F.ujikatsu = enemyGroup(rt, { faction: 'hojo', name: '北条氏勝の手', anchor: { x: 12, z: 20 }, facing: Math.PI, width: 4, aggro: 0, seekRange: 0, order: 'path', noRout: true, morale: 100, arriveNoncombat: true, peaceful: true },
      [{ type: 'busho', n: 1, o: { name: '北条氏勝', invuln: true, horse: true } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 4 }]);
    // 本丸へ直進すると二の丸の柵と本丸の北の柵に詰まる。曲輪の東を回って城外へ落ちる。
    F.ujikatsu.path = [[65, 20], [70, -46], [70, -130], [52, -200]]; F.ujikatsu.pathIdx = 0;
    F.ujikatsu.speed = 3.2; F.ujikatsu.noPursue = true; F.ujikatsu.historicalOrders = true;
    // 攻撃対象外の兵も到着を数える。除くと全員着いても退去の処理が呼ばれない。
    for (const u of F.ujikatsu.units) { u.invuln = true; u.noTarget = true; }
    F.ujikatsu.onArrive = (g) => { for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u); };
  });
}
