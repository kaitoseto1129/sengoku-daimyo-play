// ======================================================================
// 大河内城 15分の構成（docs/oda15_plan_1108.md 7）　④「北畠軍出撃・野戦・反撃を退ける」（9〜12分）
// 南の鹿垣の封鎖を保った後。飢え始めた城から北畠勢が大きく打って出て、鹿垣の外の田で野戦になる。
// 奥では囲みの織田勢と北畠勢が組み合い（軽い作り addClash）、近くは本物の兵。騎馬の横槍も来る。
// 退けると城兵は木戸へ逃げ込み、もう打って出ない → 和睦（peace）へ。
// 呼び方：b_okawachi.js の封鎖の締め（blockHeld）で start(rt, ctx, done)。
// ======================================================================
import * as DP from '../b_depth.js';
import { depthStart } from '../b_depth.js';
import { clash } from '../b_sekigahara.js';
import { TIER } from '../device_tier.js';

export function start(rt, ctx, done) {
  const F = rt.flags;
  if (F.k15Shutsu) return;
  F.k15Shutsu = 'on';
  const { LINE, speaker } = ctx;
  const n = (k) => Math.round(k * (TIER.weak ? 0.6 : 1));
  const field = { x: LINE.x, z: LINE.z - 4 };   // 柵の口のすぐ外（柵を越える回り道をさせない）
  depthStart(rt, ctx, [
    DP.rest({ dur: 5, heal: 0.35, banner: ['北畠勢、打って出る', '飢える前に囲みを破るつもりじゃ'],
      say: [['使番', '城の木戸が開いた！　北畠の大勢が南へ下りて来まする！', 3.6]],
      fn: (rt2) => {
        try {
          F.k15FieldClash = clash(rt2, { x: field.x - 30, z: field.z - 4, facing: Math.PI, w: 30, gap0: 10, seed: 157001, noRout: false, noWake: true, nearHide: 14, killRate: 0.02,
            A: { flag: 'oda', armor: 0x352d26, count: n(160), team: 0, faction: 'oda', flagRate: 0.4 },
            B: { flag: 'kitabatake', armor: 0x493028, count: n(150), team: 1, faction: 'kitabatake', flagRate: 0.45 } });
          F.k15FieldClash?.go?.();
        } catch (e) { F.k15FieldClash = null; }
      } }),
    DP.fight({
      at: field, title: '鹿垣の外の野戦', sub: '北畠具教の打って出', obj: '鹿垣の外で北畠の打って出を退けよ', max: 170,
      say: [[speaker, '柵の内に籠もるな。押し出して横から突け！', 3.4]],
      foes: () => [{ name: '北畠の打って出', from: { x: field.x - 4, z: field.z - 26 }, formation: 'yari', list: [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }, { type: 'bow', n: 2 }], mass: 140 }],
      later: [{ t: 40, title: '騎馬の横槍', sub: '西の田から北畠の騎馬', say: ['足軽', '西から騎馬じゃ！　槍を立てよ！'],
        foes: () => [{ name: '北畠の騎馬', from: { x: field.x - 26, z: field.z - 6 }, list: [{ type: 'cavalry', n: 4 }, { type: 'ashigaru', n: 4 }], mass: 60 }] }],
      reward: '北畠の打って出を退けた',
      onEnd: (rt2) => {
        F.k15FieldClash?.rout?.('B', { from: 0, minFight: 0 });
        rt2.say('組頭', '城兵が木戸へ逃げ込むぞ。もう出ては来まい', 3.4);
      },
    }),
    DP.rest({ dur: 5, heal: 0.3, say: [[speaker, '囲みは破れなんだ。城は飢える。あとは向こうが折れるのを待つだけじゃ', 4]] }),
  ], () => { F.k15Shutsu = 'done'; done(); });
}
