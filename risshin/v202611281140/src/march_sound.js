// ======================================================================
// K474 進軍の段の音（cloud-28）：cloud-06 の進軍の段（march_open.js の rt.flags.marchG）に付ける音。
// 列が道を歩く間：遠い陣太鼓の歩みの拍・兵の足音・具足の擦れ（audio.js の marchSound）。開戦の法螺は戦の始めに鳴るので重ねない。
// 止める時：本人が道の終わり（陣の後ろ）に着いた・近くで斬り合いが始まった・戦が終わった・始めから百二十秒・前夜の静けさ。
// battle.js の毎コマの音の所から marchSoundTick(rt) を呼ぶ。
// ======================================================================
import { marchSound } from './audio.js';

export function marchSoundTick(rt, near = 0) {
  const F = rt.flags || {};
  if (F._msDone) return;
  const g = F.marchG, M = rt.def?.marchIn;
  if (!g || !M?.road) { if (rt.t > 8) F._msDone = true; return; }   // 進軍の段の無い戦は何もしない
  const u = rt.player?.u, end = M.road[M.road.length - 1];
  const arrived = u && Math.hypot(u.pos.x - end[0], u.pos.z - end[1]) < 12;
  // 近くの斬り合いは「敵が本人の二十五歩の内にいる」で見る（毎コマでなく半秒ごと。near は味方の列の動きでも増えるので使わない）
  if (u && rt.t >= (F._msFoeT || 0)) {
    F._msFoeT = rt.t + 0.5; F._msFoe = false;
    for (const q of rt.army?.groups || []) { if (q.team !== 1 || q.hidden || q.civ) continue; if (q.units.some((e) => e.alive && Math.abs(e.pos.x - u.pos.x) < 25 && Math.abs(e.pos.z - u.pos.z) < 25 && Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) < 25)) { F._msFoe = true; break; } }
  }
  const stop = rt.over || F.ending || F.beforeWar || F._msFoe || rt.t > 120 || arrived || (g._marchDone && rt.t - (F._msColT ??= rt.t) > 20);
  if (stop) { F._msWhy = rt.over ? 'over' : F.ending ? 'ending' : F.beforeWar ? 'eve' : F._msFoe ? 'foe' : rt.t > 120 ? 't' : arrived ? 'arrived' : 'col'; if (F._msOn) marchSound(false); F._msOn = false; F._msDone = true; return; }
  if (!F._msOn) { marchSound(true, { horn: false }); F._msOn = true; }
}
