// ======================================================================
// 高遠城　本丸の段（11〜14分・docs/oda15_plan_1108.md 30「本丸へ・仁科隊最後の抵抗・盛信最期」）
// 二の丸を取った後の行き先を一つずつ示す：本丸の門へ詰める → 門が破れる（味方の総懸かり）→ 本丸の旗の下へ。
// 11/8 bot：元の流れでは二の丸の奥で足が止まり、本丸の門へ向かえないまま時が尽きていた（段を入れる前から）。
//   門の前で時を使い切らないよう、詰めて二十秒で味方の掛矢が門を破る。本丸に入って盛信の最期が来なければ、
//   主殿の奥で盛信が自ら果てる（史実：盛信は最後まで戦い自害したと伝わる）。
// 入れ方：takato/nobutada.js の二の丸の段の終わりから start(rt, K)。
// ======================================================================
import { k15Go, k15Scenes, k15Heal } from '../oda15_kit.js';
import { sfx } from '../audio.js';

export function start(rt, K) {
  const F = rt.flags;
  if (F.ending || F.k15hon) return;
  F.k15hon = true; F.k15on = true; F.k15fight = false; F.k15stage = 'honmaru';
  k15Heal(rt);
  const stop = () => F.ending || rt.over;
  const gate = { x: K.GATE_HON.x + 12, z: K.GATE_HON.z };
  const toGate = () => { const p = rt.player.u.pos; return p.x > 5 ? { x: -2.125, z: -8 } : gate; };
  k15Go(rt, 'hm-gate', () => (Math.hypot(rt.player.u.pos.x - gate.x, rt.player.u.pos.z - gate.z) < 7 ? gate : toGate()), 7, '本丸の門へ詰めよ', '本丸の門', () => {
    rt.say('森長可', '掛矢を持て！　門を打ち破れ！', 3.5);
    const t0 = rt.t;
    const wait = () => {
      if (stop()) return;
      const g = F.gates;
      if (!(g.honInner.opened || g.honOuter.opened) && rt.t - t0 < 20) { rt.after(0.5, wait, true); return; }
      for (const q of [g.honOuter, g.honInner]) if (!q.opened) q._openNow?.(true);
      rt.banner('本丸の門、破れる', '味方の掛矢が門を打ち倒した');
      sfx('crash', 0.6);
      k15Heal(rt);
      inside();
    };
    wait();
  }, { limit: 90 });
  // 本丸の門から旗までは、土橋と喰違いの道をたどる（直に向かうと土塁に詰まる）
  const ROAD = [[17, 10], [-2.125, -8], [K.GATE_HON.x + 6, -8], [-41, -8], [-45, -8], [-43.6, -4], [-45, 0], [-52, 0]];
  let wi = -1;
  const way = () => {
    const p = rt.player.u.pos;
    if (wi < 0) { let best = Infinity; ROAD.forEach((q, i) => { const d = Math.hypot(p.x - q[0], p.z - q[1]); if (d < best) { best = d; wi = i; } }); }
    while (wi < ROAD.length - 1 && Math.hypot(p.x - ROAD[wi][0], p.z - ROAD[wi][1]) < 2.5) wi++;
    return { x: ROAD[wi][0], z: ROAD[wi][1] };
  };
  function inside() {
    k15Go(rt, 'hm-post', way, 1.5, '本丸へ攻め入り、旗の下へ', '本丸の旗', () => {
      F.k15fight = false;
      const t0 = rt.t;
      const last = () => {
        if (stop()) return;
        if (F.keepFell || F.keep?.down || F.lordDying) { hold(); return; }
        if (rt.t - t0 < 45) { rt.after(0.5, last, true); return; }
        // 主殿の奥で盛信が果てる
        if (!F.honFell) { try { rt.def.honTaken.call(rt.def, rt); } catch (e) { /* 本丸の記録が無い時も続ける */ } }
        F.lordDying = true; F.lordState = 'last';
        k15Scenes(rt, [
          [0.5, () => rt.say('仁科盛信', '城はここまでか。降りはせぬ。さらばじゃ', 4)],
          [4.5, () => {
            const lord = F.keep?.lord;
            if (lord?.alive) { lord.invuln = false; lord.hp = 0; rt.army.kill(lord, null); }
            F.keepFell = true; F.lordState = 'dead';
            rt.say('使番', '仁科五郎、主殿の奥にて果てたり！　旗を守れ', 4);
            hold();
          }],
        ]);
      };
      last();
    }, { limit: 90 });
  }
  // 旗の下に立ち続ける（元の締め：旗の下で十二秒）
  function hold() {
    // 城主が果てると、本丸に残る城兵は崩れて搦手の崖へ逃げる（元の勝ちも残る備えの士気を落とす）
    for (const g of rt.army.groups) {
      if (g.team !== 1 || g.routed || !g.units.some((u) => u.alive)) continue;
      const c = g.center?.(); if (!c || Math.hypot(c.x - F.honPost.x, c.z - F.honPost.z) > 32) continue;
      g.noRout = false; g.routed = true; g.order = 'flee'; g.fleeDir = { x: -1, z: 0 }; g.fleeSet = true;
      for (const u of g.units) if (u.alive) { u.invuln = false; u.noTarget = false; u.perch = null; u.fleeing = true; u.target = null; u.atk = null; u.swing = null; }
    }
    k15Heal(rt);
    F.k15at = { id: 'hm-hold', at: way, r: 2, t0: rt.t };
    rt.marker('k15', () => F.honPost, '本丸の旗', { h: 3, guideAlways: true });
    rt.obj('main', '本丸の旗の下で、味方と旗を守れ', 'main', true);
  }
}
