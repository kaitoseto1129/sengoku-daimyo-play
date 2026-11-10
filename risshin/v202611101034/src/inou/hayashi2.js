// ======================================================================
// 稲生 12〜13分：林勢の二の備（陣の厚み）
//   林勢の槍の列（本体の段二）を六割まで斬り減らすと（遅くとも組み合って四十秒で）、名塚の方の田の道から林の二の備（二組と弓）が押し出して列の穴を埋める。
//   林勢は七百。一列を破っても後ろに次の備が控える厚みを見せる。本体の「槍の列を破れ」の数に入る（二の備も同じ林勢の先手）。
// ======================================================================
import { sfx } from '../audio.js';

const alive = (gs) => (gs || []).reduce((n, g) => n + g.units.filter((u) => u.alive && !u.gone && !u.fleeing).length, 0);

export function tick(rt) {
  const F = rt.flags, v = F.v15, C = v.C;
  if (v.l2res || F.ending || F.stage !== 2 || !F.regrouped || !F.l2N || !v.def.foeLine) return;
  v.regT ??= rt.t;
  if (alive(F.l2) > F.l2N * 0.62 && rt.t - v.regT < 40) return;
  v.l2res = rt.t;
  for (const [x, i] of [[C.FRONT_X - 12, 5], [C.FRONT_X + 12, 6]]) {
    const g = v.def.foeLine(rt, x, C.BOSS.z - 10, i, 11, '林勢の二の備', x, true);
    g.dmgMult = 0.36; g.order = 'move'; g.speed = 3.4; g.dest = { x, z: C.L2_MEET - 6 };
    g.onArrive = (q) => { q.order = 'attack'; q.aggro = 14; q.seekRange = 26; };
    F.l2.push(g); F.l2N += g.units.length;
    F.l2All += g.units.length;   // 二の備も七百の内訳へ。生存者だけ増やすと人数の棒が満ちたままになる
  }
  sfx('taiko', 0.9); rt.army.play('toki', { x: C.FRONT_X, z: C.BOSS.z }, 1.3);
  rt.say('足軽', '田の向こうから林の二の備が押し出して来るぞ！', 3);
  rt.after(3.2, () => rt.say('組頭', '一列破っても次が来る。七百の林勢じゃ。息を合わせて槍を揃えよ！', 3.4));
}
