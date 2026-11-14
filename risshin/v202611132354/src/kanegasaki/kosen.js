// ======================================================================
// 金ヶ崎の退き口 15分の構成（docs/oda15_plan_1108.md 8）　①「朝倉方拠点攻略・優勢・前進」（0〜3分）
// 金ヶ崎の城は開いた。木ノ芽峠へ進む先手として、峠道を下りて来た朝倉の残りを押し返し、峠の手前の柵を取る。
// 味方は優勢（奥の押し合いは織田が押す・軽い作り）。柵を取った所で浅井離反の急報（betrayed）へ渡す。
// 呼び方：b_kanegasaki.js の setup で start(rt, ctx, done)。done で離反と追手（wave1）が始まる。
// ======================================================================
import * as DP from '../b_depth.js';
import { depthStart } from '../b_depth.js';
import { clash } from '../b_sekigahara.js';
import { TIER } from '../device_tier.js';

export function start(rt, ctx, done) {
  const F = rt.flags;
  if (F.k15Kosen) return;
  F.k15Kosen = 'on';
  const { LINE0, ARMOR } = ctx;
  const n = (k) => Math.round(k * (TIER.weak ? 0.6 : 1));
  const A1 = { x: LINE0.x - 2, z: LINE0.z - 14 };   // 一の備のすぐ先の坂
  const A2 = { x: LINE0.x - 4, z: LINE0.z - 30 };   // 峠道の手前の柵
  const stages = [
    DP.fight({
      at: A1, title: '峠道の朝倉勢', sub: '城を捨てた兵が峠から押し返して来る', obj: '坂を下りて来る朝倉勢を押し返せ', max: 90, limit: 100, noRefill: true,   // 11/10 kanegasaki_spec_1109：異変は二分ほどで（四分の攻めは長かった）
      say: [['木下藤吉郎', '城は開いた。残りの朝倉を峠へ押し戻せ！　勢いはこちらにあるぞ', 3.6]],
      foes: () => [{ name: '峠から下りた朝倉勢', from: { x: A1.x + 2, z: A1.z - 26 }, list: [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5 }, { type: 'bow', n: 2 }], mass: 140, dmg: 0.45 }],
      later: [{ t: 30, say: ['足軽', '東の疋田の道からも来るぞ！'], foes: () => [{ name: '疋田の朝倉勢', from: { x: A1.x + 26, z: A1.z - 8 }, list: [{ type: 'ashigaru', n: 6 }, { type: 'gun', n: 1 }], mass: 60 }] }],
      reward: '峠道の朝倉勢を押し返した',
      onEnd: (rt2, m, won) => {
        if (!won) return;
        try {
          // 近くの戦いは本物の兵だけ。絵の軍勢はほかの遠景と同じ九十メートルの外へ限る。
          F.k15KosenClash = clash(rt2, { x: A2.x + 22, z: A2.z - 6, facing: Math.PI, w: 24, gap0: 8, seed: 157101, noRout: false, noWake: true, nearHide: 90, killRate: 0.02,
            A: { flag: 'oda', armor: ARMOR.oda, count: n(170), team: 0, faction: 'oda', flagRate: 0.4 },
            B: { flag: 'asakura', armor: ARMOR.asakura, count: n(90), team: 1, faction: 'asakura', flagRate: 0.4 } });
          F.k15KosenClash?.go?.();
          F.k15KosenClash?.push?.('A', 0.7);
        } catch (e) { F.k15KosenClash = null; }
      },
    }),
    DP.move({
      to: A2, r: 7, label: '峠道の柵', obj: '前へ。峠道の手前の柵へ進め', max: 45,
      say: [['木下藤吉郎', '押せ押せ！　柵を取れば一乗谷まで一息じゃ', 3.2]],
      ambush: { d: 12, say: ['足軽', '柵の陰に残っておるぞ！'], foes: () => [{ name: '柵の守り', from: { x: A2.x - 6, z: A2.z - 14 }, list: [{ type: 'ashigaru', n: 2 }], mass: 0, dmg: 0.35 }] },
      // 11/10 関所：act の bot が峠の朝倉勢と柵の守りに囲まれ、五度の流しで四度、開戦一〜二分半で倒れた（森の手は後ろ）。
      //   始めの攻めは優勢の段なので、峠の朝倉勢と柵の残りは少なく弱く（押し合いの厚みは奥の軽い乱戦で見せる）。
      onEnd: (rt2, m, arrived) => { F.k15FenceTaken = arrived; },
    }),
    DP.rest({ dur: 6, heal: 0.25, banner: ['峠道の柵を取った', '朝倉勢は峠の奥へ退く'],
      say: [['足軽', '柵を取ったぞ！　次は木ノ芽峠じゃ！', 3], ['木下藤吉郎', 'よし、今宵は峠の下で陣を張る……ん、あの早馬は何じゃ', 3.6]] }),
  ];
  // 移動の期限で次へ進んでも、着いていない柵を取ったとは告げない。
  const report = stages[2], reportStart = report.start;
  const delayedReport = DP.rest({ dur: 6, heal: 0.25,
    banner: ['峠道の攻めが止まる', '木下の手と一の備へ戻る'],
    say: [['足軽', '柵には届かぬ。味方と槍をそろえよ！', 3], ['木下藤吉郎', '一の備へ戻れ……ん、あの早馬は何じゃ', 3.6]] });
  report.start = (rt2, C, m, context) =>
    (F.k15FenceTaken ? reportStart : delayedReport.start)(rt2, C, m, context);
  for (const stage of stages) {
    // 目標に沿って待つ間に、共通の放置判定で戦いを打ち切らない。
    stage.idleAdvance = false;
    if (stage.kind !== 'fight' && stage.kind !== 'move') continue;
    const start = stage.start;
    stage.start = (rt2, C, m, context) => {
      start(rt2, C, m, context);
      const g = context.aidG;
      if (!g || g.routed || !g.count) return;
      // 横長の攻めの持ち場は木戸脇の斜面へ掛かる。森の手は道の二列で
      // 木戸の開口を通り、目標へ着いてから打ち合う。兵の位置は飛ばさない。
      const c = g.center(), at = C.at || C.goal;
      if (!at) return;
      g.path = [[8, c.z], [8, at.z], [at.x, at.z]];
      g.pathIdx = 0; g.dest = { x: at.x, z: at.z };
      g.order = 'path'; g.formation = 'column'; g.colW = 2; g.roadColumn = true; g._fitAt = 0;
      g.onArrive = (group) => {
        group.order = 'attack'; group.path = null; group.onArrive = null;
        group.roadColumn = false; group.seekRange = 45;
      };
    };
  }
  const dctx = { ...ctx, scale: 1.2 };
  depthStart(rt, dctx, stages, () => {
    F.k15Kosen = 'done';
    // 11/10 関所：森可成の手が攻めの号令のまま一の備の北に残り、殿の段で川の砦へ来るはずの朝倉の寄せを川の北で崩していた
    //   （砦に追手が届かず期限で負け）。浅井の離反で全軍が退くので、森の手も若狭への道を先に退く（遠くの味方の旗になる）。
    const a = dctx.aidG;
    if (a?.count) {
      a.aggro = 0; a.seekRange = 0; a.noRout = true;
      // 11/13 K103「味方が何もせず」：退く列は手の届く追手（1.8m）だけ払って進む（aggro 0 のままだと、道で当たった敵と押し合って立ち尽くした）
      a.retreatOnly = true;
      a.path = [[8, 12], [-10, 60], [-26, 104], [-54, 150], [-66, 170]];
      a.pathIdx = 0; a.dest = { x: -66, z: 170 };
      a.order = 'path'; a.formation = 'column'; a.colW = 2; a.roadColumn = true; a._fitAt = 0;
      a.onArrive = (group) => { group.order = 'hold'; group.path = null; group.onArrive = null; group.facing = 0; group.retreatOnly = false; };
      dctx.aidG = null;
    }
    F.k15KosenClash?.rout?.('A', { hideAfter: 30, from: 0 });
    done();
  });
}
