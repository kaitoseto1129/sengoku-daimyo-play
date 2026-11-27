// ======================================================================
// 森部 0〜2分：楡俣川の南岸で渡河の下知を待つ
//   『信長公記』：五月十四日、雨。墨俣から長井甲斐守・日比野下野守が出て来た。信長は「天の与ふる所」と言い、楡俣川を越えた。
//   南岸の柳の陰に組が集まり、対岸の畦に斎藤の先手の槍が並ぶのを雨越しに見る。勘当の身の前田又左衛門が勝手に加わって来る。
//   信長の下知と法螺で渡河が始まる（本体の「川を渡れ」・signal）。早く渡っても、合図までは斎藤の先手はかかって来ない。
// ======================================================================
import { sfx } from '../audio.js';


export function start(rt, def, C) {
  const F = rt.flags, v = F.m15;
  v.kishiT = rt.t; v.ph = 'kishi';
  rt.unmark('point');
  rt.marker('kishi', C.KISHI, '南岸の柳の陰', { guideArea: 'wait', guideRadius: 5 });
  const live = () => !rt.over && !F.ending && !v.kishiDone;
  // 下知までは、織田の前備は南岸で待ち、斎藤の先手は対岸の畦の奥で槍を並べる（本体の初めの動きを、下知の時まで遅らせる）
  const CROSS = [['A', 34, 70], ['B', -22, 70], ['Y', -40, 60], ['R3', 64, 66]];
  rt.after(0.1, () => { for (const [k, x] of CROSS) { const g = F[k]; if (g) { g.order = 'move'; g.dest = { x, z: 104 }; g.speed = 2; g.onArrive = (q) => { q.order = 'hold'; }; } } });
  rt.after(1.3, () => { const V = F.V; if (V) { V.order = 'move'; V.dest = { x: 40, z: 56 }; V.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: 40, z: 56 }; }; } });
  v.cross = CROSS;
  const say = (t, who, s, d = 3.4) => rt.after(t, () => { if (live()) rt.say(who, s, d); });
  say(2, '組頭 源八（げんぱち）', '楡俣川の南岸の柳の陰に集まれ。殿の下知があるまで、川には入るな', 3.6);
  say(6, '前田又左衛門', '勘当の身なれど、この又左、首を取って御赦免をいただく！', 3.4);
  say(10, '使番', '殿の御諚！　「天の与ふる所ぞ」、楡俣川を越えよとの事！', 3.8);
  rt.after(14, () => { if (live()) tick(rt); });
  // 早く渡った時の一声
  v.kishiWarn = false;
}

function finish(rt, C) {
  const F = rt.flags, v = F.m15;
  if (v.kishiDone) return;
  v.kishiDone = true; v.ph = null;
  sfx('horagai', 0.9);
  rt.unmark('kishi');
  // 前備が浅瀬を渡り、斎藤の先手が北岸の畦へ寄せる（本体の初めの動き）
  for (const [k, x, z] of v.cross || []) { const g = F[k]; if (g) { g.order = 'move'; g.dest = { x, z }; g.speed = 2; g.onArrive = (q) => { q.order = 'hold'; }; } }
  const V = F.V;
  if (V && !F.signal) { V.speed = 2.1; V.order = 'move'; V.dest = { x: 40, z: 72 }; V.onArrive = (g) => { F.vArrived = rt.t; g.order = 'attack'; g.seekRange = 35; g.anchor = { x: 40, z: 72 }; }; }
  rt.marker('point', C.POINT2, () => rt.flags.pointInside ? '北岸の畦で組を待つ' : '楡俣川の北岸の畦', { guideArea: 'wait', guideRadius: C.FORD_R });
  F.fordWaitEnd = Math.max(F.fordWaitEnd || 0, rt.t + 8);
}

export function tick(rt) {
  const F = rt.flags, v = F.m15;
  if (v.kishiDone || rt.over) return;
  // 南岸へ一度も集まらないまま、時計だけで本人の目標を済みにしない。
  // 下知の後に戻った時も、その場で渡河へ進める。
  const at = v.C.KISHI, p = rt.player.u.pos;
  if (!F.ending && rt.t - v.kishiT >= 14 && Math.hypot(p.x - at.x, p.z - at.z) <= 5) {
    finish(rt, v.C);
    return;
  }
  if (!v.kishiWarn && F.pointInside) { v.kishiWarn = true; rt.say('組頭 源八（げんぱち）', 'まだ渡るな！　下知を待て。一人で向こう岸に立てば狙い撃ちぞ', 3.4); }
}
