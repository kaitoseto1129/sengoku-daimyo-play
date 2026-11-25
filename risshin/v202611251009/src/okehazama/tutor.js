// ======================================================================
// K654（kaito 11/25「上司・先輩が『ついてこい』と導き、その人を通じて操作を覚える」）桶狭間の始め：組頭 源八の手ほどき
//   稲生で覚えた事（歩く・走る・突く・受ける）は繰り返さず、桶狭間で新しく要る四つを一つずつ、源八の動きと声だけで教える。
//   字の札・新しいボタンは足さない。任務の札は本体のまま（①谷の出口へ → ③下知を待つ → ④松井の備え）で、ここは札より先へ言わない。
//   一 声を殺して進む（谷を下る march）：源八が先を歩く。走ると振り向いて「しっ、走るな」。歩いて付けば「それでよい」。
//      遅れて組が待つ間は、源八が振り向いて呼び、二十四m 余り離れると組ごと戻って来て呼ぶ。
//   二 伏せて待つ（谷の出口 wait）：組は片膝で伏せる。物見・鉄砲衆を退けた後、本人が旗のそばで二秒じっとするまで「かかれ」を待つ
//      （離れると「旗へ戻れ」、動くと「動くな」。四十秒で必ず先へ）。
//   三 合図で駆け下りる（かかれ）：本人の組は伏せたまま待ち、本人が走り出したら立って一緒に駆け下りる（六秒で必ず先へ）。
//   四 旗を見て大将へ：源八が山の上の今川の大旗を指す。本人がそちらを向いたら「あれが大将の旗ぞ」（十四秒で畳む）。
//   主君（信長）で遊ぶ時は出さない。斬り合いの最中（本人の十四m に敵）は呼ばない。
// ======================================================================
const ready = (u) => !!u && u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget;
const WHO = '組頭 源八';

function S(rt) { return rt.flags.otut; }
function leader(rt) { const g = rt.hostGroup, G = rt.flags.genpachi; return ready(G) && g?.units.includes(G) ? G : g?.units.find(ready) || null; }
// 源八が本人へ向き、槍を掲げて呼ぶ（声は八秒に一度まで）
function call(rt, text, d = 2.4, force = false) {
  const T = S(rt), L = leader(rt), P = rt.player.u;
  if (!L) return;
  if (rt.hostGroup && (rt.hostGroup.speed === 0 || rt.hostGroup.order === 'hold')) rt.hostGroup.facing = Math.atan2(P.pos.x - L.pos.x, P.pos.z - L.pos.z);
  if (!force && rt.t < T.callT) return;
  T.callT = rt.t + 8;
  L.cheer = 1.4; L._crouch = false;
  if (text && Math.hypot(L.pos.x - P.pos.x, L.pos.z - P.pos.z) < 34) rt.say(WHO, text, d);
}
const fighting = (rt) => !!rt.army.nearestEnemy(rt.player.u, 14, ready);
const running = (rt) => !!rt.player.running && (rt.player.u.moving || 0) > 0.9;

export function start(rt) {
  if (rt.G.lord || rt.flags.otut) return;
  rt.flags.otut = { step: 'quiet', t0: rt.t, callT: rt.t + 4, ok: 0, backT: 0 };
  rt.after(3.4, () => { const T = S(rt); if (T?.step === 'quiet' && rt.phase === 'march') call(rt, '雨に紛れて寄せる。声を殺せ。走らず、わしの後ろを歩いて来い', 3.6, true); });
}

export function tick(rt, dt) {
  const T = S(rt), F = rt.flags;
  if (!T || T.step === 'done' || rt.over || F.ending || !rt.player.u.alive) return;
  T.acc = (T.acc || 0) + dt;
  // 伏せて待つ間のじっとした時間と、かかれの走り出しは毎コマ数える（一瞬の事）
  if (T.step === 'kake' && !T.go && running(rt)) release(rt, true);
  if (T.acc < 0.25) return;
  const st = T.acc; T.acc = 0;
  if (T.step === 'quiet') quiet(rt, T, st);
  if (T.step === 'fuse') fuse(rt, T, st);
  if (T.step === 'kake') kake(rt, T);
  if (T.step === 'hata') hata(rt, T, st);
}

// 一 声を殺して進む
function quiet(rt, T) {
  const F = rt.flags, g = rt.hostGroup, L = leader(rt), P = rt.player.u;
  if (rt.phase === 'wait' || rt.phase === 'assault') { toFuse(rt, T); return; }
  if (rt.phase !== 'march' || !L || !g) return;
  const d = Math.hypot(L.pos.x - P.pos.x, L.pos.z - P.pos.z);
  // 戻って来た組は、本人の十m 手前で道へ戻る
  if (T.back) {
    if (d < 10 || rt.t - T.back > 14) { T.back = 0; g.order = 'path'; g.onArrive = null; call(rt, '遅れるな。声を立てず、わしの後ろに付け', 2.8, true); }
    return;
  }
  if (fighting(rt)) return;
  if (running(rt) && d < 30) { T.ok = 0; call(rt, 'しっ！　走るな。足音を殺して歩け', 2.4); return; }
  if (!T.praised && d < 10 && (P.moving || 0) > 0.15 && !rt.player.running) {
    T.ok += 0.25;
    if (T.ok >= 4) { T.praised = true; call(rt, 'それでよい。そのまま静かについて来い', 2.6, true); }
  }
  // 組が本人を待っている（本体の march が足を止めた）間は、源八が振り向いて呼ぶ。遠ければ組ごと戻る
  if (F.marchPaused && !g.arrived) {
    if (d > 24 && rt.t > T.backT) {
      T.back = rt.t; T.backT = rt.t + 20;
      const k = 8 / d, dest = { x: P.pos.x + (L.pos.x - P.pos.x) * k, z: P.pos.z + (L.pos.z - P.pos.z) * k };
      g.order = 'move'; g.dest = dest; g.anchor = { ...dest };
      g.onArrive = (q) => { q.order = 'path'; q.onArrive = null; };
      call(rt, 'こっちじゃ！　遅れるでない！', 2.4, true);
    } else if (d > 6) call(rt, 'こっちじゃ。静かに来い', 2.2);
  }
}

// 二 伏せて待つ
function toFuse(rt, T) {
  T.step = 'fuse'; T.t0 = rt.t; T.ok = 0; T.still = 0;
  if (T.back) { T.back = 0; const g = rt.hostGroup; if (g?.order === 'move') { g.order = 'hold'; g.onArrive = null; } }
  crouch(rt);
}
// 止まっている組の者を片膝に（動く・敵を狙うと army_anim が立たせる）
function crouch(rt) {
  for (const u of rt.hostGroup?.units || []) if (ready(u) && !u.isPlayer && !u.target && (u.moving || 0) < 0.1) u._crouch = true;
}
function fuse(rt, T, st) {
  const F = rt.flags, v = F.o15 || {}, P = rt.player.u;
  if (rt.phase === 'assault') { toKake(rt, T); return; }
  if (rt.phase !== 'wait') return;
  // 物見・鉄砲衆と戦う間は教えない。退けた後の「下知を待つ」所で伏せて待つ事を覚える
  if (!v.zeneiDone) return;
  if (T.zd == null) T.zd = rt.t;
  if (!fighting(rt)) crouch(rt);
  const W = F.waitPos, dw = W ? Math.hypot(W.x - P.pos.x, W.z - P.pos.z) : 0;
  const still = dw <= 9 && (P.moving || 0) < 0.1;
  T.still = still ? T.still + st : 0;
  if (!T.settled && T.still >= 2) { T.settled = true; call(rt, 'よし。そのまま伏せて、殿の下知を待て', 2.8, true); }
  if (T.settled || rt.t - T.zd > 40) return;
  // やるまで「かかれ」を待つ（本体の雨待ちの時刻を少しずつ先へ）
  if (Number.isFinite(F.waitReadyAt)) F.waitReadyAt = Math.max(F.waitReadyAt, rt.t + 1);
  if (fighting(rt)) return;
  if (dw > 9) call(rt, '旗へ戻れ。ここで伏せて待つのじゃ', 2.6);
  else if ((P.moving || 0) >= 0.1) call(rt, '動くな。伏せておれ', 2);
}

// 三 合図で駆け下りる
function toKake(rt, T) {
  T.step = 'kake'; T.t0 = rt.t; T.go = false;
  const g = rt.hostGroup;
  if (g && !g.routed) { T.speed = g.speed; g.speed = 0; }
  rt.after(2.6, () => { if (S(rt) === T && T.step === 'kake' && !T.go) call(rt, '今じゃ！　立って走れ、駆け下りよ！', 2.4, true); });
}
function kake(rt, T) {
  if (rt.t - T.t0 > 4.5 && !T.hurry) { T.hurry = true; call(rt, '走れ！　組が待っておるぞ！', 2, true); }
  if (rt.t - T.t0 > 6) release(rt, false);
}
function release(rt, ran) {
  const T = S(rt), g = rt.hostGroup;
  if (T.go) return;
  T.go = true;
  if (g && T.speed != null && g.speed === 0) g.speed = T.speed;
  for (const u of g?.units || []) u._crouch = false;
  if (ran) call(rt, 'それっ！　続け、駆け下りよ！', 2, true);
  T.step = 'hata'; T.t0 = rt.t; T.look = 0;
  rt.after(2.4, () => { if (S(rt) === T && T.step === 'hata') call(rt, '見よ、山の上の今川の大旗を。あの旗の下に義元がおる', 3.2, true); });
}

// 四 旗を見て大将へ
function hata(rt, T, st) {
  const v = rt.flags.o15, H = v?.C?.fieldPoint(v.C.HONJIN.x, v.C.HONJIN.z), p = rt.player, P = p.u.pos;
  if (!H || rt.t - T.t0 > 14) { T.step = 'done'; return; }
  if (rt.t - T.t0 < 2.6) return;
  const want = Math.atan2(H.x - P.x, H.z - P.z), a = (p.yaw || 0) + (p.camYawOff || 0);
  const diff = Math.abs(Math.atan2(Math.sin(want - a), Math.cos(want - a)));
  T.look = diff < 0.5 ? T.look + st : 0;
  if (T.look >= 0.5) { T.step = 'done'; call(rt, 'そうじゃ。あれが大将の旗ぞ。旗を目指して押せ！', 2.6, true); return; }
  if (rt.t - T.t0 > 8 && !T.again && !fighting(rt)) { T.again = true; call(rt, '山の上の旗を見よ！', 2, true); }
}
