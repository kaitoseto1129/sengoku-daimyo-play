// ======================================================================
// 信貴山城の戦い　本丸の段の終わり「本丸に火が回る」（約11〜13分。shigisan/kousan.js の後、b_shigisan.js の win の前に入れる）
// 史実：城内から火が上がり（多聞院日記の猛火・和州諸将軍伝の内通）、久秀は天主に籠もって自ら火をかけた（信長公記巻十）。
// 遊び：打って出た組を払うと、本丸の館に火が回り、松永の兵が火から逃げ出して来る。本丸の南口の外で味方と口を固め、
//   火の勢いが天主へ移るのを見届ける（約一分）。済んだら落城の締め（win）へ。字は出さない：火・逃げ出る兵・印で分からせる。
// ======================================================================
import { enemyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';

export function install(rt, ctx) {
  const F = rt.flags;
  const { dress, MATSU, TOP, betrayal } = ctx;
  const t0 = rt.t, W = rt.world;
  const POST = { x: TOP.x, z: TOP.z + TOP.r + 7 };
  let done = false, tick = 0, R = null;
  F.enjouFires = [[TOP.x + 8, TOP.z + 4, 1.8], [TOP.x - 9, TOP.z + 2, 1.5]].map(([x, z, size]) => W.addFire?.(x, z, { size, h: 1.2, blackSmoke: true }));
  sfx('wood', 0.8);
  rt.say('足軽', '本丸の館に火が回ったぞ！　煙で前が見えぬ！', 3.5);
  rt.obj('main', '火の回った本丸の南口の外で、味方と口を固めよ', 'main');
  rt.objProgress('main', '');
  rt.marker('enjou', POST, '本丸の南口の外', { h: 3, guideAlways: true, guidePriority: 450 });
  rt.after(10, () => { if (!done && !F.betrayed) betrayal(); });
  rt.after(18, () => {
    if (done) return;
    R = enemyGroup(rt, { faction: 'matsunaga', name: '火から逃げ出た松永の兵', anchor: { x: TOP.x + 4, z: TOP.z + TOP.r - 4 }, facing: 0, width: 4, order: 'attack', aggro: 20, seekRange: 22, morale: 40, fleeDir: { x: 0.6, z: 1 } },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 3 }], MATSU));
    rt.say('組頭', '火の中から逃げ出て来た！　死に物狂いじゃ、気を付けよ！', 3.5);
    rt.marker('enjouR', () => (R.units.some((u) => u.alive && !u.fleeing && !u.woundOut) ? R.center() : null), '逃げ出た松永の兵', { red: true, group: R });
  });
  rt.after(30, () => { if (!done) rt.say('筒井順慶', '久秀は天主に籠もったか……。火が天主へ移るぞ', 4); });
  return {
    update(dt) {
      if (done || F.ending || rt.over) return;
      if ((tick -= dt) > 0) return;
      tick = 0.5;
      const p = rt.player.u.pos, el = rt.t - t0, d = Math.hypot(p.x - POST.x, p.z - POST.z);
      if ((el > 60 && d < 14) || el > 85) {
        done = true; F.enjouDone = true;
        rt.unmark('enjou'); rt.unmark('enjouR');
        if (R) for (const u of R.units) if (u.alive) { u.fleeing = true; u.moraleFleeDir = { x: 0.6, z: 1 }; }
      }
    },
  };
}
