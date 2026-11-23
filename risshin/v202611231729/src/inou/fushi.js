// ======================================================================
// 稲生 13分ごろ：田の中の伏兵（林勢の先手が崩れた後、美作守の旗本へ向かう道）
//   林勢の先手が崩れると、田の道の両脇の刈り残しの稲の陰に、林の足軽が五人ずつ伏せて待つ（しゃがんで旗を倒した姿）。
//   主人公が七m に近づくと（本体の lurk の決まり）、鬨を上げて飛び出す。遠くを通れば伏せたまま。
//   美作守の旗本の手前で足を止めさせ、「旗本へ急げ」の道にも出来事を置く（移動も出来事に）。
// ======================================================================
import { enemyGroup } from '../bhelp.js';

const LOOK = { armor: 0x2e2822, hatColor: 0x1c1916, lace: 0x6a4a30, cloth: 0x7a5236, flag: 'nobukatsu', flagShape: 1 };

export function tick(rt) {
  const F = rt.flags, v = F.v15, C = v.C;
  if (v.fushiT || F.ending || F.stage !== 3) return;
  v.fushiT = rt.t;
  const P = rt.player.u.pos;
  // 主人公と旗本の間の道の両脇（主人公から二十m 以上先）
  const z0 = Math.max(C.BOSS.z + 22, Math.min(P.z - 22, C.BOSS.z + 44));
  v.fushi = [[C.FRONT_X - 7, z0], [C.FRONT_X + 8, z0 - 12]].map(([x, z]) => {
    const g = enemyGroup(rt, { faction: 'nobukatsu', name: '林勢の伏兵', anchor: { x, z }, fixed: true, facing: 0, fleeDir: { x: 0, z: -1 }, width: 3, noRout: true, noAI: true,
      order: 'hold', aggro: 0, morale: 80, dmgMult: 0.4, ambush: true, speed: 3.4 }, [{ type: 'ashigaru', n: 5, o: LOOK }]);
    g.secKind = 'lurk'; F.groups.push(g);
    return g;
  });
}
