// ======================================================================
// 三方ヶ原の戦い　「前衛崩壊」の段（3〜6分。魚鱗の寄せの後、赤備えの前に入る）
// 鶴翼の端（石川数正の備）が武田に押し込まれて崩れ、平手の手は二の列まで下がって穴を塞ぐ。
// 小山田の新手・馬場の騎馬・鉄砲が続けて寄せる。敵の命は増やさず、寄せる隊の数と向きで苦しさを出す。
// 終わりに右の森の赤備えに気づき、本体の crash（赤備え）へ。
// ======================================================================
import { sfx } from '../audio.js';

// K：本体から渡す道具 { rest, withstand, uS, uA, uC, gunLine, HIRATE_POST, LINE_Z, adv, allyFall }
export function steps(K) {
  const SECOND = { x: K.HIRATE_POST.x - 2, z: K.LINE_Z + 7 };   // 平手の二の列（持ち場の七歩後ろ）
  return [
    K.rest({ dur: 7, heal: 0, fn: (rt) => {
      const F = rt.flags;
      rt.banner('鶴翼の端、崩れる', '石川数正の備が押し込まれ、横が空いた');
      sfx('kane', 0.3);
      K.allyFall(rt, F.bA?.ishikawa);
      for (const id of ['oyamada', 'obata', 'baba']) K.adv(F.bT?.[id], 10, 14, true);
      F.cl?.push?.('B', 0.5);
      // 平手の手も二の列へ下がって穴を塞ぐ
      for (const [i, g] of [F.hirate, F.saku].entries()) if (g && g.count && !g.routed) {
        g.order = 'hold'; g.anchor = { x: SECOND.x - i * 9, z: SECOND.z + i }; g.facing = Math.PI; g.formation = 'yari';
      }
    }, say: [['足軽', '左の徳川の備えが崩れたがや！　横ががら空きだわ！'], ['平手汎秀', '二の列まで下がれ！　穴を塞ぐぞ！']] }),
    K.withstand({ at: SECOND, dur: 92, r: 14, title: '二の列で穴を塞ぐ', sub: '崩れた鶴翼の端へ、武田が雪崩れ込む', label: '平手の二の列', obj: '平手の二の列で、崩れた鶴翼の穴を塞げ',
      waves: [
        { t: 0, foes: () => [
          { name: '小山田信茂の新手', from: { x: SECOND.x - 6, z: K.LINE_Z - 30 }, list: [K.uS(2), K.uA(12)], formation: 'yari', mass: 360 },
          { name: '馬場信春の騎馬', from: { x: SECOND.x - 26, z: K.LINE_Z - 20 }, list: [{ type: 'samurai', n: 1, o: { horse: true } }, K.uC(4)], mass: 160 }] },
        { t: 12, say: ['組頭', '筒先じゃ！　鉄砲の前を外れよ、槍は下げるな！'], foes: () => [K.gunLine('小山田の鉄砲衆', { x: SECOND.x + 10, z: K.LINE_Z - 40 }, 6)] },
        { t: 44, say: ['物見', '小幡の旗も寄せてきた！　赤い具足の上州衆じゃ！'], foes: () => [{ name: '小幡信貞の手', from: { x: SECOND.x - 18, z: K.LINE_Z - 34 }, list: [K.uS(2), K.uA(11)], formation: 'yari', mass: 300 }] },
      ],
      reward: '崩れた鶴翼の穴を塞いだ', lost: ['組頭', '押し込まれた……！　槍を立て直せ！'] }),
    K.rest({ dur: 6, heal: 0, fn: (rt) => rt.obj('dp', '右の森へ槍を向け直せ', 'main'), bark: '右へ槍を向け直す', say: [['組頭', '右の森に山県昌景の赤備え！　槍ごと向き直れ！']] }),
  ];
}
