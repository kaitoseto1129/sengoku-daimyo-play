// ======================================================================
// 箕作城 15分の構成（docs/oda15_plan_1108.md 6）　①「六角領侵攻・城を遠景・藤吉郎隊／丹羽隊と合流」（0〜3分）
// 寄せの前に、麓の物見の場へ上がって城の構えを見る。着いたら必ず何かが起きる（kaito 11/8）：
//   城の三段の構えが見え（三の郭・二の丸・本丸の旗）、六角の物見の小勢が脇から斬りかかる。
//   追い払うと丹羽の手が後ろから着き、法螺貝で総懸かり（climb）へ移る。
// 呼び方：b_mitsukuri.js の setup の終わりで start(rt, ctx, done)。
// ======================================================================
import * as DP from '../b_depth.js';
import { depthStart } from '../b_depth.js';

export function start(rt, ctx, done) {
  const F = rt.flags;
  if (F.k15Monomi) return;
  F.k15Monomi = 'on';
  const { SPOT, CASTLE } = ctx;   // SPOT：麓の物見の場（大手道の一つ下の折れの角。道の上なので必ず歩いて着ける）
  depthStart(rt, { ...ctx, scale: 1.2 }, [
    DP.rest({ dur: 4, heal: 0, banner: ['南近江・六角領', '上洛の道をふさぐ箕作城'],
      say: [['木下藤吉郎', '寄せる前に城の構えを見よ。物見の場へ上がれ', 3.4]] }),
    DP.move({
      to: SPOT, r: 5, label: '物見の場', obj: '物見の場へ上がり、城の構えを見よ', max: 70,
      ambush: { d: 4, title: '城の構えが見えた', sub: '坂の柵・二の丸の木戸・山上の本丸', say: ['足軽', '脇の藪から六角の物見じゃ！'],
        foes: () => [{ name: '六角の物見', from: { x: SPOT.x - 18, z: SPOT.z - 6 }, list: [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }, { type: 'bow', n: 1 }], mass: 90 }] },
      onEnd: (rt2) => {
        // 着いた時に見えた物：三段の旗を短く示す（字は旗の名だけ）
        const marks = [['k15m1', CASTLE.san, '三の郭'], ['k15m2', CASTLE.ni, '二の丸の木戸'], ['k15m3', CASTLE.hon, '本丸']];
        for (const [id, at, label] of marks) rt2.marker(id, at, label, { h: 4 });
        rt2.after(9, () => { for (const [id] of marks) rt2.unmark(id); });
        rt2.say('使番', '城の構えは三段。坂の柵、二の丸の木戸、山上の本丸にござる！', 3.8);
      },
    }),
    DP.fight({
      at: SPOT, title: '六角の物見', sub: '脇から寄せる小勢', obj: '六角の物見を追い払え', max: 100, noRefill: true,
      foes: () => [{ name: '六角の物見の後詰', from: { x: SPOT.x + 16, z: SPOT.z - 10 }, list: [{ type: 'ashigaru', n: 5 }, { type: 'gun', n: 1 }], mass: 0 }],
      reward: '六角の物見を追い払った',
    }),
    DP.rest({ dur: 6, heal: 0.25, banner: ['丹羽の手、着到', '四方から寄せる'],
      say: [['丹羽長秀', '丹羽の手、ただいま着いた。わしらは東の口から寄せる', 3.4], ['木下藤吉郎', 'よし、総懸かりじゃ。持ち場へ戻れ', 2.8]] }),
  ], () => { F.k15Monomi = 'done'; done(); });
}
