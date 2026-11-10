// ======================================================================
// 越前・大滝寺の山狩り　寺院炎上・残党掃討（12〜15分）の入り（docs/oda15_plan_1108.md 19）
//   本堂を押さえた時、本堂の衆徒の本隊（六十人の備え）がまとまったまま奥の院へ退き、
//   山狩りの段で本人と組が侍の多い一団に囲まれて討たれていた（11/9 の流し：奥の院の前で一分）。
//   本堂が落ちたら本堂の衆徒は散り散りに左右の森へ逃げる（狩り出すのは山道の守りと奥の院の残り）。
//   本堂を取った直後も傷は引き継ぎ、共通の手当ての条件で回復する。
// 兵は増やさない。字は台詞だけ。
// ======================================================================
import { sfx } from '../audio.js';
import { enemyGroup } from '../bhelp.js';
import { fighting, resume, sweepGroup } from './hondo_sweep.js';
import { siegeFighter } from '../siege_zones.js';

export function onOku(rt) {
  const F = rt.flags;
  if (F.ikOku) return;
  F.ikOku = true;
  for (const b of [F.ikkoHondoMain, F.ikkoHondoBow]) {
    const g = b?.real;
    if (!g || g.routed) continue;
    const sx = g.center().x >= 0 ? 1 : -1;
    g.routed = true; g.order = 'flee'; g.morale = 0; g.noRout = false; g.focus = null; g.stay = false;
    g.fleeDir = { x: sx, z: 0.4 };
    for (const u of g.units) if (u.alive) { u.fleeing = true; u.target = null; u.aiT = 0; }
    try { b.light?.rout?.({ hideAfter: 40 }); } catch (e) { /* なし */ }
  }
  rt.after(9, () => { if (!F.ending) rt.say('足軽', '本堂の衆徒は散り散りじゃ。左右の森へ逃げ込んだぞ', 3.2); });
}

// 戦後の余韻（最後の三十秒余り・共通の追加要素5）：燃える本堂の前で、遅れて勝鬨を三度。
//   雨の上がった山に煙が昇り、府中の方の知らせで越前の制圧を伝え、低い法螺で終わる。本体の勝ちの finish の待ちを LEN にする。
export const LEN = 36;
export function yoin(rt) {
  const F = rt.flags;
  if (F.ikYoin) return;
  F.ikYoin = true;
  for (const u of rt.army.units) if (u.team === 1 && u.alive) { u.fleeing = true; if (u.group) { u.group.routed = true; u.group.speed = Math.max(u.group.speed || 3, 5); } }
  for (const [t, v] of [[9, 0.9], [12.6, 1], [16.2, 1]]) {
    rt.after(t, () => {
      if (rt.over) return;
      try { rt.army.celebrate(rt.player.u.team); } catch (e) { /* なし */ }
      try { sfx('sig_eiei', v); } catch (e) { /* なし */ }
    });
  }
  rt.after(18, () => { if (!rt.over) rt.say('使番', '府中より知らせ！　越前の一揆の砦は、ことごとく落ちました', 3.6); });
  rt.after(20.5, () => { if (!rt.over) rt.banner('越前の一向一揆、平らぐ', '天正三年八月'); });
  rt.after(23, () => { if (!rt.over) rt.say('足軽', '……寺が燃えておる。仏の寺じゃというに', 3.4); });
  rt.after(27.5, () => { if (!rt.over) rt.say('組頭', '口を慎め。これが戦じゃ', 3); });
  rt.after(31, () => { if (!rt.over) try { sfx('farHorn', 0.5); } catch (e) { /* なし */ } });
}

// 山狩りの段：本堂の備えから後で補われた兵や、堂の中・切岸の上で動けなくなった兵が一人残ると、
//   「堂に敵が残る」で終わらず九分止まった（11/9 の流し：本堂の鉄砲一人）。
//   五秒ごとに堂の区域を見て、本堂の衆徒は逃がす。交戦も移動も三十秒止まった者だけを詰まりとする。ctx：{ zones（堂の区域） }
export function tick(rt, dt, ctx) {
  const F = rt.flags;
  if (!F.ikOku || F.ending || (F.ikOkuT = (F.ikOkuT || 0) - dt) > 0) return;
  F.ikOkuT = 5;
  for (const u of rt.army.units) {
    if (u.team !== 1 || !u.alive || u.fleeing || u.isStruct) continue;
    if (u.woundOut || u.noTarget || !ctx.zones.some((z) => z.test(u.pos.x, u.pos.z))) { u._ikStill = null; continue; }
    // 実兵の組がまだ無い備えと、所属の無い兵を同じ組として退かせない。
    if (u.group && (u.group === F.ikkoHondoMain?.real || u.group === F.ikkoHondoBow?.real)) {
      u.fleeing = true; u.target = null; u.aiT = 0; continue;
    }
    // 弓・鉄砲や持ち場の槍は、その場で戦う。立ち止まっているだけで討死にしない。
    if (fighting(rt, u)) {
      u._ikStill = null;
      continue;
    }
    const s = u._ikStill;
    if (!s || Math.hypot(u.pos.x - s.x, u.pos.z - s.z) > 1.5) { u._ikStill = { x: u.pos.x, z: u.pos.z, t: rt.t }; continue; }
    if (rt.t - s.t > 30) { resume(rt, u); s.t = rt.t; }
  }
}

// 山門が破れて十七日の朝へ移る時も、本人の傷は引き継ぐ。
// 手当ては共通の停止・被弾後の待ち時間と回復速度で行い、門の破壊だけで命を戻さない。
export function morning(rt) {
  const F = rt.flags;
  // 山門を破られ、下知で一部が奥の院へ退く（遊び用の補い）。
  // 退く兵も生きている。名目の四割を損耗へ足すと、実際の損耗と二重に人数を減らしてしまう。
  const b = F.ikkoHondoMain;
  if (b && !F.ikMorningThin) {
    F.ikMorningThin = true;
    let k = 0, retreating = false;
    for (const v of b.real?.units || []) if (siegeFighter(v) && v.hp > 0 && !v.dying && !v.rearWound && v.type !== 'busho' && (k++ % 5) < 2) {
      v.fleeing = true; v.target = null; v.aiT = 0; v.noTarget = true;
      v.moraleFleeDir = { x: 0, z: 1 };
      retreating = true;
    }
    if (retreating) rt.say('衆徒の大将', '山門が破られた！　一部は奥の院へ退け。残る者は本堂を守れ！', 3.6);
  }
}

// 山狩りの山場：本堂を取って四十秒、奥の院の森から残党の一団が松明を捨てて斬り込む（残党の奇襲）。
//   一の手が崩れて二十五秒で裏から二の手。二つとも立つ者が二人以下になるまで戦を終えない。本体の nextAttack(4) が blockWin を見る。
export function ambushTick(rt, ctx) {
  const F = rt.flags;
  if (!F.ikOku || F.ending) return;
  const A = F.ikAmbush || (F.ikAmbush = { at: rt.t });
  if (!A.g) {
    if (rt.t - A.at < (A.wave ? 25 : 40)) return;
    A.wave = (A.wave || 0) + 1;
    const p = rt.player.u.pos, sx = p.x >= 0 ? -1 : 1;
    // 11/10 クラウドの正式の流し：十六歩先から侍二・足軽六が一度に囲み、本人が奥の院で倒れた（侍 117・足軽 106 の傷）。
    //   一団を侍一・足軽五にし、二十二歩先の森の縁から来させる（構えて受ける間を残す）
    A.g = enemyGroup(rt, { faction: 'ikko', flag: 'namu', name: '森の残党', fixed: true, noGuard: true, anchor: { x: p.x + sx * 20, z: p.z + 12 }, facing: Math.PI,
      fleeDir: { x: sx, z: 0.5 }, aggro: 40, seekRange: 45, width: 8, formation: 'loose', morale: 100, noRout: true, speed: 3.2 },
    [{ type: 'samurai', n: 1, o: { ...ctx.look } }, { type: 'ashigaru', n: 5, o: { ...ctx.look } }]);
    A.g.order = 'attack';
    try { sfx('toki', 0.9); } catch (e) { /* なし */ }
    rt.say('足軽', A.wave === 1 ? '森から来るぞ！　残党が斬り込んで来た！' : '奥の院の裏からも来るぞ！', 2.8);
    return;
  }
  if (A.done) return;
  sweepGroup(rt, A.g);
  // 導入の山狩り・行き先と同じく、討死動作中や後送中の者は残兵に数えない。
  // 生存の印だけ残る者を待つと、戦える残党を崩しても次の一団へ進まない。
  let left = 0;
  for (const u of A.g.units) if (siegeFighter(u) && u.hp > 0 && !u.dying && !u.rearWound) left++;
  // 時間だけで無傷の敵を敗走させ、撃退済みにしない。
  if (left > 2) return;
  const g = A.g;
  A.done = A.wave >= 2; g.noRout = false; g.morale = 0; g.routed = true; g.order = 'flee';
  for (const u of g.units) if (u.alive) { u.fleeing = true; u.target = null; u.aiT = 0; }
  if (A.wave < 2) {
    // 一の手が崩れて二十五秒、奥の院の裏から最後の一団（二の手）
    A.g = null; A.done = false; A.at = rt.t;
    rt.say('組頭', 'まだ森に潜んでおるぞ。気を抜くな', 3);
    return;
  }
  rt.say('組頭', '残党は崩れた。奥の院の森を、隅まで狩れ', 3);
}
export function blockWin(rt) { const A = rt.flags.ikAmbush; return !!rt.flags.ikOku && !(A && A.done); }
