// ======================================================================
// 賤ヶ岳の戦い　戦況の転換（夜の美濃大返し）・七本槍の見せ場・戦の後の余韻
//   夜：使番「秀吉様、戻られます！」。北国街道に羽柴の旗の長い列（軽い作り）が木ノ本へ下りて来る。
//       柴田の使番が盛政へ「すぐ退け」の命を伝えるが、盛政は大岩山に残る（向こうの声が聞こえる）。
//   夜明け：先懸けの衆（七本槍）が一人ずつ名乗って槍を入れる（台詞と鬨の声）。
//   終わり：前田が退き、勝家「退け」。見出し「賤ヶ岳　羽柴軍勝利」。北ノ庄の煙の知らせ。
// ======================================================================
import { flagTexture } from '../textures.js';
import { enemyGroup } from '../bhelp.js';

function say(rt, who, s, t, sec = 3) {
  const phase = rt.flags.phase, ending = !!rt.flags.ending;
  // 前の段の名乗りで、追撃や勝利後の知らせを遮らない。
  rt.after(t, () => { if (!rt.over && rt.flags.phase === phase && !!rt.flags.ending === ending) rt.say(who, s, sec); });
}

export function nightTurn(rt, ctx) {
  const F = rt.flags, W = rt.world;
  // 北国街道を下る羽柴の大軍（松明の列の後ろの本隊。軽い作り）
  try {
    const A = (x, z, seed, count) => W.addDistantArmy({ x, z, w: 14, d: 22, count, facing: Math.PI * 0.86, armor: 0x24201c, flagTex: flagTexture('toyotomi'), mon: 'toyotomi', seed, team: 0, kind: 'mixed', host: false, farFill: true });
    F.retG = [A(206, 156, 15841, 320), A(178, 70, 15842, 300), A(150, -10, 15843, 280)];
    rt.after(2, () => { try { F.retG[0]?.moveTo(214, 214, 80); F.retG[1]?.moveTo(204, 150, 90); F.retG[2]?.moveTo(176, 66, 90); } catch (e) { /* 遠景 */ } });
  } catch (e) { F.retG = []; }
  say(rt, '使番', '秀吉様、戻られます！　北国街道に羽柴の旗、数えきれませぬ！', 9, 3.4);
  // 盛政は退けの命に従わない（湖の向こうの柴田の陣の声）
  say(rt, '柴田の使番', '玄蕃殿、勝家様より「すぐに退け」との仰せにござる！', 15, 3.2);
  say(rt, '佐久間盛政', '退かぬ。猿が戻る前に、賤ヶ岳を揉み潰してくれる', 19, 3.2);
  say(rt, '桑山重晴', '玄蕃め、居座りおった。夜が明ければ逃げ場はないぞ', 23.5, 3);
}

// 七本槍：夜明けの切通しと岸の道で一人ずつ名乗る（場所の札や説明の字は出さない。声と鬨だけ）
export function sevenSpears(rt, ctx, at) {
  const F = rt.flags;
  if (at === 'cut') {
    say(rt, '福島正則', '一番槍、福島市松！', 12, 2.4);
    rt.after(12, () => { if (!rt.over && !F.ending && F.phase === 3) rt.army.play('toki', { ...ctx.KATSUMASA }, 1.0); });
    say(rt, '加藤清正', '虎之助も続くぞ！　柴田の殿を突き崩せ！', 26, 2.6);
    say(rt, '脇坂安治', '甚内、ここにあり！', 40, 2.2);
  } else if (at === 'shore') {
    say(rt, '片桐且元', '助作も遅れはとらぬ！', 6, 2.4);
    say(rt, '加藤嘉明', '岸の道を塞げ！　玄蕃の退き口を断て！', 18, 2.8);
    say(rt, '平野長泰', '権平、一番首ぞ！', 34, 2.2);
    say(rt, '糟屋武則', '助右衛門も槍を入れたぞ！', 48, 2.4);
    rt.after(18, () => { if (!F.ending) rt.army.play('toki', { x: -126, z: 128 }, 1.1); });
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

// 夜の段「東の肩の道で秀吉の先手を迎える」：松明の道の上の口（JOIN）へ下り、上って来る先手を迎える。
//   着くと、居座った盛政の夜討ちの小勢が北の藪から先手の列へ斬りかかる。払えば本陣で秀吉を迎える段へ。
// 敗走した夜討ちの兵を、まだ道を塞いでいる人数に含めない。
export function nightRaidLeft(g) {
  return !g || g.routed ? 0 : g.units.reduce((n, u) => n + (u.alive && !u.gone && !u.fleeing ? 1 : 0), 0);
}

export function tickMeet(rt, ctx) {
  const F = rt.flags, P = rt.player.u.pos, st = rt.t - F.pt;
  const near = Math.hypot(P.x - ctx.JOIN.x, P.z - ctx.JOIN.z) < 16;
  if (!F.yochi && ((near && st > 12) || st > 60)) {
    F.yochi = rt.t;
    F.yochiG = enemyGroup(rt, { ...ctx.SAKUMA, name: '佐久間の夜討ち', anchor: { x: ctx.JOIN.x + 4, z: ctx.JOIN.z - 26 }, facing: 0.2, fleeDir: { x: 0, z: -1 }, width: 5, morale: 80, dmgMult: 0.4,
      order: 'attack', aggro: 22, seekRange: 34 }, ctx.foeList(12, { flag: ctx.SAKUMA.flag }));
    F.yochiG.kind4 = 'raid'; F.groups.push(F.yochiG);
    rt.army.play('toki', { x: ctx.JOIN.x, z: ctx.JOIN.z - 24 }, 1.0);
    rt.say('羽柴の先手', '藪から夜討ちじゃ！　松明を消すな、槍を揃えよ！', 3);
  }
  // 迎える場所に着き、夜討ちを退けるまで達成しない。離れた砦で時を待つだけでは進めない。
  if (near && F.yochi && rt.t - F.yochi > 30 && nightRaidLeft(F.yochiG) <= 2) {
    if (ctx.live(F.yochiG)) {
      const g = F.yochiG;
      g.order = 'retreat'; g.focus = null; g.onArrive = null; g.path = null;
      g.aggro = 0; g.seekRange = 0;
      g.dest = { x: ctx.JOIN.x + 20, z: ctx.JOIN.z - 80 }; g.kind4 = 'gone';
      // 東の口から退いた寄せ手と同じく、遠くへ退き切った兵だけを片付ける。
      // 夜討ちの残兵を終戦まで残し、本陣へ戻る味方の足を止めない。
      g.nightWithdraw = true;
    }
    rt.say('羽柴の先手', '退いたか。筑前様は砦の本陣に入られた。参られよ', 3);
    ctx.next();
  }
}
