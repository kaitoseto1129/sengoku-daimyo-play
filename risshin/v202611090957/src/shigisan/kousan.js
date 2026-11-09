// ======================================================================
// 信貴山城の戦い　本丸の段の出来事「降伏の勧めと、久秀の拒み」（約9〜12分。b_shigisan.js の honmaru から入れる）
// 史実：信長は久秀に降るよう使いを出したが、久秀は応じず、天主に火をかけて果てた（信長公記巻十）。
//   名物の茶釜（平蜘蛛）と爆死は後の脚色が強いので見せない（kaito 11/1 の紙）。
// 遊び：本丸の口で一度矢玉が止み、信忠の使番が降伏を勧める声を張る。久秀は櫓の上から拒み、本丸の兵が最後の打って出をする。
//   打って出た組を払うか約二分で、落城（win）へ（b_shigisan.js の win はこの段が済むまで待つ）。字は出さない：止む矢玉・声・赤い印で分からせる。
// ======================================================================
import { enemyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';

export function install(rt, ctx) {
  const F = rt.flags;
  const { dress, MATSU, TOP, onDone } = ctx;
  const t0 = rt.t;
  let L = null, done = false, tick = 0;
  const stopped = () => done || F.ending || rt.over || !rt.player.u.alive;
  // 勧告中に討死・終戦しても、止めた射撃の設定を残さない。
  const resumeFire = () => {
    for (const g of rt.army.groups) if ('_kousanFire' in g) { g.fire = g._kousanFire; delete g._kousanFire; }
  };
  // 本丸の口で矢玉が止む（数秒）
  rt.after(6, () => {
    if (stopped()) return;
    for (const g of rt.army.groups) if (g.team === 1) { g._kousanFire = g.fire; g.fire = false; }
    sfx('kane', 0.6);
    rt.say('信忠の使番', '松永弾正殿に申す！　今のうちに城を開き、降られよ。城介様（信忠）は命までは取らぬと仰せじゃ！', 5);
  });
  rt.after(13, () => { if (!stopped()) rt.say('松永久秀', '降れと申すか。信長に二度も頭を下げるつもりは無い！　帰って伝えよ！', 4.5); });
  rt.after(19, () => {
    resumeFire();
    if (stopped()) return;
    sfx('volley', 0.9);
    // 本丸の最後の打って出
    L = enemyGroup(rt, { faction: 'matsunaga', name: '本丸から打って出た松永の衆', anchor: { x: TOP.x + 6, z: TOP.z + TOP.r - 2 }, facing: 0, width: 8, order: 'attack', aggro: 30, seekRange: 34, morale: 95, fleeDir: { x: 0, z: -1 } },
      dress([{ type: 'samurai', n: 2, o: { hat: 'kabuto_m' } }, { type: 'ashigaru', n: 5 }], MATSU));
    rt.army.play?.('eshout', { x: TOP.x, z: TOP.z + TOP.r }, 1.6);
    rt.say('組頭', '拒んだか！　本丸から打って出て来るぞ。槍をそろえよ！', 4);
    rt.obj('kousan', '本丸の口から打って出た松永の衆を払え', 'order');
    rt.marker('kousanL', () => (L.units.some((u) => u.alive && !u.fleeing && !u.woundOut) ? L.center() : null), '打って出た松永の衆', { red: true, group: L });
  });
  return {
    update(dt) {
      if (stopped()) { resumeFire(); return; }
      if ((tick -= dt) > 0) return;
      tick = 0.5;
      const el = rt.t - t0;
      if (!L) return;
      let n = 0;
      for (const u of L.units) if (u.alive && !u.fleeing && !u.woundOut) n++;
      rt.objProgress('kousan', n ? `打って出た松永の衆 ${n}人` : '');
      if ((!n && el > 75) || el > 150) {
        done = true; F.kousanDone = true;
        rt.unmark('kousanL');
        if (!n) { rt.objDone('kousan'); rt.award((t) => t.side.push('降伏を拒んだ本丸の打って出を払った'), '本丸の打って出を払った'); }
        else rt.objRemove('kousan');
        onDone?.();
      }
    },
  };
}
