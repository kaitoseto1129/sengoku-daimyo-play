// ======================================================================
// 山中城　別の口（6〜13分）：本人が大手の虎口と二の丸で戦う間に、東の尾根（堀秀政）と西の丸の側でも寄せ手が城へ入っていく
//   軽い大軍の押し合い（本物にはならない）と使番の「別曲輪、突破！」「西側も入りました！」。旗が城のあちこちに増える。
// 呼び方：setup で install(rt)、段が変わる所で step(rt, n)。
// ======================================================================
import { clash } from '../b_sekigahara.js';
import { nobori } from '../props.js';
import { flagTexture } from '../textures.js';

export function install(rt) {
  const F = rt.flags;
  F.fronts = {};
  const mk = (k, x, z, A, seed) => {
    try {
      F.fronts[k] = clash(rt, { x, z, facing: Math.atan2(25 - x, -100 - z), w: 28, gap0: 16, seed, noWake: true, noRout: true, maxDrift: 14,
        A: { flagTex: flagTexture(A), flag: A, armor: 0x2b2723, count: 220, flagRate: 0.5, guns: true },
        B: { flag: 'hojo', armor: 0x2e2a26, count: 100, flagRate: 0.35, bows: true, guns: true } });
    } catch (e) { F.fronts[k] = null; }
  };
  // 絵の兵は動ける範囲（±236m）の外の尾根だけに置く。城内の別の口は本物の先手が攻める。
  mk('east', 310, 4, 'hori', 15921);      // 東の遠い尾根（堀秀政の後続）
  mk('west', -310, -18, 'kashiwa', 15922);   // 西の遠い尾根（山内の後続）
}

const flagsAt = (rt, list, k) => { for (const [x, z] of list) { try { rt.scene.add(nobori(rt.world, x, z, k, 6)); } catch (e) { /* 飾り */ } } };

export function step(rt, n) {
  const F = rt.flags, E = F.fronts || {}, say = (t, who, s) => rt.after(t, () => { if (!F.ending) rt.say(who, s, 3.2); });
  if (n === 2) { E.east?.go?.(); say(12, '物見', '東の尾根を、堀様の旗が登っていきます'); }
  else if (n === 3) { E.west?.go?.(); E.east?.push?.('A', 0.5); say(20, '使番', '西の丸の堀にも、山内様の手が取り付きました！'); }
  else if (n === 4) {
    say(3, '使番', '別曲輪、突破！　堀秀政様、三の丸の東へ入りました！');
    rt.after(3, () => { E.east?.rout?.('B', { from: 0, hideAfter: 40 }); flagsAt(rt, [[46, 8], [40, -6]], 'hori'); });
    say(18, '使番', '西側も入りました！　西の丸に豊臣の旗！');
    rt.after(18, () => { E.west?.rout?.('B', { from: 0, hideAfter: 40 }); flagsAt(rt, [[-54, -50], [-46, -40]], 'kashiwa'); });
    say(46, '物見', '北条の旗が、一つ、また一つ倒れていく……');
  }
}
