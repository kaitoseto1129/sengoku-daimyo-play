// ======================================================================
// 野田・福島の戦い　始まりの段「水路の物見」（0〜3分。docs/oda15_plan_1108.md の 10）
// - 堤の東の端から葦の水路へ下り、淀川の向こうの野田砦・福島砦を見る（足場は泥と葦。三好方の砦の確かめ）。
//   着いたら必ず何か起きる：砦の将の名が頭上に出る・手柄・葦の中の三好の鉄砲が撃ちかけて来る。
// - 葦に潜む鉄砲を追い払うと、前田利家の下知（本の筋書きの ①）へ。物見と鉄砲の撃退を終えるまで、下知へ進めない。
// ======================================================================
import { sfx } from '../audio.js';
import { revealName } from '../battle_intel.js';

export const MISSIONS = ['堤の東の端から葦の水路へ下り、野田・福島の砦を見よ', '葦に潜んで撃つ三好の鉄砲を、水路の岸から追い払え'];
const MI = { x: 52, z: -17 };   // 堤の東の端の先、葦の岸（淀川の向こうに二つの砦）
const MIN_T = 150;
// 深手や退いた兵を残敵に数えず、戦える相手だけを防ぐ。
const fighting = u => u.alive && !u.fleeing && !u.dying && !u.woundOut && !u.rearWound && !u.downed && !u.noTarget && !u.gone;

// ctx：{ enemyGroup, makeRoom, dress, foe（三好の具足）, ready()（前田の下知へ） }
export function install(rt, ctx) {
  const F = rt.flags, S = F.nodaSuiro = { k: 0, t0: rt.t, done: false, at: MI };
  const live = () => !S.done && !F.ending && !rt.over && !F.step;
  rt.marker('nodaMi', MI, '葦の水路', { guideAlways: true, alwaysDistance: true });
  rt.after(4.5, () => live() && rt.say('前田利家', '下知の前に、水路の先の砦を見て来い。堤の東の端から葦へ下りよ', 4));
  rt.after(16, () => live() && rt.say('足軽', '泥が深い……足を取られるぞ。葦の根を踏め', 3));
  rt.after(34, () => { if (!live()) return; try { sfx('gun', 0.6); } catch (e) { /* 音が無くても進む */ } rt.say('組頭', '砦の狭間から撃って来おる。堤の陰を伝え', 3); });
  // 待つ間も戦場は動く：入江を埋める人足・西の井楼・三好の太鼓
  rt.after(88, () => live() && rt.say('組頭', '見よ、入江を埋める人足じゃ。土俵を担いで堤を延ばしておる', 3.6));
  rt.after(112, () => { if (!live()) return; try { sfx('taiko', 0.6); } catch (e) { /* 音が無くても進む */ } rt.say('足軽', '砦の中で太鼓が鳴っておる……三好も出る気か', 3.2); });

  function seen() {
    if (S.k !== 0) return;
    S.k = 1; S.spawnAt = rt.t + 5;
    // 鉄砲を追い払う間も岸の行き先を残す。敵の赤い印は道案内に選ばれない。
    for (const n of ['三好長逸', '岩成友通', '三好康長']) { try { revealName(rt, n); } catch (e) { /* 名の無い将は飛ばす */ } }
    rt.award((t) => { t.side.push('水路の先の野田・福島の砦を見届けた'); t.special = { label: '砦の構えを見届けた', pts: 10 }; }, '二つの砦を見届けた', MI);
    rt.say('前田利家', 'よう見た。川向こうの中が福島、西が野田。塀の狭間に雑賀の鉄砲衆が籠もる', 4);
    rt.after(5, () => snipers());
  }
  function snipers() {
    if (!live() || S.g || rt.t < (S.spawnAt || 0)) return;
    S.spawnAt = rt.t + 5;
    // 名の無い遠い控えを退かせ、鉄砲四人を含む十人の枠を先に確保する。
    // 出せなかった敵を、時刻だけで追い払った事にはしない。
    if (ctx.makeRoom(rt, 10) < 10) return;
    const g = ctx.enemyGroup(rt, { faction: 'miyoshi', name: '葦に潜む三好の鉄砲', anchor: { x: MI.x + 24, z: MI.z - 3 }, facing: -Math.PI / 2, aggro: 16, seekRange: 40, width: 8, morale: 70 },
      ctx.dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 4 }, { type: 'ashigaru', n: 5 }], ctx.foe));
    if (!g || !g.count) return;
    S.g = g; S.k = 2; S.gT = rt.t;
    g.order = 'attack';
    rt.marker('nodaSnipe', () => { const u = g.units.find(fighting); return u ? { x: u.pos.x, z: u.pos.z } : null; }, '三好の鉄砲', { red: true, group: g });
    try { sfx('gun', 1); } catch (e) { /* 音が無くても進む */ }
    rt.say('足軽', '葦の中から撃って来たぞ！　舟で渡って来おった！', 3);
    rt.after(3.2, () => live() && rt.say('前田利家', '込め替えの隙に寄って突け！　水路の岸から追い払え！', 3.4));
  }
  function withdraw() {
    const g = S.g;
    if (!g || g.routed) return;
    // 少数まで減った時も、攻め先や追う相手を残さず出撃元へ退く。
    g.onArrive = null; g.focus = null;
    g.dest = { x: MI.x + 24, z: MI.z - 3 };
    g.noRout = false; g.morale = 0; g.order = 'retreat';
  }
  S.tick = () => {
    if (S.done || rt.over || F.ending || !rt.player.u.alive) return;
    if (F.step) { S.done = true; return; }
    const p = rt.player.u.pos;
    if (S.k === 0 && Math.hypot(p.x - MI.x, p.z - MI.z) < 7) seen();
    if (S.k === 1) snipers();
    if (S.k === 2) {
      const left = S.g.units.filter(fighting).length;
      // 岸で実際に撃ち合ってから数える。遠くで待っただけでは追い払った事にしない。
      if (S.contestedAt == null && Math.hypot(p.x - MI.x, p.z - MI.z) < 16 &&
          S.g.units.some(u => fighting(u) && Math.abs(u.pos.y - p.y) < 3 &&
            Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 40 &&
            !rt.army.wallBetween(p, -1, u.pos) && !rt.army.terrainBlocks(p, u.pos))) S.contestedAt = rt.t;
      // 葦や水際に残った数人の全滅待ちをしない。交戦が長引けば砦へ退く。
      if (S.contestedAt != null && rt.t - S.contestedAt > 120 && !S.g.routed && left > 2) {
        withdraw();
        S.k = 3; S.backT = rt.t;
        rt.unmark('nodaSnipe');
        rt.say('前田利家', '三好の鉄砲が退くぞ。追うな、堤へ戻れ！', 3.5);
      }
      if (S.k === 2 && (left <= 2 || S.g.routed)) {
        S.k = 3; S.backT = rt.t;
        rt.unmark('nodaSnipe');
        withdraw();
        rt.say('前田利家', '追い払ったな。堤へ戻れ、今日の下知を言うぞ', 3.5);
      }
    }
    if (S.k === 3 && rt.t - S.t0 >= MIN_T && rt.t - S.backT > 8) finish();
  };
  function finish() {
    if (S.done || S.k !== 3 || F.step || rt.over || F.ending) return;
    S.done = true;
    rt.unmark('nodaMi'); rt.unmark('nodaSnipe');
    withdraw();
    ctx.ready();
  }
}

export function stageOf(rt) {
  const S = rt.flags.nodaSuiro;
  if (!S || S.done || rt.flags.step) return null;
  return S.k >= 2 ? 1 : 0;
}
// bot：葦の岸へ
export function bot(b, goTo, p, inp, strike) {
  const S = b.flags.nodaSuiro;
  if (!S || S.done || b.flags.step) return false;
  // 物見の直後は五秒後の伏兵を岸で待つ。出る前に堤へ帰らない。
  if (S.k <= 1) { goTo(p, inp, S.at.x, S.at.z, 3); return true; }
  const u = p.u;
  if (S.k === 2 && S.g) {
    let e = null, best = Infinity;
    for (const v of S.g.units) if (fighting(v)) { const d = Math.hypot(v.pos.x - u.pos.x, v.pos.z - u.pos.z); if (d < best) { best = d; e = v; } }
    if (e) {
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (best > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2); else strike(p, inp, e, best);
      return true;
    }
  }
  goTo(p, inp, 0, -2, 3);
  return true;
}
