// ======================================================================
// 賤ヶ岳の戦い　①の段「砦の陣立て」（0〜1分半）。11/10 改訂（docs/shizugatake_spec_1109.md）
//   賤ヶ岳の砦から東の物見へ下り、余呉湖のまわりの砦の並び（羽柴方・柴田方）と遠くの旗を見る。秀吉は大垣で不在。
//   まだ全面の戦でない。「城一つを攻める戦」でなく「砦の群れどうしの戦」と分からせる。見届けると佐久間が動く（戦の定義の march）。
// 大軍は軽い作り（addDistantArmy・clash）。
// ======================================================================
import { flagTexture } from '../textures.js';
import { clash } from '../b_sekigahara.js';

function say(rt, who, s, t, sec = 3) {
  const phase = rt.flags.phase;
  rt.after(t, () => { if (!rt.over && !rt.flags.ending && rt.flags.phase === phase) rt.say(who, s, sec); });
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
      x: P.OIWA.x - 30, z: P.OIWA.z + 26, facing: 0.9, w: 30, gap0: 18, seed: 15838, noRout: false, noWake: true,
      A: { flag: 'kiri53', armor: 0x24201c, count: 120, flagRate: 0.4, guns: true },
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
    say(rt, '物見', 'こなた南は大岩山に中川殿、岩崎山に高山殿。湖を挟んで砦が睨み合うておりまする', 3.6, 3.6);
    say(rt, '桑山重晴', '大岩山は湖の向こうに突き出ておる。破られれば、ここが矢面じゃ', 8, 3.2);
    rt.award((t) => t.side.push('東の物見で砦の並びを見届けた'), '砦の並びを見届けた');
  }
  // 砦の並びを見届けてから佐久間が動く。未到着を時間だけで達成扱いにしない。
  if (!F.raid && F.sawForts && rt.t - F.sawT > 14 && st > 60) {
    F.raid = true;
    ctx.next();
  }
}
