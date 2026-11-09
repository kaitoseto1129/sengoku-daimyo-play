// ======================================================================
// 大河内城 15分の構成（docs/oda15_plan_1108.md 7）　⑤の前半「戦闘停止・和睦交渉」（12〜14分）
// 打って出を退けた後、城から白い布を掲げた使者が下りて来る。和睦を嫌う北畠の侍が使者を襲う。
// 使者を守って南の陣まで送り届けると、和睦の札（peace）へ。
// 呼び方：b_okawachi.js の打って出の段（shutsugeki）の後で start(rt, ctx, done)。
// ======================================================================
import * as DP from '../b_depth.js';
import { depthStart } from '../b_depth.js';
import { allyGroup } from '../bhelp.js';

const gone = (g) => !g || g.count === 0 || g.routed;

export function start(rt, ctx, done) {
  const F = rt.flags;
  if (F.k15Waboku) return;
  F.k15Waboku = 'on';
  const { LINE, CAMP, speaker, dress } = ctx;
  const p = rt.player.u.pos;
  // 使者（味方として扱い、敵に狙われる。討たれない）
  const envoy = allyGroup(rt, { fixed: true, name: '北畠の使者', anchor: { x: LINE.x - 4, z: LINE.z - 6 }, facing: Math.PI, width: 2, aggro: 0, noRout: true, order: 'move' },
    dress([{ type: 'samurai', n: 1, o: { name: '北畠の使者', invuln: true, horse: false } }, { type: 'ashigaru', n: 2, o: { weapon: 'none', invuln: true } }]));
  envoy.dest = { x: CAMP.x, z: CAMP.z }; envoy.speed = 1.8;
  F.k15Envoy = envoy;
  rt.marker('k15envoy', () => (gone(envoy) ? null : envoy.center()), '北畠の使者', {});
  depthStart(rt, ctx, [
    DP.rest({ dur: 6, heal: 0.3, banner: ['城から使者', '白い布を掲げて下りて来る'],
      say: [['足軽', '城から使者じゃ！　白い布を掲げておるぞ', 3.2], [speaker, '槍を下げよ。使者を本陣まで無事に送れ', 3.4]] }),
    DP.move({
      to: () => ({ x: (LINE.x + CAMP.x) / 2, z: (LINE.z + CAMP.z) / 2 }), r: 8, label: '使者の道', obj: '北畠の使者を守り、南の陣へ送り届けよ', max: 100,
      ambush: { t: 14, title: '和睦を嫌う侍', sub: '使者を斬らせるな', say: ['北畠の侍', '和睦など許さぬ！　使者を斬れ！'],
        foes: () => [{ name: '和睦を嫌う北畠の侍', from: { x: p.x - 18, z: p.z - 10 }, list: [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 3 }], mass: 0 }] },
    }),
    DP.rest({ dur: 8, heal: 0.2, banner: ['使者、本陣へ着く', '和睦の話が始まる'],
      say: [['使番', '使者は本陣に入りました。殿が会われるとのこと', 3.4], [speaker, 'これで城の者も飢えずに済むかもしれん', 3.4]] }),
  ], () => {
    F.k15Waboku = 'done';
    rt.unmark('k15envoy');
    for (const u of envoy.units) if (u.alive && !u.gone) rt.army.despawn(u);
    done();
  });
}
