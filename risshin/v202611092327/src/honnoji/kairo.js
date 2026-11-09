// ======================================================================
// 本能寺の変　火の回る回廊（8〜11分・docs/oda15_plan_1108.md 32「寺内・廊下・中庭を移動しながら戦う／火災拡大・退路減少・明智軍増加」）
// 本堂の守りの後、上様と奥へ退く前に：中庭の回廊で明智勢を食い止める → 本堂に火が回り、回廊にも火が移る（退く道が細る）→
// 渡り廊下の口で新手を受け、御殿へ駆け込む。終わると元の「上様と奥へ退く」段（p6）へ。
// 入れ方：b_honnoji.js で wrap(honnoji, K) を一度。def.p6 を包む。
// ======================================================================
import { k15Freeze, k15Heal, k15Off, k15Go, k15Scenes, k15Track } from '../oda15_kit.js';
import { PT } from '../honno_tera.js';
import { sfx } from '../audio.js';

export function wrap(def, K) {
  const p6 = def.p6;
  def.p6 = function (r) {
    const F = r.flags;
    if (k15Off(r) || F.kairoDone || (F.hp || 0) >= 6) return p6.call(this, r);
    if (F.k15stage === 'kairo') return;
    start(r, K, () => { k15Heal(r); F.kairoDone = true; F.k15on = false; F.k15stage = null; p6.call(this, r); });
  };
}

function start(rt, K, done) {
  const F = rt.flags, W = rt.world;
  F.k15stage = 'kairo'; F.k15on = true;
  k15Freeze(rt, 'kairo');   // 前の段の時計を止める
  const stop = () => F.k15stage !== 'kairo' || F.ending;
  const niwa = PT.niwa, watari = { x: -66, z: 72 };
  rt.banner('中庭の回廊', '上様が奥へ移られる前に、回廊の口の追手を払え');
  k15Go(rt, 'kr-niwa', niwa, 5, '中庭の回廊の口を守れ', '回廊の口', () => {
    const w1 = K.akechi(rt, '中庭へ入った明智勢', [[niwa.x + 12, niwa.z - 10], [niwa.x + 2, niwa.z]], [K.uS(1), K.uA(4)], { entered: true, player: true, dmg: 0.5 });
    rt.say('小姓', '中庭に明智勢じゃ！', 3);
    k15Track(rt, w1, '中庭の明智勢', { sec: 60, reward: '中庭の回廊の口を守った' }, () => k15Scenes(rt, [
      [1, () => {
        rt.banner('本堂に火が回る', '回廊の屋根にも火が移った。退く道が細る');
        sfx('crash', 0.5);
        for (const [x, z] of [[-46, 58], [-45, 70], [-52, 77]]) { try { W.addFire(x, z, { size: 1.8, h: 2.4, blackSmoke: true }); } catch (e) { /* 火を置けない所でも続ける */ } }
      }],
      [3, () => rt.say('森蘭丸', '火が回る！　渡り廊下から御殿へ！', 3.5)],
    ], () => k15Go(rt, 'kr-watari', watari, 5, '渡り廊下の口へ走れ', '渡り廊下', () => {
      const w2 = K.akechi(rt, '回廊を回り込む明智勢', [[watari.x + 10, watari.z - 6], [watari.x + 1, watari.z]], [K.uS(2), K.uA(3)], { entered: true, player: true, dmg: 0.5 });
      rt.say('小姓', '回り込まれた！　ここで食い止めよ！', 3);
      k15Track(rt, w2, '回り込む明智勢', { sec: 70, reward: '渡り廊下の口で明智勢を食い止めた' }, () => k15Scenes(rt, [
        [1, () => rt.say('森蘭丸', '寄せ手は増えるばかりじゃ。上様をお連れして御殿の奥へ！', 3.5)],
      ], () => k15Go(rt, 'kr-back', { x: -50, z: 56 }, 5, '本堂の上様のもとへ戻れ', '本堂の口', done, { limit: 30 }), stop));
    }, { limit: 40 }), stop));
  }, { limit: 40 });
}
