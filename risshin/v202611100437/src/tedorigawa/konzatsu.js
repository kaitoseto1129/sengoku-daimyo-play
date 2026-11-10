// ======================================================================
// 手取川の戦い　退き口の段「雨・増水・渡り口の混雑」（3〜6分。b_tedorigawa.js の retreat の後、rearguard の前に入れる）
// 史実：折からの雨で手取川は増水し、渡る織田勢は多くが溺れたと伝わる（謙信書状写「数多川へ追い籠め」）。
// 遊び：①濁流に足を取られた足軽が下流へ流される。水際へ走って引き上げる（着くと足軽が岸へ上がる）
//   ②渡り口に詰まった列へ、上杉の物見の騎馬が横から突っ込む。払う → 北岸の殿の段（rearguard）へ。
//   救助と騎馬は刻限で次の下知へ移るが、崩れた荷は本人が着いてから除く。
// ======================================================================
import { allyGroup, enemyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';

const DROWN = { x: 22, z: -14 };   // 流された足軽（渡り口の下流の水際）

export function install(rt, ctx) {
  const F = rt.flags;
  // 討死・決着の後は、予約した下知や次の段で終幕を上書きしない。
  const active = () => !F.ending && !rt.over && rt.player.u.alive;
  const { dress, ODA, UESUGI, FORD, next } = ctx;
  const t0 = rt.t;
  let step = 0, t1 = rt.t, tick = 0, done = false, R = null;
  F.konzatsu = true;
  // 流された足軽（三人。命は少し減っている）
  const W = allyGroup(rt, { fixed: true, name: '流された足軽', anchor: DROWN, facing: 0, width: 3, aggro: 0, noRout: true, order: 'hold' },
    dress([{ type: 'ashigaru', n: 3 }], ODA));
  for (const u of W.units) u.hp = Math.min(u.hp, u.maxHp * 0.5);
  sfx('wade', 0.8);
  rt.say('足軽', '川が増えてきた！　足が持っていかれる……助けてくれ！', 3.5);
  rt.after(4, () => { if (active()) rt.say('組頭', '下流で流されておる！　水際へ走って引き上げよ！', 4); });
  rt.obj('konzatsu', '下流の水際で、流された足軽を引き上げよ', 'order');
  rt.marker('konzatsuW', DROWN, '流された足軽', { h: 3, guideAlways: true, guidePriority: 420 });

  const saved = (ok) => {
    step = 1; t1 = rt.t;
    rt.unmark('konzatsuW');
    if (ok) {
      rt.objDone('konzatsu');
      rt.award((t) => t.side.push('増水の手取川で、流された足軽を引き上げた'), '流された足軽を引き上げた');
      rt.say('足軽', 'た、助かった……。この恩は忘れませぬ', 3);
    } else rt.objRemove('konzatsu');
    // 引き上げた者は南岸へ渡る列に加わる
    W.fixed = false; W.retreatOnly = true; W.order = 'path'; W.path = [[4, -20], [4, 30]]; W.pathIdx = 0; W.speed = 1.6;
    W.onArrive = (q) => { q.order = 'hold'; };
    // 渡り口の詰まりへ、上杉の物見の騎馬が横から（約十五秒後）
    rt.after(15, () => {
      if (done || !active()) return;
      R = enemyGroup(rt, { name: '上杉の物見の騎馬', anchor: { x: -70, z: -44 }, facing: Math.PI / 2, width: 6, order: 'hold', aggro: 30, seekRange: 40, morale: 85, faction: 'uesugi', fleeDir: { x: -1, z: -0.5 } },
        dress([{ type: 'samurai', n: 1, o: { horse: true } }, { type: 'cavalry', n: 5 }], UESUGI));
      R.fixed = false; R.order = 'move'; R.dest = { x: -6, z: -34 }; R.onArrive = (q) => { q.order = 'attack'; q.aggro = 30; };
      sfx('hooves', 0.9);
      rt.say('組頭', '西から騎馬じゃ！　詰まった列を横から突く気だ。槍を向けよ！', 4);
      rt.obj('konzatsu2', '渡り口の列へ横から来る、上杉の騎馬を払え', 'order');
      rt.marker('konzatsuR', () => (R.units.some((u) => u.alive && !u.fleeing && !u.woundOut) ? R.center() : null), '上杉の騎馬', { red: true, group: R });
    });
  };

  return {
    update(dt) {
      if (done || !active()) return;
      if ((tick -= dt) > 0) return;
      tick = 0.5;
      const p = rt.player.u.pos, el = rt.t - t1;
      if (step === 0) {
        if (Math.hypot(p.x - DROWN.x, p.z - DROWN.z) < 5) saved(true);
        else if (el > 70) saved(false);
        return;
      }
      if (step === 2) {
        if (el > 2 && Math.hypot(p.x - 8, p.z - (FORD.z - 2)) < 5) this.cargo();
        return;
      }
      if (!R) return;
      let n = 0;
      for (const u of R.units) if (u.alive && !u.fleeing && !u.woundOut) n++;
      rt.objProgress('konzatsu2', n ? `上杉の騎馬 ${n}騎` : '');
      if (!n || el > 110) {
        rt.unmark('konzatsuR');
        if (!n) { rt.objDone('konzatsu2'); rt.award((t) => t.side.push('渡り口を横から突いた上杉の騎馬を払った'), '上杉の物見の騎馬を払った'); }
        else rt.objRemove('konzatsu2');
        // ③ 渡り口の俵の荷が崩れて列が止まる。荷の所へ行くと、荷を川へ落として口が開く
        step = 2; t1 = rt.t; R = null;
        rt.after(2, () => {
          if (done || !active()) return;
          rt.say('組頭', '渡り口で荷が崩れた！　列が止まっておる。荷を川へ落とせ！', 4);
          rt.obj('konzatsu3', '渡り口で崩れた荷を川へ落とし、列を通せ', 'order');
          rt.marker('konzatsuC', { x: 8, z: FORD.z - 2 }, '崩れた荷', { h: 3, guideAlways: true, guidePriority: 420 });
        });
      }
    },
    cargo() {
      if (done || F.ending || rt.over || !rt.player.u.alive ||
          Math.hypot(rt.player.u.pos.x - 8, rt.player.u.pos.z - (FORD.z - 2)) >= 5) return;
      done = true; F.konzatsuDone = true;
      rt.unmark('konzatsuC');
      const near = Math.hypot(rt.player.u.pos.x - 8, rt.player.u.pos.z - (FORD.z - 2)) < 6;
      if (F.cargo) F.cargo.visible = false;
      F.cargoCleared = true;
      sfx('wade', 0.7);
      if (near) { rt.objDone('konzatsu3'); rt.award((t) => t.side.push('渡り口の崩れた荷を川へ落とし、渡る列を通した'), '渡り口の荷をどけた'); }
      else rt.objRemove('konzatsu3');
      rt.say('足軽', '荷が流れた！　列が動くぞ！', 3);
      rt.after(4, () => { if (active()) rt.say('柴田勝家', '本隊が渡るまで、北の岸で上杉を止めよ！　殿を頼むぞ！', 4); });
      rt.after(7, () => { if (active()) next(); });
    },
    since: () => rt.t - t0,
  };
}
