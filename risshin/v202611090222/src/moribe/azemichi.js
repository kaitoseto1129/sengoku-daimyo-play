// ======================================================================
// 森部 5〜7分：北岸の田の畦（足場の悪さ・小隊長の撃破）
//   斎藤の先手が畦から退くと、組は前備の槍の列へ向かってぬかるむ田を渡る。田の畦の稲の陰に、斎藤の物頭と足軽が伏せて待つ。
//   組と一緒に物頭を討てば、頭を失った伏兵は背を向けて逃げる。済んだら本体の「前備の槍の列で受け止めよ」へ。
//   一分半で決まらなければ、柴田の前備が物頭を討つ（物語は進む）。
// ======================================================================
import { sfx } from '../audio.js';

const ready = (u) => !!u && u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget;

export function start(rt, def, C) {
  const F = rt.flags, v = F.m15;
  if (v.azeT) return;
  v.azeT = rt.t; v.ph = 'aze';
  const P = rt.player.u.pos;
  const z = Math.max(26, Math.min(P.z - 16, 46));
  v.azeGs = [[P.x - 6, z, true], [P.x + 9, z - 6, false]].map(([x, zz, head]) => {
    const g = C.enemyGroup(rt, { faction: 'saito', name: '斎藤の伏兵', fixed: true, anchor: { x, z: zz }, facing: 0, fleeDir: { x: -0.2, z: -1 }, aggro: 0, speed: 2.2,
      noRout: true, formation: 'line', ambush: true },
    head ? [{ type: 'samurai', n: 1, o: { name: '斎藤の物頭' } }, { type: 'ashigaru', n: 5 }] : [{ type: 'ashigaru', n: 5 }, { type: 'bow', n: 1 }]);
    g.order = 'hold';
    return g;
  });
  v.azeBoss = v.azeGs[0].units.find((u) => u.name === '斎藤の物頭');
  rt.marker('aze', () => (ready(v.azeBoss) ? v.azeBoss.pos : null), '田の畦の物頭', { red: true, group: v.azeGs[0] });
  rt.say('組頭 源八（げんぱち）', '先手は退いた。ぬかるむ田を渡って前備の列へ寄るぞ。足を取られるな', 3.6);
}

function wake(rt) {
  const F = rt.flags, v = F.m15;
  if (v.azeUp) return;
  v.azeUp = rt.t;
  for (const g of v.azeGs) { g.order = 'attack'; g.aggro = 14; g.seekRange = 24; }
  rt.army.playFar?.('eshout', v.azeGs[0].center(), 1.3);
  sfx('taiko', 0.6);
  rt.say('足軽', '稲の陰から斎藤の伏兵じゃ！', 2.6);
  rt.after(2.8, () => rt.say('組頭 源八（げんぱち）', 'あの陣笠の侍が物頭じゃ。物頭を討てば崩れる！', 3.2));
}

export function tick(rt) {
  const F = rt.flags, v = F.m15;
  if (v.azeDone || rt.over || F.ending) return;
  const P = rt.player.u.pos, t = rt.t - v.azeT;
  if (!v.azeUp && (t > 25 || v.azeGs.some((g) => g.units.some((u) => ready(u) && Math.hypot(u.pos.x - P.x, u.pos.z - P.z) < 12)))) wake(rt);
  const B = v.azeBoss;
  if (v.azeUp && !ready(B) && t > 20 || t > 90) {
    if (B?.alive && !B.gone) {
      // 退いた印や近習の救出だけで「討った」と知らせない。
      let k = null;
      for (const g of F.friends || []) for (const u of g.units) if (ready(u) && (!k || Math.hypot(u.pos.x - B.pos.x, u.pos.z - B.pos.z) < Math.hypot(k.pos.x - B.pos.x, k.pos.z - B.pos.z))) k = u;
      B.invuln = false; B.officerSaved = true;
      rt.army.kill(B, k);
      if (B.alive && !B.gone) return;
    }
    v.azeDone = true; v.ph = null;
    rt.unmark('aze');
    for (const g of v.azeGs) { g.noRout = false; g.morale = 0; g.leader = null; g.fleeSet = true; g.fleeDir = { x: -0.2, z: -1 }; }
    rt.say('組頭 源八（げんぱち）', t > 90 ? '前備が物頭を討った。伏兵は逃げてゆくぞ' : '物頭を討ったぞ！　頭を失うた伏兵が逃げてゆく', 3.2);
    if (t <= 90) rt.award((tr) => tr.side.push('田の畦で斎藤の物頭を討った'), '田の畦で斎藤の物頭を討った');
  }
}
export function target(rt) {
  const v = rt.flags.m15, P = rt.player.u.pos;
  if (ready(v.azeBoss)) return v.azeBoss;
  let best = null, bd = Infinity;
  for (const g of v.azeGs || []) for (const u of g.units) { if (!ready(u)) continue; const d = (u.pos.x - P.x) ** 2 + (u.pos.z - P.z) ** 2; if (d < bd) { bd = d; best = u; } }
  return best;
}
