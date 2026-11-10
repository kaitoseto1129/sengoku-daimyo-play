// ======================================================================
// 小田原征伐　「城を出る兵」の段（14〜15分）　docs/toyo15_plan_1108.md の 15
// 史実：七月五日、氏直は城を出て滝川雄利の陣へ降った。城の兵は武器を置いて城を出、城は豊臣方に渡された。
// 遊び：官兵衛を本丸の門へ送り届けた後、門が開き、北条の兵が槍を伏せて列を作って出てくる。北条の旗が下がる。
//   戦では終わらない。主人公は門の前で見届ける（印の所に立って待つ）。済むと戦の win（開城・天下統一の終幕）。
// 入れ方：b_t12_odawara.js の depthStart の段の並びの最後（官兵衛の段の後）に step(H) を置く。
// ======================================================================
import { enemyGroup, nm } from '../bhelp.js';
import { sfx } from '../audio.js';

export function step(H) {
  return {
    kind: 'move', key: 'kaijo',
    start(rt, C) {
      const F = rt.flags;
      C.at = H.WATCH; C.goal = H.WATCH; C.groups = []; C.say = 0;
      F.day = 3; F.keisen = 0;
      rt.banner('七月五日', '北条氏直が降り、小田原城が開く');
      rt.obj('dp', '本丸の門の前で、槍を置いて城を出る北条の兵を見届ける', 'main');
      rt.marker('dp', H.WATCH, '本丸の門の前', { h: 3 });
      // 北条の旗が下がり始める（t12_odawara/tenka.js の tick が下げる）
      F.lowerT = rt.t - 1.5; F.lowering = true;
      sfx('taiko', 0.5);
    },
    tick(rt, C, m, ctx, el) {
      const F = rt.flags;
      const line = (t, f) => { if (el >= t && C.say < t) { C.say = t; f(); } };
      line(1, () => rt.say('北条の侍', '殿の御下知じゃ。槍を置け。城を出る', 3.4));
      // 城を出る兵の列（槍を伏せ、門の外で座る）
      for (const [t, k] of [[4, 0], [16, 1], [28, 2]]) if (el >= t && !C['out' + k]) {
        C['out' + k] = true;
        // 本丸の門は KGATE より北。門外に現れず、門内から細い列で出る。
        const g = enemyGroup(rt, { faction: 'hojo', name: '城を出る北条の兵', anchor: { x: H.KGATE.x, z: H.KGATE.z - 13 }, facing: 0, width: 3, formation: 'column', aggro: 0, morale: 100, noRout: true, noAI: true,
          // 列の後ろも櫓門を抜けてから左右へ分かれる。門内から斜めに向かうと後列が板塀に当たる。
          order: 'path', roadColumn: true, followColumnRoad: true, pathIdx: 0,
          path: [[H.KGATE.x, H.KGATE.z - 13], [H.KGATE.x, H.KGATE.z + 6], [H.WATCH.x - 8 + k * 5, H.WATCH.z + 6]],
          speed: 1.4, arriveNoncombat: true },
        H.dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }], H.HOJO));
        g.peaceful = true; g.fire = false;
        g.arriveCount = g.units.length;
        for (const u of g.units) { u.noTarget = true; u.invuln = true; }
        g.onArrive = (q) => {
          q.onArrive = null; q.order = 'hold'; q.surrendered = true;
          // 門を抜けてから武器を地面へ置く。座るだけでは槍が手に残る。
          for (const u of q.units) if (u.alive && !u.gone) {
            rt.army.dropWeapon(u);
            u._crouch = true;
          }
        };
        C.groups.push(g);
      }
      line(8, () => rt.say('黒田官兵衛', '城の者には手を出すな。殿下は命を助けると仰せじゃ', 3.6));
      line(14, () => rt.say(nm(rt), '総構えの堀の前では退いたが……今度は刃を交えずに城が開く', 3.6));
      line(21, () => rt.say('北条の兵', '鎧も槍もまだある。……それでも、置くのか', 3));
      line(26, () => rt.say('井伊直政', 'もはや刀を抜くには及ばぬ。囲みを保った皆の働きよ', 3.6));
      line(32, () => rt.say('黒田官兵衛', '氏直殿は滝川殿の陣へ参られる。……北条の百年が、今日で終わる', 4));
      const P = rt.player.u.pos;
      C.near = Math.hypot(P.x - H.WATCH.x, P.z - H.WATCH.z) < 16;
      // 三番目の列も門外に着くまで、時間だけで見届けを済ませない。
      return el > 38 && C.near && C.groups.length === 3 && C.groups.every((g) => g.surrendered);
    },
    end(rt) {
      rt.unmark('dp');
      rt.objDone('dp');
    },
  };
}
