// ======================================================================
// 田野　勝頼本隊の包囲（9〜13分・docs/oda15_plan_1108.md 31「勝頼本隊包囲・武田兵が次々倒れる」）と、武田家の終わりの余韻（14〜15分）
// 土屋昌恒の衆を退けた後、すぐ最期へ行かず：滝川の大軍が田野の屋敷を囲む（軽い大軍）→ 勝頼の旗本が最後に斬って出る →
// 退けると武田の兵が次々に倒れ、屋敷が静まる → 元の最期（win）。最後に武田の旗が倒れ、勝鬨、伏線の二十秒余り。
// 入れ方：b_tano.js で wrap(tano) を一度。def.win を包む。
// ======================================================================
import { k15Off, k15Go, k15Scenes, k15Live, k15Rout, k15Charge, k15Afterglow } from '../oda15_kit.js';
import { enemyGroup, centerOf } from '../bhelp.js';
import { flagTexture } from '../textures.js';
import { sfx } from '../audio.js';

export function wrap(def) {
  const win = def.win;
  def.win = function (r) {
    const F = r.flags;
    if (k15Off(r) || F.ending || F.kakomiDone || !r.player.u.alive) return win.call(this, r);
    if (F.k15stage === 'kakomi') return;
    start(r, () => {
      F.kakomiDone = true; F.k15on = false; F.k15fight = false;
      glow(r);
      win.call(this, r);
    });
  };
}

function start(rt, done) {
  const F = rt.flags, W = rt.world;
  F.k15stage = 'kakomi'; F.k15on = true;
  const stop = () => F.k15stage !== 'kakomi';
  rt.banner('田野の屋敷を囲む', '滝川の大軍が、谷の両の斜面から屋敷を囲んだ');
  // 囲む大軍（軽い作り）
  if (W.addDistantArmy) {
    for (const [x, z, f, s] of [[150, -34, 0, 1], [150, 32, Math.PI, 2], [176, 0, -Math.PI / 2, 3]])
      W.addDistantArmy({ x, z, w: 34, d: 10, count: 140, facing: f, armor: 0x24201c, flagTex: flagTexture('oda'), kind: 'mixed', host: false, seed: 31100 + s });
  }
  sfx('horagai', 0.6);
  const at = { x: 124, z: -4 };
  const look = { x: 112, z: -12 };
  k15Scenes(rt, [
    [3, () => rt.say('滝川の組頭', '囲みは成った。斜面の上から、屋敷の内を見て参れ', 4)],
  ], () => k15Go(rt, 'kk-look', look, 6, '斜面の上から、屋敷の内を見よ', '屋敷を見下ろす斜面', () => {
    // 物見に着いたら：屋敷の庭に勝頼父子と北条夫人
    rt.player.yaw = rt.player.u.heading = Math.atan2(138 - rt.player.u.pos.x, -6 - rt.player.u.pos.z);
    rt.banner('屋敷の庭', '勝頼・信勝の父子と北条夫人。そばに残る者は四十あまり');
    rt.award((t) => t.side.push('屋敷の内の勝頼父子を見届けた'), '屋敷の内の勝頼父子を見届けた');
    k15Scenes(rt, [
      [3.5, () => rt.say('足軽', 'あれが武田の御屋形か……　鎧も着ておらぬ', 4)],
      [4.5, () => rt.say('滝川の組頭', '旗本が斬って出るぞ。屋敷の口へ詰めよ', 4)],
    ], () => k15Go(rt, 'kk-yashiki', at, 7, '屋敷の口へ詰め、囲みを締めよ', '屋敷の口', () => {
    // 勝頼の旗本の最後の斬り込み
    const g = enemyGroup(rt, { fixed: true, name: '勝頼の旗本', faction: 'takeda', anchor: { x: 140, z: -2 }, facing: -Math.PI / 2, width: 4, aggro: 22, morale: 99 },
      [{ type: 'samurai', n: 6, o: { name: '武田の旗本' } }, { type: 'ashigaru', n: 4 }]);
    g.noRout = true;
    const N0 = k15Live(g), t0 = rt.t;
    F.k15fight = true;
    rt.banner('勝頼の旗本、斬って出る', '主の最期の時を稼ぐため、残る者が死に物狂いで');
    rt.say('武田の旗本', '御屋形様には指一本触れさせぬ！', 3.5);
    k15Charge(rt, g, at);
    rt.marker('k15foe', centerOf(g), '勝頼の旗本', { red: true, group: g });
    rt.obj('main', '斬って出る勝頼の旗本を退けよ', 'main', true);
    const tick = () => {
      if (stop() || rt.over) return;
      const left = k15Live(g);
      rt.objProgress('main', `旗本 ${left}／${N0}`);
      if (left <= 1 || rt.t - t0 > 100) {
        k15Rout(rt, g, { x: 150, z: -6 }); rt.unmark('k15foe'); F.k15fight = false;
        rt.award((t) => t.side.push('勝頼の旗本の斬り込みを受けた'), '勝頼の旗本の斬り込みを受けた');
        k15Scenes(rt, [
          [1, () => rt.banner('屋敷が静まる', '武田の兵が、一人、また一人と倒れていく')],
          [4, () => rt.say('足軽', '声が止んだ……', 3)],
          [3.5, () => rt.say('滝川の組頭', '踏み込むな。最期は武士の作法に任せよ', 4)],
          [4.5, () => rt.say('使番', '北条の御方は「黒髪の乱れたる世ぞ果てしなき」と詠まれたと', 5)],
          [5.5, () => rt.say('足軽', '奥方まで……　十九と聞いた', 3.5)],
          [4, () => rt.banner('屋敷の内', '勝頼父子のそばに残る者は、もう数えるほど')],
        ], done, stop);
        return;
      }
      rt.after(0.5, tick, true);
    };
    tick();
  }, { limit: 60 }), stop);
  }, { limit: 40 }), stop);
}

// 武田家の終わりの余韻（元の勝ちの締めを遅らせる）
function glow(rt) {
  k15Afterglow(rt, [
    [1, () => { rt.banner('武田の旗が倒れる', '新羅三郎以来の、武田の家が絶えた'); sfx('crash', 0.4); }],
    [5, () => { sfx('kachidoki', 0.8); rt.say('滝川の組頭', '勝鬨じゃ。えい、えい！', 3); }],
    [4, () => rt.say('使番', '殿（滝川一益）は、勝頼父子の首を信忠様のもとへ送られる', 4.5)],
    [5, () => rt.say('足軽', '終わったのう……　あれほどの武田が', 3.5)],
    [4.5, () => {}],
  ]);
}
