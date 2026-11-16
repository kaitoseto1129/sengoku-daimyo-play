// ======================================================================
// 天正伊賀の乱・比自山城 開幕の段（0〜約2分30秒）：着陣の夜、見えない伊賀衆
// 構成：docs/oda15_plan_1108.md の 28（0〜3 伊賀侵入・森林・敵が見えない）。
// 流れ：陣の西の林の外れへ物見に出る（着くと鳥が飛び立ち、矢が一本だけ木に立つ。草鞋の跡・手柄）
//   → 陣の口へ戻る。移る間：峰の狼煙・山の法螺・蒲生の言葉。二分半ほどで夜討ち（既存の raid）が始まる。
// 敵の姿は見せない（兵を増やさない）。音・煙・台詞・行き先のピンだけ。
// ======================================================================
import { sfx } from '../audio.js';

export const SHINNYU_END = 150;   // 夜討ちが始まる秒
const WOOD = { x: -34, z: 62 };    // 陣の西の林の外れ

export function install(rt, ctx) {
  const F = rt.flags;
  const S = (F.igOpen = { t0: rt.t, atWood: false, back: false, done: false });
  const on = () => !F.step && !F.ending && !rt.over;
  rt.obj('main', '陣の西の林の外れへ出て、伊賀衆の気配を探れ', 'main');
  rt.after(40, () => {
    if (!on()) return;
    // 鉄砲用の大きな白煙を空中へ一度出すと、峰に白い玉だけが浮く。
    // 狼煙は地面から立ち昇る既存の煙柱を使い、合図の後は止める。
    const smoke = rt.world.addSmokeColumn(ctx.castle.x, rt.world.heightAt(ctx.castle.x, ctx.castle.z), ctx.castle.z,
      { size: 1.4, black: true });
    rt.after(18, () => { if (smoke != null) rt.world.removeSmokeColumn(smoke); });
    rt.say('足軽', '峰に狼煙じゃ……。こちらの数を、もう山の上へ知らせておる', 4);
  });
  // 11/14 imac-own2：台詞は一度ずつ。陣の口へ戻った後は間を詰めて早く夜討ちへ（立って二分待つだけにしない）。
  S.said = {};
  S.lines = [
    [75, 'yojin', () => rt.say('蒲生忠三郎', '伊賀の者は谷も獣道も知り尽くしておる。姿が見えぬ時ほど用心せよ', 4.5)],
    [108, 'hora', () => { rt.army.playFar('sig_hora', { x: ctx.castle.x - 40, z: ctx.castle.z }, 0.6); rt.say('物見', '山の法螺じゃ！　どこから鳴っておるか分からぬ……', 3.5); }],
    [132, 'kagari', () => rt.say('蒲生忠三郎', '篝火を落とせ。陣の口に槍を並べよ。来るぞ', 4)],
  ];
}

function sawTracks(rt, ctx, byPlayer) {
  const F = rt.flags, S = F.igOpen;
  if (S.atWood) return;
  S.atWood = true;
  rt.army.play('arrow', WOOD, 0.8);
  rt.army.play('wood', WOOD, 0.6);   // 矢が木に立つ音
  rt.say('足軽', byPlayer ? '鳥が飛び立った！……矢が一本、木に立っておる。草鞋の跡が山へ続いとる' : '西の林で鳥が飛び立った！　誰かおるぞ', 4.5);
  if (byPlayer) rt.award((t) => { if (!t.side.includes('林の外れで伊賀衆の足跡を見つけた')) t.side.push('林の外れで伊賀衆の足跡を見つけた'); }, '伊賀衆の足跡を見つけた');
  rt.after(5, () => { if (!F.step && !F.ending) rt.say('蒲生忠三郎', '深追いするな。陣の口へ戻り、味方の列に付け', 4); });
  rt.obj('main', '陣の口へ戻り、味方の列に付け', 'main');
}

// 毎コマ。夜討ちへ移る時に true。
export function tick(rt, ctx) {
  const F = rt.flags, S = F.igOpen;
  if (!S || S.done) return false;
  const t = rt.t - S.t0, p = rt.player.u.pos;
  if (!S.atWood && Math.hypot(p.x - WOOD.x, p.z - WOOD.z) < 5) sawTracks(rt, ctx, true);
  if (!S.atWood && t >= 90) sawTracks(rt, ctx, false);
  // 林から陣の口へ戻ったら、残りの台詞を5秒おきに詰め、最後の台詞の4秒後に夜討ちへ。
  if (S.atWood && S.backT == null && t >= 30 && Math.hypot(p.x - ctx.mouth().x, p.z - ctx.mouth().z) < 14) S.backT = t;
  const next = S.lines.find(([, k]) => !S.said[k]);
  if (next && (t >= next[0] || S.backT != null && t >= Math.max(S.backT + 1, (S.lastSay ?? -99) + 5))) {
    S.said[next[1]] = true; S.lastSay = t;
    if (!F.step && !F.ending && !rt.over) next[2]();
  }
  if (t >= SHINNYU_END || S.backT != null && !next && t >= S.lastSay + 4) { S.done = true; return true; }
  return false;
}

export function pin(rt, ctx) {
  const S = rt.flags.igOpen;
  if (!S || S.done) return null;
  return S.atWood ? ctx.mouth() : WOOD;
}
