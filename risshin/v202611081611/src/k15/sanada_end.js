// ======================================================================
// 徳川編 15　天王寺・岡山の戦い：信繁の最期（④三の突撃の後 → ⑤安居の天神）
// 史実：三度目の突撃が尽き、疲れ果てた信繁はわずかな供と安居の天神の杜で休んでいた所を、越前の西尾宗次に討たれた。
// ここで足す事（字でなく絵で分からせる）：
//   ・天神の杜には信繁の近習が六文銭の幟を立てて待つ（④の始めから置く。見えない所から湧かせない）。
//   ・近習が杜に一人でも残る間、信繁は討てない（名のある将は家臣が守る）。
//   ・近習を退けた後、杜の六文銭の幟に主人公が寄ると、幟を奪う（主人公の手柄）。
// 入れ方：b_k15_tennoji_okayama.js の stage4 で install(rt, ctx)、botBrain の⑤で bot(...) を呼ぶ。
// ======================================================================
import { nobori } from '../props.js';
import { enemyGroup, nm } from '../bhelp.js';
import { sfx } from '../audio.js';

const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;

// 杜に残って信繁を守る近習（生きて、逃げていない者）
function guardsLeft(F) {
  const g = F.sEnd?.guard;
  let n = 0;
  if (g) for (const u of g.units) if (u.alive && !u.fleeing) n++;
  return n;
}

// ctx：{ YASUI, sq, SANADA }
export function install(rt, ctx) {
  const F = rt.flags;
  if (F.sEnd) return;
  const { YASUI, sq, SANADA } = ctx;
  const E = F.sEnd = { guard: null, flag: null, taken: false, warned: false, wrapped: false, at: { x: YASUI.x, z: YASUI.z + 3 } };
  // 六文銭の幟（杜の前。奪える）
  E.flag = nobori(rt.world, YASUI.x + 2.5, YASUI.z + 2, 'sanada', 6);
  rt.scene.add(E.flag);
  // 杜の前で信繁を待つ近習（侍六人。崩れず杜を離れない）
  E.guard = enemyGroup(rt, { fixed: true, faction: 'toyotomi', name: '真田の近習', anchor: { x: YASUI.x, z: YASUI.z + 3 }, facing: Math.PI, width: 5, order: 'hold', morale: 100, noRout: true, aggro: 7, seekRange: 9 },
    [sq(SANADA, 'samurai', 6)]);
  E.guard.noFrontline = true; E.guard.stay = true; E.guard.noRetinue = true;
  const tick = () => {
    if (!rt.flags || rt.flags !== F) return;
    step(rt, F, E);
    if (!E.done) rt.after(0.2, tick);
  };
  rt.after(0.2, tick);
}

function step(rt, F, E) {
  const P = rt.player.u.pos;
  const N = F.nobuU;
  // 近習が残る間は信繁を討てない（本の update が毎コマ書く invuln に、近習の守りを重ねる）
  if (N && !E.wrapped) {
    E.wrapped = true;
    let base = !!N.invuln;
    Object.defineProperty(N, 'invuln', { configurable: true, get: () => base || (F.step === 5 && guardsLeft(F) > 0), set: (v) => { base = v; } });
  }
  // ⑤で信繁が本陣の前の斬り合いに捕まって天神へ退けない時の助け（斬り合いをほどき、八秒動かなければ主人公の見ていない所で道を詰める）
  if (F.step === 5 && !F.atYasui && N?.alive && !(E.mvT > rt.t)) {
    E.mvT = rt.t + 1;
    const d = Math.hypot(N.pos.x - E.at.x, N.pos.z - E.at.z);
    N.target = null; N.atk = null; N.swing = null; N.fleeing = false;
    if (E.lastD === undefined || d < E.lastD - 1) { E.lastD = d; E.stillT = rt.t; }
    else if (rt.t - E.stillT > 8 && d > 18 && !near(P, N.pos, 40)) {
      const k = Math.min(1, 20 / d);
      N.pos.x += (E.at.x - N.pos.x) * k; N.pos.z += (E.at.z - N.pos.z) * k;
      if (N.pos.y !== undefined && rt.world.heightAt) N.pos.y = rt.world.heightAt(N.pos.x, N.pos.z);
      E.lastD = undefined;
    }
  }
  // 杜に着いた信繁は杜を離れない（主人公を追って天王寺口の側まで出て、そこで討たれた）
  if (F.step === 5 && F.atYasui && N?.alive && !rt.army.duel && !near(N.pos, E.at, 9) && !(E.bkT > rt.t)) {
    E.bkT = rt.t + 1;
    N.target = null; N.atk = null; N.swing = null;
    if (!near(P, N.pos, 30)) { const k = Math.min(1, 6 / Math.hypot(N.pos.x - E.at.x, N.pos.z - E.at.z)); N.pos.x += (E.at.x - N.pos.x) * k; N.pos.z += (E.at.z - N.pos.z) * k; }
  }
  // 近習は杜を離れない（越前勢や主人公を追って杜の外で散らない）
  const g = E.guard;
  if (g && g.anchor && !F.ending) { g.anchor.x = E.at.x; g.anchor.z = E.at.z; }
  if (F.step === 5 && !E.warned && near(P, E.at, 24) && guardsLeft(F) > 0) {
    E.warned = true;
    rt.say('真田の近習', '殿には指一本触れさせぬ！', 3);
  }
  if (F.step === 5 && E.warned && !E.cleared && guardsLeft(F) === 0) {
    E.cleared = true;
    if (N?.alive) rt.say('真田信繁', '皆、ようやってくれた……', 3);
  }
  // 近習を退けた後、主人公が六文銭の幟に寄ると奪う（手柄）
  if (!E.taken && E.flag && guardsLeft(F) === 0 && F.step >= 4 && near(P, E.flag.position, 2.6)) {
    E.taken = true;
    rt.scene.remove(E.flag);
    sfx('taiko', 0.6);
    rt.award((t) => t.side.push('安居の天神で六文銭の幟を奪った'), '六文銭の幟を奪った');
    rt.say(nm(rt), '真田の六文銭、奪い取ったり！', 3);
  }
  if (E.taken && (F.ending || !N?.alive)) E.done = true;
  if (F.ending && rt.t - (E.endT ??= rt.t) > 28) E.done = true;
}

// bot の頭（⑤）：近習が残っていれば近習から討つ。扱ったら true
export function bot(b, inp, goTo) {
  const F = b.flags, E = F.sEnd;
  if (!E || F.step !== 5 || !F.atYasui || guardsLeft(F) === 0) return false;
  const p = b.player, u = p.u;
  let best = null, bd = 1e9;
  for (const o of E.guard.units) if (o.alive && !o.fleeing) { const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z); if (d < bd) { bd = d; best = o; } }
  if (!best) return false;
  if (bd > 2.6) { goTo(p, inp, best.pos.x, best.pos.z, 2); return true; }
  p.yaw = Math.atan2(best.pos.x - u.pos.x, best.pos.z - u.pos.z);
  if (Math.random() < 0.5) inp.leftPressed = true;
  return true;
}
