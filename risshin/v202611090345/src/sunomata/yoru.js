// ======================================================================
// 墨俣 6〜9分：夜と火矢（二の手）
//   二の手が寄せる間に日が落ち、夜になる。斎藤方は組みかけの柵へ火矢を射込む。
//   柵の脇に火が上がると、人足が水桶と筵で叩き消す（三十秒ほどで消える）。藤吉郎が「火を消せ、門を守れ」と叫ぶ。
//   火は見せるだけ（柵の固さは本体の決まりのまま）。夜の暗さは共通の空と光（world.setTime）。
// ======================================================================
import { sfx } from '../audio.js';

export function start(rt, def, C) {
  const F = rt.flags, v = F.s15;
  if (v.yoruT) return;
  v.yoruT = rt.t; v.fires = 0;
  rt.after(20, () => { if (!rt.over && !F.won && F.wave === 2) { rt.world.setTime('dusk'); rt.say('前野長康', '日が傾いた。暗くなる前に柵を結び切れ！', 3); } });
  rt.after(75, () => { if (!rt.over && !F.won && F.wave === 2) { rt.world.setTime('night'); rt.bark('日が落ちた。夜の寄せじゃ'); } });
}

function fireArrow(rt) {
  const F = rt.flags, v = F.s15, C = v.C;
  const segs = (F.segs || []).filter((s) => s.alive && s.seg);
  if (!segs.length) return;
  const s = segs[Math.floor(Math.random() * segs.length)];
  const x = (s.seg[0] + s.seg[2]) / 2, z = (s.seg[1] + s.seg[3]) / 2;
  try {
    const f = rt.world.addFire(x, z, { h: 0.6, size: 0.9 });
    // 人足が叩き消す（三十秒）
    rt.after(30, () => { try { if (f) rt.world.removeFire(f); } catch (e) { /* 消えなくても進む */ } });
  } catch (e) { /* 火が出せなくても戦は進む */ }
  sfx('arrow', 0.8);
  v.fires++;
  rt.say(v.fires === 1 ? '足軽' : '人足', v.fires === 1 ? '火矢じゃ！　柵に火が付いたぞ！' : '水を掛けよ！　筵で叩け！', 2.6);
  if (v.fires === 1) rt.after(2.8, () => rt.say('木下藤吉郎', '火を消せ！　組みかけの門を燃やされるな。槍の者は寄せ手を柵に寄せつけるな！', 3.8));
}

export function tick(rt) {
  const F = rt.flags, v = F.s15;
  if (rt.over || F.won || F.wave !== 2) return;
  const t = rt.t - v.yoruT;
  // 夜になってから四十秒の間に三度、火矢が射込まれる
  const at = [80, 96, 112];
  while (v.fires < at.length && t >= at[v.fires]) fireArrow(rt);
}
