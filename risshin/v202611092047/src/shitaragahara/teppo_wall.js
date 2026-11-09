// ======================================================================
// 設楽原の決戦　鉄砲の壁（docs/shitaragahara_spec_1109.md 10〜16・21・34〜35）
//   一言：「柵の内側に作られた巨大な鉄砲の壁に、武田軍が何度もぶつかって崩れていく戦」。
//   ・近く（本人の 150m 内）は本物の鉄砲組だけ（軽い兵は 150m 内に描かない決まり・world.js FAKE_NEAR）。
//     各口の三組を A・B・C の番にして、二秒半ずつずらして撃たせる（同じ口で音が途切れない）。
//   ・遠く（150m 外）は柵沿いの軽い鉄砲の列（b_shitaragahara.js の三列）が撃っている体で、
//     区画ごとに時をずらして一斉射の音（遠いほど低く続く音は audio.js が距離で替える）と白煙を置く。
//     武田が寄せている区画ほど多く鳴らし、戦線のどこかでいつも鳴っている。
//   ・白煙は一斉射の煙（army.smoke）と、しばらく残る硝煙の名残（world.gunSmoke）。名残は上限があり、前線が少しずつ白くなる。
//   ・斉射の当たりは一人ずつでなく、二〜四人が同時によろめき、うち一、二人が倒れる。
//     一つの寄せを斉射だけで崩し切らない（一隊の四割まで。残りは柵と槍の勝負）。
// 兵は増やさない（本物の鉄砲組の番を回すだけ）。毎コマ new しない（点の入れ物を使い回す）。
// ======================================================================

const PT = { x: 0, z: 0 };

// ctx：{ SB, MOUTHS, ZONES }
export function install(rt, ctx) {
  const F = rt.flags;
  if (F.shWall) return F.shWall;
  const W = F.shWall = { ctx, t: 0, far: 0, near: [0, 0, 0], band: [0, 0, 0], hits: new Map(), on: false };
  // 口ごとの三組（A・B・C）。F.guns は口ごとに三つずつ並ぶ
  W.mouthGuns = ctx.MOUTHS.map((m) => F.guns.filter((q) => Math.abs(q.anchor.z - m.z) < 40));
  return W;
}

// 戦が始まったら鳴らし始める（導入の間は静か）
export function start(rt) { const W = rt.flags.shWall; if (W) W.on = true; }
export function stop(rt) { const W = rt.flags.shWall; if (W) W.on = false; }

// その口の前（柵の東八十メートル内）に寄せて来た武田の本物の兵の数
function foesAt(rt, z, SB, span = 60) {
  let n = 0;
  for (const u of rt.army.units) {
    if (u.team !== 1 || !u.alive || u.fleeing || u.gone || u.noTarget || u.group?.shWaiting) continue;
    const dx = u.pos.x - SB.x0;
    if (dx > -2 && dx < 80 && Math.abs(u.pos.z - z) < span) n++;
  }
  return n;
}

// 斉射の当たり：二〜四人がよろめき、一、二人が倒れる。一隊の四割までしか斉射では倒さない
function volleyHit(rt, W, z, SB) {
  const cand = [];
  for (const u of rt.army.units) {
    if (u.team !== 1 || !u.alive || u.fleeing || u.gone || u.noTarget || u.group?.shWaiting || u.invuln || u.type === 'busho') continue;
    const dx = u.pos.x - SB.x0;
    if (dx < 6 || dx > 70 || Math.abs(u.pos.z - z) > 28) continue;
    cand.push(u);
    if (cand.length >= 12) break;
  }
  if (!cand.length) return;
  const n = Math.min(cand.length, 2 + Math.floor(Math.random() * 3));
  let killed = 0;
  for (let i = 0; i < n; i++) {
    const u = cand.splice(Math.floor(Math.random() * cand.length), 1)[0];
    const g = u.group, n0 = g ? (W.hits.get(g)?.n0 ?? g.units.length) : 0;
    const rec = g ? (W.hits.get(g) || { n0, k: 0 }) : null;
    if (rec && !W.hits.has(g)) W.hits.set(g, rec);
    u.stagger = Math.max(u.stagger || 0, 0.9 + Math.random() * 0.6);   // 斉射に打たれてよろめく
    if (killed < 2 && rec && rec.k < rec.n0 * 0.4 && Math.random() < 0.55) { rec.k++; killed++; rt.army.kill(u, null); }
  }
}

export function tick(rt, dt) {
  const F = rt.flags, W = F.shWall;
  if (!W || !W.on || F.ending) return;
  const { SB, MOUTHS, ZONES } = W.ctx, P = rt.player.u.pos;
  W.t += dt;
  // ---- 近い口：三組を A→B→C の番で、二秒半ずつずらして撃たせる（寄せが来ている口だけ） ----
  for (let i = 0; i < MOUTHS.length; i++) {
    const m = MOUTHS[i];
    if ((W.near[i] -= dt) > 0) continue;
    const foes = foesAt(rt, m.z, SB);
    if (!foes) { W.near[i] = 1.5; continue; }
    W.near[i] = 2.4 + Math.random() * 0.6;
    const gs = W.mouthGuns[i].filter((q) => q.count && !q.routed);
    if (!gs.length) continue;
    const g = gs[W.band[i]++ % gs.length];
    // この番の組だけ構えを解いて撃たせ、ほかの組は込めて待つ
    for (const q of gs) { q.fire = q === g; q.holdFire = q !== g; }
    const c = g.center();
    PT.x = SB.x0 + 2; PT.z = c.z;
    try { rt.army.play('volley', PT, 1.2); } catch (e) { /* 音が無くても進む */ }
    for (let k = -1; k <= 1; k++) {
      try { rt.army.smoke(SB.x0 + 1.5, rt.world.heightAt(SB.x0 + 1.5, c.z + k * 4) + 1.5, c.z + k * 4, 1, 0); } catch (e) { /* なし */ }
    }
    try { rt.world.gunSmoke?.(SB.x0 + 4, c.z); } catch (e) { /* なし */ }
    volleyHit(rt, W, c.z, SB);
  }
  // ---- 遠い区画：軽い鉄砲の列の一斉射（本人から 150m 外の柵だけ）。寄せの来ている区画ほど多く ----
  if ((W.far -= dt) > 0) return;
  let best = null, bw = 0;
  for (let k = 0; k < 6; k++) {
    const z = SB.z0 + 20 + Math.random() * (SB.z1 - SB.z0 - 40);
    if (Math.abs(z - P.z) < 150 && Math.abs(P.x - SB.x0) < 150) continue;
    if (MOUTHS.some((m) => Math.abs(m.z - z) < 30)) continue;   // 本物の組の前は本物に任せる
    const w = 1 + foesAt(rt, z, SB, 80) * 0.5 + Math.random();
    if (w > bw) { bw = w; best = z; }
  }
  W.far = best == null ? 0.8 : Math.max(0.7, 2.2 - bw * 0.25) + Math.random() * 0.8;
  if (best == null) return;
  PT.x = SB.x0 + 2; PT.z = best;
  try { rt.army.play('volley', PT, 0.9); } catch (e) { /* なし */ }
  try { rt.world.gunSmoke?.(SB.x0 + 3, best); } catch (e) { /* なし */ }
  if (Math.random() < 0.5) try { rt.army.smoke(SB.x0 + 1.5, rt.world.heightAt(SB.x0 + 1.5, best) + 1.5, best, 1, 0, 0.6); } catch (e) { /* なし */ }
  volleyHit(rt, W, best, SB);
}
