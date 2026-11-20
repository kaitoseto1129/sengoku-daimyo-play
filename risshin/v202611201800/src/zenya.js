// ======================================================================
// 前夜（K306・11/14 kaito「漫画くらい濃く。戦一つで4つ5つの戦が書けるくらいの中身に」）
//   戦の始めの十数秒を、夜明け前の陣中にする：空は夜、本人の陣の周りに篝火、組頭や将の短い声。
//   決めた秒が来たら、空を朝へ移ろわせる（world.setTime の移ろい）。字の札は足さず、声と空と火だけで見せる（五1）。
//   兵は足さない（重さを増やさない）。火は数本だけ。
// 呼び方：戦の setup の終わりで install(rt, { around: [[dx, dz], …] か fires: [[x, z], …], lines: [[秒, 誰, 声], …], dawnAt: 秒, dawn: 'morning' })
// ======================================================================
import { sfx } from './audio.js';
import { kagaribi } from './props.js';

export function install(rt, o = {}) {
  const W = rt.world, F = rt.flags;
  if (!W || typeof W.setTime !== 'function' || F.zenya) return;
  const day = W.timeKey || 'day';
  const Z = F.zenya = { t0: rt.t, fires: [], done: false };
  try { W.setTime('night', true); } catch (e) { return; }
  // o.around：本人の立つ所からのずれで置く（陣の中の篝火）。無ければ o.fires の地図の座標
  const P = rt.player?.u?.pos;
  const list = o.around && P ? o.around.map(([dx, dz]) => [P.x + dx, P.z + dz]) : (o.fires || []);
  for (const [x, z] of list) {
    try { const f = W.addFire(x, z, { h: 0.15 }); if (f) Z.fires.push(f); } catch (e) { /* 火が出なくても進む */ }
    // K521（kaito 11/20「薪も台も無い地面から火だけが生えている」）：篝火の台と薪を火の下に立てる（前夜の火は全戦の共通）
    try { rt.scene.add(kagaribi(W, x, z)); } catch (e) { /* 台が出なくても進む */ }
  }
  const live = () => !rt.over && !F.ending && rt.player?.u?.alive;
  for (const [s, who, text, d] of o.lines || []) rt.after(s, () => { if (live()) rt.say(who, text, d || 3.5); });
  // 夜明け：空を朝へ移ろわせ、篝火は消す（煙だけ残る）。そのあと戦の元の時刻（昼の時計）へ戻す
  rt.after(o.dawnAt ?? 16, () => {
    if (Z.done) return;
    Z.done = true;
    try { sfx('horagai', 0.45); } catch (e) { /* 音が無くても進む */ }
    try { W.setTime(o.dawn || 'morning'); } catch (e) { /* 空が替わらなくても進む */ }
    for (const f of Z.fires) { try { f.lit = false; } catch (e) { /* 消せなくても進む */ } }
    rt.after(o.dayAt ?? 50, () => { try { if (W.timeKey !== day) W.setTime(day); } catch (e) { /* 戻せなくても進む */ } });
  });
}
