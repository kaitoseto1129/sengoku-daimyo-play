// ======================================================================
// 大河内城 15分の構成（docs/oda15_plan_1108.md 7）　③「夜襲・補給遮断・城外の兵糧拠点を潰す」（6〜9分）
// 搦手の夜攻めが押し返され、陣へ退いた後。同じ夜のうちに、城へ兵糧を運び込む北畠の荷置き場を襲う。
// 荷を守る番を払い、俵に火を掛ける（火は共通の addFire）。済んだら翌朝の封鎖（siegeDays）へ。
// 時間で決まる後の段は、この段に使った秒だけ後ろへずらす（F.k15Shift）。
// 呼び方：b_okawachi.js の siegeDays() の頭で start(rt, ctx, done)。
// ======================================================================
import * as DP from '../b_depth.js';
import { depthStart } from '../b_depth.js';

export function start(rt, ctx, done) {
  const F = rt.flags;
  if (F.k15Hyoro) return;
  F.k15Hyoro = 'on';
  const t0 = rt.t;
  const { DEPOT, speaker } = ctx;
  depthStart(rt, ctx, [
    DP.rest({ dur: 5, heal: 0.35, banner: ['夜のうちに', '城へ運ぶ兵糧を断つ'],
      say: [[speaker, '力攻めは止めじゃ。代わりに城へ運ぶ兵糧の荷置き場を焼く。声を立てるな', 4]] }),
    DP.move({
      to: DEPOT, r: 7, label: '北畠の荷置き場', obj: '暗い道を進み、北畠の荷置き場へ', max: 110,
      ambush: { d: 9, title: '荷置き場の番', sub: '俵の山を守る北畠の兵', say: ['足軽', '松明じゃ、荷の番が気付いたぞ！'],
        foes: () => [{ name: '荷置き場の番', from: { x: DEPOT.x + 10, z: DEPOT.z - 8 }, list: [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 7 }], mass: 0 }] },
    }),
    DP.fight({
      at: DEPOT, title: '荷を守る北畠勢', sub: '城から駆け付けた手', obj: '荷を守る北畠勢を払え', max: 130, noRefill: true,
      foes: () => [{ name: '荷を守る北畠勢', from: { x: DEPOT.x - 16, z: DEPOT.z - 12 }, list: [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 7 }, { type: 'bow', n: 2 }], mass: 0 }],
      reward: '北畠の荷置き場を焼いた',
      onEnd: (rt2) => {
        // 俵の山に火を掛ける（三つの火。城の者にも見える）
        F.k15DepotFires = [[0, 0], [3, 2], [-3, 1.5]].map(([dx, dz]) => rt2.world.addFire(DEPOT.x + dx, DEPOT.z + dz, { h: 2.2, size: 2 }));
        rt2.banner('兵糧の荷が燃える', '城の者は山の上から見ている');
        rt2.say('足軽', '俵が燃える！　これで城の米は細るぞ', 3.2);
      },
    }),
    DP.rest({ dur: 6, heal: 0.3, say: [[speaker, 'よし、退け。夜が明けたら南の鹿垣で囲みを続ける', 3.6]] }),
  ], () => { F.k15Hyoro = 'done'; F.k15Shift = (F.k15Shift || 0) + (rt.t - t0); done(); });
}
