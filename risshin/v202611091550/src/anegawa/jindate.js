// ======================================================================
// 姉川の戦い　始まりの段「両軍の布陣と物見」（0〜3分。docs/oda15_plan_1108.md の 9）
// - 森可成の備の脇、南岸の物見の高みへ上がると、川向こうの浅井の陣立て（磯野の先手・二の手・三の手・長政の本陣）が見える。
//   着いたら必ず何か起きる（kaito_k15_play_1108）：浅井の将の名が頭上に出る・手柄・浅井の太鼓・物見の小勢が瀬を渡って来る。
// - 物見の小勢と岸で最初の槍合わせ（敵前衛との最初の接触）。
// - その間も西では徳川と朝倉の一番合戦の銃声、使番の知らせ、本陣の法螺（移動も出来事にする）。
// - 物見の高みへ着き、小勢と槍を合わせて追い返したら、磯野員昌の渡河へ渡す。
// 本物の兵は物見の小勢十一人だけ足す（上限の内）。字は任務の一行と名と台詞だけ（五1）。
// ======================================================================
import { sfx } from '../audio.js';
import { revealName } from '../battle_intel.js';

export const MISSIONS = ['南岸の物見の高みから、浅井の陣立てを見よ', '瀬を渡って来た浅井の物見を、岸で追い返せ'];
const MIN_T = 150;     // 磯野の渡河はこの秒より前には来ない（布陣を見せる間）

// ctx：{ south(x), north(x), enemyGroup(rt, o, list), dress, AZAI, AZAI_FLEE, post, charge() }
export function install(rt, ctx) {
  const F = rt.flags, S = F.aneJin = { k: 0, t0: rt.t, done: false };
  const MI = { x: 30, z: ctx.south(30) + 9 };
  S.at = MI;
  const live = () => !S.done && !F.ending && !rt.over && rt.player?.u?.alive && F.step === 0;
  rt.say('森可成', '浅井の陣立てを見て来い。岸の高みから川向こうがよう見える', 4);
  rt.after(4.5, () => live() && rt.say('組頭', '旗の数を数えよ。どの手が先に渡るか、見極めるのじゃ', 3.5));
  // 西の一番合戦：徳川と朝倉の銃声と使番（物見に行く間の出来事）
  rt.after(14, () => {
    if (!live()) return;
    try { sfx('gun', 0.7); sfx('horagai', 0.5); } catch (e) { /* 音が無くても進む */ }
    rt.say('使番', '西の三田村口、徳川殿が朝倉と槍を合わせ申した！', 3.5);
  });
  rt.after(30, () => live() && rt.say('足軽', '西は朝から鉄砲の音が止まぬ……こっちはまだか', 3));
  // 待つ間も戦場は動く：段の厚み・川向こうの旗・太鼓の変わり目
  rt.after(62, () => live() && rt.say('柴田勝家', '前に坂井、池田、その後ろに我らと森。幾段にも構えた。容易くは抜かせぬ', 4));
  rt.after(98, () => { if (!live()) return; rt.say('足軽', '川向こうの旗がまた増えた……水際まで寄って来るぞ', 3.4); F.clash?.[0]?.push?.('A', 0.1); });
  rt.after(MIN_T - 12, () => { if (!live()) return; try { sfx('taiko', 1); } catch (e) { /* 音が無くても進む */ } rt.say('森可成', '浅井の太鼓が変わった。来るぞ、槍を揃えよ！', 3.4); });

  function seen() {
    if (S.k !== 0) return;
    S.k = 1; S.seenT = rt.t;
    rt.unmark('aneMi');
    for (const n of ['磯野員昌', '浅井政澄', '阿閉貞征', '浅井長政']) { try { revealName(rt, n); } catch (e) { /* 名の無い将は飛ばす */ } }
    rt.award((t) => { t.side.push('物見の高みで浅井の陣立てを見届けた'); t.special = { label: '浅井の陣立てを見届けた', pts: 10 }; }, '浅井の陣立てを見届けた', MI);
    rt.say('森可成', 'よう見た。先手は磯野、後ろに二の手・三の手、奥に長政の本陣。厚い陣じゃ', 4);
    try { sfx('taiko', 0.8); } catch (e) { /* 音が無くても進む */ }
    // 川向こうの浅井の手が、旗を揃えて水際へ寄る（突っ立たせない）
    try { F.azDA?.[0]?.m.moveTo(24, -50, 30); F.jinMasazumi?.m.moveTo(18, -30, 30); } catch (e) { /* 遠景が無くても進む */ }
    rt.after(6, () => scouts());
  }

  function scouts() {
    if (!live() || S.g) return;
    // 枠の空かない間は空の隊を撃退済みにせず、全員が出られるまで待つ。
    if (!ctx.canDeploy(11)) { rt.after(1, scouts); return; }
    const x = MI.x + 6, z = ctx.north(x) - 10;
    const g = ctx.enemyGroup(rt, { faction: 'azai', name: '浅井の物見', anchor: { x, z }, facing: 0, fleeDir: ctx.AZAI_FLEE, aggro: 14, width: 10, morale: 70, speed: 3.2 },
      ctx.dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 4 }], ctx.AZAI));
    S.g = g; S.k = 2; S.scoutT = rt.t;
    g.order = 'move'; g.dest = { x: MI.x - 4, z: ctx.south(MI.x) + 3 };
    g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 30; };
    rt.marker('aneScout', () => { if (g.routed || !g.units.some((u) => u.alive && !u.gone && !u.fleeing)) return null; const c = g.center(); return { x: c.x, z: c.z }; }, '浅井の物見', { red: true, group: g });
    rt.army.play('eshout', { x, z }, 1.2);
    rt.say('足軽', '浅井の物見が瀬を渡って来るぞ！　鉄砲を持っておる！', 3);
    rt.after(3.5, () => live() && rt.say('森可成', '岸へ上げるな。槍で追い返せ！', 3));
  }

  // 毎コマ（b_anegawa.js の update から）
  S.tick = () => {
    if (S.done || rt.over || F.ending || !rt.player?.u?.alive) return;
    if (F.step !== 0) { S.done = true; return; }
    const p = rt.player.u.pos, el = rt.t - S.t0;
    if (S.k === 0 && Math.hypot(p.x - MI.x, p.z - MI.z) < 7) seen();
    if (S.k === 2 && S.g) {
      const g = S.g, left = g.units.filter((u) => u.alive).length;
      if (left <= 3 || g.routed) {
        // 味方だけで片付いた時は次の物見を出す。本人の目標を時計で果たさない。
        if (!S.fought) {
          g.noRout = false; g.morale = 0; g.order = 'retreat';
          S.g = null; S.k = 1; rt.unmark('aneScout');
          rt.after(6, scouts);
          return;
        }
        S.k = 3; S.backT = rt.t;
        rt.unmark('aneScout');
        if (!g.routed) { g.noRout = false; g.morale = 0; g.order = 'retreat'; }
        rt.say('森可成', 'よし、追い返した。次は本手が来るぞ。持ち場へ戻り、槍を揃えよ！', 4);
        rt.after(5, () => live() && rt.say('使番', '殿より！　浅井が渡れば、岸で受け止めよとの下知！', 3.5));
        try { sfx('horagai', 0.6); } catch (e) { /* 音が無くても進む */ }
      }
    }
    if (S.k === 3 && el >= MIN_T && rt.t - S.backT > 12) finish();
  };

  function finish() {
    if (S.done || F.step !== 0 || rt.over || F.ending) return;
    S.done = true; S.k = 3;
    rt.unmark('aneMi'); rt.unmark('aneScout');
    if (S.g && !S.g.routed) { S.g.noRout = false; S.g.morale = 0; S.g.order = 'retreat'; }
    ctx.charge();
  }

  rt.marker('aneMi', MI, '物見の高み');
}

// 本人が物見と槍を合わせた事だけを記録する。討ち取りも同じ入口を通る。
export function hit(rt, u) {
  const S = rt.flags.aneJin;
  if (S && !S.done && S.k === 2 && u?.group === S.g) S.fought = true;
}

// 右上の一行（def.missionOf）：始まりの段の番号。済んだら null
export function stageOf(rt) {
  const S = rt.flags.aneJin;
  if (!S || S.done || rt.flags.step !== 0) return null;
  return S.k >= 1 ? 1 : 0;
}

// 行き先のピン：物見の高み、または物見の小勢
export function pin(rt, q) {
  const S = rt.flags.aneJin;
  if (!S || S.done) return undefined;
  if (S.k <= 1) { q.x = S.at.x; q.z = S.at.z; q.r = 6; q.hide = 6; return q; }
  if (S.k === 2 && S.g) {
    const u = !S.g.routed && S.g.units.find((v) => v.alive && !v.gone && !v.fleeing);
    if (u) { q.unit = u; q.enemy = true; q.x = u.pos.x; q.z = u.pos.z; q.r = q.hide = 2; return q; }
  }
  return undefined;
}

// bot：物見の高みへ行き、物見の小勢と槍を合わせる
export function bot(b, goTo, p, inp, strike) {
  const S = b.flags.aneJin;
  if (!S || S.done) return false;
  if (S.k <= 1) { goTo(p, inp, S.at.x, S.at.z, 3); return true; }
  if (S.k === 2 && S.g && !S.g.routed) {
    const e = S.g.units.find((u) => u.alive && !u.gone && !u.fleeing);
    if (e) {
      const d = Math.hypot(e.pos.x - p.u.pos.x, e.pos.z - p.u.pos.z);
      p.yaw = Math.atan2(e.pos.x - p.u.pos.x, e.pos.z - p.u.pos.z);
      if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2);
      else strike(p, inp, e, d);
      return true;
    }
  }
  return false;
}
