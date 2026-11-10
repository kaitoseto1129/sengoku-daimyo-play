// ======================================================================
// 三方ヶ原の戦い　「平手汎秀の最期」の段（7〜10分。この戦の一番有名な場面。docs/oda15_plan_1108.md 13）
// 赤備えを受けた後、馬場・山県・内藤の手が平手の手を三方から押し包む。主人公は平手のそばで囲みを支える。
// 囲みは厚くなり、平手は名乗って打って出て討ち死にする（『信長公記』）。続けて家康の退く下知（退き鐘）。
// 平手は本体の setup で invuln（持ち場では倒れない）。この段の終わりにだけ討たれる。
// ======================================================================
import { sfx } from '../audio.js';

export const HIRA_LAST = { x: 30, z: -8 };   // 平手が最後に踏みとどまる所（右の森の際から南西へ下がった野）

// 実戦で同時に討たれた時も、名入りの札を六秒ずつ離して一人ずつ伝える。
export function fallNotice(rt, name) {
  const F = rt.flags;
  const at = Math.max(rt.t, (F.mkLastFallT ?? -Infinity) + 6);
  F.mkLastFallT = at;
  const show = () => { if (!rt.over) rt.banner(`${name}、討ち死に`, ''); };
  if (at > rt.t) rt.after(at - rt.t, show); else show();
}

// 退く下知の後に平手の討死（名を大きく一度・onKill と重ねない）
function hirateFalls(rt) {
  const F = rt.flags;
  const u = F.hiraU;
  rt.say('平手汎秀', '我こそは平手監物汎秀なり！　織田の加勢の名を汚すな、続け！', 3.2);
  if (u?.alive && F.hirate) { F.hirate.order = 'attack'; F.hirate.aggro = 20; F.hirate.seekRange = 30; }
  rt.after(7.6, () => {
    if (F.ending || rt.over || F.hirateFallSaid) return;
    F.hirateFallSaid = true;
    F.bossName = '佐久間信盛';
    if (u?.alive) { u.invuln = false; u.hp = 0; rt.army.kill(u, null); }
    fallNotice(rt, '平手汎秀');
    sfx('kane', 0.45);
    if (F.hirate && F.hirate.count) { F.hirate.morale = Math.min(F.hirate.morale || 60, 30); }
  });
  rt.after(10.4, () => { if (!F.ending && !rt.over) rt.say('足軽', '平手様、討死！　大旗が倒れたがや！', 2.8); });
  // 総崩れの下知を先に聞かせ、退く味方を支える中で平手が討たれる順にする。
  rt.after(3.6, () => {
    if (F.ending || rt.over) return;
    sfx('horagai', 0.5);
    rt.say('物見', '別の手が横から……！　平手の殿のそばへ武田が割り込んだ！', 3.4);
  });
}

// K：本体から渡す道具 { rest, withstand, uS, uA, uC, uB, gunLine, aka }
export function steps(K) {
  return [
    K.rest({ dur: 6, heal: 0, fn: (rt) => {
      const F = rt.flags;
      rt.banner('平手の手、囲まれる', '馬場・山県・内藤の手が三方から押し包む');
      const g = F.hirate;
      if (g && g.count && !g.routed) { g.order = 'hold'; g.anchor = { x: HIRA_LAST.x, z: HIRA_LAST.z }; g.facing = Math.PI; g.formation = 'yari'; g.noRout = true; }
      for (const id of ['baba', 'naito', 'katsuyori']) K.adv(F.bT?.[id], 12, 16, true);
      if (F.hiraU) rt.marker('hiraMe', () => (F.hiraU?.alive ? { x: F.hiraU.pos.x, z: F.hiraU.pos.z } : null), '平手汎秀', { h: 3 });
    }, say: [['足軽', '平手の殿の手が囲まれとる！　馬場の旗と赤備えに挟まれたがや！'], ['平手汎秀', 'ここで退けば徳川殿に顔向けできぬ。踏みとどまれ！']] }),
    K.withstand({ at: HIRA_LAST, dur: 70, cap: 105, r: 22,   /* 11/9 見回り：囲みの斬り合いは平手の周り二十歩に広がる。十四歩では守りの秒が貯まらず四百五十秒止まった */ title: '平手のそばで囲みを支える', sub: '三方から武田の手が押し包む', label: '平手汎秀のそば',
      obj: '平手隊を救え',
      waves: [
        // 囲みは寄せる手の数と向きで見せる。一手ずつ強くはしない（敵の命・打ちは増やさない。dmg は並の 0.75）
        { t: 0, foes: () => [{ name: '馬場信春の手', from: { x: HIRA_LAST.x - 22, z: HIRA_LAST.z - 24 }, list: [K.uS(2), K.uA(10)], formation: 'yari', mass: 380, dmg: 0.75 }] },
        { t: 16, say: ['組頭', '右から赤備えの残りじゃ！　槍を向けよ！'], foes: () => [{ ...K.aka([{ type: 'samurai', n: 1, o: { horse: true } }, K.uC(2), K.uS(2)]), name: '赤備えの残り', from: { x: HIRA_LAST.x + 24, z: HIRA_LAST.z - 18 }, mass: 220, dmg: 0.75 }] },
        { t: 24, say: ['組頭', '平手の殿の手が持ち直したぞ！　いや、後ろにも回ってきた！　背を合わせよ！'], foes: () => [K.gunLine('馬場の鉄砲衆', { x: HIRA_LAST.x - 30, z: HIRA_LAST.z - 6 }, 5)] },
        { t: 38, say: ['物見', '内藤の旗！　まだ新手が来る！'], foes: () => [{ name: '内藤昌秀の手', from: { x: HIRA_LAST.x - 4, z: HIRA_LAST.z - 34 }, list: [K.uS(2), K.uA(10)], formation: 'yari', mass: 400, dmg: 0.75 }] },
        { t: 52, say: ['足軽', '囲みが閉じる……！　武田の旗ばっかりだわ！'], foes: () => [{ name: '武田勝頼の手', from: { x: HIRA_LAST.x + 14, z: HIRA_LAST.z - 32 }, list: [{ type: 'samurai', n: 1, o: { horse: true } }, K.uA(9)], formation: 'yari', mass: 360, dmg: 0.75 }] },
      ],
      reward: '平手汎秀のそばで武田の囲みを支えた', lost: ['組頭', '囲みが破れん……！　平手の殿を守れ！'] }),
    K.rest({ dur: 13, heal: 0, fn: (rt) => { rt.obj('dp', '平手隊を救え', 'main'); hirateFalls(rt); rt.after(12.5, () => rt.unmark('hiraMe')); } }),
  ];
}
