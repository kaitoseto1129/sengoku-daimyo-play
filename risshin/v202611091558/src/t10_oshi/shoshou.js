// ======================================================================
// 忍城　諸将（二巡・docs/generals_toyo_toku_1108.md の 13）
//   豊臣：丸墓山の三成の陣の脇に長束正家（堤の普請と兵糧の奉行）。関東の諸将（宇都宮国綱・結城晴朝・多賀谷重経）は北の遠景の軽い大軍。
//   城方：城代の成田泰季が城の中で病に倒れ、一門の長親が城を預かった（史実）事を物見が知らせる。
// 呼び方：setup で install(rt, K)。K = { MARU, ISHI }
// ======================================================================
import { allyGroup } from '../bhelp.js';

export function install(rt, K) {
  const F = rt.flags, W = rt.world;
  F.natsuka = allyGroup(rt, { faction: 'ishida', name: '長束正家の手', fullStrength: true, anchor: { x: K.MARU.x + 8, z: K.MARU.z + 6 }, facing: Math.atan2(-1, -1), width: 4, aggro: 0, fixed: true, noAI: true },
    [{ type: 'busho', n: 1, o: { name: '長束正家', invuln: true, horse: false, armor: K.ISHI.armor } }, { type: 'samurai', n: 2 }]);
  for (const u of F.natsuka.units) u.noTarget = true;
  // 関東の諸将（北の遠景。本物にはならない）
  for (const [i, [x, z]] of [[60, 200], [0, 214], [-60, 206]].entries()) {
    try { W.addDistantArmy({ x, z, w: 36, d: 14, count: 260, facing: Math.PI, farFill: true, armor: 0x2a2622, team: 0, flag: 'toyotomi', mon: 'toyotomi', seed: 15960 + i }); } catch (e) { /* 飾り */ }
  }
  const say = (t, who, s, d = 3.4) => rt.after(t, () => { if (!F.ending) rt.say(who, s, d); });
  say(14, '長束正家', '堤の普請は昼夜を分かたず。米と銭で近在の者を集めておる', 3.6);
  say(34, '使番', '北には宇都宮国綱様・結城晴朝様・多賀谷重経様の関東の衆が陣を張っております', 3.8);
  say(58, '物見', '城代の成田泰季は病に倒れたとの噂。城は一門の成田長親が預かっておるそうな', 3.8);
}
