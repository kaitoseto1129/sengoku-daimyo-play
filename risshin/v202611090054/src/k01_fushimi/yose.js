// ======================================================================
// 伏見城　寄せ手の厚みと城の崩れ（docs/toku15_plan_1108.md の 1）
//  ・寄せ手の厚みは戦の本体の陣・幟で示す。見せかけの兵は足さない
//  ・6〜9分：寄せ手の梯子が石垣に掛かる。三の丸の東の櫓が焼け落ち、城の内に火が回る
//  ・9〜12分：曲輪ごとに梯子が増え、本丸へ段々に退く（使番の知らせ）
//  ・終わり：「伏見城　落城」の後に「任務達成　徳川軍の時間を稼いだ」（落城＝負けではない）
// 本物の兵は足さない。呼び方：setup で install(rt, ctx)、update で ctx.tick(dt)、win で ctx.ending()
// ======================================================================
import { hashigo } from '../props.js';
import { sfx } from '../audio.js';
import { onceWhen } from '../k_toku_a/sonae.js';
import { allyGroup } from '../bhelp.js';

// 梯子：[曲輪の段（D.i がこれ以上で掛かる）, x, 足もとの z, 石垣の上の z]
const LADDERS = [
  [2, -19, 49.2, 45.6], [2, -11, 49.2, 45.6], [2, 12, 49.2, 45.6], [2, 20, 49.2, 45.6],
  [6, -17, 7.2, 3.6], [6, -10, 7.2, 3.6], [6, 11, 7.2, 3.6], [6, 18, 7.2, 3.6],
  [8, -11, -30.6, -34.4], [8, 11, -30.6, -34.4],
];

export function install(rt, ctx) {
  const F = rt.flags, W = rt.world, T = { ladders: [] };
  F.k01y = T;
  const di = () => F.dp?.i ?? -1;
  const ladder = (x, z0, z1) => {
    try {
      const foot = { x, y: W.heightAt(x, z0), z: z0 }, top = { x, y: Math.max(W.heightAt(x, z1 - 1.5), W.heightAt(x, z1)) + 1.1, z: z1 };
      const m = hashigo(foot, top); rt.scene.add(m); T.ladders.push(m);
    } catch (e) { /* 掛けられない所は飛ばす */ }
  };
  const ladders = (k) => { for (const [i, x, z0, z1] of LADDERS) if (i === k) ladder(x, z0, z1); };

  // 家康の出陣（generals_toyo_toku 1：家康は戦前の別れに必ず）：大手の曲輪で元忠と別れ、旗本と大手門から東へ発つ。
  //   別れの台詞（戦の setup）の間は主人公の脇に立ち、言い終えると大手門を出て、城の外で消える（会津へ）
  try {
    const TK = { flag: 'tokugawa' };
    T.ieyasu = allyGroup(rt, { faction: 'tokugawa', name: '徳川家康の旗本', anchor: { x: -9, z: 74 }, facing: Math.PI / 2, width: 5, aggro: 0, order: 'hold', fixed: true, noRout: true, fullStrength: true, peaceful: true },
      [{ type: 'busho', n: 1, o: { ...TK, name: '徳川家康', invuln: true, horse: true } }, { type: 'samurai', n: 7, o: { ...TK, invuln: true } }]);
    T.ieyasu.civ = true; for (const u of T.ieyasu.units) u.civ = true;   // 数（城方千八百の割合）に入れない・狙わせない
    rt.after(11.5, () => {
      const g = T.ieyasu; if (!g) return;
      g.order = 'move'; g.dest = { x: 0, z: 96 }; g.speed = 3.2; g.keepMoveOrder = true;
      g.onArrive = (q) => { q.order = 'move'; q.dest = { x: 90, z: 130 }; q.onArrive = null; };
    });
    rt.after(40, () => { for (const u of (T.ieyasu?.units || []).slice()) if (u.alive) rt.army.despawn(u); });
  } catch (e) { T.ieyasu = null; }

  T.tick = onceWhen(rt, [
    // 三の丸の虎口の段：石垣に梯子が掛かる
    [() => di() >= 2, () => { ladders(2); rt.after(6, () => rt.say('鳥居の侍', '梯子じゃ！　石垣の上から突き落とせ', 3)); }],
    // 小早川・島津・毛利が着く：西・東の奥にも旗が並ぶ
    [() => di() >= 3, () => { rt.after(1.5, () => rt.say('使番', '西に小早川、東に島津と毛利の旗！　城の三方が埋まりました', 3.4)); }],
    // 二の丸へ回る段：三の丸の東の櫓が火矢で焼け落ちる（城の内の火の始まり）
    [() => di() >= 5, () => {
      if (W.addFire) for (const [x, z, s, h] of [[24, 42, 2.8, 6], [22, 38, 2.2, 3], [14, 32, 1.6, 2]]) W.addFire(x, z, { size: s, h, blackSmoke: h > 2 });
      if (W.addSmokeColumn) W.addSmokeColumn(24, W.heightAt(24, 42) + 10, 42, { size: 3, black: true });
      sfx('thunder', 0.9);
      rt.after(0.6, () => rt.say('使番', '三の丸の東の櫓が焼け落ちた！　火が城の内へ回るぞ', 3.4));
    }],
    // 二の丸の段：二の丸の石垣にも梯子
    [() => di() >= 6, () => ladders(6)],
    // 本丸の段：本丸の口の脇にも梯子。本丸の外はもう寄せ手のもの
    [() => di() >= 8, () => { ladders(8); rt.after(4, () => rt.say('使番', '二の丸、乗っ取られました！　残るは本丸のみ', 3.2)); }],
  ]);

  // 落城の締め：炎上 → 自刃 → 「伏見城　落城」 → 「任務達成　徳川軍の時間を稼いだ」。勝鬨は上げない
  T.ending = () => {
    rt.after(20, () => rt.banner('血天井', '本丸で果てた者の血に染まる床板は、のちに京の寺々の天井となった'));
    rt.after(24.5, () => { sfx('taiko', 0.5); rt.banner('伏見城　落城', '慶長五年八月一日'); });
    rt.after(29, () => rt.banner('任務達成', '徳川軍の時間を稼いだ'));
  };
  ctx.tick = (dt) => T.tick(dt);
  ctx.ending = () => T.ending();
  return ctx;
}
