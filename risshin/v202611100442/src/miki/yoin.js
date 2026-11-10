// ======================================================================
// 三木城・大村の合戦 終幕の余韻（約30秒）
// 構成：docs/oda15_plan_1108.md の 26（12〜15 補給失敗・城内飢餓・別所長治の最期への伏線）と共通5。
// 大村坂の別所勢が城へ逃げ戻る・散った俵・炊ぎの煙の上がらぬ城・秀吉の言葉。本人は歩ける。
// 兵は増やさない。残る敵を走って逃がし、台詞と音だけを足す。
// ======================================================================
import { sfx } from '../audio.js';

export const YOIN_LEN = 30;

export function start(rt, ctx) {
  const F = rt.flags;
  if (F.mkYoin) return;
  const S = (F.mkYoin = { t0: rt.t, done: false });
  rt.objDone('main');
  rt.obj('main', '城へ逃げる別所勢を見送れ', 'main');
  rt.objProgress('main', '');
  // 大村・平田へ出撃した手だけを帰す。城内の長治の本陣と荷駄の担ぎ手は持ち場を保つ。
  for (const g of rt.army.groups) if (g.team === 1 && !g.routed && g.count &&
      (F.foes?.includes(g) || F.mkSally?.waves?.includes(g))) {
    g.noRout = false; g.morale = 0; g.retreatOnly = true;
  }
  rt.player.u.invuln = true;   // 締めの間の流れ弾で結果を変えない
  sfx('horagai', 0.7);
  rt.say('羽柴秀吉', '追うな！　逃げる者は城へ帰せ。城の米を一粒でも多く食わせるのじゃ', 4.5);
  const on = () => !rt.over && F.mkYoin === S;
  rt.after(7, () => { if (on()) { rt.army.play('toki', rt.player.u.pos, 0.9); rt.say('組頭', '勝鬨じゃ！　えい、えい！', 2.5); } });
  rt.after(10, () => { if (on()) rt.army.play('eiei', rt.player.u.pos, 1); });
  rt.after(14, () => { if (on()) rt.say('物見', '城を見よ。朝餉の煙が一筋も上がらぬ', 3.5); });
  rt.after(20, () => { if (on()) rt.say('羽柴秀吉', '道の俵は陣へ運べ。長治殿も、もう長くは持つまい', 4); });
  rt.after(26, () => { if (on()) rt.army.playFar('kane', { x: 70, z: 30 }, 0.5); });
}

export function tick(rt) {
  const S = rt.flags.mkYoin;
  if (!S || S.done) return false;
  if (rt.t - S.t0 >= YOIN_LEN) { S.done = true; return true; }
  return false;
}
