// ======================================================================
// 越前一向一揆・木ノ芽峠　峠突破・一揆勢撤退（12〜15分）と戦後の余韻（docs/oda15_plan_1108.md 18・共通の追加要素5）
//   西光寺真敬の殿が崩れた後、すぐ結果へ行かない：峠道を追うと、崩れた一揆勢の一団が念仏を唱えて最後に踏みとどまる。
//   それを崩すと、夜の峠に燃える砦と、府中の方の火。少し遅れて勝鬨、柴田の声、史実の一行で終わる。
// 兵は一揆の残り十二人。字は台詞と任務の一行だけ。行き先は金の▼一つ。
// ======================================================================
import { enemyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';

export const LEN = 34;

// 狙える兵と残敵の数え方をそろえ、既に戦えない負傷兵を追わせない。
export const fighter = u => !!u?.alive && !u.gone && !u.dying && !u.downed && !u.woundOut &&
  !u.rearWound && !u.invuln && !u.fleeing && !u.noTarget && !u.isStruct && !u.civ &&
  !u.group?.routed && u.group?.order !== 'flee';

// ctx：{ at（踏みとどまる所）, look, win（本体の勝ち） }
export function start(rt, ctx) {
  const F = rt.flags;
  if (F.echFuchu) return;
  const P = F.echFuchu = { s: 0, at: rt.t, ctx, pos: ctx.at };
  rt.say('柴田勝家', '殿は崩れた！　峠道を追え。府中へ一人も通すな！', 3.6);
  rt.obj('chase', '峠道を追い、踏みとどまる一揆勢を崩す', 'main', true);
  try { sfx('sig_kakari', 0.8); } catch (e) { /* なし */ }
  P.g = enemyGroup(rt, { faction: 'ikko', flag: 'namu', name: '崩れた一揆勢', fixed: true, noGuard: true, anchor: { ...ctx.at }, facing: Math.PI,
    fleeDir: { x: 0, z: 1 }, aggro: 14, seekRange: 16, width: 9, formation: 'line', morale: 100, noRout: true, speed: 3.2 },
  [{ type: 'samurai', n: 2, o: { ...ctx.look } }, { type: 'ashigaru', n: 10, o: { ...ctx.look } }]);
  P.g.order = 'hold';
  P.n0 = P.g.units.length;
  for (const g of F.echUp || []) { if (!g?.count || g.routed) continue; g.order = 'move'; g.dest = { x: ctx.at.x, z: ctx.at.z - 10 }; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 40; }; }
}

export function pin(rt) { const P = rt.flags.echFuchu; return P && P.s === 0 ? P.pos : null; }

export function tick(rt) {
  const F = rt.flags, P = F.echFuchu;
  if (!P || P.s > 1) return;
  const p = rt.player.u.pos, g = P.g;
  if (P.s === 0) {
    F.echExitAt = P.pos;   // 金の▼と bot の行き先（本体の echExitAt）
    // 時間だけでは追撃先へ着いた事にしない。
    if (Math.hypot(p.x - P.pos.x, p.z - P.pos.z) < 26) {
      P.s = 1; P.at1 = rt.t; F.echExitAt = null;
      g.order = 'attack'; g.aggro = 40; g.seekRange = 40;
      rt.say('一揆の門徒', '南無阿弥陀仏……ここで死ねば極楽じゃ！', 3.2);
    }
    return;
  }
  const left = g.units.filter(fighter).length;
  const near = Math.hypot(p.x - P.pos.x, p.z - P.pos.z) < 26;
  // 味方が先に討ち切った時も、本人を追撃先へ案内してから押さえる。
  F.echExitAt = near ? null : P.pos;
  // 主力の四分の三を失い、追手が陣を押さえたら残兵は崩れる。
  // 全滅待ちで斜面や木の陰の一人を探し続けさせない。
  // 時間だけ・主人公が遠くにいる間には追撃を果たした事にしない。
  if (left > P.n0 * .25 || !near) return;
  P.s = 2;
  g.noRout = false; g.morale = 0; g.routed = true; g.order = 'flee';
  g.focus = null; g.fleeDir = { x: 0, z: 1 };
  for (const u of g.units) if (u.alive) { u.fleeing = true; u.target = null; u.aiT = 0; }
  rt.objDone('chase');
  yoin(rt);
}

// 戦後の余韻：燃える砦と府中の方の火、遅れて勝鬨。最後に本体の勝ちへ（結果までの待ちは LEN 秒）
function yoin(rt) {
  const F = rt.flags, P = F.echFuchu;
  try { rt.world.addSmokeColumn?.(P.pos.x + 40, P.pos.z - 260, { size: 3 }); } catch (e) { /* なし */ }
  rt.say('組頭', '……一揆勢は府中へ散った。峠は、われらの物じゃ', 3.4);
  for (const [t, v] of [[6, 0.9], [9.6, 1], [13.2, 1]]) {
    rt.after(t, () => {
      if (rt.over) return;
      try { rt.army.celebrate(rt.player.u.team); } catch (e) { /* なし */ }
      try { sfx('sig_eiei', v); } catch (e) { /* なし */ }
    });
  }
  P.ctx.win(rt);
}
