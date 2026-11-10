// ======================================================================
// 比叡山攻め　始まりの段「坂本の湖岸」（0〜3分。docs/oda15_plan_1108.md の 12）
// - 坂本の東の湖岸の辻から、山の上に並ぶ東塔・西塔・横川の堂を見上げる（寺院群の広さ）。
//   着いたら必ず何か起きる：三塔の伽藍を見せる・手柄・里坊の僧兵が打って出る。
// - 里坊の僧兵を退けると、本の筋書きの坂本の放火と日吉社への攻め（hiei_mtn.p1）へ。本人が湖岸に着き、守りが退いてから進む。
// ======================================================================
import { sfx } from '../audio.js';

export const HEADINGS = ['坂本の湖岸の辻から、山の上の三塔を見上げよ', '打って出た里坊の僧兵を、坂本の通りで退けよ'];
const MI = { x: 182, z: 7 };   // 坂本の通りの東の端（湖の側）
// 深手で戦列を離れた者や逃げた者を残敵・攻撃先として数えない。
const ready = (u) => u?.alive && !u.gone && !u.dying && !u.downed && !u.rearWound && !u.woundOut && !u.fleeing && !u.noTarget && !u.group?.routed;

// ctx：{ foe(rt, o, list), list（里坊の僧兵）, vista（三塔を見せる視点）, ready() }
export function install(rt, ctx) {
  const F = rt.flags, S = F.hieiSaka = { k: 0, t0: rt.t, done: false, at: MI };
  const live = () => !S.done && !F.ending && !rt.over && !F.step;
  rt.marker('hieiMi', MI, '湖岸の辻', { guideAlways: true, guidePriority: 250 });
  rt.after(6, () => live() && rt.say('明智光秀', '攻め上る前に、湖岸の辻から山を見よ。三塔十六谷、堂の数は数え切れぬ', 4.2));
  rt.after(24, () => live() && rt.say('足軽', '坂本の里の者が、荷を担いで山へ逃げて行くぞ', 3));
  rt.after(82, () => live() && rt.say('佐久間信盛', '山の衆は浅井・朝倉を匿うた。殿のお怒りは解けぬ', 3.6));

  function seen(arrived) {
    if (S.k !== 0) return;
    S.k = 1;
    // 僧兵が打って出るまでの八秒も、湖岸の行き先を残す。
    if (arrived) {
      rt.award((t) => { t.side.push('坂本の湖岸から比叡の三塔を見届けた'); t.special = { label: '山の伽藍を見届けた', pts: 8 }; }, '比叡の三塔を見届けた', MI);
      // 山を見上げる向きは本人に任せ、到着しても視点を勝手に動かさない。
    }
    rt.say('明智光秀', '本坂を登れば東塔、その奥に西塔、さらに北の尾根の先が横川じゃ', 4);
    rt.after(8, () => sally());
  }
  function sally() {
    if (!live() || S.g) return;
    const g = ctx.foe(rt, { name: '坂本の里坊の僧兵', anchor: { x: 196, z: -4 }, facing: -Math.PI / 2, width: 4, aggro: 14, morale: 75, fleeDir: { x: -1, z: -0.4 } }, ctx.list);
    if (!g || !g.count) { S.k = 3; S.backT = rt.t; return; }
    S.g = g; S.k = 2; S.gT = rt.t;
    g.order = 'move'; g.dest = { x: MI.x + 2, z: MI.z }; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 40; };
    rt.marker('hieiSally', () => { const u = g.units.find(ready); return u ? { x: u.pos.x, z: u.pos.z } : null; }, '里坊の僧兵', { red: true, group: g, guideAlways: true, guidePriority: 250 });
    rt.unmark('hieiMi');
    try { sfx('bellRapid', 0.4); } catch (e) { /* 音が無くても進む */ }
    rt.army.play('eshout', { x: 196, z: -4 }, 1.3);
    rt.say('足軽', '湖の側の里坊から僧兵が打って出たぞ！　薙刀じゃ！', 3);
  }
  S.tick = () => {
    if (S.done || rt.over || F.ending) return;
    if (F.step) { S.done = true; return; }
    const p = rt.player.u.pos;
    if (S.k === 0 && Math.hypot(p.x - MI.x, p.z - MI.z) < 6) seen(true);
    if (S.k === 2) {
      const fighting = S.g.units.some(ready);
      if (!fighting || S.g.routed) {
        S.k = 3; S.backT = rt.t;
        // 退いた敵の印に頼らず、次の下知まで坂本の通りを示す。
        rt.marker('hieiMi', MI, '坂本の通り', { guideAlways: true, guidePriority: 250 });
        rt.unmark('hieiSally');
        if (!S.g.routed) { S.g.noRout = false; S.g.morale = 0; S.g.order = 'retreat'; }
        rt.say('明智光秀', '退けたな。坂本に火を掛ける。法螺を待て', 3.4);
      }
    }
    if (S.k === 3 && rt.t - S.backT > 6) finish();
  };
  function finish() {
    if (S.done || F.step || rt.over || F.ending) return;
    S.done = true;
    rt.unmark('hieiMi'); rt.unmark('hieiSally');
    if (S.g && !S.g.routed) { S.g.noRout = false; S.g.morale = 0; S.g.order = 'retreat'; }
    ctx.ready();
  }
}
export function heading(rt) {
  const S = rt.flags.hieiSaka;
  if (!S || S.done || rt.flags.step) return null;
  return HEADINGS[S.k >= 2 ? 1 : 0];
}
export function active(rt) { const S = rt.flags.hieiSaka; return !!S && !S.done && !rt.flags.step; }
export function bot(b, goTo, p, inp, strike) {
  const S = b.flags.hieiSaka;
  if (!S || S.done || b.flags.step) return false;
  if (S.k === 0) { goTo(p, inp, S.at.x, S.at.z, 2.5); return true; }
  const u = p.u;
  if (S.k === 2 && S.g) {
    let e = null, best = Infinity;
    for (const v of S.g.units) if (ready(v)) { const d = Math.hypot(v.pos.x - u.pos.x, v.pos.z - u.pos.z); if (d < best) { best = d; e = v; } }
    if (e) {
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (best > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2); else strike(p, inp, e, best);
      return true;
    }
  }
  goTo(p, inp, 176, 6, 2.5);
  return true;
}
