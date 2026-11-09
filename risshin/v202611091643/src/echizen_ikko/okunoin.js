// ======================================================================
// 越前・大滝寺の山狩り　寺院炎上・残党掃討（12〜15分）の入り（docs/oda15_plan_1108.md 19）
//   本堂を押さえた時、本堂の衆徒の本隊（六十人の備え）がまとまったまま奥の院へ退き、
//   山狩りの段で本人と組が侍の多い一団に囲まれて討たれていた（11/9 の流し：奥の院の前で一分）。
//   本堂が落ちたら本堂の衆徒は散り散りに左右の森へ逃げる（狩り出すのは山道の守りと奥の院の残り）。
//   本人は本堂を取って息を整える（命を八割まで戻す）。
// 兵は増やさない。字は台詞だけ。
// ======================================================================
import { sfx } from '../audio.js';
import { enemyGroup } from '../bhelp.js';

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
  const u = rt.player.u;
  if (u.maxHp) u.hp = Math.max(u.hp, u.maxHp * 0.8);
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
//   五秒ごとに堂の区域を見て、本堂の衆徒は逃がし、三十秒動かない者は味方の手に討たれた事にする。ctx：{ zones（堂の区域） }
export function tick(rt, dt, ctx) {
  const F = rt.flags;
  if (!F.ikOku || F.ending || (F.ikOkuT = (F.ikOkuT || 0) - dt) > 0) return;
  F.ikOkuT = 5;
  const hondo = [F.ikkoHondoMain?.real, F.ikkoHondoBow?.real];
  for (const u of rt.army.units) {
    if (u.team !== 1 || !u.alive || u.fleeing || u.isStruct || !ctx.zones.some((z) => z.test(u.pos.x, u.pos.z))) continue;
    if (hondo.includes(u.group)) { u.fleeing = true; u.target = null; u.aiT = 0; continue; }
    const s = u._ikStill;
    if (!s || Math.hypot(u.pos.x - s.x, u.pos.z - s.z) > 1.5) { u._ikStill = { x: u.pos.x, z: u.pos.z, t: rt.t }; continue; }
    if (rt.t - s.t > 30) rt.army.kill(u, null);
  }
}

// 山門が破れて十七日の朝へ移る時（夜が明けるまでの時が過ぎている）：本人は手当てをして命を八割まで戻す。
//   夜の山門の斬り合いで一割まで減ったまま、朝の本堂の鉄砲の前へ出て討たれていた（11/9 の流し）
export function morning(rt) {
  const F = rt.flags, u = rt.player.u;
  if (u.alive && u.maxHp) u.hp = Math.max(u.hp, u.maxHp * 0.8);
  // 夜のうちに本堂の衆徒の多くは山へ落ちた（十七日からの山狩り・史実）。朝の本堂に残るのは六割ほど。
  //   本隊が丸ごと残って、本人と組が本堂の前で囲まれて討たれていた（11/9 の流し）
  const b = F.ikkoHondoMain;
  if (b && !F.ikMorningThin) {
    F.ikMorningThin = true;
    b.lost = Math.min(b.nominal, (b.lost || 0) + Math.floor(b.nominal * 0.4));
    let k = 0;
    for (const v of b.real?.units || []) if (v.alive && !v.fleeing && v.type !== 'busho' && (k++ % 5) < 2) { v.fleeing = true; v.target = null; v.aiT = 0; v.noTarget = true; }
  }
}

// 山狩りの山場：本堂を取って四十秒、奥の院の森から残党の一団が松明を捨てて斬り込む（残党の奇襲）。
//   一の手が崩れて二十五秒で裏から二の手。二つとも崩すまで（立つ者が二人以下か八十秒）は戦を終えない。本体の nextAttack(4) が blockWin を見る。
export function ambushTick(rt, ctx) {
  const F = rt.flags;
  if (!F.ikOku || F.ending) return;
  const A = F.ikAmbush || (F.ikAmbush = { at: rt.t });
  if (!A.g) {
    if (rt.t - A.at < (A.wave ? 25 : 40)) return;
    A.wave = (A.wave || 0) + 1;
    const p = rt.player.u.pos, sx = p.x >= 0 ? -1 : 1;
    A.g = enemyGroup(rt, { faction: 'ikko', flag: 'namu', name: '森の残党', fixed: true, noGuard: true, anchor: { x: p.x + sx * 16, z: p.z + 12 }, facing: Math.PI,
      fleeDir: { x: sx, z: 0.5 }, aggro: 40, seekRange: 45, width: 8, formation: 'loose', morale: 100, noRout: true, speed: 3.6 },
    [{ type: 'samurai', n: 2, o: { ...ctx.look } }, { type: 'ashigaru', n: 6, o: { ...ctx.look } }]);
    A.g.order = 'attack'; A.t0 = rt.t;
    try { sfx('toki', 0.9); } catch (e) { /* なし */ }
    rt.say('足軽', A.wave === 1 ? '森から来るぞ！　残党が斬り込んで来た！' : '奥の院の裏からも来るぞ！', 2.8);
    return;
  }
  if (A.done) return;
  const left = A.g.units.filter((u) => u.alive && !u.fleeing).length;
  if (left > 2 && rt.t - A.t0 < 80) return;
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
