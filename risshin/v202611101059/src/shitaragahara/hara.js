// ======================================================================
// 設楽原の決戦　有名な場面（9〜12分）「武田の宿将、相次いで討死」（docs/oda15_plan_1108.md 17）
//   柳田前へ移る道の途中：手負いの足軽が後ろへ下がり、使番が南の竹広の様子を知らせる（移動も出来事に）。
//   柳田前の柵：まず原昌胤の隊が寄せ、崩れると内藤昌豊の隊が続く（本体の step 3）。
//   真田兄弟・山県・原・内藤……と、名のある将の討死が三分ほどの間に続き、武田の旗が一つずつ倒れていく。
// 兵は原の隊十七人と手負い三人。字は台詞・任務の一行・討死の見出しだけ。
// ======================================================================
import { enemyGroup, allyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';

// 柳田前へ移る道の出来事（本体の step 2 の毎コマ）
export function march(rt, dt, ctx) {
  const F = rt.flags, M = F.shMarch || (F.shMarch = { at: rt.t });
  const p = rt.player.u.pos, T = rt.t - M.at;
  if (!M.wounded && T > 3) {
    M.wounded = true;
    // 手負いの足軽三人が柵の内の道を後ろへ下がる（すれ違う）
    const g = allyGroup(rt, { faction: 'oda', name: '手負いの足軽', fixed: true, noGuard: true, anchor: { x: p.x - 6, z: p.z + 40 }, facing: Math.PI, width: 4, aggro: 0, formation: 'column', order: 'hold' },
      [{ type: 'ashigaru', n: 3 }]);
    for (const u of g.units) { u.hp = Math.min(u.hp, u.maxHp * 0.3); u.noTarget = true; }
    g.order = 'move'; g.speed = 1.3; g.dest = { x: p.x - 70, z: p.z - 30 };
    g.onArrive = (q) => { q.order = 'hold'; };
    M.g = g;
    rt.say('手負いの足軽', '真田の槍は重かった……後ろへ下がる', 2.8);
  }
  if (!M.runner && T > 12) {
    M.runner = true;
    rt.say('使番', F.nf?.southDone
      ? '竹広の柵も守り切った！　赤備えの別手は退いた'
      : '竹広の柵に赤備えの別手が寄せておる！　徳川殿の鉄砲が押し返しておる', 3.8);
    try { sfx('volleyFar', 0.8); } catch (e) { /* なし */ }
  }
  if (!M.drum && T > 24) {
    M.drum = true;
    try { sfx('taiko', 0.9); } catch (e) { /* なし */ }
    rt.say('組頭', '武田の押し太鼓じゃ。次は柳田前へ来るぞ。急げ！', 3);
  }
}

export function active(rt) { const H = rt.flags.shHara; return !!H && !H.done; }
export function group(rt) { const H = rt.flags.shHara; return H && !H.done ? H.g : null; }

// 柳田前の口へ原昌胤の隊を寄せる（本体の step 2 で内藤の代わりに呼ぶ）。ctx：{ SB, MOUTHS, black, ready, nfGuns }
export function send(rt, ctx) {
  const F = rt.flags, gz = ctx.SB.gates[1] + 4.5;
  const H = F.shHara = { at: rt.t, ctx, done: false };
  H.g = ctx.black(() => enemyGroup(rt, { faction: 'takeda', name: '原昌胤隊', fixed: true, noGuard: true, anchor: { x: 92, z: gz - 18 }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, aggro: 12, width: 18, formation: 'line', morale: 100, noRout: true, speed: 3.8 },
    [{ type: 'busho', n: 1, o: { name: '原昌胤', flag: 'takeda' } }, { type: 'samurai', n: 2, o: { flag: 'takeda' } }, { type: 'ashigaru', n: 14, o: { flag: 'takeda' } }]));
  H.g.order = 'path'; H.g.pathIdx = 0; H.g.path = [[ctx.SB.x0 + 5, gz]]; H.g.dest = null;
  H.g.onArrive = (q) => { q.order = 'hold'; q.anchor.x = ctx.SB.x0 + 4; q.anchor.z = gz; q.facing = -Math.PI / 2; q.aggro = 18; H.arrive ??= rt.t; };
  H.n0 = ctx.ready(H.g);
  ctx.nfGuns(rt, ctx.MOUTHS[1].z);
  try { sfx('taiko', 1); } catch (e) { /* なし */ }
  return H;
}

// true の間は本体の step 3（内藤の寄せ）を止める。崩れたら本体が内藤を寄せる
export function tick(rt, dt) {
  const F = rt.flags, H = F.shHara;
  if (!H || H.done) return false;
  const p = rt.player.u.pos, c = H.ctx, g = H.g, gz = c.SB.gates[1] + 4.5;
  if (!H.said && g.center().x < c.SB.x0 + 40) { H.said = true; rt.say('原昌胤', '柵の口を押し開け！　続け！', 2.8); try { sfx('hooves', 0.6); } catch (e) { /* なし */ } }
  // 柳田前への到着は本体が移動中から記録している。別の持ち場へ移った後も守った事を消さない。
  if (F.nf?.defendedCenter || Math.hypot(p.x - (c.SB.x0 - c.SB.gap - 3), p.z - gz) < 30) H.there = true;
  const lord = g.units.find((u) => u.name === '原昌胤');
  // 全列の到着待ちで先頭の斬り合いを数え落とさない。
  if (H.arrive == null && g.units.some((u) =>
      u.alive && !u.fleeing && !u.gone && !u.woundOut && !u.rearWound && !u.noTarget &&
      Math.hypot(u.pos.x - (c.SB.x0 + 5), u.pos.z - gz) < 14)) H.arrive = rt.t;
  const left = c.ready(g), atGate = H.arrive != null ? rt.t - H.arrive : -1;
  // 行軍の長さを柵前の戦いに数えない。先頭が着いた後の上限で波を終える。
  // 行軍中の時間切れで、まだ柵へ来ていない将を討死にしない。
  // 全員の到着は待たず、先頭の到着から四十五秒で寄せを終える。
  const end = H.there && (!lord?.alive || left <= Math.ceil(H.n0 * 0.4) || atGate > 45);
  if (!end) return true;
  H.done = true;
  if (lord?.alive) { lord.invuln = false; rt.army.kill(lord, null); }
  g.noRout = false; g.morale = 0; g.routed = true; g.order = 'retreat'; g.dest = { x: 500, z: gz }; g.fleeDir = { x: 1, z: 0 };
  for (const u of g.units) if (u.alive) u.fleeing = true;
  rt.banner('原昌胤、討死', '柳田前へ寄せた原隊が退く');
  rt.say('使番', F.shBreach?.done
    ? '真田兄弟、山県、原……武田の名のある将が次々に倒れておる！'
    : '原昌胤、討死！　柳田前の武田勢が退いております！', 3.8);
  rt.after(4.2, () => {
    if (!F.ending && !rt.over && F.nf?.step === 3 && !F.nf.done[1]) rt.say('組頭', '内藤隊が続くぞ！　柵の口を槍で守れ。鉄砲の前へ出るな！', 3.4);
  });
  if (H.there) rt.award((t) => { t.side.push('柳田前の柵で原昌胤の隊を退けた'); }, '原昌胤の隊を退けた', { x: c.SB.x0 - c.SB.gap - 3, z: gz });

  return false;
}
