// ======================================================================
// 雑賀攻め・小雑賀川　始まりの段「川べりの物見」（0〜2分。b_saika.js の setup の終わりから入れる）
// 史実：堀秀政らの山手の勢は小雑賀川に着いたが、対岸は高い岸で、柵の内から雑賀の鉄砲が狙っていた（信長公記巻十）。
// 遊び：川上の物見の場（竹束の脇）へ寄ると、対岸の柵に並ぶ鉄砲が見え（赤い印）、一斉に撃って来る。
//   続いて川上の浅瀬から雑賀の小組が渡って来るので、杭抜き組の前で払う。払い終えてから杭抜きの段へ。
//   物見に着いたら必ず何か起きる（kaito 11/8）。字は出さない：赤い印・硝煙・寄せる小組で分からせる。
// ======================================================================
import { enemyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';

const LOOK = { x: -4, z: -18 };   // 物見の場（川べりの竹束の脇）

export function install(rt, ctx) {
  const F = rt.flags;
  const { dress, SAIKA, next, missionText } = ctx;
  let seen = false, raid = null, done = false, tick = 0;
  rt.setPhase('mono');
  rt.unmark('goal');
  rt.obj('main', missionText, 'main', true);
  rt.marker('mono', LOOK, '川上の物見の場', { h: 3, guideAlways: true, guidePriority: 400 });
  rt.after(9, () => { if (!seen && !done) rt.say('堀秀政', '向こう岸の柵の数を見て参れ。頭を上げすぎるな', 4); });

  const reveal = () => {
    seen = true;
    rt.unmark('mono');
    sfx('volley', 1);
    (F.gunPosts || []).forEach((g, i) => rt.marker('monoGun' + i, () => (g.routed || !g.count ? null : g.center()), '柵の鉄砲', { red: true, group: g }));
    rt.after(10, () => (F.gunPosts || []).forEach((g, i) => rt.unmark('monoGun' + i)));
    rt.say('組頭', '柵の内に鉄砲がずらりと並んでおる！　伏せよ！', 3.5);
    rt.award((t) => t.side.push('川べりの物見で、対岸の鉄砲の並びを見届けた'), '対岸の鉄砲の並びを見た');
    // 川上の浅瀬から雑賀の小組が渡って来る（杭抜き組を狙う）
    rt.after(6, () => {
      if (done) return;
      raid = enemyGroup(rt, { faction: 'saika', name: '川上から渡る雑賀の小組', anchor: { x: -30, z: -46 }, facing: Math.PI / 2, width: 6, order: 'attack', aggro: 24, seekRange: 34, morale: 80, fleeDir: { x: -1, z: 0 } },
        dress([{ type: 'samurai', n: 1, o: { hat: 'jingasa' } }, { type: 'ashigaru', n: 4 }, { type: 'gun', n: 2 }], SAIKA));
      raid.fixed = false; raid.order = 'move'; raid.dest = { x: -4, z: -14 };
      raid.onArrive = (q) => { q.order = 'attack'; q.aggro = 30; };
      rt.army.play?.('eshout', { x: -26, z: -44 }, 1.3);
      rt.say('見張り', '川上の浅瀬を渡って来るぞ！　杭抜きの組を守れ！', 4);
      rt.objProgress('main', '川上から渡って来る雑賀の小組を払え');
      rt.marker('monoRaid', () => (raid.routed || !raid.count ? null : raid.center()), '渡って来る雑賀衆', { red: true, group: raid });
    });
  };

  return {
    update(dt) {
      if (done || F.ending || rt.over) return;
      if ((tick -= dt) > 0) return;
      tick = 0.5;
      const p = rt.player.u.pos;
      if (!seen && (Math.hypot(p.x - LOOK.x, p.z - LOOK.z) < 7)) reveal();
      if (raid) {
        let live = 0;
        for (const u of raid.units) if (u.alive && !u.fleeing && !u.woundOut) live++;
        rt.objProgress('main', live ? `渡って来た雑賀衆 ${live}人` : '');
        if (!live) {
          done = true;
          rt.unmark('monoRaid');
          if (!live) rt.award((t) => t.side.push('川上から渡った雑賀の小組を払った'), '渡った雑賀の小組を払った');
          rt.say('堀秀政', 'よし。今のうちに川底の杭を抜くぞ！', 3.5);
          rt.after(3, () => next());
        }
      }
    },
  };
}
