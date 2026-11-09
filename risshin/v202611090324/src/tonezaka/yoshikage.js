// ======================================================================
// 刀根坂の戦い　「義景を追う」の段（9〜12分。この戦の一番有名な場面。峠口の殿を破った後）
// 峠を越えた先で、義景の旗が見える所まで追いすがる。義景の旗本が返して道を塞ぎ、主を逃がす。
// 旗本を突き破っても義景は供と北へ逃れる（『信長公記』：義景は一乗谷へ、のち大野で自害）。義景は討てない（noTarget のまま）。
// ======================================================================
import { sfx } from '../audio.js';

// K：{ at, rest, hold, move, A, S, chief }
export function steps(K) {
  const SEE = K.at(-6, -176);   // 峠の先の下り、義景の旗が見える所
  const NIDA = K.at(2, -204);   // 義景が逃げた後の道に捨てられた荷駄
  return [
    K.move({ to: SEE, r: 9, label: '峠の先の下り', obj: '峠を越え、義景の旗を追え',
      say: [['織田信長', '義景の旗が見えたぞ！　追え、追え！']],
      max: 70 }),
    K.rest({ dur: 5, heal: 0, fn: (rt) => {
      const F = rt.flags;
      F.toneHead = '義景の旗本の返しを突き破れ';
      rt.banner('義景の旗本、返す', '主を逃がすため、旗本が道を塞ぐ');
      if (F.yoshikage?.count) { F.yoshikage.speed = 1.4; }
      sfx('horagai', 0.5);
    }, say: [['朝倉の旗本', '殿をお通しせよ！　ここで死ね！']] }),
    K.hold({ at: SEE, dur: 55, r: 15, title: '義景の旗本', sub: '旗本が命を捨てて道を塞ぐ', label: '峠の先の下り', obj: '義景の旗本の返しを突き破れ',
      waves: [
        { t: 0, foes: () => [{ name: '義景の旗本', from: K.at(-4, -194), list: [K.S(4), K.A(8)], formation: 'yari', mass: 0, dmg: 0.7 }] },
        { t: 28, say: ['足軽', '旗本の後ろから、まだ来るぞ！'], foes: () => [{ name: '義景の馬廻', from: K.at(4, -198), list: [{ type: 'samurai', n: 1, o: { horse: true } }, K.S(2), K.A(6)], mass: 0, dmg: 0.7 }] },
      ],
      reward: '義景の旗本の返しを突き破った' }),
    K.rest({ dur: 9, heal: 0, fn: (rt) => {
      const F = rt.flags;
      rt._bannerT = rt.t; rt.hud.banner('義景、逃げ延びる', '供わずかに、一乗谷へ');
      if (F.yoshikage?.count) F.yoshikage.speed = 2.6;
    }, say: [['柴田勝家', '……逃したか。だが朝倉の荷駄が道に捨ててある。押さえよ！']] }),
    // 朝倉軍の壊滅：捨てられた荷駄と、守りに残った兵（三千余りが討たれ、荷駄も旗も道に残った）
    K.move({ to: NIDA, r: 9, label: '道に捨てられた荷駄', obj: '道に捨てられた朝倉の荷駄を押さえよ', max: 60,
      ambush: { d: 16, t: 14, say: ['組頭', '荷駄の陰に残った兵じゃ！'], foes: () => [{ name: '荷駄に残った朝倉の兵', from: K.at(10, -214), list: [K.S(1), K.A(7)], mass: 0, dmg: 0.7 }] } }),
    K.rest({ dur: 8, heal: 0, fn: (rt) => { rt._bannerT = rt.t; rt.hud.banner('朝倉軍、壊滅', '討たれた者三千余り。荷駄も旗も道に残った'); },
      say: [['織田信長', '敦賀で兵を休めよ。越前は、もう手の内じゃ'], ['柴田勝家', 'この勢いで一乗谷へ攻め入るぞ！']] }),
  ];
}
