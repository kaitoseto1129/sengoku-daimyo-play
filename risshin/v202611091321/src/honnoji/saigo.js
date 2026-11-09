// ======================================================================
// 本能寺の変　信長の最後の防衛（12〜14分・docs/oda15_plan_1108.md 32「信長最後の防衛・主人公と信長が近くで戦う・内部へ後退」）
// 御殿の奥へ退く前に：広間で上様と並んで槍を振るう（この戦の一番有名な場面）→ 上様が肘に槍傷を受ける →
// 最後の明智勢を控えの間の口で受ける → 元の「もはやこれまで」（p8）へ。
// 入れ方：b_honnoji.js で wrap(honnoji, K) を一度。def.p8 を包む。
// ======================================================================
import { k15Freeze, k15Heal, k15Off, k15Go, k15Scenes, k15Track } from '../oda15_kit.js';
import { PT } from '../honno_tera.js';
import { sfx } from '../audio.js';

export function wrap(def, K) {
  const p8 = def.p8;
  def.p8 = function (r) {
    const F = r.flags;
    if (k15Off(r) || F.saigoDone || (F.hp || 0) >= 8) return p8.call(this, r);
    if (F.k15stage === 'saigo') return;
    start(r, K, () => { k15Heal(r); F.saigoDone = true; F.k15on = false; F.k15stage = null; p8.call(this, r); });
  };
}

function start(rt, K, done) {
  const F = rt.flags;
  F.k15stage = 'saigo'; F.k15on = true;
  k15Freeze(rt, 'saigo');   // 前の段の時計を止める
  const stop = () => F.k15stage !== 'saigo' || F.ending;
  const hiroma = PT.hiroma, hikae = PT.hikae;
  rt.banner('上様と並んで', '小袖の信長が、自ら槍を取って広間に立つ');
  k15Scenes(rt, [
    [1, () => rt.say('織田信長', 'そこの者、わしの横に付け。一人も奥へ通すな', 4)],
  ], () => k15Go(rt, 'sg-hiroma', hiroma, 4, '広間で、上様の横に付け', '上様の横', () => {
    const w1 = K.akechi(rt, '広間へ踏み込む明智勢', [[hiroma.x + 10, hiroma.z + 2], [hiroma.x + 2, hiroma.z]], [K.uS(2), K.uA(3)], { entered: true, player: true, dmg: 0.5 });
    // 寄せ手の頭は安田作兵衛（蘭丸を討ったと伝わる明智の侍）
    const lead = w1?.units.find((u) => u.alive && u.type === 'samurai'); if (lead) { lead.name = '安田作兵衛'; lead.nameOpen = true; }
    rt.say('森蘭丸', '広間へ来るぞ！　上様をお守りせよ！', 3);
    k15Track(rt, w1, '広間の明智勢', { sec: 70, reward: '広間で上様と並んで戦った' }, () => k15Scenes(rt, [
      [1, () => { rt.banner('上様、肘に傷', '明智の槍が、信長の肘を裂いた'); sfx('hit', 0.6); }],
      [3, () => rt.say('織田信長', '……かすり傷じゃ。蘭丸、控えの間を固めよ', 4)],
      [4, () => rt.say('森蘭丸', '上様を奥へ！　最後の口は、我らが守る！', 3.5)],
    ], () => k15Go(rt, 'sg-hikae', hikae, 4, '控えの間の口で、最後の明智勢を受けよ', '控えの間の口', () => {
      const w2 = K.akechi(rt, '奥へ迫る明智勢', [[hiroma.x + 6, hiroma.z], [hikae.x + 2, hikae.z]], [K.uS(2), K.uA(4)], { entered: true, player: true, dmg: 0.5 });
      k15Track(rt, w2, '奥へ迫る明智勢', { sec: 70, reward: '控えの間の口で最後の明智勢を受けた' }, () => k15Scenes(rt, [
        [1, () => rt.say('小姓', '火が奥まで来た！', 3)],
        [3, () => {}],
      ], done, stop));
    }, { limit: 30 }), stop));
  }, { limit: 30 }), stop);
}
