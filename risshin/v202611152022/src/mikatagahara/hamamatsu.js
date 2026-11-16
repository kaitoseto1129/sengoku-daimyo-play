// ======================================================================
// 三方ヶ原の戦い　終幕「浜松城の門」（docs/mikatagahara_spec_1109.md の一番印象に残す3つの三）
// 家康が入り、主人公も入り、門が閉まる。一瞬遅れて武田の騎馬が門の前へ来て、外で槍と怒号。でも門は閉まっている。
// 城の中は負傷者と泥と少なくなった旗。誰も勝鬨を上げない。音は急に小さく。本人の視点と操作を保ったまま進む。
// ======================================================================
import { sfx } from '../audio.js';

const DUR = 26;

// ctx：{ HAMA, gone }
export function install(rt, ctx) {
  const F = rt.flags, H = ctx.HAMA;
  const alive = () => !rt.over;
  // 11/15 クラウドさ（K340・act bot 734秒 段 end）：待つ備・前を埋める備の武田の「新手」が門の前で攻めの号令のまま二十秒止まった（11回）。
  //   追手と同じく、門の前で足を止めてから台地へ引き揚げさせる
  const foes = () => (F.chase || []).concat((rt.army.groups || []).filter((g) => g && g.team === 1 && (g.isReserve || g.name === '新手') && !(F.chase || []).includes(g)));
  for (const g of foes()) if (!ctx.gone(g) && !(F.chase || []).includes(g)) { g.stay = false; g.order = 'hold'; g.aggro = 0; g.seekRange = 0; g.morale = Math.min(g.morale ?? 30, 30); }
  // K306（本の見開き 11/14「夜、かがり火、開け放った城門」）：家康は門を閉めさせず、篝火を焚いて逃げ戻る兵を迎えた（『三河後風土記』ほかの伝え。
  //   追手が開いた門を見て伏兵を疑い引き揚げた「空城の計」は後の世の伝えで、確かな史料には無い＝GAME_C の見せ場として遊びの復元）
  rt.say('徳川家康', '門を閉めるな。篝火を焚け。戻る者を一人でも多く入れよ', 3.2);
  rt.after(3.4, () => { if (alive()) rt.say('門番', '……門は開けたままにござるか！', 2.4); });
  // 一瞬遅れて、武田の騎馬が門の前へ。外で槍と怒号。
  rt.after(3.2, () => {
    if (!alive()) return;
    for (const g of foes()) if (!ctx.gone(g)) {
      const c = g.center();
      g.order = 'path'; g.retreatOnly = true; g.speed = 4.4; g.seekRange = 0; g.aggro = 0;
      g.path = [[c.x * 0.5, H.z - 20]]; g.pathIdx = 0; g.onArrive = (q) => { q.order = 'hold'; q.facing = 0; };
    }
    rt.army.play('gallop', { x: H.x, y: 0, z: H.z - 20 }, 1.6);
  });
  rt.after(5.5, () => { if (alive()) { rt.army.playFar('eshout', { x: H.x, y: 0, z: H.z - 18 }, 1); rt.say('足軽', '門の外に武田の騎馬が……！　門は開いたままじゃ！', 3); } });
  rt.after(8.5, () => { if (alive()) rt.say('武田の騎馬武者', '門が開いて篝火が……。伏せ勢があるやもしれぬ。寄るな！', 3); });
  // 篝火の門の前で騎馬が足を止め、門の内の槍と睨み合う（門は最後まで開いたまま）
  rt.after(9, () => { if (alive()) rt.army.playFar('eshout', { x: H.x + 4, y: 0, z: H.z - 20 }, 0.7); });
  // 城の中：誰も勝鬨を上げない
  rt.after(11, () => { if (alive()) rt.say('石川数正', '……殿は御無事じゃ。手負いの者を奥へ運べ', 3); });
  rt.after(14, () => {
    if (!alive()) return;
    // 追手は門を破らず、台地へ引き揚げる
    for (const g of foes()) if (!ctx.gone(g)) {
      const c = g.center();
      g.order = 'path'; g.retreatOnly = true; g.speed = 3.4;
      g.path = [[c.x, c.z - 30], [c.x, 60]]; g.pathIdx = 0; g.onArrive = (q) => { q.order = 'hold'; };
    }
    if (F.pursuit) { try { F.pursuit.visible = true; F.pursuit.moveTo(8, 60, 30); } catch (e) { /* 遠景が無くても進む */ } }
  });
  rt.after(14.5, () => { if (alive()) rt.say('足軽', '……生きて、戻れたがや', 2.4); });
  rt.after(17, () => { if (alive()) rt.say('徳川家康', '……この負け、生涯忘れまいぞ', 3.2); });
  rt.after(20.5, () => { if (alive()) rt.say('語り', '三方ヶ原は武田の大勝に終わった。平手汎秀・夏目吉信らが討ち死にし、家康は浜松城へ生きて戻った', 5); });
  rt.after(DUR, () => {
    if (!rt.over) rt.finish({ scriptedEnd: true,
      ...(rt.tracker.main === false ? { failureReason: '家康を浜松城へ帰せなかった' } : {}),
    }, 0.2);
  });
}
