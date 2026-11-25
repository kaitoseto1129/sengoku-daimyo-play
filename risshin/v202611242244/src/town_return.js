// ======================================================================
// 帰還の列（K308 要件51・72・73）：戦から城下へ戻った最初の一度だけ、町の門から兵の列が入ってくる。
//   勝ち戦＝旗を立て、縄を掛けた捕虜を引き、足並みがそろう。町の人が「勝ち戦じゃ」と迎える。
//   負け戦＝人が少なく、旗も無く、足を引きずる（遅い）。町の人の声は暗い。
//   組の者が討たれていれば「〇〇の家には、もう知らせが行った」と兵が言う（要件73）。
// 兵の数は少なく（多くて十人）。歩き終えたら門の内の脇に並んで休む。
// ======================================================================
import { allyGroup } from './bhelp.js';
import { S as SETTINGS } from './settings.js';
import { RANKS, scenario, scenarioKey } from './state.js';
import { houseReturn } from './house_towns.js';   // H3（11/24 Sanae）：毛利・島津・伊達の帰り道の声

export function returnSetup(rt, game, gate) {
  const r = game && game.lastResult;
  if (!r || r._townReturn || !gate) return;
  r._townReturn = true;
  const win = !!r.mainDone;
  const dead = (r.squadLines || []).filter((l) => !l.alive).map((l) => l.name);
  const x0 = gate.x, z0 = gate.z - 6, dest = { x: gate.x + 3, z: gate.z + 24 };   // 通りの東の端（通りは半分の幅 4.5。+9 は家の中だった）
  const list = win
    ? [{ type: 'ashigaru', n: 6, o: { invuln: true, flag: scenario().faction || 'oda' } }, { type: 'porter', n: 2, o: { invuln: true, weapon: 'none', hat: 'none', name: '捕虜' } }]
    : [{ type: 'ashigaru', n: 3, o: { invuln: true, flag: null, hat: 'hachimaki' } }, { type: 'porter', n: 1, o: { invuln: true, weapon: 'none', name: '手負い' } }];
  const g = allyGroup(rt, { name: win ? '帰陣の兵' : '戻った兵', anchor: { x: x0, z: z0 }, facing: 0, order: 'move', dest, noRout: true, width: 2, speed: win ? 1.1 : 0.7, march: true, aggro: 0, seekRange: 0, fixed: true }, list);
  const R = rt.flags.homecoming = { g, win, dead, said: 0, t: 0, done: false, dest };
  // 位が上がった時は、門番が新しい位で呼ぶ（昇進の後の清洲。位で町の扱いが変わる）
  const rankNew = r.promoted ? (r.rankNameAfter || RANKS[r.rankAfter]?.name || '') : '';
  const H = R.house = houseReturn(scenarioKey());
  rt.after(2.5, () => rt.say('門番', rankNew ? `${rankNew}殿、お帰りなされ！　勝ち戦じゃ` : win ? (H ? H.win : '勝ち戦じゃ！　旗が戻ってきたぞ') : (H ? H.lose : '……戻ってきた。思うたより少ないのう'), 4));
  if (dead.length) {
    rt.after(9, () => rt.say('組の者', `${dead[0]}の家には、もう知らせが行った`, 4));
    // 討たれた仲間の寝床は、長屋で空いたまま（四秒後に続けて一言）
    rt.after(14, () => rt.say('長屋の者', `長屋の${dead[0]}の寝床が、空いたままじゃ`, 4));
  }
  return R;
}

export function returnTick(rt, dt) {
  const R = rt.flags.homecoming;
  if (!R || R.done) return;
  R.t += dt;
  const g = R.g, c = g.units.find((u) => u.alive);
  if (!c) { R.done = true; return; }
  // 列が止まったら脇で休ませる
  if (Math.hypot(c.pos.x - R.dest.x, c.pos.z - R.dest.z) < 3 || R.t > 70) { g.order = 'hold'; g.dest = null; R.done = true; return; }
  // 負け戦は足を引きずる（体を少し傾ける）
  if (!R.win && !SETTINGS.reduceMotion) for (const u of g.units) if (u.body) u.body.rotation.z = Math.sin(rt.t * 3 + u.id) * 0.08;
  // 主人公が列のそばを通ると、町の人の声（八秒に一度まで）
  const p = rt.player.u.pos;
  if (Math.hypot(p.x - c.pos.x, p.z - c.pos.z) < 10 && rt.t - (R.sayAt || -99) > 8) {
    R.sayAt = rt.t;
    const L = R.house ? (R.win ? R.house.crowd : R.house.sad) : R.win ? ['お帰りなされ！', '縄を掛けた者がおる。敵の兵じゃ', '旗が揃うて戻ってきた'] : ['怪我人ばかりじゃ……', '旗が戻らなんだ', '静かに迎えてやれ'];
    rt.say('町の人', L[R.said++ % L.length], 2.5);
  }
}
