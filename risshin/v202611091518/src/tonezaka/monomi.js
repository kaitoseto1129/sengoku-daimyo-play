// ======================================================================
// 刀根坂の戦い　始まりの段「朝倉の松明」（0〜3分の導入。kaito 11/8 夜・docs/oda15_plan_1108.md 14）
// 嵐の夜。大嶽の砦が落ち、朝倉が陣を払い始めた所から。主人公は道脇の高みへ上がり、北の峠へ退く松明の列を見る。
// 着くと峠の道に松明の列が灯り、法螺と太鼓、信長が「追え」と下知（物見に着いたら必ず何か起きる）。そのまま追撃（本体の chase）へ。
// 行かなくても時が来れば追撃は始まる（二5）。字は札の一行だけ（五1）。
// ======================================================================
import { sfx } from '../audio.js';

const WAIT = 60;   // 物見に上がらない時も、この秒で追撃へ

// ctx：{ at, roadX, next }。at は戦の向きへ回した座標、next は本体の chase
export function install(rt, ctx) {
  const F = rt.flags;
  const MI = ctx.at(-16, 90);          // 道の西の肩の高み（出立の所から十数歩）
  F.toneMonomi = MI; F.toneHead = '道脇の高みから、峠へ退く朝倉の松明を見よ';
  rt.obj('main', F.toneHead, 'main', true);
  rt.marker('toneMonomi', MI, '道脇の高み', { h: 2, guideAlways: true });
  rt.say('柴田勝家', '朝倉の陣が静まり返った。退く気か……その方、あの高みから峠の方を見て参れ', 3.8);
  const t0 = rt.t;
  const live = () => !F.ending && !rt.over && F.toneMonomi;
  // 歩く間の出来事：使番の急報・遠い太鼓
  rt.after(8, () => { if (live()) { sfx('horagai', 0.4); rt.say('使番', '申し上げる！　大嶽の砦、落ちました！　朝倉の兵は砦を捨てて逃げ散っておりまする！', 3.8); } });
  rt.after(19, () => { if (live()) rt.say('織田信長', '義景は今夜のうちに退くぞ。馬を引け。わしが先に出る', 3.4); });
  rt.after(30, () => { if (live()) { sfx('taiko', 0.3); rt.say('足軽', '刀根坂の峠で太鼓が鳴っとる……雨で松明が揺れとるがや', 2.8); } });
  let done = false;
  const go = () => {
    if (done) return; done = true;
    F.toneMonomi = null; F.toneHead = null;
    rt.unmark('toneMonomi');
    ctx.next();
  };
  const report = () => {
    if (F.monomiDone) return;
    F.monomiDone = true;
    // 着いたら峠の道に松明の列が灯る（遠い所だけ。近くに絵の兵は出さない）
    // 手前から奥へ、一つずつ灯る
    [-140, -158, -176, -194, -212].forEach((z, i) => rt.after(i * 1.6, () => {
      try { const p = ctx.at(ctx.roadX(z) + (i % 2 ? 1 : -1), z); rt.world.addFire?.(p.x, p.z, { torch: true, h: 2.1, size: 0.5, nightOnly: true }); } catch (e) { console.warn('tonezaka monomi torches', e); }
    }));
    sfx('horagai', 0.7);
    rt.after(1.4, () => sfx('taiko', 0.7));
    rt.banner('朝倉、陣を払う', '雨の刀根坂へ、松明の列が西北西へ退いていく');
    rt.award((t) => { t.side.push('朝倉の松明の列を見届けて知らせた'); t.special = { label: '朝倉の退きを物見した', pts: Math.max(t.special ? t.special.pts : 0, 10) }; }, '朝倉の退きを見届けた', MI);
    rt.say('組頭', '松明が峠へ連なっとる！　朝倉が退いていくぞ！', 3);
    rt.after(3.4, () => { if (!F.ending) rt.say('織田信長', '今じゃ、追え！　一人も越前へ帰すな！', 3.2); });
    rt.after(8, () => { if (!F.ending) rt.say('柴田勝家', '馬廻が出るぞ！　遅れるな、信長公の馬を追え！', 3); });
    rt.after(14, go);
  };
  const tick = () => {
    if (done || F.ending || rt.over) return;
    const u = rt.player?.u;
    if (u && rt.t - t0 > 21 && Math.hypot(u.pos.x - MI.x, u.pos.z - MI.z) < 7) { report(); return; }
    if (rt.t - t0 > WAIT) { go(); return; }
    rt.after(0.4, tick);
  };
  tick();
}
