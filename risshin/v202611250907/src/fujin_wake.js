// 11/20 クラウド（K457・K395 kaito「後ろで待つだけの塊を無くす。遠くにいて襲ってこない部隊も、殺し合いなので襲いかかる」・全戦共通）：
//   布陣の表が立てた塊（fujin_layout.js の blk・行。rt.flags._fj）は realFromLight が stay・fixed・hold で立てるので、
//   十八m 内に敵が来ない限り（engageNear）開戦から終わりまで持ち場に立つだけだった。
//   段（済ませた任務の数）と開戦からの時が進むごとに、敵に近い塊から順に起こし、待ちを解いて「かかれ」で前へ出す。
//   起きた塊は ai.js の「かかれ」（見えない相手の隊へ詰める・味方は遊び手の方へ寄る）で動き、ここでも十秒止まれば相手の塊の手前へ持ち場を移す。
//   携帯の重さ：休ませ（idle_far.js）は持ち場で待つ（hold）塊だけなので、起きた塊だけが本気で考える。起こす数は段と時で少しずつ増やす。
//   起こさない：わざわざ待たせると書いた行（blk の { noEngage: true }・blk でない行の noEngage＝本能寺の明智など）・moves を歩く間・崩れた塊・戦の def.noFujinWake。?k457=0 で切る（前後の比べ用）
const WAKE_T0 = 10;      // 開戦から最初に起こすまで（秒）
const PER_STAGE = 4;     // 段が一つ進むごとに、両軍それぞれ起こす塊の数
const PER_SEC = 1 / 5;   // 時が進むごとに（五秒に一つ）

function stageOf(rt) {
  let n = 0; for (const o of rt.objectives || []) if (o && o.state === 'done') n++;
  return n;
}
function centerOf(g) {
  let x = 0, z = 0, n = 0;
  for (const u of g.units) if (u.alive && !u.gone) { x += u.pos.x; z += u.pos.z; n++; }
  return n ? { x: x / n, z: z / n, n } : null;
}

export function fujinWakeTick(rt, stayPut = false) {
  rt._fjStay = stayPut;
  const F = rt.flags, list = F && F._fj;
  if (!list || !list.length || rt.over || F.ending || rt.def?.noFujinWake || F.beforeWar) return;
  if ((F._fwT || 0) > rt.t) return; F._fwT = rt.t + 2;
  if (typeof location !== 'undefined' && /[?&]k457=0\b/.test(location.search)) return;
  if (F._fwT0 == null) F._fwT0 = rt.t;   // 表の塊が立った時を開戦とする
  const since = rt.t - F._fwT0; if (since < WAKE_T0) return;
  const allow = 2 + stageOf(rt) * PER_STAGE + Math.floor((since - WAKE_T0) * PER_SEC);
  // 動ける敵の中心（側ごと）。生きている兵のいる組の中心を集める
  const foeC = [[], []];
  for (const g of rt.army.groups) {
    if (!g.units || g.routed || g.civ || !(g.count > 0) || g.team > 1) continue;
    const c = centerOf(g); if (c && c.n >= 2) foeC[g.team].push(c);
  }
  const nearFoe = (team, c) => { let best = null, bd = 1e9; for (const o of foeC[1 - team] || []) { const d = Math.hypot(o.x - c.x, o.z - c.z); if (d < bd) { bd = d; best = o; } } return best ? { c: best, d: bd } : null; };
  // 表の stayPut（設楽原の柵の内・鳥取の囲み）は味方（遊び手の側）の塊を持ち場から出さない（柵・囲みを守るのが筋）。寄せる側だけ起こす
  //   ただし本人が柵・囲みの味方の塊から五十 m より前へ出たら（設楽原の追い討ち）、味方の塊も起こして本人の周りの敵へ出す
  const me = rt.player?.u, my = me?.team ?? 0;
  let ahead = false;
  if (rt._fjStay && me) { let bd = 1e9; for (const g of list) if (g && g.team === my && !g._fjWoke && g.stay) { const c = centerOf(g); if (c) bd = Math.min(bd, Math.hypot(c.x - me.pos.x, c.z - me.pos.z)); } ahead = bd > 50 && bd < 1e9; }
  for (const team of (rt._fjStay && !ahead ? [1 - my] : [0, 1])) {
    let woke = 0; const sleep = [];
    for (const g of list) {
      if (!g || g.team !== team || !g.units) continue;
      if (g._fjWoke) { woke++; pushOn(rt, g, nearFoe); continue; }
      const r = g._fjR; if (!r || (r.noEngage && (r._neHold || !r.blocks)) || g.routed || g._fjMoving || !(g.count > 0) || !g.stay || g.order !== 'hold') continue;
      // 11/20 cloud-41（戸次川の主）：def.fujinWakeHold(rt, g)＝筋書きが「まだ伏せて待つ」塊は起こさない（戸次川：島津の本隊は包みの段まで尾根の奥）
      if (rt.def?.fujinWakeHold?.(rt, g)) continue;
      const c = centerOf(g); if (!c) continue;
      const f = nearFoe(team, c); if (!f) continue;
      sleep.push({ g, d: f.d });
    }
    if (woke >= allow || !sleep.length) continue;
    sleep.sort((a, b) => a.d - b.d);
    for (let i = 0; i < sleep.length && woke < allow; i++, woke++) wake(rt, sleep[i].g);
  }
}

function wake(rt, g) {
  g._fjWoke = true; g._fwAt = rt.t; g.noEngage = false;
  g.stay = false; g.fixed = false; g.order = 'attack'; g.aggro = Math.max(g.aggro || 0, 22); g.seekRange = Math.max(g.seekRange || 0, 40);
  g.dest = null; g.path = null; g.speed = Math.max(g.speed || 0, 3.4);
  // 休ませていた兵（idle_far・idle_park）は起こす
  for (const u of g.units) {
    if (u._kyk) { u._kyk = false; u.idleSkip = false; if (u.mesh && !u.mesh.parent && u._kyParent) { u._kyParent.add(u.mesh); u._kyParent = null; } }
    u.keepReal = true;
  }
}

// 起きた塊が四秒持ち場で止まり、誰も斬り合っていなければ、近い相手の塊の六 m 手前へ持ち場を移す（一度に三十 m まで）
function pushOn(rt, g, nearFoe) {
  if (g.routed || !(g.count > 0) || g.order !== 'attack' || g.focus) return;
  const c = centerOf(g); if (!c) return;
  const st = g._fwSt;
  if (!st || Math.hypot(c.x - st.x, c.z - st.z) > 2) { g._fwSt = { x: c.x, z: c.z, t: rt.t }; return; }
  if (rt.t - st.t < 4) return;
  st.t = rt.t;
  if (g.units.some((u) => u.alive && (u.atk || u.target && u.target.alive && Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) < 6))) return;
  const f = nearFoe(g.team, c); if (!f || f.d < 8) return;
  const k = Math.min(30, f.d - 6), dx = (f.c.x - c.x) / f.d, dz = (f.c.z - c.z) / f.d;
  const lim = (rt.world?.def?.moveLim || rt.def?.moveLim || 176) - 16;
  g.anchor = { x: Math.max(-lim, Math.min(lim, c.x + dx * k)), z: Math.max(-lim, Math.min(lim, c.z + dz * k)) };
}
