// ======================================================================
// 第二次木津川口 終幕の余韻（約30秒）：戦いが止んだ後、すぐ結果へ行かない。
// 構成：docs/oda15_plan_1108.md 共通5（旗が落ちる・敵が逃げる・勝鬨・武将の会話）。
// 退く毛利の船団・燃えて傾く大将船・九鬼の勝鬨・次の戦（三木）への伏線。本人は甲板を歩ける。
// ======================================================================
import { sfx } from '../audio.js';

export const YOIN_LEN = 30;

export function start(rt, ctx) {
  const F = rt.flags;
  if (F.kzYoin) return;
  const S = (F.kzYoin = { t0: rt.t, done: false });
  rt.setPhase('yoin'); rt.objProgress('main', '');
  rt.objDone('main');
  rt.obj('main', '退く毛利の船団を見送れ', 'main');
  for (const groups of [F.boarders, F.small]) for (const q of groups || []) if (q && !q.routed) { q.noRout = false; q.morale = 0; }
  for (let i = 0; i < 3; i++) { rt.uninteract('g' + i); rt.unmark('g' + i); }
  rt.say('物見', '毛利の船が木津浦へ退いていく！　もう寄せては来ぬ！', 3.5);
  // 敗北の締めに入ってから結果が出るまでの間も、勝鬨と勝利の声を止める。
  const on = () => rt.flags === F && rt.player.u.alive && !rt.over && !F.ending && F.kzYoin === S && !S.done;
  rt.after(5, () => { if (on()) rt.army.playFar('sig_nobiki', { x: -120, z: 160 }, 0.8); });
  rt.after(9, () => {
    if (!on()) return;
    rt.say('九鬼嘉隆', '勝鬨じゃ！　えい、えい！', 2.5);
    sfx('toki', 0.8);
    rt.after(2.6, () => { if (on()) rt.army.play('eiei', rt.player.u.pos, 1); });
  });
  rt.after(16, () => { if (on()) rt.say('水夫', '大将の船も崩れた。寄せていた小早も退いていくぞ', 3); });
  rt.after(22, () => { if (on()) rt.say('九鬼嘉隆', '大坂の海の道は、これで細る。上様へ急ぎ知らせよ', 4); });
}

export function tick(rt) {
  const S = rt.flags.kzYoin;
  if (!S || S.done) return false;
  if (rt.t - S.t0 >= YOIN_LEN) { S.done = true; return true; }
  return false;
}
