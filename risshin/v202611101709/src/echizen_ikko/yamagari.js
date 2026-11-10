// ======================================================================
// 越前・大滝寺の山狩り　導入（0〜6分）「森の残党捜索・小隊の山狩り・山中の一揆勢」（docs/oda15_plan_1108.md 19）
//   府中を追われた一揆の残りが山に潜む。組（小隊）で雨の森の小道を狩り、藪から立った残党と槍を合わせる。
//   次に右の谷筋へ回ると、潜んでいた一団が坂の上から竹槍で突き下ろす（山中の小さな戦）。
//   生け捕った者の口から、千余りが大滝寺に籠ったと知れ、麓の参道へ戻って寺攻め（本体の assault）へ渡す。
// 兵は二つの一団の十五人だけ。字は台詞と任務の一行だけ。行き先は金の▼一つ。
// ======================================================================
import { enemyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';
import { siegeFighter } from '../siege_zones.js';
import { sweepGroup } from './hondo_sweep.js';

const A = { x: -30, z: -150 };   // 左の森の小道の入り口（FOREST_ROAD の初め）
const B = { x: 24, z: -142 };    // 右の谷筋（VALLEY_ROAD の初めの手前）
const BACK = { x: 0, z: -165 };  // 麓の参道の集まり場
export const GOAL = '雨の森と谷筋で、潜む一揆の残党を狩る';
const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;
// 討死動作中・後送中の者を、残る敵や行き先へ数えない（寺攻めと同じ条件）。
const fighter = (u) => siegeFighter(u) && u.hp > 0 && !u.dying && !u.rearWound;

export function active(rt) { const Y = rt.flags.ikYama; return !!Y && !Y.done; }
export function pin(rt) {
  const Y = rt.flags.ikYama;
  if (!Y || Y.done) return null;
  // 斬り合いの間も残る敵を指す。離れた弓兵が索敵の外へ出ても、本人の足元で止まらない。
  if (Y.s === 1 || Y.s === 3) {
    const p = rt.player.u.pos;
    let target = null, nearest = Infinity;
    if (Y.g) for (const u of Y.g.units) {
      if (!fighter(u)) continue;
      const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
      if (d < nearest) { target = u.pos; nearest = d; }
    }
    return target || (Y.s === 1 ? A : B);
  }
  return Y.s === 0 ? A : Y.s === 2 ? B : Y.s === 4 ? BACK : null;
}

// ctx：{ look（門徒の小袖）, done（寺攻めを始める） }
export function start(rt, ctx) {
  const F = rt.flags;
  if (F.ikYama) return;
  const Y = F.ikYama = { s: 0, at: rt.t, ctx, done: false };
  rt.unmark('main');
  rt.marker('ikYama', () => pin(rt) || rt.player.u.pos, '山狩り', {});
  rt.obj('main', GOAL, 'main', true);
  rt.say('組頭', '府中を追われた一揆が、この山に潜んでおる。左の森の小道から狩るぞ', 4);
  for (const q of rt.squadGroups || []) q.order = 'follow';
}

// 寺の惣門の守りと混ざらないよう、寺から十分離れた所（z −135 より麓）に置き、崩れたら寺と反対の外の山へ逃がす
function band(rt, Y, at, list, name) {
  const g = enemyGroup(rt, { faction: 'ikko', flag: 'namu', name, fixed: true, noGuard: true, anchor: { ...at }, facing: Math.PI,
    fleeDir: { x: Math.sign(at.x) || -1, z: -0.6 }, aggro: 24, seekRange: 30, width: 8, formation: 'loose', morale: 100, noRout: true, speed: 3.4 },
  list.map(([type, n]) => ({ type, n, o: { ...Y.ctx.look } })));
  g.order = 'attack';
  return g;
}
const standing = (g) => g.units.filter(fighter).length;
function rout(g) {
  g.fleeDir = { x: Math.sign(g.anchor.x) || -1, z: -0.6 };
  g.noRout = false; g.morale = 0; g.routed = true; g.order = 'flee'; g.focus = null;
  for (const u of g.units) if (u.alive) { u.fleeing = true; u.target = null; u.aiT = 0; }
}

export function tick(rt) {
  const F = rt.flags, Y = F.ikYama;
  if (!Y || Y.done || F.ending) return;
  const p = rt.player.u.pos;
  if (Y.s === 1 || Y.s === 3) sweepGroup(rt, Y.g);
  // 時間だけで発見・撃退・帰還を済ませない。本人の到着と守りの損耗を待つ。
  // ① 森の小道へ。着くと藪から残党が立つ
  if (Y.s === 0) {
    if (near(p, A, 10)) {
      Y.s = 1; Y.at = rt.t;
      Y.g = band(rt, Y, { x: A.x - 4, z: A.z + 10 }, [['ashigaru', 6], ['samurai', 1]], '山に潜む一揆の残党');
      Y.n = Y.g.units.length;
      try { sfx('toki', 0.5); } catch (e) { /* なし */ }
      rt.say('足軽', 'おった！　藪の中じゃ！', 2.4);
      rt.after(2.6, () => rt.say('組頭', '槍をそろえよ。一人も逃がすな！', 2.8));
    }
    return;
  }
  // 岩場で止まった残党は上の sweepGroup で通れる道へ動き直す。
  // 損害の無い時間が続いた事だけでは、まだ戦える一団を撃退済みにしない。
  if (Y.s === 1) {
    if (standing(Y.g) > 2) return;
    rout(Y.g);
    Y.s = 2; Y.at = rt.t;
    rt.say('組頭', '残りは谷へ逃げた。右の谷筋へ回れ！', 3.2);
    rt.after(3.6, () => rt.say('物見', '谷の上の岩陰に、竹槍の一団が潜んでおります', 3.2));
    return;
  }
  // ② 右の谷筋へ。坂の上から一団が突き下ろす
  if (Y.s === 2) {
    if (near(p, B, 12)) {
      Y.s = 3; Y.at = rt.t;
      Y.g = band(rt, Y, { x: B.x + 8, z: B.z + 12 }, [['ashigaru', 6], ['samurai', 1], ['bow', 1]], '谷に潜む一揆勢');
      Y.g.aggro = 40; Y.g.seekRange = 45;
      try { sfx('toki', 0.9); } catch (e) { /* なし */ }
      rt.say('一揆の門徒', '仏敵を討て！　南無阿弥陀仏！', 2.8);
    }
    return;
  }
  if (Y.s === 3) {
    if (standing(Y.g) > 2) return;
    rout(Y.g);
    Y.s = 4; Y.at = rt.t;
    rt.say('組頭', '生け捕った者が言うには、残党が大滝寺に籠ったそうじゃ', 3.6);
    rt.after(4, () => rt.say('組頭', '麓の参道へ戻れ。滝川様の先手が寺へ寄せる', 3.2));
    rt.award((t) => { t.side.push('雨の森と谷筋で一揆の残党を狩った'); }, '山の残党を狩った', B);
    return;
  }
  // ③ 麓の参道へ戻ると寺攻め
  if (Y.s === 4 && near(p, BACK, 12)) finish(rt);
}

function finish(rt) {
  const F = rt.flags, Y = F.ikYama;
  Y.done = true;
  rt.unmark('ikYama');
  try { Y.ctx.done(); } catch (e) { /* なし */ }
}

// 導入の間の bot：近い敵を突き、いなければ金の▼へ歩く
export function bot(b, inp, { goTo, patientStrike, strikeTarget }) {
  const p = b.player, u = p.u;
  const e = strikeTarget?.(b, 16);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    inp.runHeld = d > 6;
    if (d > 2.4) goTo(p, inp, e.pos.x, e.pos.z, 2);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d < 3.2) patientStrike(p, inp, e, d);
    return;
  }
  const q = pin(b);
  if (q) { inp.runHeld = true; goTo(p, inp, q.x, q.z, 3); }
}
