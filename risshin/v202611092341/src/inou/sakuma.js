// ======================================================================
// 稲生 13分ごろ：名塚の佐久間勢の後詰（援軍）
//   林勢の先手が崩れ、美作守の旗本が田の道で踏みとどまる所へ、名塚の砦を守り抜いた佐久間大学（盛重）の勢が
//   東の畦から駆けつけて旗本の横へかかる。減った信長方の列を埋める（兵が空にならない）。
//   『信長公記』：名塚の砦は佐久間大学が守った。後詰の働きは遊びの補い（人数・道筋は仮）。
//   美作守は本体の決まりどおり討たれない（止めは信長）。旗本の最後の一人は主人公の槍で（本体の lastTarget）。
// ======================================================================
import { allyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';

export function tick(rt) {
  const F = rt.flags, v = F.v15, C = v.C;
  if (v.sakT || F.ending || F.stage !== 3 || rt.t - (F.stageT || rt.t) < 60) return;
  v.sakT = rt.t;
  const LOOK = { armor: 0x24221f, hatColor: 0x121110, lace: 0x5a4630, cloth: 0x4a3a2a, flag: 'oda', flagShape: 2 };
  v.sakuma = [0, 1].map((i) => {
    const list = i === 0
      ? [{ type: 'busho', n: 1, o: { ...LOOK, name: '佐久間大学', invuln: true, keep: true, horse: true } }, { type: 'samurai', n: 2, o: LOOK }, { type: 'ashigaru', n: 7, o: { ...LOOK, flagScale: 1 } }]
      : [{ type: 'samurai', n: 2, o: LOOK }, { type: 'ashigaru', n: 8, o: { ...LOOK, flagScale: 1 } }];
    const g = allyGroup(rt, { name: '佐久間勢', fullStrength: true, anchor: { x: 66, z: C.BOSS.z + 64 + i * 8 }, facing: Math.PI * 1.25, width: 5, aggro: 0, speed: 3.6,
      noAI: true, noRout: true, order: 'move', formation: 'line', dmgMult: 0.5, defMult: 1.1, dest: { x: C.BOSS.x + 14 - i * 6, z: C.BOSS.z + 10 + i * 4 } }, list);
    g.onArrive = (q) => { q.order = 'attack'; q.aggro = 16; q.seekRange = 26; };
    F.line.push(g);
    return g;
  });
  sfx('taiko', 1); rt.after(0.4, () => sfx('taiko', 0.9));
  rt.army.play('toki', { x: 60, z: C.BOSS.z + 60 }, 1.4);
  rt.say('足軽', '東の畦から旗が来る……佐久間殿じゃ！　名塚の勢が駆けつけたぞ！', 3.2);
  rt.after(3.6, () => rt.say('佐久間大学', '名塚は守り抜いた！　美作守の旗本の横へかかれ！', 3));
}
