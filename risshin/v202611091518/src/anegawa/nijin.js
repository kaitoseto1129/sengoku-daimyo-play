// ======================================================================
// 姉川の戦い　中の段「段崩し」（3〜9分。docs/oda15_plan_1108.md の 9）
// - 磯野員昌の渡河（anegawa.charge）から始まる。浅井の先鋒が強く押し、坂井・池田の段が下がる（3〜6分）。
// - 磯野が段を次々に破って本陣へ迫る（6〜9分。姉川で一番名高い場面）。浅井の新手が川向こうから続けて渡り、兵が空にならない。
// - 徳川の別手（榊原）と美濃三人衆の横槍は、この段の終わり（九分ごろ）まで出さない。敵の命は増やさない。
// 本の筋書き（b_anegawa.js）の時計を F.aneExtra 秒だけ延ばし、横槍の早さの下限 F.aneYokoAt・徳川の動きの下限 F.aneTkAt を置く。
// ======================================================================
import { sfx } from '../audio.js';

export const EXTRA = 290;   // 本の押し合いの時計（下限・見切り）をこれだけ延ばす
const TK_AT = 335;          // 渡河からこの秒で西の徳川の別手が動く
const YOKO_AT = 390;        // 渡河からこの秒より前には稲葉の横槍は駆け出さない（九分半ごろ）
// 浅井の新手（渡河からの秒・名・兵）。川向こうの控えから同じ瀬を渡り、前の塊に続く
const WAVES = [
  [140, '浅井の新手・浅井政澄の手', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }]],
  [215, '浅井の新手・阿閉の手', [{ type: 'samurai', n: 2 }, { type: 'cavalry', n: 2 }, { type: 'ashigaru', n: 12 }]],
  [280, '浅井の新手・新庄の手', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }, { type: 'bow', n: 3 }]],
  [345, '浅井の新手・長政の旗本', [{ type: 'samurai', n: 3 }, { type: 'cavalry', n: 2 }, { type: 'ashigaru', n: 10 }]],
];

// ctx：{ enemyGroup, dress, AZAI, AZAI_FLEE, mori:{x}, tokugawa() }
export function install(rt, ctx) {
  const F = rt.flags, t0 = rt.t;
  if (rt.G.lord) return;
  F.aneExtra = EXTRA; F.aneTkAt = t0 + TK_AT; F.aneYokoAt = t0 + YOKO_AT;
  const live = () => F.step === 1 && !F.ending && !rt.over && rt.player?.u?.alive;
  WAVES.forEach(([at, name, list], i) => {
    const count = list.reduce((n, q) => n + q.n, 0);
    const deploy = () => {
      if (!live() || F.inabaT) return;
      // 上限で空の隊や数人だけを出して、新手を出し終えた事にしない。
      if (!ctx.canDeploy(count)) { rt.after(1, deploy); return; }
      const g = ctx.enemyGroup(rt, { faction: 'azai', name, anchor: { x: 14, z: -40 }, facing: 0, fleeDir: ctx.AZAI_FLEE, aggro: 12, width: 14, morale: 90, speed: 3.4 },
        ctx.dress(list, ctx.AZAI));
      if (!g || !g.count) return;
      g.dmgMult = 1;
      // 後の二手は段を抜けて信長の本陣の前まで押し込む（狙われる本陣の緊張。本陣の前の大軍の押し合い hqClash も動く）
      g.order = 'path'; g.path = i < 2 ? [[10, -14], [8, 14], [ctx.mori.x + 18, F.holdAt.z - 6]] :
        [[10, -14], [8, 14], [ctx.mori.x + 18, ctx.mori.z], [ctx.HQ.x + 8, ctx.HQ.z - 34]]; g.pathIdx = 0;
      // 11/9 二巡：本陣の前まで来た後の二手は、前の旗本と斬り合う（四十歩の輪で本陣の内へなだれ込み、手当て中の本人の知らぬ間に負けになった）
      g.onArrive = (q) => { q.order = 'attack'; q.seekRange = i < 2 ? 40 : 18; };
      F.waves.push(g);
      try { sfx('taiko', 0.9); } catch (e) { /* 音が無くても進む */ }
      rt.army.play('eshout', { x: 10, z: -20 }, 1.4);
      F.clash?.[1]?.push?.('B', 0.15);
      if (i === 0) rt.say('組頭', '川向こうから新手じゃ！　浅井はまだ渡って来る！', 3.6);
      if (i >= 2) rt.after(4, () => live() && rt.say('使番', '浅井の新手が段を抜けて、本陣へ向かう！　本陣の前で止めよ！', 3.6));
    };
    rt.after(at, deploy);
  });
  const say = (at, who, line, d = 3.6) => rt.after(at, () => { if (live() && !F.inabaT) rt.say(who, line, d); });
  say(95, '足軽', '前の段が押されておる……坂井殿の旗が下がるぞ！');
  say(190, '森可成', '磯野め、段を次々に破りおる。ここが破れれば本陣じゃ。穴を埋めよ！', 4);
  say(300, '足軽', '後ろの段まで押されておる……磯野の旗が止まらぬ！');
  say(318, '使番', '本陣より！　旗本も槍を取った。森の備は退かず、浅井の横腹を突けとの仰せ！', 4);
  rt.after(TK_AT, () => { if (live()) ctx.tokugawa(); });
  say(YOKO_AT - 4, '森可成', '東に稲葉殿の旗！　横から突く備えじゃ、もう少し支えよ！', 3.4);
}
