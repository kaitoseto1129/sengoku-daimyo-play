// ======================================================================
// 志賀の陣・宇佐山城　始まりの段「湖の道の物見」（0〜3分。docs/oda15_plan_1108.md の 11）
// - 宇佐山城の麓の坂本の町で森可成の隊と合流する前に、北の湖の道の物見の辻へ出て、下って来る浅井・朝倉の大軍を見る。
//   着いたら必ず何か起きる：敵将の名が頭上に出る・手柄・朝倉の物見の小勢が辻へ寄せる。
// - 辻で旗を見て、物見を追い払い町口へ戻ると十六日の町口の戦へ進む。
// ======================================================================
import { sfx } from '../audio.js';
import { revealName } from '../battle_intel.js';

export const MISSIONS = ['北の湖の道の辻へ出て、下って来る浅井・朝倉の旗を見よ', '辻へ寄せる朝倉の物見を、森隊と追い払え'];
const MIN_T = 135, MAX_T = 195, SCOUT_WAIT = 55;
const scoutActive = (u) => u.alive && !u.gone && !u.fleeing && !u.downed && !u.woundOut && !u.rearWound;

// ctx：{ at（物見の辻）, home（町口）, enemyGroup, dress, look（朝倉の具足）, ready() }
export function install(rt, ctx) {
  const F = rt.flags, MI = ctx.at, S = F.shigaMonomi = { k: 0, t0: rt.t, done: false, at: MI };
  const live = () => !S.done && !F.ending && !rt.over && !F.step;
  rt.marker('shigaMi', MI, '湖の道の辻');
  rt.after(5, () => live() && rt.say('森可成', '槍の列に入る前に、北の辻へ出て敵の旗を見て来い。数を知らねば守れぬ', 4.2));
  rt.after(20, () => live() && rt.say('足軽', '湖の向こうまで旗じゃ……あれが皆、敵か', 3));
  rt.after(SCOUT_WAIT, () => { if (live() && S.k === 0) rt.say('森可成', '北の湖の道の辻へ出よ。敵の旗を見届けて来い！', 3.5); });
  rt.after(78, () => live() && rt.say('織田信治', '兄上は摂津。ここはわしらで支えるほかない', 3.4));
  rt.after(MAX_T, () => { if (live()) rt.say('森可成', S.k === 3 ? '坂本の町口へ戻れ。槍の列を組むぞ！' : S.k === 0 ? '北の湖の道の辻へ出て、敵の旗を見届けよ！' : '湖の道の辻で、朝倉の物見を追い払え！', 3.5); });

  function seen(arrived) {
    if (S.k !== 0) return;
    S.k = 1;
    rt.unmark('shigaMi');
    for (const c of [F.campA, F.campB]) {
      if (c?.general?.name) { try { revealName(rt, c.general.name); } catch (e) { /* 名の無い将は飛ばす */ } }
    }
    if (arrived) rt.award((t) => { t.side.push('湖の道で浅井・朝倉の軍勢を見届けた'); t.special = { label: '敵の軍勢を見届けた', pts: 10 }; }, '敵の軍勢を見届けた', MI);
    try { sfx('horagai', 0.6); } catch (e) { /* 音が無くても進む */ }
    rt.say('森可成', '三万はおるか……。朝倉が湖の道、浅井が山側じゃ。十倍の敵ぞ', 4);
    rt.after(6, () => scouts());
  }
  function scouts() {
    if (!live() || S.g) return;
    const g = ctx.enemyGroup(rt, { faction: 'asakura', name: '朝倉の物見', anchor: { x: MI.x - 4, z: MI.z - 34 }, marchTo: MI, facing: 0, order: 'attack', seekRange: 60, aggro: 14, morale: 70, fleeDir: { x: 0, z: -1 } },
      ctx.dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 7 }, { type: 'gun', n: 2 }], ctx.look));
    // 兵数の上限でまだ出せない時も、敵を追い払った扱いにしない。
    if (!g || !g.count) { rt.after(3, scouts); return; }
    S.g = g; S.k = 2; S.gT = rt.t;
    rt.marker('shigaScout', () => { const u = g.units.find((v) => v.alive); return u ? { x: u.pos.x, z: u.pos.z } : null; }, '朝倉の物見', { red: true, group: g });
    rt.army.play('eshout', { x: MI.x - 4, z: MI.z - 34 }, 1.3);
    rt.say('足軽', '朝倉の物見が辻へ来るぞ！', 2.8);
    rt.after(3, () => live() && rt.say('森可成', '一人も帰すな！　こちらの数を知られるぞ！', 3));
  }
  S.tick = () => {
    if (S.done || rt.over || F.ending) return;
    if (F.step) { S.done = true; return; }
    const p = rt.player.u.pos;
    if (S.k === 0 && Math.hypot(p.x - MI.x, p.z - MI.z) < 8) seen(true);
    if (S.k === 2) {
      const left = S.g.units.filter(scoutActive).length;
      if (rt.t - S.gT > 10 && (left <= 2 || S.g.routed)) {
        S.k = 3; S.backT = rt.t;
        rt.unmark('shigaScout');
        if (!S.g.routed) { S.g.noRout = false; S.g.morale = 0; S.g.order = 'retreat'; }
        rt.say('森可成', 'よし。町口へ戻れ、槍の列を組むぞ！', 3.2);
      }
    }
    if (S.k === 3 && rt.t - S.t0 >= MIN_T && rt.t - S.backT > 8 &&
        Math.hypot(p.x - ctx.home.x, p.z - ctx.home.z) < 8) finish();
  };
  function finish() {
    if (S.done || F.step || rt.over || F.ending) return;
    S.done = true;
    rt.unmark('shigaMi'); rt.unmark('shigaScout');
    if (S.g && !S.g.routed) { S.g.noRout = false; S.g.morale = 0; S.g.order = 'retreat'; }
    ctx.ready();
  }
}
export function stageOf(rt) {
  const S = rt.flags.shigaMonomi;
  if (!S || S.done || rt.flags.step) return null;
  return S.k >= 2 ? 1 : 0;
}
export function bot(b, goTo, p, inp, strike, home) {
  const S = b.flags.shigaMonomi;
  if (!S || S.done || b.flags.step) return false;
  // 敵の到着待ちも辻に留まり、撃退前に町口へ戻らない。
  if (S.k <= 1) { goTo(p, inp, S.at.x, S.at.z, 3); return true; }
  const u = p.u;
  if (S.k === 2 && S.g) {
    // 物見を追って北の本隊へ入り込まず、辻で寄せ手を受ける。
    if (Math.hypot(u.pos.x - S.at.x, u.pos.z - S.at.z) > 40) {
      goTo(p, inp, S.at.x, S.at.z, 3); return true;
    }
    let e = null, best = Infinity;
    for (const v of S.g.units) if (scoutActive(v) && Math.hypot(v.pos.x - S.at.x, v.pos.z - S.at.z) <= 40) { const d = Math.hypot(v.pos.x - u.pos.x, v.pos.z - u.pos.z); if (d < best) { best = d; e = v; } }
    if (e) {
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (best > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2); else strike(p, inp, e, best);
      return true;
    }
    goTo(p, inp, S.at.x, S.at.z, 3); return true;
  }
  goTo(p, inp, home.x, home.z, 3);
  return true;
}
