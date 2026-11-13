// ======================================================================
// 設楽原の決戦　第一波「試しの寄せ」（3〜5分・docs/shitaragahara_spec_1109.md 19）
//   夜明けの知らせの後、真田の本隊より先に、武田の先手の小勢（騎馬四・徒歩十）が大宮前の柵へ寄せる。
//   「鉄砲で止められる」を見せる段：前進 → 柵の鉄砲の番の斉射で前の数人がよろめき倒れる（teppo_wall.js）
//   → 騎馬が崩れる → 残りが柵に取り付き、槍組が迎え撃つ。崩れたら真田の本隊（本体の step 1）へ。
// 兵は十五人だけ。字は台詞と任務の一行だけ。
// ======================================================================
import { enemyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';

export function active(rt) { const T = rt.flags.shTame; return !!T && !T.done; }
export function group(rt) { const T = rt.flags.shTame; return T && !T.done ? T.g : null; }

// ctx：{ SB, MOUTHS, black, ready }。true の間は本体の真田の寄せを待たせる
export function tick(rt, dt, ctx) {
  const F = rt.flags;
  let T = F.shTame;
  if (T?.done) return false;
  const gz = ctx.SB.gates[0] + 4.5;
  // 武田の接近（1:30〜3:00・仕様30）：川向こうの備が動き、土煙・蹄・太鼓・旗が近づく。「構え！」で第一波
  if (!T) { T = F.shTame = { at: rt.t, done: false, s: 0 }; }
  if (T.s === 0) {
    const t = rt.t - T.at;
    if (!T.e0) {
      T.e0 = true;
      try { sfx('taiko', 1); } catch (e) { /* 音が無くても進む */ }
      rt.say('組頭', '川向こうで武田の陣太鼓じゃ。旗が動いたぞ！', 3.2);
      for (const fc of F.far || []) if (!fc.v && Math.abs(fc.z - ctx.MOUTHS[0].z) < 60) { try { fc.m.advance(30, 10); } catch (e) { /* なし */ } }
    }
    if (!T.e1 && t > 12) {
      T.e1 = true;
      try { if (!rt.world.inWaterAt?.(110, gz)) rt.world.dustCloud?.(110, gz, true, true); sfx('hooves', 0.6); } catch (e) { /* なし */ }
      rt.say('前田利家', '土煙が上がった。騎馬が先に来るぞ', 3);
    }
    if (!T.e2 && t > 24) { T.e2 = true; rt.say('使番', '武田の先手、段丘を下りまする！', 3); try { sfx('hooves', 0.9); } catch (e) { /* なし */ } }
    if (t < 34) return true;
    T.s = 1; T.at = rt.t;
  }
  if (!T.g) {
    T.g = ctx.black(() => enemyGroup(rt, { faction: 'takeda', name: '武田の先手', fixed: true, noGuard: true, anchor: { x: 80, z: gz + 10 }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, aggro: 10, width: 16, formation: 'line', morale: 90, noRout: true, speed: 3.6 },
      [{ type: 'samurai', n: 1, o: { flag: 'takeda' } }, { type: 'cavalry', n: 4, o: { horseBattle: 'mounted', flag: 'takeda' } }, { type: 'ashigaru', n: 10, o: { flag: 'takeda' } }]));
    T.g.order = 'path'; T.g.pathIdx = 0; T.g.path = [[ctx.SB.x0 + 5, gz]]; T.g.dest = null;   // 構え！の後、柵へ駆けて来る
    T.g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 24; q.aggro = 20; T.arrive ??= rt.t; };
    T.n0 = ctx.ready(T.g);
    try { sfx('hooves', 0.8); sfx('taiko', 0.9); } catch (e) { /* 音が無くても進む */ }
    rt.say('組頭', '武田の先手が段丘を下りて来る！　構え！　引き付けて放て！', 3.6);
    return true;
  }
  // 後列が川や柵で遅れても、先頭が虎口へ着いた刻から受け合いを数える。
  // 真田・内藤の寄せと同じく、離脱した兵や遠い兵は到着に含めない。
  if (T.arrive == null && T.g.units.some((u) =>
      u.alive && !u.fleeing && !u.gone && !u.woundOut && !u.rearWound && !u.noTarget &&
      Math.hypot(u.pos.x - (ctx.SB.x0 + 5), u.pos.z - gz) < 14)) T.arrive = rt.t;
  const left = ctx.ready(T.g), atGate = T.arrive != null ? rt.t - T.arrive : -1;
  // 遠方で待っただけの退却を、本人が柵を守った手柄にしない。
  // 射撃で虎口への到着前に崩した時も、寄せを受けた持ち場でのみ記録する。
  const P = rt.player.u, postX = ctx.SB.x0 - ctx.SB.gap - 3;
  if (P.alive && P.pos.x < ctx.SB.x0 && Math.hypot(P.pos.x - postX, P.pos.z - gz) < 30 &&
      (atGate >= 0 || T.g.units.some((u) => u.alive && !u.fleeing && !u.gone &&
        !u.woundOut && !u.rearWound && !u.noTarget && u.pos.x < ctx.SB.x0 + 40 && Math.abs(u.pos.z - gz) < 30))) T.defended = true;
  if (!T.half && left <= T.n0 * 0.6) { T.half = true; rt.say('前田利家', '見よ、鉄砲で崩れるぞ。柵に取り付いた者は槍で突け！', 3.2); }
  if (left > Math.ceil(T.n0 * 0.3) && atGate < 40 && rt.t - T.at < 100) return true;
  T.done = true;
  const g = T.g;
  g.onArrive = null; g.path = null; g.focus = null;
  g.noRout = false; g.morale = 0; g.routed = true; g.order = 'retreat'; g.dest = { x: 500, z: gz }; g.fleeDir = { x: 1, z: 0 };
  for (const u of g.units) if (u.alive) u.fleeing = true;
  rt.say('組頭', '先手が退いた！　だが後ろから真田の旗が来るぞ！', 3.4);
  if (T.defended && (atGate >= 0 || left < T.n0)) {
    rt.award((t) => { t.side.push('柵の前で武田の先手を止めた'); }, '先手を止めた', { x: postX, z: gz });
  }
  return false;
}
