// ======================================================================
// 大河内城 15分の構成（docs/oda15_plan_1108.md 7）　①「城外包囲陣・北畠軍と小競り合い・城の規模」（0〜3分）
// 夜攻めの前の夕方。坂の角の物見の場から城の大きさと四方の囲みを見る。着いたら必ず何かが起きる（kaito 11/8）：
//   木戸の脇から北畠の物見が斬りかかり、鹿垣の外の小競り合いになる。払うと夜の支度（nightDay）へ。
// 時間で決まる後の段（407秒の封鎖の締め）は、この段に使った秒だけ後ろへずらす（F.k15Shift）。
// 呼び方：b_okawachi.js の setup の終わりで start(rt, ctx, done)。
// ======================================================================
import * as DP from '../b_depth.js';
import { depthStart } from '../b_depth.js';
import { ROAD_KARAMETE } from '../castles/okawachi.js';

export function start(rt, ctx, done) {
  const F = rt.flags;
  if (F.k15Kakoi) return;
  F.k15Kakoi = 'on';
  const t0 = rt.t;
  const { SPOT, speaker } = ctx;
  // 段の途中で援護の組が交代しても、生き残り全員へ帰陣の下知を渡す。
  const aidGroups = new Set();
  const rememberAid = () => { if (ctx.aidG) aidGroups.add(ctx.aidG); };
  // 物見の場から西へずらすと切岸の外に出て、城兵が坂へ戻れない。
  // 次の角との中間から二列で寄せ、後列まで既存の道幅に収める。
  const next = ROAD_KARAMETE[5];
  const from = { x: (SPOT.x + next[0]) / 2, z: (SPOT.z + next[1]) / 2 };
  depthStart(rt, ctx, [
    DP.rest({ dur: 4, heal: 0, banner: ['大河内城', '五万の兵が四方を囲む'],
      say: [[speaker, '城は山ひとつ。大手も搦手も鹿垣で塞いだ。まず角の物見の場で城を見よ', 4]] }),
    DP.move({
      to: SPOT, r: 5, label: '物見の場', obj: '坂の角の物見の場へ上がり、城の構えを見よ', max: 80,
      ambush: { d: 10, title: '城の構えが見えた', sub: '木戸の上に櫓・山上に本丸', say: ['足軽', '木戸の脇から北畠の物見じゃ！'],
        foes: () => [{ name: '北畠の物見', from, formation: 'column', list: [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }, { type: 'bow', n: 1 }], mass: 0 }] },
      onEnd: (rt2) => { rememberAid(); rt2.say('使番', '城の木戸は固く、山上の本丸までは坂が三つ。力攻めは骨が折れまするぞ', 4); },
    }),
    DP.fight({
      at: SPOT, title: '鹿垣の外の小競り合い', sub: '北畠の物見の後詰', obj: '北畠の物見を追い払え', max: 100, noRefill: true,
      foes: () => [{ name: '北畠の後詰', from, formation: 'column', list: [{ type: 'ashigaru', n: 6 }, { type: 'gun', n: 1 }], mass: 0 }],
      reward: '北畠の物見を追い払った',
      onEnd: rememberAid,
    }),
    DP.rest({ dur: 5, heal: 0.3, say: [[speaker, '日が暮れる。持ち場の竹束へ戻れ。夜に搦手へかかるぞ', 3.6]] }),
  ].map((s) => {
    if (s.kind === 'move' || s.kind === 'fight') {
      const start = s.start;
      s.start = (rt2, C, m, context) => {
        start(rt2, C, m, context);
        // 広い横隊で坂の切岸へ寄せず、援護兵も角を順に通る。
        context.prepareAid?.(context.aidG);
        rememberAid();
      };
    }
    return s;
  }), () => { rememberAid(); F.k15Kakoi = 'done'; F.k15Shift = (F.k15Shift || 0) + (rt.t - t0); done(aidGroups); });
}
