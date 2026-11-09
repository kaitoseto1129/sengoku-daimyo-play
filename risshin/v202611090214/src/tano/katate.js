// ======================================================================
// 田野　崖道の土屋昌恒（6〜10分・docs/oda15_plan_1108.md 31「土屋昌恒ら最後の抵抗・狭い場所で激戦」）と、
// 鳥居畑の柵の口での武田の逆寄せ（9〜11分）。
// ①四郎作の崖道を破った後、さらに狭い崖の道で土屋昌恒が藤蔓を片手に道を塞ぐ（片手千人斬りの伝え・この戦の一番有名な場面）。
//   一人ずつしか通れない道へ、土屋の衆が三度斬って出る。破ると土屋は屋敷へ退く。→ 元の「鳥居畑の柵の口」へ。
// ②柵の口を破った後、屋敷から武田の残る兵が逆寄せに出る。柵の口で受けると → 元の「田野の平屋敷」へ。
// 入れ方：b_tano.js で wrap(tano) を一度。def.next を包む（段の間に挟む）。
// ======================================================================
import { k15Off, k15Go, k15Scenes, k15Wave } from '../oda15_kit.js';
import { enemyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';

export function wrap(def) {
  const next = def.next;
  def.next = function (r) {
    const F = r.flags, D = F.dp, nx = D?.steps?.[D.i + 1];
    if (k15Off(r) || !nx) return next.call(this, r);
    if (F.k15stage === 'katate' || F.k15stage === 'gyaku') return;
    const go = () => {
      if (F.k15stage === 'katate') F.katateDone = true;
      if (F.k15stage === 'gyaku') F.gyakuDone = true;
      F.k15on = false; F.k15stage = null; D.on = true; next.call(this, r);
    };
    if (nx.phase === 'fence' && !F.katateDone) { D.on = false; katate(r, go); return; }
    if (nx.phase === 'tano' && !F.gyakuDone) { D.on = false; gyaku(r, go); return; }
    return next.call(this, r);
  };
}

const takeda = (n, lead, o = {}) => [{ type: 'samurai', n: 1, o: { name: lead, ...o } }, { type: 'ashigaru', n }];

function katate(rt, done) {
  const F = rt.flags;
  F.k15stage = 'katate'; F.k15on = true;
  rt.unmark('dp'); rt.unzone('dp');
  const stop = () => F.k15stage !== 'katate';
  const cliff = { x: 52, z: -1 }, front = { x: 44, z: 0 };
  rt.banner('崖の細道', '片側は崖、片側は日川の淵。一人ずつしか通れない');
  k15Scenes(rt, [
    [3, () => rt.say('滝川の組頭', 'この先の細道に、まだ武田の者が残っておる。崖に沿って進め', 4)],
  ], () => k15Go(rt, 'kt-cliff', front, 6, '崖の細道を進め', '崖の細道', () => {
    rt.banner('土屋昌恒、道を塞ぐ', '藤蔓を片手に崖へ身を支え、片手の刀で寄せ手を斬る');
    sfx('shout', 0.7);
    const tsuchiya = enemyGroup(rt, { fixed: true, noAI: true, name: '土屋昌恒', faction: 'takeda', anchor: { x: cliff.x + 6, z: cliff.z }, facing: -Math.PI / 2, width: 1, aggro: 0 },
      [{ type: 'samurai', n: 1, o: { name: '土屋昌恒', invuln: true, horse: false, hat: 'kabuto_m' } }]);
    k15Scenes(rt, [
      [3.5, () => rt.say('土屋昌恒', 'ここは土屋惣蔵が通さぬ。御屋形様のもとへは、一人も行かせぬ！', 5)],
      [5, () => rt.say('滝川の組頭', '一人ずつ懸かっては斬られる。槍をそろえて押せ！', 4)],
    ], () => {
      rt.obj('main', '崖の細道で、土屋の衆を押し返せ', 'main', true);
      let n = 0;
      const one = () => {
        if (stop()) return;
        n++;
        if (n > 3) {
          rt.banner('土屋昌恒、屋敷へ退く', '細道を破られ、主のもとへ戻った');
          rt.say('足軽', 'あれが土屋惣蔵か……　片手で、何人斬ったか', 4);
          rt.award((t) => t.side.push('崖の細道を破った'), '崖の細道を破った');
          for (const u of tsuchiya.units) if (u.alive) rt.army.despawn(u);
          rt.after(5, () => { if (!stop()) done(); }, true);
          return;
        }
        if (n > 1) rt.say('土屋昌恒', n === 2 ? 'まだじゃ、次の者、懸かれ！' : '最後の者ども、続け！', 3.5);
        k15Wave(rt, { make: enemyGroup, name: '土屋の衆', faction: 'takeda', at: { x: cliff.x + 3, z: cliff.z }, to: front,
          list: takeda(n === 3 ? 4 : 3, '土屋の家来'), label: '土屋の衆', width: 2, sec: 60, left: 1, flee: { x: 130, z: -6 },
          reward: n === 3 ? '土屋の衆を細道で破った' : null }, () => rt.after(2.5, one, true));
      };
      one();
    }, stop);
  }, { limit: 50 }));
}

function gyaku(rt, done) {
  const F = rt.flags;
  F.k15stage = 'gyaku'; F.k15on = true;
  rt.unmark('dp'); rt.unzone('dp');
  const stop = () => F.k15stage !== 'gyaku';
  const gate = { x: 100, z: 0 };
  rt.banner('柵の口を取った', '屋敷の奥から、武田の残る兵が逆寄せに出る');
  k15Scenes(rt, [
    [3, () => rt.say('物見', '屋敷から兵が出て来る！　柵の口を固めよ', 3.5)],
  ], () => k15Go(rt, 'gy-gate', gate, 7, '柵の口で、武田の逆寄せを受けよ', '柵の口', () => {
    rt.obj('main', '柵の口で、武田の逆寄せを受けよ', 'main', true);
    k15Wave(rt, { make: enemyGroup, name: '武田の逆寄せ', faction: 'takeda', at: { x: 118, z: -2 }, to: gate,
      list: takeda(7, '跡部の侍'), label: '逆寄せ', width: 4, sec: 90, flee: { x: 134, z: -6 }, reward: '柵の口で武田の逆寄せを受けた' }, () => {
      k15Scenes(rt, [
        [2, () => rt.say('滝川の組頭', '押し返した。屋敷へ入るぞ。勝頼の旗は奥じゃ', 4)],
        [4.5, () => {}],
      ], done, stop);
    });
  }, { limit: 40 }));
}
