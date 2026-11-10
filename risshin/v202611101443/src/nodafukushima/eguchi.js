// ======================================================================
// 野田・福島の戦い　終わりの段「江口の退き口」（12〜15分。docs/oda15_plan_1108.md の 10）
// - 詰め陣の守兵に合流した後、すぐ締めず、柴田勝家と和田惟政の殿に守られて江口の渡しへ退く（敵陣の間を抜けて退却）。
// - 江口では一揆が舟を隠し、退く列を待ち伏せする（公記）。払って渡しへ着けば、本の締め（winEnd）へ。
// ======================================================================
import { sfx } from '../audio.js';

export const MISSION = '柴田の殿に続き、江口の渡しへ退け';
const DEST = { x: 40, z: 150 };
// 深手で戦えない兵や退いた兵を、渡しを塞ぐ残兵に数えない。
const fighting = u => u.alive && !u.fleeing && !u.dying && !u.woundOut && !u.rearWound && !u.downed && !u.noTarget && !u.gone;

// ctx：{ enemyGroup, makeRoom, dress, ikko, friends[], done() }
export function start(rt, ctx) {
  const F = rt.flags;
  if (F.nodaEguchi) return;
  const S = F.nodaEguchi = { t0: rt.t, done: false, k: 0, at: DEST };
  rt.marker('nodaEguchi', DEST, '江口の渡し', { h: 3, guideAlways: true, alwaysDistance: true });
  for (const g of ctx.friends) if (g && g.count && !g.routed) {
    g.onArrive = null; g.order = 'move'; g.noAI = false; g.dest = { x: DEST.x + (Math.random() - 0.5) * 16, z: DEST.z - 10 - Math.random() * 10 };
  }
  try { sfx('sig_nobiki', 0.6); } catch (e) { /* 音が無くても進む */ }
  rt.say('前田利家', 'よう戻った。だが、ここも長くは持たぬ。殿の柴田殿に続き、江口の渡しへ退くぞ！', 4.2);
  rt.after(10, () => !S.done && rt.say('柴田勝家', '殿は柴田が受け持つ。振り返るな、走れ！', 3.2));
  // 時間だけでは渡しへ着いた事にしない。待ち伏せを払い、本人が着くまで待つ。
  function ambush() {
    if (S.k || S.done || rt.t < (S.spawnAt || 0)) return;
    S.spawnAt = rt.t + 5;
    if (ctx.makeRoom(rt, 12) < 12) return;
    const g = ctx.enemyGroup(rt, { faction: 'honganji', name: '舟を隠した門徒', anchor: { x: DEST.x + 20, z: DEST.z - 34 }, facing: -Math.PI / 2, aggro: 16, seekRange: 50, width: 10, morale: 90 },
      ctx.dress([{ type: 'ashigaru', n: 9 }, { type: 'gun', n: 3 }], ctx.ikko));
    if (!g || !g.count) return;
    S.k = 1; S.aT = rt.t;
    g.ikko = true; g.order = 'attack'; g.focus = rt.player.u; S.g = g;
    rt.marker('nodaAmbush', () => { const u = g.units.find(fighting); return u ? { x: u.pos.x, z: u.pos.z } : null; }, '舟を隠した門徒', { red: true, group: g });
    rt.army.play('eshout', { x: DEST.x + 20, z: DEST.z - 34 }, 1.6);
    rt.say('足軽', '舟が無い！　一揆が舟を隠して待ち伏せしておったぞ！', 3.4);
    rt.after(3.6, () => !S.done && rt.say('前田利家', '道を開けよ！　払って渡しへ抜けるぞ！', 3));
  }
  function withdraw() {
    const g = S.g;
    if (!g || g.routed) return;
    // 追撃の対象を残すと、渡しへ抜ける主人公を退いた門徒が追い続ける。
    g.onArrive = null; g.focus = null;
    g.dest = { x: DEST.x + 20, z: DEST.z - 34 };
    g.noRout = false; g.morale = 0; g.order = 'retreat';
  }
  S.tick = () => {
    if (S.done || rt.over || !rt.player.u.alive) return;
    const p = rt.player.u.pos;
    if (!S.k && (p.z > DEST.z - 60 || rt.t - S.t0 > 45)) ambush();
    let left = 0;
    for (const u of S.g?.units || []) if (fighting(u)) {
      left++;
      // 渡しへ退く本人と待ち伏せが向き合ってから数える。遠くで待つだけでは進めない。
      if (S.contestedAt == null && Math.hypot(p.x - DEST.x, p.z - DEST.z) < 50 &&
          Math.abs(u.pos.y - p.y) < 3 && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 18 &&
          !rt.army.wallBetween(p, -1, u.pos) && !rt.army.terrainBlocks(p, u.pos)) S.contestedAt = rt.t;
    }
    // 殿が支える間に残兵を退かせる。少数の残敵を討ち尽くすまで渡しで足止めしない。
    if (!S.cleared && S.g && S.contestedAt != null && rt.t - S.contestedAt > 120) {
      withdraw();
      S.cleared = true;
      rt.unmark('nodaAmbush');
      rt.say('柴田勝家', '門徒が退くぞ！　追うな、江口の渡しへ抜けよ！', 3.2);
    }
    const clear = S.cleared || !S.g || S.g.routed || left <= 3;
    if (S.k && clear && !S.cleared) { S.cleared = true; rt.unmark('nodaAmbush'); withdraw(); rt.award((t) => t.side.push('江口で待ち伏せの門徒を払った'), '江口の待ち伏せを払った'); }
    if (S.k && clear && Math.hypot(p.x - DEST.x, p.z - DEST.z) < 12) finish();
  };
  function finish() {
    if (S.done) return;
    S.done = true;
    rt.unmark('nodaEguchi'); rt.unmark('nodaAmbush');
    withdraw();
    // 余韻：渡しから振り返ると、砦に本願寺の旗。十一年の戦の始まり
    rt.say('足軽', '振り返れば、砦にも堤にも南無阿弥陀仏の旗じゃ……', 3.4);
    rt.after(3.8, () => { if (!rt.over && rt.player.u.alive) rt.say('柴田勝家', '殿は渡り終えた。舟を出せ！', 2.8); });
    rt.after(7, () => { if (!rt.over && rt.player.u.alive) ctx.done(); });
  }
}
export function active(rt) { const S = rt.flags.nodaEguchi; return !!S && !S.done; }
export function bot(b, goTo, p, inp, strike) {
  const S = b.flags.nodaEguchi;
  if (!S || S.done) return false;
  const u = p.u;
  if (S.g && !S.cleared) {
    let e = null, best = Infinity;
    for (const v of S.g.units) if (fighting(v)) { const d = Math.hypot(v.pos.x - u.pos.x, v.pos.z - u.pos.z); if (d < best) { best = d; e = v; } }
    if (e && best < 30) {
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (best > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2); else strike(p, inp, e, best);
      return true;
    }
  }
  goTo(p, inp, S.at.x, S.at.z, 4);
  return true;
}
