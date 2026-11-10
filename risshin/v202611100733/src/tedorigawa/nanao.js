// ======================================================================
// 手取川の戦い　始まりの段「七尾落城の報せと退き始め」（0〜3分。b_tedorigawa.js の brief から入れる）
// 史実：九月十五日に七尾城が落ち、救援に向かった柴田勝家の軍は手取川を越えた所で知らせを受け、退き始めた（謙信書状写・信長公記）。
// 遊び：①北の塚へ上って物見をする（着くと北の闇に上杉の松明の列が動き出す）
//   ②払いかけの陣の荷駄に火を掛けて捨てる（着くと火が上がり、柴田が「人を先に渡せ」と下知する）→ 渡り口へ退く（retreat）
//   どちらも本人が着いてから進む。待つだけで物見や焼き捨ての戦功を与えない。
// ======================================================================
import { sfx } from '../audio.js';

const LOOK = { x: 20, z: -64 };     // 北の小さな塚（物見の場）。11/10：闇で待つ上杉の列（z -84 より北）・謙信の馬廻（20,-100）から離し、陣のすぐ北東に
const CARGO = { x: -14, z: -64 };   // 払いかけの陣の荷駄（俵）

export function install(rt, ctx) {
  const F = rt.flags;
  // 討死・決着の後は、予約した下知や次の段で終幕を上書きしない。
  const active = () => !F.ending && !rt.over && rt.player.u.alive;
  const { next } = ctx;
  let step = 0, t1 = rt.t, tick = 0, done = false;
  rt.setPhase('nanao');
  rt.obj('main', '北の塚へ上り、上杉の動きを見よ', 'main');
  rt.marker('nanaoLook', LOOK, '北の塚', { h: 3, guideAlways: true, guidePriority: 400 });
  // 11/10 指示書：勝家は狼狽せず「夜のうちに兵を引く。」→ 戦わずに帰れると一瞬思わせる。
  rt.say('柴田勝家', '……夜のうちに兵を引く。', 3.5);
  rt.after(4, () => { if (active() && step === 0) rt.say('柴田勝家', '退く前に、上杉がどこまで来ておるか見て参れ！', 4); });
  rt.after(9.5, () => { if (active() && step === 0) rt.say('足軽', '戦わずに済むか……', 3); });

  // 11/10 詰まり防止（docs/sunomata_spec_1109.md の決まり）：寄れずに止まっても、下知で先へ進む。戦功は着いた時だけ。
  const look = (auto = false) => {
    step = 1; t1 = rt.t;
    rt.unmark('nanaoLook');
    sfx('horagai', 0.5);
    // 北の闇の上杉の大軍が動き出す（軽い作りの軍勢を前へ）
    for (const h of F.host2 || []) h.advance?.(18, 40);
    for (const h of F.pursuitBackdrop || []) h.advance?.(14, 40);
    rt.after(1.5, () => { if (active()) rt.say('物見の足軽', '松明が川のように南へ流れて来る……上杉の本隊じゃ！', 4); });
    if (!auto) rt.award((t) => t.side.push('北の塚で物見をし、上杉の本隊の動きを知らせた'), '上杉の動きを知らせた');
    rt.after(6, () => {
      if (done || !active()) return;
      rt.say('柴田勝家', '荷は焼き捨てよ！　人を先に渡す。急げ！', 4);
      rt.obj('main', '陣の荷駄に火を掛けて捨て、渡り口へ退け', 'main');
      rt.marker('nanaoCargo', CARGO, '捨てる荷駄', { h: 3, guideAlways: true, guidePriority: 400 });
    });
  };
  const burn = (auto = false) => {
    step = 2;
    rt.unmark('nanaoCargo');
    rt.world.addFire?.(CARGO.x, CARGO.z, { size: 1.8, blackSmoke: true });
    sfx('wood', 0.6);
    rt.say('組頭', auto ? '荷はわしが焼いた！　渡り口へ下がるぞ！' : '火が付いた！　荷はくれてやれ。渡り口へ下がるぞ！', 3.5);
    done = true; F.nanaoDone = true;
    rt.after(4, () => { if (active()) next(); });
  };

  return {
    update(dt) {
      if (done || F.ending || rt.over || !rt.player.u.alive) return;
      if ((tick -= dt) > 0) return;
      tick = 0.5;
      const p = rt.player.u.pos, el = rt.t - t1;
      if (step === 0 && (Math.hypot(p.x - LOOK.x, p.z - LOOK.z) < 9 || el > 50)) look(el > 50);
      else if (step === 1 && el > 6 && (Math.hypot(p.x - CARGO.x, p.z - CARGO.z) < 6 || el > 45)) burn(el > 45);
    },
  };
}
