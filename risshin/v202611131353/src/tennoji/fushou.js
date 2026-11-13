// ======================================================================
// 天王寺の戦い　後詰の中の段「信長、足を撃たれる」（7〜9分。b_tennoji.js の breakIn から入れる。この戦の一番の場面）
// 史実：信長は先手の足軽に交じって攻めかかり、足に鉄砲傷を負ったが、下知を止めず砦へ入った（信長公記巻九）。
// 遊び：後詰が門へ寄ると、本願寺の鉄砲が一斉に鳴り、信長が撃たれる。後詰の兵が一時たじろぎ、門徒が勢いづく。
//   数秒で信長が旗を上げ直し、兵が持ち直す。撃たれた時に信長の傍にいれば手柄。入城（inFort）はこの場面が済むまで待つ。
// 字は出さない：一斉の音・硝煙・信長の頭上の印・たじろぐ兵と、持ち直す法螺で分からせる。
// ======================================================================
import { sfx } from '../audio.js';

export function install(rt, ctx) {
  const F = rt.flags;
  const { T_GATE, spent } = ctx;
  const t0 = rt.t;
  const step = F.step;
  const active = () => F.step === step && !F.ending && !rt.over && rt.player.u.alive;
  let shotT = 0, done = false, tick = 0;
  const N = () => F.nobuU;
  const groups = () => [F.nobu, F.saku, F.taki, F.honjin?.guard].filter((g) => g && !spent(g));
  const keep = new Map();

  const shoot = () => {
    shotT = rt.t;
    const u = N();
    sfx('volley', 1);
    rt.army.play?.('volley', { x: u.pos.x - 10, z: u.pos.z - 14 }, 1.3);
    if (!F.nobuWounded) { F.nobuWounded = true; u.speed *= 0.85; u.run *= 0.85; }
    u.hp = Math.min(u.hp, u.maxHp * 0.55); u.lastHitT = 0;
    u.onWound?.();
    F.nobuShotSaid = true;
    // 後詰の兵が一時たじろぐ（崩れはしない）
    for (const g of groups()) { keep.set(g, g.noRout); g.noRout = true; g.morale = Math.min(g.morale || 100, 42); }
    const near = Math.hypot(rt.player.u.pos.x - u.pos.x, rt.player.u.pos.z - u.pos.z) < 22;
    F.fushouNear = near;
    // 味方への負傷の知らせは onWound が出す。一秒後に同じ知らせを重ねない。
    rt.after(2.5, () => { if (active()) rt.army.play?.('eshout', { x: T_GATE.x, z: T_GATE.z + 14 }, 1.4); });
    rt.after(3.2, () => { if (active()) rt.say('門徒', '信長を撃ったぞ！　押せ、押し包め！', 3); });
  };
  const rise = () => {
    sfx('horagai', 0.9);
    rt.say('織田信長', 'かすり傷じゃ！　旗を下げるな。砦の衆と一つになれ、進め！', 4);
    for (const g of groups()) { g.morale = 100; g.noRout = keep.has(g) ? keep.get(g) : g.noRout; }
    const u = N();
    if (u?.alive) u.hp = Math.max(u.hp, u.maxHp * 0.5);
    if (F.fushouNear) rt.award((t) => t.side.push('撃たれた信長の傍で槍を揃え、後詰の列を支えた'), '撃たれた信長の傍を守った');
    rt.after(3, () => { if (active()) { done = true; F.fushouDone = true; } });
  };

  return {
    update(dt) {
      // 討死や段替わりの後に、古い負傷の場面と護衛の手柄を再開しない。
      if (done || !active()) return;
      if ((tick -= dt) > 0) return;
      tick = 0.25;
      const u = N();
      if (!u?.alive) { done = true; F.fushouDone = true; return; }
      if (!shotT) {
        // 実弾で先に撃たれた時は、その場面を済んだものとする。
        // 六十秒の合図で再び体力を削り、同じ負傷の声と斉射を重ねない。
        if (F.nobuShotSaid) { done = true; F.fushouDone = true; return; }
        const el = rt.t - t0, d = Math.hypot(u.pos.x - T_GATE.x, u.pos.z - T_GATE.z);
        if (el > 60 || (el > 40 && d < 45)) shoot();
      } else if (rt.t - shotT > 7 && !F.fushouRise) { F.fushouRise = true; rise(); }
    },
  };
}
