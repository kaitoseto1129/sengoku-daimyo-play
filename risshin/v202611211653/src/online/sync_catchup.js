// K580（二人の対戦・毎秒の合わせの位置のずれ）・クラウド k365-cloud-37（11/21・司令塔の割り振り、cloud-26 の match.js の syncFoe から呼ぶ）
//   相手の写しの備（team 1）が相手の画面の本物から 75秒で 80m ずれた：今の合わせは「15m より離れたら本物の所へ歩かせる」だけで、
//   写しが本物より遅い（歩きの速さ・行き先が毎秒変わる）と差が開き続けた。
//   ずれの大きい備だけ、少しずつ寄せ直す：①本物の動きの向き（前の合わせとの差）から 1.5 秒先を狙う ②ずれが 10m を越えたら速さを上げる
//   （ずれ 35m で倍・最大 2.5 倍）③軽い大軍は行き先までの時を縮めて同じだけ速く。ずれ 10m 内は何もしない（今の歩きのまま）。
//   戻り値：寄せ直しをした時 true（match.js の歩かせる下知を重ねない）
export function syncCatchUp(S, to, now) {
  const b = S && S.b; if (!b || !b.pos || !to) return false;
  const C = S._sc || (S._sc = { x: to.x, z: to.z, t: now, vx: 0, vz: 0 });
  // 一時の途切れ（合わせが三秒より空いた・11/21 cloud-37：10秒途切れた後に AI の下知のまま 11〜19m のずれが三十秒残った）の後の八秒は強く寄せる
  if (now - C.t > 3) { C.boost = now + 8; C.vx = 0; C.vz = 0; }
  const hard = C.boost > now;
  if (now > C.t + 0.2) {
    const dt = Math.max(0.2, Math.min(3, now - C.t));
    // 動きの向きは前の合わせとの差を均して（一秒の揺れで行き過ぎない）
    C.vx = C.vx * 0.5 + ((to.x - C.x) / dt) * 0.5; C.vz = C.vz * 0.5 + ((to.z - C.z) / dt) * 0.5;
    C.x = to.x; C.z = to.z; C.t = now;
  }
  const d = Math.hypot(b.pos.x - to.x, b.pos.z - to.z);
  if (d <= (hard ? 3 : 6)) { S._scOn = false; return false; }
  // 敗走した備は下知で歩かせない（逃げの動きを崩さない）。軽い大軍の居所を本物の所へ一秒に三割ずつ寄せ、本物の兵も少しずつずらす（両方の画面で別々に逃げ、ずれが開いた）
  if (S.state === '敗走') {
    const A = b.light && b.light.army;
    if (A && A.off) { A.tw = null; A.off.x += (to.x - b.pos.x) * 0.3; A.off.z += (to.z - b.pos.z) * 0.3; }
    // 本物の兵は一秒に三割（四 m まで）ずつ本物の所へずらす（逃げる向きを変えると行き過ぎて、ずれが 75m に開いた）
    const g = b.real;
    if (g && g.units) {
      const k = Math.min(4, d * 0.3) / (d || 1), mx = (to.x - b.pos.x) * k, mz = (to.z - b.pos.z) * k;
      for (const u of g.units) if (u.alive && u.pos && !u.isPlayer) { u.pos.x += mx; u.pos.z += mz; }
    }
    return true;
  }
  const lead = { x: to.x + C.vx * 1.5, z: to.z + C.vz * 1.5 };
  const boost = Math.min(2.5, 1 + Math.max(0, d - 6) / 25);
  // 部隊の下知（b.cmd）ごと歩かせる（兵の組だけ動かすと、部隊は待機のままで状態も前進にならず、一秒で 20m 遅れた）
  if (b.order) { try { b.order({ id: 'move', to: { x: lead.x, z: lead.z } }); } catch (e) { /* 下知が無ければ組だけ */ } }
  if (S.moveTo !== undefined) S.moveTo = { x: lead.x, z: lead.z };
  const g = b.real;
  // 斬り合い中の兵は下知より相手を追うので、8m を越えた分は一秒に 2m まで兵ごとずらす（11/21 12時 main の通し二回で 75秒 7〜13m・10m 内に詰める）（歩きの半分ほど・遠目に目立たない）
  const melee = S.state === '交戦中';   // 斬り合い中は相手を追って下知が効かないので強めに（11/21 途切れの通し：交戦中の備だけ 10〜14m が残った）
  const th = hard ? 3 : melee ? 6 : 8;
  if (g && g.units && d > th) {
    const k = Math.min(hard ? 4 : melee ? 3 : 2, (d - th) * 0.4) / d, mx = (to.x - b.pos.x) * k, mz = (to.z - b.pos.z) * k;
    for (const u of g.units) if (u.alive && u.pos && !u.isPlayer) { u.pos.x += mx; u.pos.z += mz; }
    // 持ち場（anchor）も同じだけ動かす（予備の備は毎コマ持ち場へ戻り、寄せた分が消えて 11〜12m が残った）
    if (g.anchor) { g.anchor = { x: g.anchor.x + mx, z: g.anchor.z + mz }; }
  }
  if (g && g.count) {
    g.order = 'move'; g.dest = { x: lead.x, z: lead.z }; g.speed = Math.max(3.4, (g._scBase || (g._scBase = g.speed || 3.4)) * boost);
    g.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: lead.x, z: lead.z }; q.speed = q._scBase || q.speed; };
  }
  const L = b.light;
  if (L && L.moveTo) { const dl = Math.hypot(lead.x - b.pos.x, lead.z - b.pos.z); try { L.moveTo(lead.x, lead.z, Math.max(0.8, dl / (3.4 * boost)), {}); } catch (e) { /* 軽い大軍が無ければ本物だけ */ } }
  S._syncTo = lead; S.pending = null; S._scOn = true;
  return true;
}
