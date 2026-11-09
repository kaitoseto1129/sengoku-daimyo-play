// ======================================================================
// 戸次川　戦の後（14〜15分）：鏡城の陣に着いてからの余韻。すぐに札へ行かない
//   川向こうの島津の勝鬨と松明・燃える鶴賀城、元親の声、使番の知らせ、そして秀吉の本隊が来る伏線（次の岩石城）
// 呼び方：本体の win から play(rt, K)。戻り値は終わりまでの秒
// ======================================================================
import { nm } from '../bhelp.js';
import { sfx } from '../audio.js';

export function play(rt, K) {
  const F = rt.flags, W = rt.world;
  rt.banner('戸次川　豊臣方敗北', '');
  // 川向こうの河原に島津の松明が並び、勝鬨が上がる
  try { for (let i = 0; i < 6; i++) W.addFire(K.FORD.x - 30 + i * 12, -24 - (i % 2) * 6, { torch: true, smoke: false }); } catch (e) { /* 飾り */ }
  try { W.addFire(K.CASTLE.x - 6, K.CASTLE.z + 4, { size: 4.2, h: 0.4, blackSmoke: true }); } catch (e) { /* 飾り */ }
  rt.after(1.5, () => { rt.army.play('toki', { x: K.FORD.x, z: -30 }, 1.6); sfx('horagai', 0.6); });
  const A = K.talk.after;
  rt.after(3, () => rt.say(nm(rt), A[0][1], 3.2));
  rt.after(6.6, () => rt.say(A[1][0], A[1][1], 3.6));
  rt.after(10.6, () => rt.say('大友義統', '仙石殿は豊前の小倉へ落ちられた由……。鶴賀も府内も、もう持たぬ', 3.4));
  rt.after(14.6, () => rt.say('使番', '殿下が来春、二十万の兵で九州へお渡りになる。まずは豊前の岩石城と', 3.6));
  rt.after(18.6, () => rt.say('長宗我部元親', '弥三郎の仇は、殿下の大軍が討つ', 3));
  return 23;
}
