// ======================================================================
// 稲葉山城 15分の構成（docs/oda15_plan_1108.md 5）　①の続き「町の出口」（0〜3分の終わり）
// 三軒に火を付け、町の番の兵を払った後。燃える町へ城から斎藤の新手が下りて来る。
// 藤吉郎の手と町の出口に並び、逃げる民の道を空けたまま新手を退ける。済んだら翌日の囲み（sally）へ。
// 呼び方：b_inabayama.js の町の段の終わりで start(rt, ctx, done)。
// ======================================================================
import * as DP from '../b_depth.js';
import { depthStart } from '../b_depth.js';

const EXIT = { x: 25, z: 44 };   // 町の出口（家の無い東の往来の先。b_inabayama.js の townExit と同じ所）

export function start(rt, ctx, done) {
  const F = rt.flags;
  if (F.k15Machi) return;
  F.k15Machi = 'on';
  rt.unmark('townExit');
  depthStart(rt, ctx, [
    DP.rest({ dur: 5, heal: 0.2, banner: ['井口の町が燃える', '城から新手が下りて来る'],
      say: [['木下藤吉郎', '火は回った。じゃが城が気付いた。出口を固めよ', 3.4]] }),
    DP.hold({
      // 11/10 関所：寄せの残りが遠くで矢を射るだけになると、出口に立ったまま四分余り何も起きなかった（bot 73〜357秒）。二分半で区切る
      at: EXIT, r: 12, dur: 60, limit: 150, noRefill: true, label: '町の出口', title: '町の出口を守れ', sub: '城から下りた斎藤の新手',
      obj: '町の出口で仲間と並び、斎藤の新手を退けよ',
      waves: [
        { t: 3, say: ['足軽', '山から旗が下りて来る！　斎藤の新手じゃ！'],
          foes: () => [{ name: '城から下りた新手', from: { x: 44, z: 14 }, list: [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 7 }, { type: 'bow', n: 2 }], mass: 120, scale: 1.3 }] },
        { t: 36, say: ['使番', '寺の脇からも来るぞ！　騎馬じゃ！'],
          foes: () => [{ name: '斎藤の騎馬', from: { x: 6, z: 18 }, list: [{ type: 'cavalry', n: 3 }, { type: 'ashigaru', n: 5 }], mass: 60, scale: 1.2 }] },
      ],
      say: [['木下藤吉郎', '民は逃がせ。刃は兵にだけ向けよ', 3.2]],
      reward: '町の出口を守り抜いた',
    }),
    DP.rest({ dur: 5, heal: 0.25, say: [['木下藤吉郎', 'よう守った。今宵は退く。明日は山を囲むぞ', 3.6]] }),
  ], () => { F.k15Machi = 'done'; done(); });
}
