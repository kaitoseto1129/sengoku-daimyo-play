// ======================================================================
// 賤ヶ岳の戦い　戦況の転換（秀吉の大返し）・七本槍の見せ場・戦の後の余韻（11/10 改訂 docs/shizugatake_spec_1109.md）
//   大返し：北国街道に羽柴の旗の長い列（軽い作り）と土煙。柴田の使番が盛政へ「退け」を伝えるが、盛政は大岩山に残る。
//   反攻：先懸けの衆（七本槍）が大岩山の奪還と、北の佐久間・柴田の備へ一人ずつ名乗って槍を入れる（台詞と鬨の声）。
//   終わり：勝家「退け」。見出し「賤ヶ岳　羽柴軍勝利」。北ノ庄の煙の知らせ。
// ======================================================================
import { flagTexture } from '../textures.js';

function say(rt, who, s, t, sec = 3) {
  const phase = rt.flags.phase, ending = !!rt.flags.ending;
  // 前の段の名乗りで、追撃や勝利後の知らせを遮らない。
  rt.after(t, () => { if (!rt.over && rt.flags.phase === phase && !!rt.flags.ending === ending) rt.say(who, s, sec); });
}

export function returnTurn(rt, ctx) {
  const F = rt.flags, W = rt.world;
  // 北国街道を下る羽柴の大軍（大垣から駆け戻った本隊。軽い作り）
  try {
    const A = (x, z, seed, count) => W.addDistantArmy({ x, z, w: 14, d: 22, count, facing: Math.PI * 0.86, armor: 0x24201c, flagTex: flagTexture('toyotomi'), mon: 'toyotomi', seed, team: 0, kind: 'mixed', host: false, farFill: true });
    F.retG = [A(206, 156, 15841, 320), A(178, 70, 15842, 300), A(150, -10, 15843, 280)];
    rt.after(2, () => { try { F.retG[0]?.moveTo(214, 214, 80); F.retG[1]?.moveTo(204, 150, 90); F.retG[2]?.moveTo(176, 66, 90); } catch (e) { /* 遠景 */ } });
  } catch (e) { F.retG = []; }
  // 盛政は退けの命に従わない（湖の向こうの柴田の陣の声）
  say(rt, '柴田の使番', '玄蕃殿、勝家様より「すぐに退け」との仰せにござる！', 15, 3.2);
  say(rt, '佐久間盛政', '退かぬ。猿が戻る前に、賤ヶ岳を揉み潰してくれる', 19, 3.2);
  say(rt, '桑山重晴', '玄蕃め、大岩山に居座りおった。もう逃げ場はないぞ', 23.5, 3);
}

// 七本槍：大岩山の奪還と、北の備への押し出しで一人ずつ名乗る（場所の札や説明の字は出さない。声と鬨だけ）
export function sevenSpears(rt, ctx, at) {
  const F = rt.flags;
  if (at === 'oiwa') {
    say(rt, '福島正則', '一番槍、福島市松！', 12, 2.4);
    rt.after(12, () => { if (!rt.over && !F.ending && F.phase === 3) rt.army.play('toki', { ...ctx.OI }, 1.0); });
    say(rt, '加藤清正', '虎之助も続くぞ！　破れた柵から押し込め！', 26, 2.6);
    say(rt, '脇坂安治', '甚内、ここにあり！', 40, 2.2);
  } else if (at === 'push') {
    say(rt, '片桐且元', '助作も遅れはとらぬ！', 6, 2.4);
    say(rt, '加藤嘉明', '柴田の先手を突き崩せ！', 18, 2.8);
    say(rt, '平野長泰', '権平、一番首ぞ！', 34, 2.2);
    say(rt, '糟屋武則', '助右衛門も槍を入れたぞ！', 48, 2.4);
  }
}

// 勝った後の余韻（前田の退き・勝家の退き・北ノ庄の煙）。終わるまでの秒を返す
export function epilogue(rt, ctx) {
  const L = [
    ['柴田勝家', '玄蕃も又左も……。これまでか。北ノ庄へ退け', 0.4],
    ['使番', '玄蕃は山へ落ちた由。前田勢は府中へ退き申した', 4.2],
    ['羽柴秀吉', '先懸けの衆、ようやった。今日の槍、末代まで語られようぞ', 8.2],
    ['羽柴秀吉', '先懸けの衆に、もう一人おったな。今日より一手を預ける。励め', 12.4],
    ['使番', '後の知らせ：玄蕃は捕縛。北ノ庄城は炎上し、勝家殿とお市様はご自害', 17.2],
    ['黒田官兵衛', '柴田は滅んだ。残るは……徳川と、信雄様か', 21.6],
  ];
  for (const [who, s, t] of L) say(rt, who, s, t, 3.2);
  rt.after(2.6, () => { if (!rt.over) rt.banner('賤ヶ岳　羽柴軍勝利', ''); });
  return 26;
}
