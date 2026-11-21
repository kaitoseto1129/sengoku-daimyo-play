// オンライン対戦（K584・K585・K590②）の陣形：各武将隊（1,000 の兵力）の初めの陣形と、戦の中の形と動き。
// kaito の決め（docs/online_final_1120.md 69）：横陣・縦陣・魚鱗・鶴翼・長蛇・方円。陣形は AI の並びで、実際の幅・深さ・動き・向きの変え方が変わる
//   （数値の上乗せ中心は禁止）。だから、ここでは強さの倍率を一つも持たない。隊の並び（formation・列の数・間）だけを決め、
//   幅が広いほど向きを変えるのが遅い（army_groups.js の旋回は半幅で決まる）・縦に細いほど道を速く進める（行軍の縦隊）・方円は将を囲む、
//   という今の兵の仕組みの性質から、動きの違いが出る。構え（aggro・seekRange＝自ら出て行く間合い）だけは陣形ごとに変える（強さではない）。
// 斬り合いの後に組が旗の下へ戻る（regroup.js）を土台に、陣形を保つ戻り方（jinHold）もここに置く。
//
// 使い方：applyJin(g, '鶴翼') で隊に陣形を付ける（いつでも替えられる）。jinTick(rt) を毎コマ呼ぶと、斬り合っていない間に陣形の持ち場へ寄り直す。
//   jinInfo(g) は幅・深さ（m）と、九十度向きを変えるのに要る秒の目安を返す（編成の画面・ AI の判断に使う）。

export const JIN = {
  // 横陣：横に厚く並ぶ。正面が広く、向きを変えるのは遅い
  横陣: { formation: 'line', aggro: 14, seek: 30, note: '正面が広い・向きを変えるのは遅い' },
  // 縦陣：四列の縦隊。正面は狭いが、進むのが速く（行軍の並び）、向きもすぐ変わる
  縦陣: { formation: 'column', colW: 4, aggro: 10, seek: 24, note: '進むのが速い・正面は狭い' },
  // 魚鱗：前が狭く後ろへ深い突撃の塊。一点を破る
  魚鱗: { formation: 'gyorin', aggro: 22, seek: 45, note: '一点を破る・横を回られやすい' },
  // 鶴翼：二段で横へ長く、両の端が前へ出る。包む
  鶴翼: { formation: 'kakuyoku', aggro: 16, seek: 36, note: '包む・中が薄い' },
  // 長蛇：二列の長い列。山道・谷を抜ける。正面はいちばん狭い
  長蛇: { formation: 'column', colW: 2, aggro: 8, seek: 20, note: '細い道を抜ける・横から突かれると弱い' },
  // 方円：将を真ん中に囲む輪。どの向きにも構えるが、前へは遅い
  方円: { formation: 'ring', aggro: 7, seek: 14, note: 'どの向きにも構える・前へは遅い' },
};
export const JIN_NAMES = Object.keys(JIN);

export function applyJin(g, name) {
  const J = JIN[name]; if (!g || !J) return false;
  g.wingK = undefined;   // 鶴翼の攻めの深い翼は陣形を付け直すと元へ
  g.jin = name; g.formation = J.formation;
  g.colW = J.colW || g.colW;
  // 構えの間合い（強さでなく、どれだけ遠くの敵へ自ら出て行くか）：魚鱗は遠くまで突っ込み、方円は寄る敵だけを受ける
  g.aggro = J.aggro; g.seekRange = J.seek;
  g.width = 0;   // 列の数は陣形の並び（units_group.js の layout）が決める
  if (J.formation === 'ring' && !g.leader) g.leader = g.units.find((u) => u.alive && u.type === 'busho') || null;
  g._slotChkAt = 0; g._fitAt = 0; g._mix = null;
  // 将は隊の中（K468「武将は単騎で前に出ない・隊の中」）：方円は輪の真ん中（units_group.js が leader を要に置く）。
  //   ほかの陣形は、持ち場のうち隊の真ん中から少し後ろ（深さの六割）に一番近い所を将に渡し、そこにいた兵と入れ替える
  const L = g.leader && g.leader.alive ? g.leader : g.units.find((u) => u.alive && u.type === 'busho');
  if (L && J.formation !== 'ring') {
    const n = Math.max(1, g.initial || g.units.length), h = g.facing || 0, fx = Math.sin(h), fz = Math.cos(h), out = {};
    let f0 = Infinity, f1 = -Infinity; const P = [];
    for (let i = 0; i < n; i++) { const p = g.slotPos(i, n, out), dx = p.x - g.anchor.x, dz = p.z - g.anchor.z; const r = dx * fz - dz * fx, f = dx * fx + dz * fz; P.push([r, f]); f0 = Math.min(f0, f); f1 = Math.max(f1, f); }
    // 11/21 クラウド36（司令塔：将は陣形の中の正しい所）：魚鱗は先（真ん中の筋の一番前）・鶴翼は要（両の翼が開く根もと＝真ん中の筋の一番後ろ）。ほかは深さの六割
    const want = J.formation === 'gyorin' ? f1 : J.formation === 'kakuyoku' ? f0 : f1 - (f1 - f0) * 0.6;
    const sideW = J.formation === 'gyorin' || J.formation === 'kakuyoku' ? 3 : 1;   // 先と要は真ん中の筋から外さない（横のずれを重く見る）
    let best = 0, bd = Infinity; for (let i = 0; i < n; i++) { const d = Math.hypot(P[i][0] * sideW, P[i][1] - want); if (d < bd) { bd = d; best = i; } }
    const other = g.units.find((u) => u !== L && u.slot === best);
    if (other) other.slot = L.slot;
    L.slot = best; g.leader = L;
  }
  return true;
}

// 隊の幅・深さ（m）と九十度の向き変えの秒の目安。旋回の速さは army_groups.js と同じ式（3 / 半幅・0.3〜1.6 rad/秒）
export function jinInfo(g) {
  const n = Math.max(1, g.initial || g.units?.length || 1);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  const h = g._face ?? g.facing ?? 0, fx = Math.sin(h), fz = Math.cos(h), out = {};
  for (let i = 0; i < n; i++) {
    const p = g.slotPos(i, n, out), dx = p.x - g.anchor.x, dz = p.z - g.anchor.z;
    const r = dx * fz - dz * fx, f = dx * fx + dz * fz;
    x0 = Math.min(x0, r); x1 = Math.max(x1, r); z0 = Math.min(z0, f); z1 = Math.max(z1, f);
  }
  const width = x1 - x0, depth = z1 - z0;
  const rate = g.formation === 'column' || g.marching ? 1.6 : Math.max(0.3, Math.min(1.6, 3 / Math.max(1, width / 2)));
  return { jin: g.jin || null, width: +width.toFixed(1), depth: +depth.toFixed(1), turn90: +(Math.PI / 2 / rate).toFixed(1) };
}

// 陣形を保つ：二秒ごとに、陣形の付いた隊（g.jin）で誰も三十m 内の敵と斬り合っていない時、持ち場から八m より離れた兵を持ち場へ戻す
//   （regroup.js は旗の下へ集める。こちらは陣形の持ち場そのものへ戻す。両方が動いても同じ向きへ寄る）
export function jinTick(rt) {
  const F = rt.flags; if (!F || rt.over || (F._jinT || 0) > rt.t) return;
  jinFromMatch(rt);
  // 鶴翼の包み：寄せる間の隊は縦の列（行軍）で進み、横へ広がる前に敵へ着いた（描かずの確かめ：九十人が横 ±15m に固まり、敵の横へ一人も回らない）。
  //   敵の隊の六十m 内に入ったら、隊の左右それぞれ外側の三分の一の兵を、敵の隊の左右の端の六m 外から敵の横・やや後ろへ回す（目の前四m に相手がいる者は除く）
  for (const g of rt.army.groups) {
    const foe = g._jinFoe;
    if (g.jin !== '鶴翼' || !foe || g.routed || g.order !== 'attack' || !foe.units) continue;
    const fal = foe.units.filter((u) => u.alive && !u.gone && !u.fleeing); if (!fal.length || foe.routed) { g._jinFoe = null; continue; }
    const al = g.units.filter((u) => u.alive && !u.gone && !u.fleeing); if (al.length < 6) continue;
    let fx = 0, fz = 0; for (const u of fal) { fx += u.pos.x; fz += u.pos.z; } fx /= fal.length; fz /= fal.length;
    let cx = 0, cz = 0; for (const u of al) { cx += u.pos.x; cz += u.pos.z; } cx /= al.length; cz /= al.length;
    const ax = fx - cx, az = fz - cz, L = Math.hypot(ax, az) || 1, ux = ax / L, uz = az / L;
    if (L > 60) continue;
    let fw = 0; for (const u of fal) fw = Math.max(fw, Math.abs((u.pos.x - fx) * -uz + (u.pos.z - fz) * ux));
    const lat = al.map((u) => [u, (u.pos.x - cx) * -uz + (u.pos.z - cz) * ux]).sort((a, b) => a[1] - b[1]);
    const k = Math.floor(lat.length / 3);
    lat.forEach(([u], i) => {
      const side = i < k ? -1 : i >= lat.length - k ? 1 : 0; if (!side) return;
      const t = u.target; if (t && t.alive && Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z) < 4) return;
      const j = (i % 5) - 2, off = fw + 6 + Math.abs(j) * 1.4, fwd = 2 + j * 2;   // 横へ fw+6〜、前後に散らす（敵の横から後ろ）
      u.target = null; u.moveTo = { x: fx + -uz * side * off + ux * fwd, z: fz + ux * side * off + uz * fwd }; u.aiT = 2;
    });
  }
  F._jinT = (rt.t || 0) + 2;
  const out = {};
  for (const g of rt.army.groups) {
    if (!g.jin || !g.units || g.routed || g.civ) continue;
    const al = g.units.filter((u) => u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.rearWound);
    if (al.length < 3) continue;
    if (al.some((u) => u.atk || (u.target && u.target.alive && Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) < 30))) continue;
    const n = g.initial || g.units.length;
    for (const u of al) {
      if (u.slot == null || u.slot < 0) continue;
      const p = g.slotPos(u.slot, n, out);
      if (Math.hypot(p.x - u.pos.x, p.z - u.pos.z) <= 8) continue;
      u.target = null; u.moveTo = { x: p.x, z: p.z }; u.aiT = 2;
    }
  }
}

// 攻めの命令（command.js applyCmd の attack・pursue の後に呼ぶ）を陣形の動きにする。強さは変えない
//   魚鱗：敵の将へ一点（focus）／鶴翼：敵の隊の少し手前に要を置き、前へ出た両の翼で包む／方円：その場で輪を保って受ける（寄る敵だけと斬り合う）
//   横陣・縦陣・長蛇は今の攻めのまま（横陣は正面で押す・縦の陣は速く寄る）
export function jinAttack(rt, g, foe) {
  if (!g || !g.jin || !foe || !foe.units) return;
  const c = g.center(), q = foe.center(); if (!c || !q) return;
  const dx = q.x - c.x, dz = q.z - c.z, L = Math.hypot(dx, dz) || 1;
  if (g.jin === '魚鱗') {
    const lead = foe.units.find((u) => u.alive && !u.gone && u.type === 'busho');
    g.focus = lead || null;
  } else if (g.jin === '鶴翼') {
    // 翼を深く前へ曲げ（wingK 0.09→0.32：一隊90人で両端が二十m ほど前へ）、要を敵の隊の正面の二m 手前に置く＝両の翼が敵の横から後ろへ回る
    //   （描かずの確かめ：前の形＝要を深さ＋4m 手前・翼は五m しか前へ出ず、九十七秒まで敵の二十五m 内に一人も入らなかった）
    g.wingK = 0.32; g._slotChkAt = 0; g._fitAt = 0;
    let fd = 0; for (const u of foe.units) if (u.alive && !u.gone) fd = Math.max(fd, (u.pos.x - q.x) * -dx / L + (u.pos.z - q.z) * -dz / L);
    const back = fd + 2;
    g.focus = null; g.anchor = { x: q.x - dx / L * back, z: q.z - dz / L * back }; g.facing = Math.atan2(dx, dz);
    g._jinFoe = foe;   // jinTick が六十m 内で両の翼を敵の左右へ回す
  } else if (g.jin === '方円') {
    g.focus = null; g.order = 'hold'; g.anchor = { x: c.x, z: c.z }; g.facing = Math.atan2(dx, dz); g.seekRange = JIN.方円.seek; g.dest = null; g.onArrive = null;
  }
}

// 試合（online/match.js）の陣形の付け方：rt.flags.match.o.layout[i].jin（編成と布陣の画面で選んだ陣形）を、その武将の本物の隊に付ける。
//   本物と軽いの入れ替え（army4k.js）で隊が作り直されても、付いていなければ付け直す。選んでいない隊は横陣
export function jinFromMatch(rt) {
  const M = rt.flags && rt.flags.match; if (!M || !rt.sonae) return;
  const o = M.o || {}, mine = o.generals || [], lay = o.layout || [], foeJin = o.foeLayout || [];
  for (const S of rt.sonae) {
    const g = S.b && S.b.real; if (!g || g.jin || !g.units) continue;
    let name = null;
    if (S.team === 0) { const i = mine.indexOf(S.taisho); name = i >= 0 ? lay[i]?.jin : null; }
    else { const i = (o.foe || mine).indexOf(S.taisho); name = i >= 0 ? foeJin[i]?.jin : null; }
    applyJin(g, JIN[name] ? name : '横陣');
    // 本人がこの備の将として立つ時（36 の placeLord）は、作り直された隊の同じ武将の体も隠して狙わせない（二人の信長にしない）
    if (S.lordBody && g.leader) { g.leader.noTarget = true; g.leader.lordDouble = true; if (g.leader.mesh) g.leader.mesh.visible = false; }
  }
}
