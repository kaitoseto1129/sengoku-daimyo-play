// ======================================================================
// 賤ヶ岳の戦い　①の段「砦の陣立て」（0〜3分）と②の段「大岩山の救援」（3〜6分）
//   ①：賤ヶ岳の砦から東の物見へ下り、余呉湖のまわりの砦の並び（羽柴方・柴田方）と遠くの備を見る。秀吉は大垣。
//       使番が別の砦の様子を知らせる。物見に着くと物見の者が砦を指して説く。時が来ると大岩山に「敵襲！」の法螺。
//   ②：中川清秀の大岩山へ加勢に下る。下る間に大岩山で佐久間勢と中川勢が組み合う（軽い合戦）。
//       着く前に大岩山が落ちる（間に合わない）：火の手・中川討死の知らせ・落ち武者・追手。追手を討てば③の砦の口の守りへ。
// 大軍は軽い作り（addDistantArmy・addClash）。本物の兵は追手と物見の組だけ。
// ======================================================================
import { flagTexture } from '../textures.js';
import { clash } from '../b_sekigahara.js';
import { enemyGroup, allyGroup } from '../bhelp.js';

export const RELIEF = { x: 18, z: 226 };   // ②の行き先：大岩山へ下る坂の途中（余呉湖の南東の岸の上）

function say(rt, who, s, t, sec = 3) {
  const phase = rt.flags.phase;
  rt.after(t, () => { if (!rt.flags.ending && rt.flags.phase === phase) rt.say(who, s, sec); });
}

// 余呉湖のまわりの砦の備（軽い作り）。砦の場所は戦の定義から
export function fortArmies(rt, P) {
  const W = rt.world, F = rt.flags, Y = (F.sfar = {});
  if (!W?.addDistantArmy) return Y;
  const A = (p, flag, count, facing, seed, team, w = 18, d = 8) => {
    try { return W.addDistantArmy({ x: p.x, z: p.z, w, d, count, facing, armor: 0x24201c, flagTex: flagTexture(flag), mon: flag, seed, team, kind: 'mixed', host: false, farFill: true }); } catch (e) { return null; }
  };
  // 砦の備（羽柴・柴田の各将の旗と兵）は軍勢の厚みの表（depth.js）が描く
  // 大岩山の取り合い（中川勢と佐久間勢。②で組み合い、中川勢が崩れる）
  try {
    Y.oiwa = clash(rt, {
      x: P.OIWA.x + 4, z: P.OIWA.z - 18, facing: 0, w: 34, gap0: 18, seed: 15838, noRout: false, noWake: true,
      A: { flag: 'toyotomi', armor: 0x24201c, count: 120, flagRate: 0.4, guns: true },
      B: { flag: 'sakuma', armor: 0x2a2420, count: 200, flagRate: 0.5, guns: true },
    });
  } catch (e) { Y.oiwa = null; }
  return Y;
}

// ①：東の物見で砦の並びを見る
export function startOpen(rt, ctx) {
  const F = rt.flags;
  F.phase = 0.5; F.pt = rt.t;
  rt.obj('s0', ctx.TEXT[0], 'main');
  say(rt, '桑山重晴', '筑前様は大垣。柴田と睨み合うて一月、この砦を預かる我らが要じゃ', 0.6, 3.4);
  say(rt, '桑山重晴', '東の物見へ下り、湖のまわりの砦を見て参れ', 4.4);
  say(rt, '使番', '田上山の秀長様より。北国街道、柴田の動きなしとの由', 22, 3.2);
  say(rt, '使番', '堂木山・神明山、柵の普請を急いでおりまする', 46, 3.2);
  say(rt, '使番', '大垣の筑前様より。岐阜の信孝様、また兵を挙げられた由', 62, 3.2);
}
export function tickOpen(rt, dt, ctx) {
  const F = rt.flags, P = rt.player.u.pos, st = rt.t - F.pt;
  if (!F.sawForts && Math.hypot(P.x - ctx.LOOK.x, P.z - ctx.LOOK.z) < 12) {
    F.sawForts = true; F.sawT = rt.t;
    rt.say('物見', '湖の北、行市山に佐久間玄蕃、別所山・茂山に前田の梅鉢', 3.2);
    rt.after(3.6, () => rt.say('物見', 'こなた南は大岩山に中川殿、岩崎山に高山殿。湖を挟んで砦が睨み合うておりまする', 3.6));
    rt.after(8, () => rt.say('桑山重晴', '大岩山は湖の向こうに突き出ておる。破られれば、ここが矢面じゃ', 3.2));
    rt.award((t) => t.side.push('東の物見で砦の並びを見届けた'), '砦の並びを見届けた');
  }
  // 砦の並びを見届けてから敵襲へ進む。未到着を時間だけで達成扱いにしない。
  if (!F.raid && F.sawForts && rt.t - F.sawT > 14 && st > 70) {
    F.raid = true;
    rt.army.play('horagai', { x: ctx.OIWA.x, z: ctx.OIWA.z - 30 }, 1.3);
    rt.army.play('toki', { x: ctx.OIWA.x, z: ctx.OIWA.z - 20 }, 1.2);
    rt.say('物見', '敵襲！　大岩山に佐久間の旗！　湖の西から回り込んで参った！', 3.4);
    try { F.sfar?.oiwa?.go?.(); } catch (e) { /* 遠景 */ }
    rt.after(3.8, () => ctx.next());
  }
}

// ②：大岩山へ加勢に下る。着く前に大岩山が落ちる
export function startRelief(rt, ctx) {
  const F = rt.flags;
  F.phase = 1; F.pt = rt.t; F.k0 = F.kills;
  F.reachedRelief = false;
  rt.objDone('s0');
  rt.obj('s1', ctx.TEXT[1], 'main');
  // 盛政の本隊は北から大岩山へ寄せる
  if (ctx.live(F.saku)) { F.saku.order = 'move'; F.saku.dest = { x: ctx.OIWA.x - 8, z: ctx.OIWA.z + 14 }; F.saku.speed = 3; F.saku.onArrive = (q) => { q.order = 'hold'; }; }
  if (ctx.live(F.mori)) { F.mori.order = 'move'; F.mori.dest = { x: ctx.OIWA.x - 2, z: ctx.OIWA.z + 22 }; F.mori.speed = 3; F.mori.onArrive = (q) => { q.order = 'hold'; }; }
  // 桑山の手から一組が主人公と一緒に下る。到着後も遠い敵へ打って出ず、救援の坂で追手を受ける。
  F.scoutG = allyGroup(rt, { name: '桑山の物見の組', fullStrength: true, anchor: { x: ctx.LOOK.x - 2, z: ctx.LOOK.z + 4 }, facing: 2.4, width: 4, aggro: 14, seekRange: 26, order: 'move', dest: { x: RELIEF.x - 1, z: RELIEF.z + 3 }, speed: 3.8, noAI: true, noRout: true },
    [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 2 }]);
  F.scoutG.onArrive = (q) => { q.order = 'hold'; q.aggro = 12; q.seekRange = 14; };
  say(rt, '桑山重晴', '中川殿を見殺しにはできぬ。加勢に下れ！', 0.8);
  say(rt, '中川清秀', '退くな！　大岩山は中川が預かった砦ぞ！', 14, 3);
  say(rt, '使番', '岩崎山の高山殿、支えきれず退かれまする！', 34, 3.2);
}
export function tickRelief(rt, dt, ctx) {
  const F = rt.flags, P = rt.player.u.pos, st = rt.t - F.pt;
  if (Math.hypot(P.x - RELIEF.x, P.z - RELIEF.z) < 16) F.reachedRelief = true;
  // 大岩山が落ちる：主人公が坂を下りきる前に（間に合わない）
  if (!F.oiwaFell && (st > 70 || (st > 42 && Math.hypot(P.x - RELIEF.x, P.z - RELIEF.z) < 30))) {
    F.oiwaFell = true;
    ctx.burn(rt);
    // 鬼玄蕃の名乗りを救援の坂から見届けられる距離へ。旗本と進み、斬り合いには入らない。
    if (ctx.live(F.mori)) {
      F.mori.order = 'move'; F.mori.dest = { x: RELIEF.x + 20, z: RELIEF.z - 20 }; F.mori.speed = 4;
      F.mori.onArrive = (q) => { q.order = 'hold'; };
    }
    try { F.sfar?.oiwa?.rout?.('A', { from: 0, hideAfter: 30, minFight: 1 }); } catch (e) { /* 遠景 */ }
    rt.army.play('toki', { x: ctx.OIWA.x, z: ctx.OIWA.z }, 1.4);
    rt.say('使番', '大岩山、落ちました！　中川清秀殿、お討死！', 3.4);
    rt.after(3.8, () => rt.say('桑山重晴', '……間に合わなんだか。落ちて来る中川の兵を拾え！', 3));
    // 中川の落ち武者が坂を上がって来る
    F.nakaG = allyGroup(rt, { name: '中川の落ち武者', fullStrength: true, anchor: { x: RELIEF.x + 10, z: RELIEF.z - 8 }, facing: -2.4, width: 3, aggro: 0, order: 'move', dest: { ...ctx.MOUTH }, speed: 2.0, noRout: true },
      [{ type: 'samurai', n: 1, o: { flag: null } }, { type: 'ashigaru', n: 7, o: { flag: null } }]);
    for (const u of F.nakaG.units) u.hp = Math.min(u.hp, u.maxHp * 0.5);
    // 落ち武者を追う佐久間の追手（坂の途中で主人公と当たる）
    F.chaseG = enemyGroup(rt, { ...ctx.SAKUMA, name: '佐久間の追手', anchor: { x: RELIEF.x + 16, z: RELIEF.z - 16 }, facing: -2.4, fleeDir: { x: 1, z: -1 }, width: 5, morale: 80, dmgMult: 0.32, noRout: true,
      order: 'move', dest: { x: RELIEF.x + 2, z: RELIEF.z + 2 }, seekRange: 10, aggro: 8, speed: 3 }, ctx.foeList(14, { flag: ctx.SAKUMA.flag }));
    F.chaseG.onArrive = (q) => { q.order = 'attack'; q.seekRange = 24; q.aggro = 14; };
    F.chaseG.kind4 = 'raid'; F.groups.push(F.chaseG);
    rt.after(16, () => { if (ctx.live(F.mori)) rt.say('佐久間盛政', '鬼玄蕃はこれにあり。追い崩して賤ヶ岳も揉み潰せ', 3.2); });
    return;
  }
  if (F.reachedRelief && F.oiwaFell && rt.t - F.pt > 115 && ctx.nLive(F.chaseG) <= 3) ctx.next();
}
