// ======================================================================
// 鳥取城　米の道を断つ段（3〜6分の続き・docs/oda15_plan_1108.md 29「毛利補給隊を遮断」）
// 二艘を焼いた後、川上で揚げた俵を担いで山へ運ぶ人足と護衛が見つかる。組で懸かって俵を川へ落とす。
// 続いて城から助けの兵が崖道を降りて来る。押し返すと、元の退き太鼓（midA）へ戻る。
// 入れ方：b_tottori.js で定義の後に wrap(def, K) を一度（読み込みの時）。def.midA を包む。
// ======================================================================
import { k15Off, k15Go as timedGo, k15Scenes, k15Rout, k15Charge } from '../oda15_kit.js';
import { fightingCount as k15Live, repelled } from './combat.js';
import { enemyGroup, centerOf } from '../bhelp.js';
import { dress } from '../b_inabayama.js';
import { sfx } from '../audio.js';

// 到着する役目は、時間だけで果たしたことにしない。
const k15Go = (rt, id, pos, r, text, label, fn, o = {}) =>
  timedGo(rt, id, pos, r, text, label, (r2) => {
    // 着いた後の台詞の間もピンを切らさない（関所3）：着いた所に残し、次の行き先で置き換える
    const p = typeof pos === 'function' ? pos() : pos;
    if (p) { const at = { x: p.x, z: p.z }; rt.marker('k15', () => at, label, { h: o.h || 3, guideAlways: true }); }
    fn(r2);
  }, { ...o, limit: Infinity });

export function wrap(def, K) {
  const midA = def.midA;
  def.midA = function (r) {
    const F = r.flags;
    if (k15Off(r) || F.nidaDone || F.step !== 1) return midA.call(this, r);
    if (F.k15stage === 'nida') return;
    start(r, K, () => { r.unmark('k15'); F.nidaDone = true; F.k15on = false; F.k15fight = false; F.step = 1; midA.call(this, r); });
  };
}
function start(rt, K, done) {
    const F = rt.flags;
    F.k15stage = 'nida'; F.k15on = true; F.step = 1.2;   // 1.2：元の update のどの段にも当たらない
    const at = { x: -50, z: -66 }, cliff = { x: -45, z: -77 };   // 11/9 織田H：崖の上（-40,-84）からは下りて来ず止まったので、崖の裾から出る
    const porters = enemyGroup(rt, { fixed: true, name: '俵を担ぐ人足', faction: 'mori', anchor: { x: at.x + 4, z: at.z - 6 }, facing: 0, width: 4, aggro: 0, morale: 20 },
      dress([{ type: 'ashigaru', n: 8, o: { keep: true } }], K.HUNGRY));
    for (const u of porters.units) u.noTarget = false;
    const escort = enemyGroup(rt, { fixed: true, name: '吉川の荷の護衛', faction: 'mori', anchor: at, facing: Math.PI, width: 5, aggro: 14, morale: 70 },
      dress([{ type: 'samurai', n: 1, o: { name: '荷駄の組頭' } }, { type: 'ashigaru', n: 9 }], K.KIKKAWA));
    K.hungryLook?.(porters); K.hungryLook?.(escort);
    rt.marker('k15foe', centerOf(escort), '荷の護衛', { red: true, group: escort });
    const N0 = k15Live(escort);
    rt.banner('川上に俵の列', '揚げた米を、城へ担ぎ上げようとしている');
    rt.say('組頭', '川上を見よ！　揚げた俵を担いで山へ運んでおる。組ごと懸かれ', 4.5);
    F.hide.noRout = true; F.hide.fixed = false; F.hide.order = 'attack'; F.hide.anchor.x = at.x + 6; F.hide.anchor.z = at.z + 6; F.hide.focus = null;
    F.k15fight = true;
    const runT0 = rt.t;
    k15Go(rt, 'nd-run', at, 10, '川上で、俵を運ぶ人足と護衛を止めよ', '俵の列', () => {
      k15Charge(rt, escort, at);
      rt.objProgress('main', `護衛 ${k15Live(escort)}／${N0}`);
      const t0 = rt.t;
      const tick = () => {
        if (rt.over || F.k15stage !== 'nida') return;
        const left = k15Live(escort);
        rt.objProgress('main', `護衛 ${left}／${N0}`);
        // 崖の助けの兵と同じく、地形に残った護衛一人を待ち続けない。
        // 到着後二分半、本人が岸を押さえていれば残兵は荷を捨てて退く。
        // 持ち場の外や、到着前の待ち時間だけでは進めない。
        if (repelled(rt, left, 3, at) || rt.t - t0 > 150 && repelled(rt, 0, 0, at)) return phase2();
        rt.after(0.5, tick, true);
      };
      tick();
    }, { limit: 60 });
    function phase2() {
      k15Rout(rt, escort, K.CASTLE); k15Rout(rt, porters, K.CASTLE);
      rt.unmark('k15foe');
      // 手間取れば一部の俵は山へ運ばれる（補給を通す＝戦が長引く。後の段で城が長く持つ）
      const leaked = rt.t - runT0 > 150;
      rt.banner(leaked ? '残る俵を押さえた' : '俵は川へ落ちた',
        leaked ? '一部の米は城へ届いた。残る人足は荷を捨てて退く' : '人足は荷を捨てて山へ逃げた');
      if (leaked) { F.ttLeak = (F.ttLeak || 0) + 1; F.ttSiege = (F.ttSiege ?? 100) - 20; rt.after(3, () => { if (!rt.over) rt.say('組頭', '幾俵かは山へ運ばれた。城がその分、長う持つ', 4); }, true); }
      sfx('wade', 0.6);
      const deed = leaked ? '城へ運ぶ俵を一部止めた' : '城へ運ぶ俵を止めた';
      rt.award((t) => t.side.push(deed), deed);
      // 城から助けの兵が崖道を降りて来る（戦況が変わる）
      const help = enemyGroup(rt, { fixed: true, name: '城の助けの兵', faction: 'mori', anchor: cliff, facing: Math.PI, width: 8, aggro: 18, morale: 60 },
        // 補給の護衛と違い、城から出るのは飢えた籠城兵。大きな指物の列へ戻さない。
        dress([{ type: 'samurai', n: 1, o: { name: '城の徒士頭', flag: 'mori', flagScale: 0.6 } }, { type: 'ashigaru', n: 9 }, { type: 'bow', n: 2 }], { ...K.KIKKAWA, flag: null }));
      K.hungryLook?.(help);
      const H0 = k15Live(help);
      k15Scenes(rt, [
        [3, () => { rt.say('足軽', '崖道から城の兵が降りて来るぞ！', 3.5); rt.army.play?.('eshout', help.center(), 0.7); }],
        [2, () => {
          k15Charge(rt, help, at);
          rt.marker('k15foe', centerOf(help), '城の助けの兵', { red: true, group: help });
          rt.obj('main', '崖道から降りる城兵を押し返せ', 'main', true);
          // 11/10 鳥取の係：印だけでは bot が岸の手前（-35,-30）に立ったまま撃退の輪（32歩）に入らず止まった。行き先を持たせる
          F.k15at = { id: 'nd-help', at: () => at, r: 6, t0: rt.t, fight: true };
          const t0 = rt.t;
          const tick = () => {
            if (rt.over || F.k15stage !== 'nida') return;
            const left = k15Live(help), el = rt.t - t0;
            rt.objProgress('main', `城兵 ${left}／${H0}`);
            // 11/9 二巡：崖の上に残った弓二人が下りて来ず、三人まで減らせずに十五分止まった。
            //   半ばを討って一分余り経てば、本人が持ち場を守っている時に残りが引き上げる。
            //   放置や持ち場からの離脱を、時間だけで撃退の手柄にしない。
            // 11/10 鳥取の係：崖の上の城兵が下りず、半ばを討てないまま刻限まで止まった。二分半、本人が岸を守っていれば引き上げる
            if (repelled(rt, left, 3, at) || (el > 75 && repelled(rt, left, Math.ceil(H0 / 2), at)) || el > 150 && repelled(rt, 0, 0, at)) {
              F.k15at = null;
              k15Rout(rt, help, K.CASTLE); rt.unmark('k15foe');
              rt.say('組頭', '城兵は崖を逃げ戻った。追うな。退き太鼓じゃ', 4);
              rt.award((t) => t.side.push('崖道の城兵を押し返した'), '崖道の城兵を押し返した');
              F.hide.order = 'hold'; F.hide.focus = null;
              rt.after(3, () => { if (!rt.over) done(); }, true);
              return;
            }
            rt.after(0.5, tick, true);
          };
          tick();
        }],
      ]);
    }
  }
