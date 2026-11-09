// ======================================================================
// 金ヶ崎の退き口 15分の構成（docs/oda15_plan_1108.md 8）　④「殿戦・藤吉郎・光秀ら・一定時間食い止める」（9〜13分）
// 一番の見せ場：笙の川の砦で、藤吉郎の殿が朝倉の本手を食い止め、主力（信長の本隊）を若狭への道へ逃がす。
// 渡りの段（deep B）の後、狭路の砦へ退く前に入る。朝倉の騎馬と侍の大きな寄せを三度受け、決めの秒だけ持ちこたえる。
// 呼び方：b_kanegasaki.js の deep('B') の後で start(rt, ctx, done)。
// ======================================================================
import * as DP from '../b_depth.js';
import { depthStart } from '../b_depth.js';

export function start(rt, ctx, done) {
  const F = rt.flags;
  if (F.k15Shingari) return;
  F.k15Shingari = 'on';
  F.dpOn = true;
  const { LINE1, LOOK } = ctx;
  const from = (dx, dz) => ({ x: LINE1.x + dx, z: LINE1.z + dz });
  depthStart(rt, { ...ctx, look: LOOK, scale: 1.0, dmg: 0.5 }, [   // 殿の組（F.tono）が尽きると総崩れになるので、一打は軽く
    DP.rest({ dur: 5, heal: 0.3, banner: ['金ヶ崎の殿', '主力が退ききるまで、ここで食い止める'],
      say: [['木下藤吉郎', '殿はこの藤吉郎が引き受けた！　上様が朽木を越えるまで、一人も通すな！', 4.2]] }),
    DP.hold({
      at: LINE1, r: 11, dur: 95, label: '川の砦', title: '殿の戦い', sub: '朝倉の本手が川を渡って来る',
      obj: '川の砦で朝倉の本手を食い止めよ。主力を逃がせ',
      waves: [
        { t: 3, say: ['足軽', '川向こうに朝倉の旗が並んだ！　渡って来るぞ！'],
          foes: () => [{ name: '朝倉景健の追手', from: from(0, -30), formation: 'yari', list: [{ type: 'busho', n: 1, o: { name: '朝倉景健', invuln: true, horse: true, hat: 'kabuto_m' } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 2 }], mass: 200 }] },
        { t: 12, say: ['朝倉景健', '織田の殿を踏み潰せ！　信長を逃がすな！'], foes: () => [] },
        { t: 35, say: ['池田勝正', '騎馬が浅瀬を回るぞ！　横を固めよ！'],
          foes: () => [{ name: '朝倉の騎馬', from: from(-24, -18), list: [{ type: 'cavalry', n: 4 }, { type: 'samurai', n: 1 }], mass: 80 }] },
        { t: 65, say: ['使番', '上様の本隊、若狭への道に入られました！　あと少し！'],
          foes: () => [{ name: '朝倉の新手', from: from(16, -26), list: [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 7 }], mass: 120 }] },
      ],
      reward: '金ヶ崎の殿で朝倉の本手を食い止めた',
      // 守備を離れて失敗した時は、後の退き口で成功へ変えない。
      onEnd: (rt2, m, won) => { if (!won) m.kgFailed = true; },
    }),
    DP.rest({ dur: 5, heal: 0.3, banner: ['主力は抜けた', '殿も狭路の砦へ退く'],
      say: [['木下藤吉郎', 'ようやった！　上様は抜けられた。わしらも退くぞ、狭路の砦まで走れ！', 4]] }),
  ], () => { F.k15Shingari = 'done'; F.dpOn = false; done(); });
}
