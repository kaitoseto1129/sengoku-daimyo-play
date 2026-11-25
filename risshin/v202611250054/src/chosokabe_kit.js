// 長宗我部家編（H3・K647・docs/house_chosokabe.md）の戦の共通の部品。軽い型（light_battle.js）の上に「一領具足の呼び集め」を載せる。
//   中富川（b_c04_nakatomi.js の callUp）と同じ作りを、表に書くだけで使えるようにした写し（中富川は触らない）。
//   使い方：chosoBattle({ ...lightBattle の表, fields: [{ at, far }], steps: [..., { kind: 'move', call: true, at: 法螺の台, ... }, ...], callSay: [話し手, 揃った時, 遅れた時] })
//   ① 戦の前、畦（fields）に鉢巻の一領具足がしゃがんで待つ（字は出さない） ② call の段で台に着くと法螺と鬨で立ち、本人の後ろへ走って味方に入る
//   ③ 着くまで late 秒を過ぎると、遠い畦（far の大きい物）から一つずつ田に残る（一つは必ず来る・負けではない）
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { allyGroup } from './bhelp.js';
import { dress } from './b_k_help.js';
import { sfx } from './audio.js';

export { uS, uA, uG, uB, busho };
export const CHOSO = { flag: 'chosokabe', armor: 0x2a2622 };
export const ICHIRYO = (n) => ({ type: 'ashigaru', n, o: { hat: 'hachimaki' } });   // 一領具足の野の姿：鉢巻に槍

function callTick(rt, dt, S, ci, n) {
  const F = rt.flags, FIELDS = S.fields, look = S.allyLook || CHOSO, hora = S.steps[ci].at;
  if (!F.ckShadow && rt.player?.u) {
    F.ckShadow = FIELDS.map((f, i) => allyGroup(rt, {
      name: '田の一領具足', flag: look.flag, anchor: { ...f.at }, facing: Math.atan2(hora.x - f.at.x, hora.z - f.at.z), fullStrength: true, noRout: true,
      aggro: 0, seekRange: 0, morale: 92, dmgMult: 0.4, fixed: true, noAI: true, order: 'hold', ambush: true,
    }, dress([ICHIRYO(f.n || (i < 2 ? 7 : 6))], look)));
    for (const g of F.ckShadow) for (const u of g.units) { u._crouch = true; u.perch = { x: u.pos.x, y: rt.world.heightAt(u.pos.x, u.pos.z), z: u.pos.z }; }
  }
  if (F.step === n - 1 && !F.ckCalled && F.dp?.i >= ci) F.ckT = (F.ckT || 0) + (dt || 0);
  if (F.step >= n && !F.ckCalled) callUp(rt, S);
}

function callUp(rt, S) {
  const F = rt.flags, FIELDS = S.fields, late = S.late ?? 26, step = S.lateStep ?? 12;
  F.ckCalled = true;
  const gone = Math.min(FIELDS.length - 1, Math.ceil(Math.max(0, (F.ckT || 0) - late) / step));   // 一つは必ず残る
  const P = rt.player?.u?.pos || S.spawn;
  let n = 0;
  (F.ckShadow || []).forEach((g, i) => {
    if (!g || !g.count) return;
    if (FIELDS[i].far >= FIELDS.length - gone) { for (const u of g.units) u._crouch = true; return; }   // 遅れた：その畦は田に戻った
    n++;
    rt.after(0.4 + i * 0.5, () => {
      g.ambush = false; for (const u of g.units) { u._crouch = false; u.perch = null; }
      g.noAI = false; g.fixed = false; g.order = 'hold'; g.aggro = 14; g.seekRange = 40; g.speed = Math.max(g.speed || 0, 3.4);
      g.anchor = { x: P.x + (i % 2 ? 8 : -8) + (i > 1 ? (i % 2 ? 6 : -6) : 0), z: P.z + (i > 1 ? -8 : -4) };
      (F.allies || (F.allies = [])).push(g);
    });
  });
  F.ckCalledN = n;
  sfx('hora', 1); rt.after(1.2, () => sfx('hora', 0.8)); rt.after(2.4, () => sfx('toki', 0.9));
  const [who, good, bad] = S.callSay || ['組頭', '集まったぞ！　鍬を置いて槍を取れ！', '……遅い。集まった者だけで行く'];
  rt.say(who, n >= Math.min(3, FIELDS.length) ? good : bad, 3);
}

export function chosoBattle(S) {
  S = { allyLook: CHOSO, allyDmg: 0.35, friendsSend: 3, minutes: 6, ...S };
  const ci = S.steps.findIndex((s) => s.call);
  if (ci >= 0 && S.fields?.length) {
    const n = S.steps.slice(0, ci + 1).filter((s) => s.kind !== 'rest').length, own = S.update;
    S.update = (rt, dt) => { callTick(rt, dt, S, ci, n); own?.(rt, dt); };
  }
  return lightBattle(S);
}
