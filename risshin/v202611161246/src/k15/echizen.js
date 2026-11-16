// ======================================================================
// 天王寺・岡山の戦い ②の段：真田の突撃（越前勢を突き抜けて家康の本陣へ）
// 史実：茶臼山の真田信繁は、正面の松平忠直の越前勢（約一万五千）の陣を抜けて、家康の本陣を目がけて突き掛かった。
//   手本と出所：docs/battle_refs/k15_tennoji_okayama.md（日本語版ウィキペディア「天王寺・岡山の戦い」・史跡の解説）。
// 見せ方：茶臼山の南で、赤備えの軽い大軍（addClash）が越前勢の列に割り込み、片方の端から崩して突き抜ける。
//   本物の兵は増やさない（軽い作り・team を渡さないので本物に替わらない）。字は足さず、行き先のピンと台詞だけ。
// 主人公の手柄：伝令。段の初めは行き先のピンを大御所の本陣に置き、着いたら急を知らせた手柄。旗本が備えを固める。
//   その後ピンは元の「本陣の前」へ戻る。着かないまま時が過ぎるか次の段に移ったら、黙ってピンを戻す。
// ======================================================================
import { sfx } from '../audio.js';
import { isTouch } from '../touch.js';

const RED = 0x8e1f16, BLACK = 0x1f1e1c;

export function install(rt, ctx) {
  const F = rt.flags, W = rt.world;
  const { CHAUSU, HON, back } = ctx;
  const S = (F.k15e = { done: false, t0: rt.t });

  // ---- 茶臼山の南：真田の赤備え（A・南を向く）が越前勢（B）の列に突っ込み、東の端から割って抜ける ----
  let C = null;
  if (W.addClash) {
    try {
      C = W.addClash({
        rt, play: (k, p, v) => rt.army.play?.(k, p, v), smoke: (x, y, z, fx, fz) => rt.army.smoke?.(x, y, z, fx, fz),
        x: CHAUSU.x - 20, z: CHAUSU.z + 32, facing: 0, w: 34, gap0: 12, seed: 615, noRout: true, noWake: true,
        A: { flag: 'sanada', armor: RED, count: isTouch ? 110 : 240, guns: true },   // 携帯は 660 人で iPhone 16 Pro が落ちた（11/8 実機）
        B: { flag: 'tokugawa', armor: BLACK, count: isTouch ? 150 : 420 },
      });
    } catch (e) { C = null; }
  }
  if (C) {
    rt.after(1.5, () => C.go());
    rt.after(6, () => { C.push('A', 0.85); C.shake('B', 25); });
    rt.after(10, () => C.cavalry?.('A', { from: 1, count: 24, flag: 'sanada', armor: RED }));
    rt.after(20, () => C.rout('B', { from: 1, minFight: 6 }));
    // 突き抜けた赤備えは本物の兵（真田の赤備え）が本陣へ運ぶ。軽い兵は主人公が遠い時に片付ける
    const tidy = () => {
      if (!C.mesh) return;
      const p = rt.player?.u?.pos;
      if (p && Math.hypot(p.x - C.x, p.z - C.z) < 70) { rt.after(5, tidy); return; }
      C.mesh.visible = false;
    };
    rt.after(60, tidy);
  }
  rt.after(19.5, () => { if (F.step === 2) rt.say('越前の侍', '赤備えに陣を割られた！　真田が抜けたぞ！', 3.2); });

  // ---- 伝令：大御所の本陣へ急を知らせる ----
  const MSG = { x: HON.x - 6, z: HON.z - 12, label: '大御所の本陣' };
  rt.marker('k15', MSG, MSG.label);
  const tick = () => {
    if (S.done || F.ending) return;
    if (F.step !== 2) { S.done = true; return; }
    const u = rt.player?.u;
    if (rt.t - S.t0 > 75) { S.done = true; rt.marker('k15', back, back.label); return; }
    if (u?.alive && Math.hypot(u.pos.x - MSG.x, u.pos.z - MSG.z) < 9) {
      S.done = true;
      rt.award((t) => t.side.push('伝令で本陣へ急を知らせた'), '伝令で本陣へ急を知らせた');
      sfx('taiko', 0.7);
      rt.say('徳川家康', 'なに、越前が抜かれたと！　旗本、槍を揃えて前へ出よ！', 3.4);
      rt.after(3.8, () => { if (F.step === 2) rt.say('本多正純', '知らせ大儀。本陣の前で赤備えを受けよ！', 3); });
      // 早い知らせで旗本が備えを固める（崩れにくくなる）
      if (F.hon && !F.hon.routed) { F.hon.defMult = (F.hon.defMult || 1) * 1.15; F.hon.morale = Math.max(F.hon.morale || 0, 100); }
      rt.marker('k15', back, back.label);
      return;
    }
    rt.after(0.25, tick);
  };
  rt.after(0.25, tick);
}
