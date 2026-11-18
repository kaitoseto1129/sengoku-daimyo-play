// ======================================================================
// 天正伊賀の乱・比自山城 終幕の余韻（約30秒）：曲輪を押さえた後、すぐ結果へ行かない。
// 構成：docs/oda15_plan_1108.md の 28（12〜15 大軍投入・比自山制圧・伊賀方撤退）と共通5。
// 麓へ寄せる諸口の大軍（既にある軽い大軍 lateHosts を山の麓まで進める）・勝鬨・空の曲輪・柏原へ落ちた伊賀衆。
// 兵は増やさない。台詞・音と、既存の遠景の動きだけ。
// ======================================================================
import { sfx } from '../audio.js';

export const YOIN_LEN = 30;

export function start(rt, finish) {
  const F = rt.flags;
  if (F.igYoin) return;
  F.igYoin = { t0: rt.t };
  (F.lateHosts || []).forEach((h, i) => h.moveTo?.([-40, 40, 0][i % 3], 76 + i * 10, 26));   // 麓の陣の前まで寄せる（三つを並べ、重ねない）
  const say = (t, who, words, d) => rt.after(t, () => { if (!rt.over) rt.say(who, words, d || 4); });
  // 図鑑（docs/books/nobunaga_zukan）：織田勢は伊賀の城と小屋を焼きながら登った。空いた曲輪の番所に火を掛ける。
  // 本人から十〜七十歩の番所を近い順に三つまで。共通の addBlaze（光は近い数個だけ）で兵は増やさない。
  rt.after(7, () => {
    if (rt.over || !rt.world.addBlaze) return;
    const p = rt.player.u.pos;
    const near = (F.castleHuts || []).map((h) => ({ h, d: Math.hypot(h.x - p.x, h.z - p.z) }))
      .filter((o) => o.d > 10 && o.d < 70).sort((a, b) => a.d - b.d).slice(0, 3);
    near.forEach(({ h }, i) => rt.after(i * 1.6, () => { if (!rt.over) rt.world.addBlaze(h.x, h.z, { w: h.w, d: h.d, h: 3.2, rot: h.rot, n: 2 }); }));
  });
  say(9, '丹羽長秀', '番所に火を掛けよ。伊賀の者が戻る所を残すな', 4);
  rt.after(14, () => { if (rt.over) return; sfx('toki', 0.7); rt.after(2.5, () => { if (!rt.over) rt.army.play('eiei', rt.player.u.pos, 0.9); }); });
  say(15, '丹羽の組頭', '勝鬨じゃ！　えい、えい！', 2.5);
  say(19, '足軽', '門も番所も空っぽだがね……。あれほど手強かった者どもが、一夜で消えた', 4);
  say(24, '丹羽長秀', '柏原の城へ寄ったか。伊賀の戦は、まだ終わらぬぞ', 4);
  rt.after(YOIN_LEN, () => finish());
}
