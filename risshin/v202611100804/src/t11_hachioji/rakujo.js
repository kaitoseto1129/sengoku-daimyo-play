// ======================================================================
// 八王子城の戦い　終幕「落城」（13〜15分）　docs/toyo15_plan_1108.md の 14
// 史実：中山勘解由・大石信濃守らが討死し、城は一日で落ちた。城兵の討死は千余と伝わり、城の女たちは御主殿の滝に身を投げ、
//   城山川は三日赤く流れたと言い伝えられる。寄せ手は討ち取った首と捕らえた妻子を小田原の城の前に晒し、籠もる北条方の心を折った。
// 遊び：本丸に火が回る。最後まで残った城兵が本丸の奥から斬り掛かる。崩れると戦の音が止み、山のあちこちから煙が上がる。
//   爽快な勝鬨ではなく重い余韻：滝の知らせ、利家の言葉、「八王子城　陥落」「氏照の本拠、失われる」。小田原へ知らせを送って終わる。
// 入れ方：b_t11_hachioji.js の depthStart の段の並びの最後（中山勘解由の後）に step(H) を置く。済むと戦の win。
// ======================================================================
import { enemyGroup, nm } from '../bhelp.js';
import { sfx } from '../audio.js';
import { retreat } from './retreat.js';

export function step(H) {
  // 敗走した組と、倒れる途中・重傷で離脱した兵は残兵に数えない。
  const live = (g) => (g && !g.routed ? g.units.filter((u) => u.alive && !u.gone && !u.dying && !u.fleeing && !u.evacuatedWound).length : 0);
  return {
    kind: 'fight', max: 150, key: 'rakujo',
    start(rt, C) {
      const F = rt.flags, W = rt.world;
      C.at = H.LAST; C.goal = H.LAST; C.groups = [];
      rt.obj('dp', '本丸の奥で、最後まで残る城兵を討つ', 'main');
      // 本丸と尾根の曲輪に火が回る（灰の煙。山のあちこちから）
      for (const [x, z, sz] of [[H.HON.x - 8, H.HON.z - 8, 2.6], [H.HON.x + 6, H.HON.z - 10, 2.2], [H.MATSUKI.x + 6, H.MATSUKI.z - 4, 2], [H.TAKA.x + 3, H.TAKA.z - 4, 1.8], [H.GOSHU.x - 2, H.GOSHU.z - 8, 2.4]])
        W.addFire(x, z, { size: sz, h: 3, smoke: true, blackSmoke: false });
      rt.say('前田の侍', '本丸に火がかかったぞ！　……まだ奥に残っておる！', 3.2);
      // 最後まで残った城兵：降らずに本丸の奥から斬り掛かる
      C.last = enemyGroup(rt, { fixed: true, faction: 'hojo', name: '最後の城兵', anchor: { x: H.LAST.x - 6, z: H.LAST.z - 4 }, facing: Math.PI * 0.25, width: 4, aggro: 16, morale: 100, noRout: true, order: 'attack', seekRange: 24 },
        H.dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }], H.HOJO));
      C.last.dmgMult = 0.4;
      C.groups.push(C.last);
      rt.after(2.6, () => rt.say('北条の侍', '氏照様の城じゃ！　一人でも多く道連れにせよ！', 3.2));
      C.say = 0;
    },
    tick(rt, C, m, ctx, el) {
      // 最後の目標も本人が本丸の奥へ着いてから果たす。味方だけが城兵を崩しても、
      // 本人が離れた所にいるまま落城の余韻と勝利へ進めない。
      const P = rt.player.u.pos;
      if (Math.hypot(P.x - H.LAST.x, P.z - H.LAST.z) < 10) C.entered = true;
      // 奥まで攻めて守兵の大半を崩した後は、柵際に残った二人を延々と追わせない。
      const left = live(C.last);
      if (C.quiet == null && C.entered && (left <= 1 || (el >= 150 && left <= C.last.units.length * 0.3))) {
        C.quiet = el;
        retreat(C.last);
        // 城方は崩れ、戦の音が止む（残りの城兵の組も崩す）
        for (const g of rt.army.groups || []) if (g.team === 1 && g !== rt.flags.yokochi && g.count) retreat(g);
        sfx('horagai', 0.6);
      }
      if (C.quiet == null) { rt.objProgress('dp', ''); return false; }
      const t = el - C.quiet, me = nm(rt);
      const line = (at, f) => { if (t >= at && C.say < at) { C.say = at; f(); } };
      line(1, () => rt.say('前田の侍', '……城方、崩れた。斬り合いの音が、止んだ', 3.2));
      line(5, () => rt.banner('八王子城　陥落', '天正十八年六月二十三日　一日で落ちる'));
      line(9, () => rt.say(me, '城の中には、女や子が多うございました', 3.4));
      line(13, () => rt.say('前田の侍', '御主殿の滝に、城の女たちが身を投げたと……川が赤く流れておる', 4));
      line(18, () => rt.say('前田利家', '……これが戦よ。忘れるな', 3.6));
      line(22.5, () => rt.banner('氏照の本拠、失われる', '城代の横地監物は西へ落ちのびた'));
      line(27, () => rt.say('前田利家', '討ち取った首と捕らえた者を、小田原の城の前に並べよ。籠もる者どもの心が折れよう', 4.4));
      line(32, () => rt.say(me, '山のあちこちから、まだ煙が上がっておる……', 3));
      return t > 37;
    },
    end(rt) {
      rt.objDone('dp');
    },
  };
}
