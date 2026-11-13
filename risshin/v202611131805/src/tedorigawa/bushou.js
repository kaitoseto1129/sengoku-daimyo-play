// ======================================================================
// 手取川の戦い　上杉の後方の指揮役
// docs/generals_place/tedorigawa.md：直江景綱は合戦前に没している。
// 景勝・直江信綱・本庄の現地参加と持ち場は未確認のため、実名にせず備えを保つ。
// 遊び：北の闇の上杉の大軍の中に、名のない指揮役と旗を置く。持ち場を離れない。
// ======================================================================
import { enemyGroup } from '../bhelp.js';
import { nobori } from '../props.js';

export function place(rt, ctx) {
  const { dress, UESUGI } = ctx;
  const W = rt.world, out = [];
  for (const [name, x, z] of [['上杉の後備えの将', -46, -150], ['上杉の連絡役', 44, -146], ['上杉の脇備えの将', 92, -128]]) {
    const g = enemyGroup(rt, { faction: 'uesugi', name: name + 'の備え', fixed: true, noHunt: true, anchor: { x, z }, facing: 0, width: 6, order: 'hold', guard: true, guardLeash: 3, aggro: 3, seekRange: 6, noRout: true, fleeDir: { x: 0, z: -1 } },
      dress([{ type: 'busho', n: 1, o: { name, invuln: true, horse: true } }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 2 }], UESUGI));
    for (const u of g.units) u.noTarget = true;
    g.noWake = true;
    rt.scene.add(nobori(W, x - 5, z - 3, 'uesugi', 6), nobori(W, x + 5, z - 3, 'uesugi', 6));
    out.push(g);
  }
  // 11/10 docs/tedorigawa_spec_1109.md：加賀の一揆勢（白山ミュージアム：松任城の謙信の前に石川・河北郡の一揆勢が布陣）。
  //   上杉と色の違う素の小袖に鉢巻、南無の旗。北西の闇に置き、追撃が始まると渡り口の西の脇へ回って逃げ道を狭める（kenshinRide の1）。
  const KOSODE = { kosode: 1, kosodeCol: 0x484339, cloth: 0x34332e, hat: 'hachimaki', sode: false, kote: 0, menpo: 0 };
  const ikki = enemyGroup(rt, { faction: 'ikko', flag: 'namu', name: '加賀の一揆勢', fixed: true, noHunt: true, anchor: { x: -84, z: -104 }, facing: 0, width: 5, formation: 'yari', order: 'hold',
    aggro: 4, seekRange: 6, noRout: false, fleeDir: { x: -1, z: -1 } },
  [{ type: 'ashigaru', n: 5, o: { ...KOSODE } }, { type: 'bow', n: 2, o: { ...KOSODE } }]);
  ikki.noWake = true;
  rt.scene.add(nobori(W, -84, -110, 'namu', 5));
  rt.flags.kagaIkki = ikki;
  return out;
}
