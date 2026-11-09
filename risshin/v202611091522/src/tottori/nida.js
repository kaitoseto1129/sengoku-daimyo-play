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
  timedGo(rt, id, pos, r, text, label, fn, { ...o, limit: Infinity });

export function wrap(def, K) {
  const midA = def.midA;
  def.midA = function (r) {
    const F = r.flags;
    if (k15Off(r) || F.nidaDone || F.step !== 1) return midA.call(this, r);
    if (F.k15stage === 'nida') return;
    start(r, K, () => { F.nidaDone = true; F.k15on = false; F.k15fight = false; F.step = 1; midA.call(this, r); });
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
    k15Go(rt, 'nd-run', at, 10, '川上で、俵を運ぶ人足と護衛を止めよ', '俵の列', () => {
      k15Charge(rt, escort, at);
      rt.objProgress('main', `護衛 ${k15Live(escort)}／${N0}`);
      const tick = () => {
        if (rt.over || F.k15stage !== 'nida') return;
        const left = k15Live(escort);
        rt.objProgress('main', `護衛 ${left}／${N0}`);
        if (repelled(rt, left, 3, at)) return phase2();
        rt.after(0.5, tick, true);
      };
      tick();
    }, { limit: 60 });
    function phase2() {
      k15Rout(rt, escort, K.CASTLE); k15Rout(rt, porters, K.CASTLE);
      rt.unmark('k15foe');
      rt.banner('俵は川へ落ちた', '人足は荷を捨てて山へ逃げた');
      sfx('wade', 0.6);
      rt.award((t) => t.side.push('城へ運ぶ俵を止めた'), '城へ運ぶ俵を止めた');
      // 城から助けの兵が崖道を降りて来る（戦況が変わる）
      const help = enemyGroup(rt, { fixed: true, name: '城の助けの兵', faction: 'mori', anchor: cliff, facing: Math.PI, width: 5, aggro: 18, morale: 60 },
        dress([{ type: 'samurai', n: 1, o: { name: '城の徒士頭' } }, { type: 'ashigaru', n: 9 }, { type: 'bow', n: 2 }], K.KIKKAWA));
      K.hungryLook?.(help);
      const H0 = k15Live(help);
      k15Scenes(rt, [
        [3, () => { rt.say('足軽', '崖道から城の兵が降りて来るぞ！', 3.5); rt.army.play?.('eshout', help.center(), 0.7); }],
        [2, () => {
          k15Charge(rt, help, at);
          rt.marker('k15foe', centerOf(help), '城の助けの兵', { red: true, group: help });
          rt.obj('main', '崖道から降りる城兵を押し返せ', 'main', true);
          const t0 = rt.t;
          const tick = () => {
            if (rt.over || F.k15stage !== 'nida') return;
            const left = k15Live(help), el = rt.t - t0;
            rt.objProgress('main', `城兵 ${left}／${H0}`);
            // 11/9 二巡：崖の上に残った弓二人が下りて来ず、三人まで減らせずに十五分止まった。
            //   半ばを討って一分余り経てば、本人が持ち場を守っている時に残りが引き上げる。
            //   放置や持ち場からの離脱を、時間だけで撃退の手柄にしない。
            if (repelled(rt, left, 3, at) || (el > 75 && repelled(rt, left, Math.ceil(H0 / 2), at)) || (el > 150 && repelled(rt, H0, H0, at))) {   // 二分半、持ち場で受け続ければ飢えた城兵は崖を引き上げる
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
