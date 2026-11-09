// ======================================================================
// 田野　追跡の段（0〜3分・docs/oda15_plan_1108.md 31「勝頼逃走・織田方追跡」）
// 谷の入口の西から、逃げる勝頼の跡を追って谷道を走る。道の途中で必ず何かが起きる：
//   捨てられた武田の荷と旗 → 落ち武者の小勢が斬りかかる → 寝返った小山田の陣の脇で使番が勝頼の行き先を告げる。
// 着くと元の谷道の段（valley）が始まる。
// 入れ方：b_tano.js で wrap(tano) を一度。def.valley を包む。
// ======================================================================
import { k15Off, k15Squad, k15Go, k15Scenes, k15Fade, k15Live, k15Rout, k15Charge } from '../oda15_kit.js';
import { enemyGroup, centerOf } from '../bhelp.js';
import { evPerson, evRemove } from '../b_ev6.js';
import { placeGroup, placePlayer } from '../b_opening.js';
import { sfx } from '../audio.js';

export function wrap(def) {
  const valley = def.valley;
  def.valley = function (r) {
    const F = r.flags;
    if (k15Off(r) || F.tsuisekiDone || F.started) return valley.call(this, r);
    if (F.k15stage === 'tsuiseki') return;
    start(r, () => { F.tsuisekiDone = true; F.k15on = false; F.k15fight = false; valley.call(this, r); });
  };
}

function start(rt, done) {
  const F = rt.flags;
  F.k15stage = 'tsuiseki'; F.k15on = true;
  const stop = () => F.k15stage !== 'tsuiseki';
  const back = rt.objectives.find((o) => o.id === 'main')?.text;
  k15Fade(rt, () => {
    placePlayer(rt, -131, 3, Math.PI / 2);   // 滝川の陣幕（-146 の囲い）の東の口の外
    k15Squad(rt, -134, 6);
  }, '天正十年三月十一日　甲斐国 田野', '新府を捨てた勝頼を、滝川一益の手が追う');
  const A = { x: -114, z: -2 }, B = { x: -99, z: -3 }, C = { x: -80, z: 2 };
  k15Scenes(rt, [
    [2, () => rt.say('使番', '殿（滝川一益）の下知じゃ。勝頼父子は、この日川の谷の奥に逃げ込んだ', 4.5)],
    [4.5, () => rt.say('滝川の組頭', '天目山へ登られては厄介じゃ。その前に追いつく', 4)],
    [4, () => rt.say('滝川の組頭', '勝頼の跡は、この谷道じゃ。遅れるな、走れ！', 4)],
  ], () => k15Go(rt, 'ts-a', A, 6, '谷道を走り、勝頼の跡を追え', '谷道', () => {
    // 捨てられた荷と旗
    rt.banner('捨てられた武田の荷', '長持と旗が道に投げ出されている。逃げる者の足は速い');
    rt.award((t) => t.side.push('勝頼の跡を見つけた'), '勝頼の跡を見つけた');
    k15Scenes(rt, [
      [3, () => rt.say('足軽', '武田菱の旗まで捨てておる……', 3.5)],
      [3.5, () => rt.say('滝川の組頭', '供の者も、もう百に足らぬと聞く。追いつけるぞ', 4)],
    ], () => k15Go(rt, 'ts-b', B, 7, '谷道の先へ急げ', '谷の曲がり', () => {
      // 落ち武者の小勢が、道の脇の藪から斬りかかる
      const g = enemyGroup(rt, { fixed: true, name: '武田の落ち武者', faction: 'takeda', anchor: { x: B.x + 10, z: B.z + 6 }, facing: -Math.PI / 2, width: 3, aggro: 20, morale: 80 },
        [{ type: 'samurai', n: 1, o: { name: '武田の落ち武者' } }, { type: 'ashigaru', n: 4 }]);
      g.noRout = true;
      const N0 = k15Live(g), t0 = rt.t;
      F.k15fight = true;
      rt.say('足軽', '藪に落ち武者じゃ！', 3);
      sfx('shout', 0.6);
      k15Charge(rt, g, rt.player.u.pos);
      rt.marker('k15foe', centerOf(g), '落ち武者', { red: true, group: g });
      rt.obj('main', '斬りかかる落ち武者を退けよ', 'main', true);
      const tick = () => {
        if (stop() || rt.over) return;
        const left = k15Live(g);
        rt.objProgress('main', `落ち武者 ${left}／${N0}`);
        if (left <= 1 || rt.t - t0 > 70) {
          k15Rout(rt, g, { x: 140, z: 0 }); rt.unmark('k15foe'); F.k15fight = false;
          rt.award((t) => t.side.push('谷道の落ち武者を退けた'), '谷道の落ち武者を退けた');
          // 置き去りにされた侍女たち（追う道の途中の出来事）
          const maid = evPerson(rt, 0, '武田の侍女', { x: B.x + 8, z: B.z - 5 }, -Math.PI / 2, { calm: true, type: 'porter' });
          k15Scenes(rt, [
            [1.5, () => rt.banner('道ばたの侍女', '輿を捨て、歩けなくなった者が残されている')],
            [3.5, () => rt.say('武田の侍女', 'お許しを……　御方様たちは、この先の田野へ', 4)],
            [4.5, () => rt.say('滝川の組頭', '女子には手を出すな。後ろの陣へ送れ', 3.5)],
            [4, () => { evRemove(rt, maid); }],
          ], () => k15Go(rt, 'ts-c', C, 7, '小山田の陣の脇を抜け、先手へ', '小山田の陣', () => {
            // 寝返った小山田の陣の脇で、使番が行き先を告げる
            k15Scenes(rt, [
              [0.5, () => { rt.banner('小山田信茂の陣', '勝頼が頼った小山田は、笹子で門を閉ざし織田に付いた'); }],
              [4, () => rt.say('使番', '勝頼は田野の平屋敷に入った！　天目山へは登れなんだ', 4.5)],
              [4.5, () => rt.say('小山田信茂', '……四郎殿は、わしを頼って来られた。わしは門を開けなんだ', 4.5)],
              [5, () => rt.say('足軽', '主を見捨てた者の陣か……　旗が下を向いておる', 3.5)],
              [4, () => { sfx('far', 0.6); rt.banner('谷の奥で鬨の声', '先手が四郎作で、武田の殿とぶつかった'); }],
              [4, () => rt.say('滝川の組頭', '先手に続け！　勝頼の首は目の前じゃ', 4)],
            ], () => { if (back) rt.obj('main', back, 'main', true); done(); }, stop);
          }), stop);
          return;
        }
        rt.after(0.5, tick, true);
      };
      tick();
    }), stop);
  }), stop);
}
