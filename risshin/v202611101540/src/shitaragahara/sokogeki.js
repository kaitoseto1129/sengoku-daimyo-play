// ======================================================================
// 設楽原の決戦　第四波「総攻撃」（11〜13分・docs/shitaragahara_spec_1109.md 19・30）
//   原が崩れ、内藤昌豊の隊が柳田前へ寄せると同時に、土屋昌次の隊が山県の開けた破れ目へ押し入る。
//   使番「破れ目に土屋隊！」で、本人は柳田前と破れ目の二つの区画を走る。名のある将が次々に前へ出て倒れる。
//   内藤と土屋の両方が崩れて、勝頼が退く（本体の nfCollapse）。
// 兵は土屋の隊十六人だけ。字は台詞と見出しだけ。
// ======================================================================
import { enemyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';

export function active(rt) { const S = rt.flags.shSoko; return !!S && !S.done; }
export function group(rt) { const S = rt.flags.shSoko; return S && !S.done ? S.g : null; }
export function pin(rt) {
  const S = rt.flags.shSoko;
  if (!S || S.done || !S.call) return null;
  const p = rt.player.u.pos;
  return Math.hypot(p.x - S.IN.x, p.z - S.IN.z) < 8 ? null : S.IN;
}

// ctx：{ SB, black, ready, BZ }
export function start(rt, ctx) {
  const F = rt.flags;
  const S = F.shSoko = { at: rt.t, done: false, ctx, IN: { x: ctx.SB.x0 - ctx.SB.gap - 3, z: ctx.BZ } };
  S.g = ctx.black(() => enemyGroup(rt, { faction: 'takeda', name: '土屋昌次隊', fixed: true, noGuard: true, anchor: { x: 100, z: ctx.BZ + 10 }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, aggro: 10, width: 16, formation: 'line', morale: 100, noRout: true, speed: 3.8 },
    [{ type: 'busho', n: 1, o: { name: '土屋昌次', flag: 'takeda' } }, { type: 'samurai', n: 2, o: { flag: 'takeda' } }, { type: 'cavalry', n: 3, o: { horseBattle: 'mounted', flag: 'takeda' } }, { type: 'ashigaru', n: 10, o: { flag: 'takeda' } }]));
  S.g.order = 'path'; S.g.pathIdx = 0; S.g.path = [[ctx.SB.x0 + 6, ctx.BZ], [S.IN.x, ctx.BZ]]; S.g.dest = null;
  S.g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 40; q.aggro = 30; };
  S.n0 = ctx.ready(S.g);
  try { sfx('taiko', 1); sfx('toki', 0.8); } catch (e) { /* 音が無くても進む */ }
  rt.say('使番', '武田の総懸かりじゃ！　内藤隊が柳田前へ、土屋隊が破れ目へ！', 3.8);
  return S;
}

// 毎コマ。内藤の寄せの間に呼ぶ。土屋の隊が柵の内へ入ったら、本人を破れ目へ呼ぶ
export function tick(rt, dt) {
  const F = rt.flags, S = F.shSoko;
  if (!S || S.done) return;
  const c = S.ctx, g = S.g, p = rt.player.u.pos;
  // 後列の到着待ちで止めず、破れ目へ来た先頭から受け合いを数える。
  if (S.arrive == null && g.units.some((u) =>
      u.alive && !u.fleeing && !u.gone && !u.woundOut && !u.rearWound && !u.noTarget &&
      Math.hypot(u.pos.x - S.IN.x, u.pos.z - S.IN.z) < 18)) S.arrive = rt.t;
  if (!S.call && (g.center().x < c.SB.x0 + 4 || rt.t - S.at > 40)) {
    S.call = true; S.capT = rt.t;
    rt.say('組頭', S.arrive != null
      ? '破れ目に土屋隊が入った！　鉄砲組がやられる、走れ！'
      : '土屋隊が破れ目へ寄せておる！　鉄砲組を守りに走れ！', 3.4);
  }
  if (Math.hypot(p.x - S.IN.x, p.z - S.IN.z) < 32) S.there = true;
  const lord = g.units.find((u) => u.name === '土屋昌次');
  const left = c.ready(g);
  // 到着後の待ち時間ではなく、本人の近くで実際に斬り合った時間を数える。
  const fighting = g.units.some((u) => {
    const target = u.atk?.target || u.swing?.target || u.target;
    return u.alive && !u.fleeing && !u.gone && !u.woundOut && !u.rearWound && !u.noTarget &&
      target?.alive && target.pos && target.team !== u.team && !target.fleeing && !target.gone &&
      !target.woundOut && !target.rearWound && !target.noTarget &&
      Math.hypot(u.pos.x - target.pos.x, u.pos.z - target.pos.z) < 8 &&
      !rt.army.wallBetween(u.pos, -1, target.pos);
  });
  if (fighting && Math.hypot(p.x - S.IN.x, p.z - S.IN.z) < 32) S.fight = (S.fight || 0) + dt;
  // 交戦後の詰まりは救済し、未交戦や本人が離れた時間だけでは決着させない。
  if (S.fight > 0 && Math.hypot(p.x - S.IN.x, p.z - S.IN.z) < 32) S.stay = (S.stay || 0) + dt;
  const cap = S.stay > 210;
  const end = cap || S.there && (!lord?.alive || left <= Math.ceil(S.n0 * 0.35) || S.fight > 60);
  if (!end) return;
  S.done = true;
  if (lord?.alive) { lord.invuln = false; rt.army.kill(lord, null); }
  g.noRout = false; g.morale = 0; g.routed = true; g.order = 'retreat'; g.dest = { x: 500, z: c.BZ }; g.fleeDir = { x: 1, z: 0 };
  for (const u of g.units) if (u.alive) u.fleeing = true;
  rt.banner('土屋昌次、討死', '破れ目を取り返した');
  if (S.there) rt.award((t) => { t.side.push('総懸かりの破れ目で土屋昌次の隊を討ち、鉄砲組を守った'); }, '鉄砲組を守った', S.IN);
}
