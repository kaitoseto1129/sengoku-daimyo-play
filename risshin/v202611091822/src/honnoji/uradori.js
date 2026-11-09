// ======================================================================
// 本能寺の変　裏通りを落ちる（14分・docs/oda15_plan_1108.md 32「信長最期・本能寺炎上」の後、二条へ移る前）
// 裏門を出た西の通りで：振り返ると本能寺が燃え落ちる（物見の代わりに必ず見せる）→ 通りを見張る明智の小勢を斬り抜ける →
// 町の者が北東の二条へ逃げよと教える。終わると元の「裏通りを抜け、二条へ」（toNijo）へ。
// 入れ方：b_honnoji.js で wrap(honnoji, K) を一度。def.toNijo を包む。
// ======================================================================
import { k15Freeze, k15Heal, k15Off, k15Go, k15Scenes, k15Track } from '../oda15_kit.js';
import { PT } from '../honno_tera.js';
import { evPerson } from '../b_ev6.js';
import { sfx } from '../audio.js';

export function wrap(def, K) {
  const toNijo = def.toNijo;
  def.toNijo = function (r) {
    const F = r.flags;
    if (k15Off(r) || F.uradoriDone || F.nTransition || (F.step || 0) >= 3) return toNijo.call(this, r);
    if (F.k15stage === 'uradori') return;
    start(r, K, () => { k15Heal(r); F.uradoriDone = true; F.k15on = false; F.k15stage = null; toNijo.call(this, r); fukutomi(r); });
  };
}

// 二条御所の守り手（docs/generals_oda_1108.md 32：福富秀勝）。信忠の手の脇に旗と供で構える
function fukutomi(rt) {
  const F = rt.flags;
  const t = () => { if (rt.over || F.ending) return; if (!F.tada) { rt.after(1, t, true); return; }
    const a = F.tada.anchor; evPerson(rt, 0, '福富秀勝', { x: a.x + 4, z: a.z + 6 }, -Math.PI / 2, { guard: 2, ash: 3, aggro: 6, mortal: true }); };
  rt.after(3, t, true);
}

function start(rt, K, done) {
  const F = rt.flags;
  F.k15stage = 'uradori'; F.k15on = true;
  k15Freeze(rt, 'uradori');   // 前の段の時計を止める
  const stop = () => F.k15stage !== 'uradori' || F.ending;
  const out = PT.uraOut, street = { x: out.x, z: out.z - 18 };
  k15Go(rt, 'ur-out', out, 5, '裏門を出て、西の通りへ', '裏門の外', () => {
    rt.banner('本能寺、燃え落ちる', '御殿の屋根が崩れ、火の粉が空へ舞う');
    sfx('crash', 0.6);
    k15Scenes(rt, [
      [3.5, () => rt.say('小姓', '上様……', 2.5)],
      [3, () => rt.say('小姓', '振り返るな。上様のお言葉じゃ。生きて、信忠様に伝えよ', 4)],
    ], () => k15Go(rt, 'ur-street', street, 5, '西の通りを北へ走れ', '西の通り', () => {
      const g = K.akechi(rt, '通りを見張る明智勢', [[street.x, street.z - 10], [street.x, street.z - 2]], [K.uS(1), K.uA(2)], { entered: true, player: true, dmg: 0.5 });
      rt.say('明智の侍', '寺から落ちる者じゃ！　逃がすな！', 3);
      k15Track(rt, g, '通りの明智勢', { sec: 50, reward: '西の通りで明智の見張りを斬り抜けた' }, () => k15Scenes(rt, [
        [1.5, () => rt.say('町の者', 'こっちじゃ！　二条の御所へは、この辻を北東へ', 4)],
        [4.5, () => {}],
      ], done, stop));
    }, { limit: 30 }), stop);
  }, { limit: 30 });
}
