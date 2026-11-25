// 伊達家編の仕組み「馬印の勢い」（H3・house_date.md ①）の共通部品。e05 摺上原・e01 相馬攻め・e02 小浜城宮森城が使う（11/24 Sanae）。
//   本人は政宗の馬印の近侍。本人が前（西）へ出ると、味方の備が勢いづいて付いてくる。出すぎて後ろの備から離れると勢いが落ち、味方は鈍る。
//   勢いは旗のはためき（風の強さ）で見せる。字・札・釦は足さない。C = { wIn, wOut, cap0, windStep }
import { allyGroup } from './bhelp.js';
import { WIND_STATE, WIND_DIR, GUST } from './world.js';

// 馬印の勢い。半秒ごと。F.mo：0〜1
export function umaTick(rt, dt, C = {}) {
  const W_IN = C.wIn || [1, 0.12], W_OUT = C.wOut || W_IN, CAP0 = C.cap0 == null ? 0.35 : C.cap0;   // 風：はじめ→変わった後（変わらない戦は同じ）。CAP0＝風の変わる前の勢いの上限
  const F = rt.flags, P = rt.player?.u;
  if (!P || F.ending) return;
  // 風の変わり（向かい風の受けが済んだら・逸話）：八秒かけて向きを回す
  if (F.step >= (C.windStep ?? 1) && !F.windT) F.windT = rt.t;
  const k = F.windT ? Math.min(1, (rt.t - F.windT) / 8) : 0;
  const wx = W_IN[0] + (W_OUT[0] - W_IN[0]) * k, wz = W_IN[1] + (W_OUT[1] - W_IN[1]) * k, wl = Math.hypot(wx, wz) || 1;
  WIND_STATE.dirX = wx / wl; WIND_STATE.dirZ = wz / wl; WIND_DIR.value.set(WIND_STATE.dirX, WIND_STATE.dirZ);
  uma(rt, P, dt);
  if ((F._moT = (F._moT || 0) - dt) > 0) return;
  F._moT = 0.5;
  const fol = (F.allies || []).filter((g) => g && g.count && !g.routed && !g.fixed && g !== F.umaG);
  let rear = 0;
  for (const g of fol) { const c = g.center(); if (c) rear = Math.max(rear, Math.hypot(c.x - P.pos.x, c.z - P.pos.z)); }
  const adv = F._moX == null ? 0 : F._moX - P.pos.x;   // 西（蘆名の側）へ進んだ分
  F._moX = P.pos.x;
  const cap = F.windT ? 1 : CAP0;   // 向かい風のうちは勢いが乗らない
  F.iso = rear > 46;
  if (F.iso) F.mo = Math.max(0, (F.mo || 0) - 0.08);
  else if (adv > 0.6 && rear < 32) F.mo = Math.min(cap, (F.mo || 0) + 0.05);
  else F.mo = Math.max(0, (F.mo || 0) - 0.012);
  F.mo = Math.min(cap, F.mo);
  F.moMax = Math.max(F.moMax || 0, F.mo); if (F.iso) F.isoS = (F.isoS || 0) + 0.5;   // 描かずの通しで読む（勢いの最大・孤立の秒）
  const M = F.mo;
  // 旗のはためき＝勢い（風の強さを共有。旗・幟・草が同じに揺れる）。孤立は旗が垂れる
  WIND_STATE.gust = GUST.value = F.iso ? 0.35 : 0.6 + 1.3 * M;
  // 付いてくる備：本人の後ろへ。速さは勢いで変わる（勢いが無いと後ろが遅れる）
  const back = { x: P.pos.x + 10, z: P.pos.z }, stepMax = 1.4 + 2.6 * M;
  fol.forEach((g, i) => {
    const k2 = i - (fol.length - 1) / 2, tx = back.x + (i % 2) * 6, tz = back.z + k2 * 9;
    const a = g.anchor || g.center() || { x: tx, z: tz }, dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
    const s = Math.min(1, stepMax / Math.max(0.01, d));
    g.anchor = { x: a.x + dx * s, z: a.z + dz * s };
    g.calm = false;
    g.dmgMult = F.iso ? 0.18 : 0.24 + 0.22 * M;
    if (M > 0.5) { g.order = 'attack'; g.seekRange = 18 + 20 * M; } else { g.order = 'hold'; g.aggro = 12 + 8 * M; }
  });
}
// 馬印持ち：本人の右後ろを歩く。斬り合わず、狙われず、数に入れない（賤ヶ岳の金幣の持ち手と同じ手）
export function uma(rt, P, dt) {
  const F = rt.flags;
  if (!F.umaG) {
    F.umaG = allyGroup(rt, { name: '政宗の馬印', anchor: { x: P.pos.x + 2, z: P.pos.z }, noRout: true, order: 'hold', aggro: 0 },
      [{ type: 'ashigaru', n: 1, o: { flag: null, uma: 'date_torige', weapon: 'none', dmg: 0 } }]);
    F.umaP = { x: 0, z: 0 };
  }
  const b = F.umaG.units.find((u) => u.alive);
  if (!b) return;
  if (!b.isUma) { b.isUma = b.isStandard = true; b.noTarget = true; b.invuln = true; if (b.uma) { b.uma.scale.setScalar(1.3); b.uma.updateMatrix(); } }
  const h = P.heading || 0, p = F.umaP;
  // 本人の横・半歩前（真後ろだとカメラと本人の間に竿が立ち本人が隠れ、後ろだと画面の外に出た・844×390 の写真）
  p.x = P.pos.x + Math.sin(h) * 0.6 - Math.cos(h) * 2.2; p.z = P.pos.z + Math.cos(h) * 0.6 + Math.sin(h) * 2.2;
  b.target = null; b.atk = null; b.watch = null;
  b.moveTo = Math.hypot(b.pos.x - p.x, b.pos.z - p.z) > 0.8 ? p : null;
  // 本人が走ると歩きでは遅れる（描かずの通しで十六歩離れた）。一歩半より離れたら、本人の走りに合わせて足を足す（近侍は主の旗から離れない）
  const ex = p.x - b.pos.x, ez = p.z - b.pos.z, ed = Math.hypot(ex, ez);
  if (ed > 1.5) { const k = Math.min(1, (ed - 1.5) * 2 * dt / ed + 5 * dt / ed); b.pos.x += ex * k; b.pos.z += ez * k; }
  F.umaG.anchor = p; F.umaD = Math.hypot(b.pos.x - P.pos.x, b.pos.z - P.pos.z);   // 隊の持ち場も本人に（持ち場へ引き戻されない）
}

