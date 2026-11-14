// ======================================================================
// 第二次木津川口 ⑤の後半：兵糧船を止める（約11分〜13分半）
// 構成：docs/oda15_plan_1108.md の 25（12〜15 毛利船団撤退・補給船撃破・本願寺補給路遮断）。
// 大将船が崩れて船団が退く陰から、荷を積んだ関船が二艘、大坂（東）へ抜けようとする。
// 自分は西の大筒で撃つ。味方の大船も漕ぎ出して追う（九十秒たっても動く船は味方が止める＝負けにしない）。
// 船と兵は既存の物（沖の関船・九鬼の大船）を使い、増やさない。
// ======================================================================
import { sfx } from '../audio.js';

export const HYORO_LEN = 150;   // この段の長さの上限（秒）

export function start(rt, ctx) {
  const F = rt.flags;
  if (F.step >= 6) return;
  F.step = 6; F.stepT = rt.t;
  const S = (F.kzHyoro = { t0: rt.t, ships: [], second: false, ally: false, done: false });
  rt.setPhase('supply'); rt.objProgress('main', '');
  rt.objDone('main');
  rt.obj('main', '西の大筒で、大坂へ抜ける兵糧船を止めよ', 'main');
  rt.army.playFar('sig_kakari', { x: -90, z: 60 }, 0.7);
  rt.say('物見', '退く船の陰に荷船じゃ！　俵を積んで大坂へ抜ける気ぞ！', 3.5);
  rt.after(4, () => { if (rt.flags === F && rt.player.u.alive && !F.ending && !rt.over && F.kzHyoro === S && !S.done) rt.say('九鬼嘉隆', '一粒も本願寺へ入れるな。大筒で横腹を撃て！', 3.5); });
  const b = ctx.launchSupply(rt);
  if (b) S.ships.push(b);
  ctx.armCannons(rt);
}

function sinkByAlly(rt, b) {
  const F = rt.flags;
  b.damageStage = 1; b.hitAt = rt.t; b.leak = true; b.rudderLost = true; b.stopping = true; b.smashed = true;
  rt.army.play('volley', { x: b.x + 30, z: b.z - 30 }, 1.2);
  rt.army.smoke(b.x, 1, b.z, 0, 0, 3);
  rt.army.burst?.(b.x, 1.4, b.z, 14, 'dust', 1, 0, 0, true, 2);
  if (F.cannonSplash) { F.cannonSplash.at = rt.t; F.cannonSplash.mesh.position.set(b.x + 1.5, 0.5, b.z); }
}

// 毎コマ。段が終わったら true。
export function tick(rt, dt, ctx) {
  const F = rt.flags, S = F.kzHyoro;
  if (!S || S.done) return false;
  const t = rt.t - S.t0;
  // 玉込め中も操作札を残し、発砲側で待つ理由を伝える。①④の大筒と同じ扱い。
  for (const c of F.guns || []) if (c.interact) c.interact.r = 2.6;
  if (!S.second && t >= 45) {
    S.second = true;
    const b = ctx.launchSupply(rt);
    if (b) { S.ships.push(b); rt.say('物見', 'もう一艘、南の沖から来るぞ！', 3); }
  }
  // 味方の大船が漕ぎ出して荷船を追う（九鬼の船団の動き）
  if (!S.ally && t >= 30) {
    S.ally = true;
    // 下知を受けた二番・三番船だけを出す。残る三艘は川口をふさぐ持ち場に残す。
    for (let i = 0; i < Math.min(2, F.escorts?.length || 0); i++) {
      const e = F.escorts[i];
      if (e.group?.routed) continue;
      e.sortie = true; e.nextSortie = rt.t + 999; e.t.x = e.homeX - 40; e.t.z = e.homeZ + 20;
    }
    rt.say('九鬼嘉隆', '二番・三番船、漕ぎ出せ！　荷船の行く手を塞げ！', 3);
    sfx('horagai', 0.5);
  }
  // 九十秒たっても動く荷船は、追った味方の大船が撃ち止める（主人公の手柄にはしない）
  for (const b of S.ships) if (b.alive && !b.damageStage && !b.passed && rt.t - (b.bornAt ?? S.t0) >= 90) {
    sinkByAlly(rt, b);
    rt.say('九鬼嘉隆', '味方の大船が荷船へ撃ち込んだ！', 3);
  }
  const settled = S.ships.length > 0 && S.ships.every((b) => !b.alive || b.passed || b.stopped);
  if ((S.second && settled && t >= 60) || t >= HYORO_LEN) {
    S.done = true;
    const mine = S.ships.filter((b) => b.hitByPlayer && b.stopped).length;
    if (mine > 0) rt.award((t2) => { t2.special = { label: '大坂へ向かう兵糧船を大筒で止めた', pts: 6 * mine }; }, '兵糧船を止めた');
    return true;
  }
  return false;
}

export function pin(rt) {
  const F = rt.flags;
  return F.step === 6 && !F.kzHyoro?.done ? (F.cannonPost || F.guns?.[1])?.post : null;
}
