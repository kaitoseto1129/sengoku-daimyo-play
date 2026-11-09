// ======================================================================
// 長島一向一揆　始まりの段「堤から見る輪中と砦」（0〜3分の導入。kaito 11/8 夜・docs/oda15_plan_1108.md 16）
// 木曽三川の中洲に、堤で囲んだ輪中と門徒の砦が並ぶ。主人公は岸の堤の上へ上がって見る。
// 着くと九鬼の安宅船が川を塞ぎに来る法螺、砦の寺の鐘が鳴り、勝家が囲みの策を言う（物見に着いたら必ず何か起きる）。そのまま横木の仕事（本体の build）へ。
// 本人が堤へ着くまで次の務めへ進めない。
// ======================================================================
import { sfx } from '../audio.js';

// ctx：{ at（堤の上）, bell（砦の寺の所）, next }
export function install(rt, ctx) {
  const F = rt.flags, MI = ctx.at;
  F.ngMonomi = MI;
  rt.obj('main', '堤の上へ上がり、輪中と門徒の砦を見よ', 'main');
  rt.marker('ngMonomi', MI, '岸の堤の上', { h: 1.6, guideAlways: true });
  rt.say('柴田勝家', '堤へ上がって島を見よ。あれが門徒の籠る長島の輪中じゃ', 3.6);
  const live = () => !F.ending && !rt.over && F.ngMonomi;
  rt.after(8, () => { if (live()) rt.say('使番', '七月、上様は三方から長島を囲まれた。早尾口・賀鳥口・市江口、川は九鬼の船で塞ぐ', 4); });
  rt.after(19, () => { if (live()) { sfx('far', 0.5); rt.say('足軽', '川向こうの砦から、念仏が聞こえる……', 2.8); } });
  rt.after(28, () => { if (live()) rt.say('柴田勝家', '島の門徒は大坂の顕如の檄で立った。指図は願証寺と下間の坊官じゃ', 3.6); });
  let done = false;
  const go = () => {
    if (done || F.ending || rt.over || !rt.player?.u?.alive) return; done = true;
    F.ngMonomi = null; rt.unmark('ngMonomi');
    ctx.next();
  };
  const report = () => {
    if (F.ngMonomiDone) return;
    F.ngMonomiDone = true;
    sfx('horagai', 0.7);
    rt.after(1.5, () => { try { rt.army.play('bell', ctx.bell, 0.7); } catch (e) { /* 音が無くても進む */ } });
    rt.banner('長島の輪中', '中洲の砦に門徒と家族が籠る。川は九鬼の船が塞ぐ');
    rt.award((t) => { t.side.push('堤から輪中と砦を見届けた'); }, '輪中と砦を見届けた', MI);
    rt.say('柴田勝家', '長島・屋長島・中江・篠橋・大鳥居。砦は五つ、どれも川に守られておる', 4);
    rt.after(4.4, () => { if (!F.ending) rt.say('柴田勝家', '攻め入らずともよい。岸に柵を結い、舟を止め、飢えさせる。囲みを締めるのじゃ', 4); });
    rt.after(9, go);
  };
  const tick = () => {
    if (done || F.ending || rt.over) return;
    const u = rt.player?.u;
    if (u?.alive && !rt.player.mounted && Math.hypot(u.pos.x - MI.x, u.pos.z - MI.z) < 6) { report(); return; }
    rt.after(0.4, tick);
  };
  tick();
}
