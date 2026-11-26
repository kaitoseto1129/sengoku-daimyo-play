// ======================================================================
// 信貴山城の戦い　本丸の段の出来事「降伏の勧めと、久秀の拒み」（約9〜12分。b_shigisan.js の honmaru から入れる）
// 史実：信長は久秀に降るよう使いを出したが、久秀は応じず、天主に火をかけて果てた（信長公記巻十）。
//   名物の茶釜（平蜘蛛）と爆死は後の脚色が強いので見せない（kaito 11/1 の紙）。
// 遊び：本丸の口で一度矢玉が止み、信忠の使番が降伏を勧める声を張る。久秀は櫓の上から拒み、本丸の兵が最後の打って出をする。
//   打って出た組を払うか約二分で、落城（win）へ（b_shigisan.js の win はこの段が済むまで待つ）。字は出さない：止む矢玉・声・赤い印で分からせる。
// ======================================================================
import { enemyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';
import { siegeFighter } from '../siege_zones.js';

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
    rt.marker('kousanL', () => (L.units.some(siegeFighter) ? L.center() : null), '打って出た松永の衆', { red: true, group: L });
  });
  return {
    update(dt) {
      if (stopped()) { resumeFire(); return; }
      if ((tick -= dt) > 0) return;
      tick = 0.5;
      const el = rt.t - t0;
      if (!L) return;
      let n = 0;
      for (const u of L.units) if (siegeFighter(u)) n++;
      rt.objProgress('kousan', n ? `打って出た松永の衆 ${n}人` : '');
      // 11/19 クラウド 信貴山の持ち主：打って出た衆が南口で相手を得ず、門の東 (26,-75) まで下りて一点に重なった（act bot 11/19 00:54 486秒 honmaru ★★）。
      //   打って出た所から二十四歩より離れ、誰も相手を持たなければ、本丸の内へ退かせる（上限の七十五秒と同じ退き）
      if (n && !L._sgBack) {
        const c = L.center();
        if (Math.hypot(c.x - TOP.x - 6, c.z - TOP.z - TOP.r + 2) > 24 && !L.units.some((u) => siegeFighter(u) && u.target)) {
          L._sgBack = true;
          for (const u of L.units) if (siegeFighter(u)) { u.fleeing = true; u.target = null; u.moraleFleeDir = { x: 0, z: -1 }; }
        }
      }
      // 打って出た時の声を聞き終え、敵を払ったら炎上の段へ渡す。
      // 敵のいない南口で七十五秒まで待つ必要はない。
      // 11/17 一時間の持ち主：本丸の段が250秒を超えた。払い切れない時の上限を百五十秒→百秒に。
      // 11/18 クラウド 信貴山の持ち主：本人は下の曲輪から西の帯道を回って南口へ着くのに九十秒余り（act bot 568秒：段の始め398秒→南口492秒）。
      //   上限百秒では炎上の段が本人の着いた三十秒後に始まり、さらに四十五秒待った。七十五秒にして、登る途中で本丸の火が見えるように
      if ((!n && el > 24) || el > 75) {
        done = true; F.kousanDone = true;
        rt.unmark('kousanL');
        if (!n) { rt.objDone('kousan'); rt.award((t) => t.side.push('降伏を拒んだ本丸の打って出を払った'), '本丸の打って出を払った'); }
        else {
          rt.objRemove('kousan');
          // 上限で段を終える時も、残兵を退かせて南口への寄せを続ける。
          for (const u of L.units) if (siegeFighter(u)) { u.fleeing = true; u.moraleFleeDir = { x: 0, z: -1 }; }
        }
        onDone?.();
      }
    },
  };
}
