// ======================================================================
// 稲生 5〜8分：横槍（小川沿いの畦から柴田勢の横を突く）
//   柴田勢と列が組み合うと、数の多い柴田勢に正面が押される。組頭は自分の組を列の右の端から小川沿いの畦へ回し、
//   柴田勢の列の端の横を突かせる。着いたら鬨を上げて突っ込み、端の二組が揺らぎ、一組が崩れて東の街道へ逃げる。
//   済んだら組は殿の馬前（列の真ん中）へ戻り、本体の信長の一喝へ続く。
//   主人公が畦へ着いてから組と横を突く（時間だけで済ませない）。
// ======================================================================
import { sfx } from '../audio.js';
import { pinAt } from './index.js';
import { inouEnemyAlive } from '../b_inou_goals.js';

const live = (g) => g && g.units.some((u) => u.alive && !u.gone);

export function start(rt, def, C) {
  const F = rt.flags, v = F.v15;
  if (v.flankT) return;
  v.flankT = rt.t; v.ph = 'flank'; F.nobuGo = null;   // 行軍の間の信長の行き先を解く（本体が列の後ろへ付ける）
  rt.after(5, () => { if (v.ph === 'flank') rt.say('組頭', '正面は数で押される。我らの組は小川沿いの畦から柴田の横へ回るぞ！', 3.6); });
  // 組は畦の陰へ走って回る（主人公を待つ）
  rt.after(4, () => {
    if (v.ph !== 'flank' || !live(F.allies)) return;
    const g = F.allies; g.focus = null; g.order = 'move'; g.speed = 3.4; g.aggro = 0;
    g.dest = { x: C.FLANK.x - 2, z: C.FLANK.z + 4 }; g.onArrive = (q) => { q.order = 'hold'; q.aggro = 6; };
  });
  rt.after(14, () => { if (v.ph === 'flank') rt.say('足軽', '真ん中が下がるぞ……押されておる！', 2.8); });
}

export function pin(rt) {
  const v = rt.flags.v15;
  if (v.flankHit) {
    const P = rt.player.u.pos;
    let target = null, best = Infinity;
    for (const g of v.flankEnds || []) for (const u of g.units) {
      if (!inouEnemyAlive(u)) continue;
      const d = (u.pos.x - P.x) ** 2 + (u.pos.z - P.z) ** 2;
      if (d < best) { best = d; target = u; }
    }
    if (target) return pinAt(rt, target.pos, '小川沿いの畦', target, 3);
  }
  return pinAt(rt, v.C.FLANK, '小川沿いの畦', null, 6);
}

function hit(rt) {
  const F = rt.flags, v = F.v15, C = v.C;
  if (v.flankHit) return;
  v.flankHit = rt.t;
  sfx('taiko', 1); rt.after(0.4, () => sfx('taiko', 1));
  rt.army.play('toki', C.FLANK, 1.5);
  rt.say('組頭', '横槍じゃ！　突けぇっ！', 2.4);
  // 柴田勢の列の右の端の二組（lineX の大きい方）
  const ends = [...(F.l1 || [])].filter(live).sort((a, b) => (b.lineX ?? 0) - (a.lineX ?? 0)).slice(0, 2);
  v.flankEnds = ends;
  for (const g of ends) { g.morale = Math.min(g.morale ?? 85, 45); g.dmgMult = (g.dmgMult || 0.42) * 0.7; }
  if (live(F.allies)) {
    const g = F.allies, e = ends[0];
    g.order = 'attack'; g.aggro = 18; g.seekRange = 30; g.speed = 3.6;
    if (e) { const c = e.center(); g.dest = { x: c.x, z: c.z }; g.focus = e.units.find((u) => u.alive && !u.gone) || null; }
  }
  rt.after(2.6, () => rt.say('柴田の侍', '横を突かれた！　端を固めよ！', 2.6));
  // 十八秒の後、端の一組が崩れて東の街道へ逃げる
  rt.after(18, () => {
    if (F.ending) return;
    const g = ends.find(live);
    if (g) v.def.routLine(rt, [g], true);
    rt.army.play('eshout', C.FLANK, 1.3);
    rt.say('組頭', '柴田の端が崩れた！　だが正面はまだ押されておる。殿の馬前へ戻るぞ！', 3.4);
    rt.after(4, () => done(rt));
  });
}
function done(rt) {
  const F = rt.flags, v = F.v15;
  if (v.flankDone) return;
  v.flankDone = true; if (v.ph === 'flank') v.ph = null;
  // 柴田の二陣：端を崩されても、北の霞から新手の二組が真ん中へ押し出して来る（陣の厚み。兵が空にならない）
  rt.after(6, () => {
    if (F.ending || F.stage !== 1 || !v.def.foeLine) return;
    const C = v.C, add = [];
    for (const [x, i] of [[C.FRONT_X - 8, 3], [C.FRONT_X + 10, 4]]) {
      const g = v.def.foeLine(rt, x, C.L1_MEET - 52, i, 12, '柴田勢の二陣', x);
      g.order = 'move'; g.speed = 3.2; g.dest = { x, z: C.L1_MEET - 4 };
      g.onArrive = (q) => { q.order = 'attack'; q.aggro = 16; q.seekRange = 28; };
      F.l1.push(g); F.l1N += g.units.length; add.push(g);
    }
    v.reserve = add; v.reserveT = rt.t;
    sfx('taiko', 0.9); rt.army.play('toki', { x: C.FRONT_X, z: C.L1_MEET - 48 }, 1.3);
    rt.say('足軽', '柴田様の二陣じゃ……鬼柴田の新手が来るぞ！', 3);
    rt.after(3.4, () => rt.say('組頭', '列を詰めよ！　殿の馬前じゃ、一歩も退くな！', 3));
  });
  if (live(F.allies)) { const g = F.allies; g.focus = null; g.order = 'move'; g.speed = 3.4; g.aggro = 8; g.dest = { x: g.slotX, z: v.C.L1_MEET + 3 }; g.onArrive = (q) => { q.order = 'attack'; q.aggro = 16; q.seekRange = 28; }; }
}

export function tick(rt) {
  const F = rt.flags, v = F.v15, C = v.C;
  if (F.ending || v.flankDone) return;
  const P = rt.player.u.pos;
  if (!v.flankHit && (Math.hypot(P.x - C.FLANK.x, P.z - C.FLANK.z) < 8)) { v.ph = 'flankHit'; hit(rt); }
}
