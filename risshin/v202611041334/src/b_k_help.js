// 徳川編 k04・k05・k09 の戦が分けて使う小さな道具（段の敵の書き方・負け・素直な遊び手）
import { STAGES } from './stages.js';
import { depthBot } from './b_depth.js';

export const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const gone = (g) => !g || g.count === 0 || g.routed;
export const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n }), uB = (n) => ({ type: 'bow', n });
// 家ごとの見た目を、名のある武将でない兵の o に重ねる
export const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
// 鉄砲の列（段の敵の一つ）
export const gunLine = (name, from, n, o = {}) => ({ name, from, list: [uS(1), uG(n)], formation: 'line', seek: 70, mass: 90, kind: 'gun', ...o });
export const busho = (name, o = {}) => ({ type: 'busho', n: 1, o: { name, horse: true, ...o } });

// 負け（討たれる・刻限）。win は各戦が持つ
export function makeLose(banner, sub, line, who) {
  return function lose(rt, why) {
    const F = rt.flags;
    if (F.ending || !rt.canFailMission()) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objFail('main');
    rt.tracker.main = false;
    rt.banner(banner, sub);
    rt.say(who, line, 4);
    rt.finish({ failureReason: why }, 6);
  };
}

// 素直な遊び手：段の的へ。段の前は spawn の近くで待つ
export function makeBot(pt) {
  return (b, inp, { goTo }) => {
    const p = b.player, u = p.u, F = b.flags;
    inp.quickCmd = null;
    if (!u.alive || F.ending) return;
    if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
    inp.k.delete('KeyW');
    goTo(p, inp, pt.x, pt.z, 3);
  };
}

// 段の札（任務の一覧）。list = [[字, 条件の段の番号]…]、最初は条件なし
export function setStages(id, list) {
  const st = (k) => (rt) => (rt.flags.step || 0) >= k;
  STAGES[id] = list.map(([t, k], i) => (i ? [t, st(k)] : [t]));
}
