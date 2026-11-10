// ======================================================================
// 雑賀攻め・小雑賀川　武将の持ち場（docs/generals_oda_1108.md の 22：織田 必須＝明智・滝川・丹羽・佐久間／雑賀 必須＝鈴木孫一・土橋守重）
// 史実：信長公記巻十の雑賀御陣は、山手（佐久間・羽柴・荒木・堀ら）と浜手（滝川・明智・丹羽・細川・筒井ら）に分けて攻めた。
//   この川岸は山手の局地なので、浜手の明智・滝川・丹羽は南の浜手の陣（画面の奥）に旗と備付きで置く（目の前に並べない）。
//   孫一・土橋は対岸の奥（雑賀の陣）に置く。孫一本人がこの川岸にいたとは断定しない（遠い旗と名で「敵の顔」を見せる補い）。
// どの将も討てず、持ち場を離れない（局地の兵や任務の数には入れない）。人数は将一人に数人ずつの軽い備え。
// ======================================================================
import { allyGroup, enemyGroup } from '../bhelp.js';
import { nobori } from '../props.js';

export function place(rt, ctx) {
  const { dress, SAIKA, WEST, EAST } = ctx;
  const W = rt.world, out = [];
  const ally = (name, flag, x, z) => {
    const g = allyGroup(rt, { name: name + 'の備え', fixed: true, noHunt: true, fullStrength: true, anchor: { x, z }, facing: WEST, width: 5, order: 'hold', guard: true, guardLeash: 3, aggro: 3, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name, invuln: true, horse: true } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 4 }], { flag }));
    for (const u of g.units) u.noTarget = true;
    rt.scene.add(nobori(W, x + 6, z - 4, flag, 6), nobori(W, x + 6, z + 4, flag, 6));
    out.push(g);
  };
  // 浜手の三将（南の浜手へ向かう陣。川岸の東、奥）
  ally('明智光秀', 'akechi', 132, 58);
  ally('滝川一益', 'takigawa', 146, 76);
  ally('丹羽長秀', 'sujikai', 120, 84);
  const foe = (name, x, z, list) => {
    const g = enemyGroup(rt, { faction: 'saika', name: name + 'の陣', fixed: true, noHunt: true, anchor: { x, z }, facing: EAST, width: 5, order: 'hold', guard: true, guardLeash: 3, aggro: 4, seekRange: 6, noRout: true, fleeDir: { x: -1, z: 0 } },
      dress(list, SAIKA));
    for (const u of g.units) { u.noTarget = true; if (u.name) u.invuln = true; }
    g.noWake = true;
    out.push(g);
  };
  // 雑賀の顔：対岸の奥（川下寄りは孫一の弥勒寺山の方角、川上寄りは土橋）
  foe('鈴木孫一', -96, 46, [{ type: 'busho', n: 1, o: { name: '鈴木孫一', invuln: true } }, { type: 'gun', n: 4 }, { type: 'samurai', n: 1 }]);
  foe('土橋守重', -100, -52, [{ type: 'busho', n: 1, o: { name: '土橋守重', invuln: true } }, { type: 'gun', n: 3 }, { type: 'ashigaru', n: 2 }]);
  return out;
}
