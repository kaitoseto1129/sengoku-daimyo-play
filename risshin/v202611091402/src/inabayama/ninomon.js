// ======================================================================
// 稲葉山城 15分の構成（docs/oda15_plan_1108.md 5）　③「急斜面・曲輪・虎口」（6〜10分）
// 付け入りで大手の木戸を抜けた後、すぐ本丸へは上がらせない。
// 入口曲輪を登る間に上から石と矢（待ち伏せ）→ 中枢曲輪に弓・鉄砲の守り → 奥の曲輪から新手。
// 段が済んだら本丸の段（signal）へ渡す。山の上なので控えの軽い大軍は付けない（斜面に浮くため）。
// 呼び方：b_inabayama.js の signal() の頭で start(rt, ctx, done)。
// ======================================================================
import * as DP from '../b_depth.js';
import { depthStart } from '../b_depth.js';

const KURUWA = { x: 2, z: -88 };     // 入口曲輪（木戸の内の広場から二つ上の折れ）
const GATE = { x: -10, z: -94 };     // 中枢曲輪への通路。信長期の二ノ門は置かない。

export function start(rt, ctx, done) {
  const F = rt.flags;
  if (F.k15Nino) return;
  F.k15Nino = 'on';
  rt.objRemove('main');
  depthStart(rt, { ...ctx, fixedSpawn: true, backing: false, scale: 1.2 }, [
    DP.rest({ dur: 4, heal: 0.2, banner: ['大手の木戸を抜けた', '上の曲輪にも守り'],
      say: [['木下藤吉郎', '木戸は抜いた。じゃが中枢曲輪にも守りが残る。曲輪を一つずつ取るぞ', 3.6]] }),
    DP.move({
      to: KURUWA, r: 8, label: '入口曲輪', obj: '入口曲輪へ登れ。上からの矢に気を付けよ', max: 90,
      ambush: { d: 16, title: '曲輪の上から', sub: '石と矢が降る', say: ['足軽', '上から石じゃ！　盾の陰へ寄れ！'],
        foes: () => [{ name: '入口曲輪の守り', from: { x: 12, z: -84 }, list: [{ type: 'ashigaru', n: 5 }, { type: 'bow', n: 3 }], mass: 0 }] },
    }),
    DP.fight({
      at: GATE, title: '中枢曲輪', sub: '曲輪の弓と鉄砲', obj: '中枢曲輪の守りを崩せ', max: 160,
      say: [['木下藤吉郎', '曲輪の脇の鉄砲を先に潰せ。正面から当たるな', 3.4]],
      foes: () => [{ name: '中枢曲輪の守り', from: { x: -22, z: -97 }, formation: 'yari', list: [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 2 }, { type: 'bow', n: 2 }], mass: 0 }],
      later: [{ t: 45, say: ['使番', '中の曲輪から新手が下りて来る！'], foes: () => [{ name: '中の曲輪の新手', from: { x: -26, z: -108 }, list: [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }], mass: 0 }] }],
      reward: '中枢曲輪の守りを崩した',
    }),
  ], () => { F.k15Nino = 'done'; done(); });
}
