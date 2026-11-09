// ======================================================================
// 岩石城　別の口（3〜12分の間ずっと）：本人が大手の一つの門で戦う間に、ほかの尾根でも豊臣の攻城隊が城へ取り付く
//   東の尾根と西の尾根に軽い大軍の押し合い（本物にはならない）。段が進むたびに使番が「東門突破！」「北曲輪も入りました！」と知らせ、
//   押し合いは城の側が崩れる。豊臣の物量が止まらない、を見せる。
// 呼び方：setup で install(rt)、段が変わる所で stage(rt, s)。
// ======================================================================
import { clash } from '../b_sekigahara.js';

const FRONTS = {
  east: { x: 54, z: 46, seed: 15701, A: 'toyotomi', n: 240 },   // 東の尾根（羽柴秀勝の手）
  west: { x: -74, z: -26, seed: 15702, A: 'tsuru', n: 200 },   // 西の尾根から北曲輪へ（蒲生の手）
};

export function install(rt) {
  const F = rt.flags;
  F.fronts = {};
  for (const [k, f] of Object.entries(FRONTS)) {
    try {
      F.fronts[k] = clash(rt, { x: f.x, z: f.z, facing: Math.atan2(-f.x, -f.z), w: 30, gap0: 14, seed: f.seed, noWake: true, noRout: true,
        A: { flag: f.A, armor: 0x2a2420, count: f.n, flagRate: 0.5, guns: true },
        B: { flag: 'saito', armor: 0x2e2a26, count: 110, flagRate: 0.35, bows: true } });
    } catch (e) { F.fronts[k] = null; }
  }
}

// 段ごとの別の口の知らせ
export function stage(rt, s) {
  const F = rt.flags, E = F.fronts || {}, say = (t, who, line) => rt.after(t, () => { if (!F.ending) rt.say(who, line, 3); });
  if (s === 1) { E.west?.go?.(); say(20, '使番', '西の尾根、蒲生の手が梯子を掛けました！'); }
  else if (s === 2) { E.east?.push?.('A', 0.5); say(10, '物見', '東の尾根の塀に、羽柴の旗が上がっていく'); }
  else if (s === 3) {
    say(4, '使番', '東門突破！　羽柴秀勝様の手、城内へ！');
    rt.after(4, () => E.east?.rout?.('B', { from: 0, hideAfter: 40 }));
    say(16, '使番', '北曲輪も入りました！　蒲生の手でござる！');
    rt.after(16, () => E.west?.rout?.('B', { from: 0, hideAfter: 40 }));
  } else if (s === 4) { say(8, '使番', '搦手の前田勢、本丸の下へ取り付きました！'); say(40, '物見', '城のあちこちに豊臣の旗が立っていく……！'); }
  else if (s === 5) say(6, '使番', '城方の三の丸、もう誰もおりませぬ！');
}
