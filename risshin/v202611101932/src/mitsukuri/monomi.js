// ======================================================================
// 箕作城 15分の構成（docs/oda15_plan_1108.md 6）　①「六角領侵攻・城を遠景・藤吉郎隊／丹羽隊と合流」（0〜3分）
// 寄せの前に、麓の物見の場へ上がって城の構えを見る。着いたら必ず何かが起きる（kaito 11/8）：
//   城の三段の構えが見え（三の郭・二の丸・本丸の旗）、六角の物見の小勢が脇から斬りかかる。
//   追い払うと丹羽の手が後ろから着き、法螺貝で総懸かり（climb）へ移る。
// 呼び方：b_mitsukuri.js の setup の終わりで start(rt, ctx, done)。
// ======================================================================
import * as DP from '../b_depth.js';
import { depthStart } from '../b_depth.js';
import { siegeFighter } from '../siege_zones.js';

export function start(rt, ctx, done) {
  const F = rt.flags;
  if (F.k15Monomi) return;
  F.k15Monomi = 'on';
  const { SPOT } = ctx;
  // 物見の小勢は三の郭の柵（z=-44）より手前の中央道から寄せる。
  // 十八〜二十ｍ奥では柵の内へ出てしまい、物見の兵に城内用の道案内が無いため届かなかった。
  depthStart(rt, { ...ctx, scale: 1.2 }, [
    DP.rest({ dur: 4, heal: 0, banner: ['南近江・六角領', '上洛の道をふさぐ箕作城'],
      say: [['木下藤吉郎', '寄せる前に城の構えを見よ。物見の場へ上がれ', 3.4]] }),
    DP.move({
      to: SPOT, r: 5, label: '物見の場', obj: '物見の場へ上がり、城の構えを見よ', max: 70,
      ambush: { d: 10, title: '城の構えが見えた', sub: '坂の柵・二の丸の木戸・山上の本丸', say: ['足軽', '脇の藪から六角の物見じゃ！'],
        foes: () => [{ name: '六角の物見', from: { x: SPOT.x - 1, z: SPOT.z - 6 }, width: 3, list: [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }, { type: 'bow', n: 1 }], mass: 0 }] },
      onEnd: (rt2) => {
        // 三段の構えは実物の旗と使番で伝え、次の行き先に三つの印を重ねない。
        rt2.say('使番', '城の構えは三段。坂の柵、二の丸の木戸、山上の本丸にござる！', 3.8);
      },
    }),
    DP.fight({
      // 増援のない物見戦に、共通の七分の増援待ちを適用しない。
      at: SPOT, title: '六角の物見', sub: '脇から寄せる小勢', obj: '六角の物見を追い払え', max: 100, limit: 100, noRefill: true,
      foes: () => [{ name: '六角の物見の後詰', from: { x: SPOT.x + 1, z: SPOT.z - 8 }, width: 3, list: [{ type: 'ashigaru', n: 5 }, { type: 'gun', n: 1 }], mass: 0 }],
      reward: '六角の物見を追い払った',
    }),
    DP.rest({ dur: 6, heal: 0.25, banner: ['丹羽の手、着到', '四方から寄せる'],
      say: [['丹羽長秀', '丹羽の手、ただいま着いた。わしらは東の口から寄せる', 3.4], ['木下藤吉郎', 'よし、総懸かりじゃ。持ち場へ戻れ', 2.8]] }),
  ].map((s) => {
    // 物見へ着かないまま待ち時間だけで合流・総懸かりを済ませない。
    // 移動は到着、迎撃は敵の撤退を確かめる。休息の短い待ちは残す。
    if (s.kind === 'move' || s.kind === 'fight') {
      s.idleAdvance = false;
      // 共通の四分・七分の打ち切りも外す。未到着や迎撃中を時間だけで済ませない。
      s.noHardCap = true;
      s.limit = Infinity;
    }
    if (s.kind === 'move' || s.kind === 'fight') {
      const tick = s.tick;
      // 到着直後の待ち伏せは迎撃する。ただし、残兵探しで物見の段を終わらなくしない。
      s.tick = (rt2, C, m, context, el, dt) => {
        const finished = tick(rt2, C, m, context, el, dt);
        // 移動は実際の到着から六十秒、後詰との戦いは九十秒で寄せを打ち切る。
        // 未到着のまま次へ飛ばさず、残兵を実際に退かせてから合流する。
        const retreat = s.kind === 'move' ? C.arr && el - C.arrT >= 60 : el >= 90;
        if (retreat) for (const g of C.groups) {
          if (g.routed || g.count <= 2) continue;
          g.noRout = false;
          g.morale = 0;
          g.routed = true;
          g.order = 'flee';
        }
        // 物見の行き先を敵の平均位置へ替えない。柵や石段の向こうの
        // 平均点を追うと、物見へ着かないまま坂の下で止まってしまう。
        if (s.kind === 'move') C.goal = SPOT;
        // 一度物見へ来てから離れた場合も、仲間の迎撃だけで合流を済ませない。
        // 組の平均位置は斜面や柵の中に落ちるため、敵が退いた後は物見の場へ戻す。
        const p = rt2.player.u.pos;
        if (!rt2.player.u.alive || Math.hypot(p.x - SPOT.x, p.z - SPOT.z) >= 5) {
          C.goal = SPOT;
          // 共通の移動は初回の到着で印を消す。迎撃中に離れた時は
          // 戻る場所の印を復帰させ、到着するまで残す。
          if ((C.arr || s.kind === 'fight') && !C.mkReturnMark) {
            rt2.marker('dp', SPOT, '物見の場', { h: 3 });
            C.mkReturnMark = true;
          }
          return false;
        }
        if (C.mkReturnMark) { rt2.unmark('dp'); C.mkReturnMark = false; }
        if (s.kind === 'move' && !finished) return false;
        if (s.kind === 'fight' && C.later.length) return false;
        // 期限で迎撃済みにする前に、上で残兵へ退却を命じる。
        // 退却前の十秒間に段だけ終わり、戦える物見を残さない。
        for (const g of C.groups) {
          if (g.routed || g.count <= 2) continue;
          // 重傷・倒れた物見は迎撃済み。生存数だけでは三人以上残ると永久に止まる。
          let fighting = 0;
          for (const u of g.units) if (siegeFighter(u) && ++fighting > 2) return false;
        }
        return true;
      };
    }
    return s;
  }), () => { F.k15Monomi = 'done'; done(); });
}
