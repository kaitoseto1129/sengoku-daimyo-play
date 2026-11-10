// ======================================================================
// 天王寺の戦い　追撃の段の道中（12〜14分。b_tennoji.js の chase から入れる）
// 史実：再攻撃で崩れた本願寺勢を、信長は大坂の城戸口まで追い、二千七百余を討った（信長公記巻九）。砦から石山まで約二・五キロ。
// 遊び：二キロ余りを歩かせるだけにしない。道中で、①燃える在家と逃げる門徒の列 ②道を塞ぐ殿の門徒 を見せ、
//   道中を歩いて追い、城戸口では殿を討ち減らして木戸へ退かせる。
// 時間だけで座標や参戦の判定を変えない。城戸口の退却と勝敗は本体で扱う。
// ======================================================================
import { enemyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';

export function install(rt, ctx) {
  const F = rt.flags;
  const { spent, dress, IKKO } = ctx;
  const W = rt.world;
  let tail = null, cut = false, tick = 0;
  // 予約から実行までに城戸口へ着いた時は、道中の演出を新しく出さない。
  const onRoad = () => !cut && !F.ending && !rt.over && F.step === 4 && !F.kidoCut &&
    Math.hypot(rt.player.u.pos.x - F.kz.x, rt.player.u.pos.z - F.kz.z) >= 260;
  // ① 道の脇の在家が燃える（石山へ退く門徒が火を掛けた。煙の柱を三つだけ）
  rt.after(10, () => {
    if (!onRoad()) return;
    const p = rt.player.u.pos;
    F.oiSmoke = [[-40, -160], [55, -230], [-25, -300]].map(([dx, dz], i) => W.addSmokeColumn?.(p.x + dx, W.heightAt(p.x + dx, p.z + dz) + 5, p.z + dz, { size: 3 - i * 0.5, black: true }));
    rt.say('足軽', '在家に火を掛けて退いていくぞ！　煙に紛れて逃がすな！', 3.5);
  });
  // ② 道を塞ぐ殿の門徒（自分の前、約九十歩）
  rt.after(24, () => {
    if (!onRoad()) return;
    const p = rt.player.u.pos, z = p.z - 90, x = p.x * 0.5;
    tail = enemyGroup(rt, { name: '道を塞ぐ殿の門徒', anchor: { x, z }, facing: 0, width: 10, order: 'hold', guard: true, guardLeash: 8, aggro: 26, seekRange: 34, morale: 80, faction: 'honganji', fleeDir: { x: 0, z: -1 } },
      dress([{ type: 'samurai', n: 1, o: { hat: 'kabuto_m' } }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 2 }], IKKO));
    F.oiTail = tail;
    // 道中の殿も敵の探索・残数と同じ組へ渡す。
    F.foes.push(tail);
    rt.army.play?.('eshout', { x, z }, 1.3);
    sfx('gun', 0.6);
    rt.say('組頭', '殿の門徒が道を塞いだ！　鉄砲の後ろへ回り、味方と払え！', 4);
    rt.marker('oiTail', () => (spent(tail) ? null : tail.center()), '道を塞ぐ殿', { red: true, group: tail });
  });

  return {
    update(dt) {
      if (F.ending || rt.over || F.step !== 4) return;
      if ((tick -= dt) > 0) return;
      tick = 0.5;
      if (cut) return;
      const p = rt.player.u.pos;
      const left = Math.hypot(p.x - F.kz.x, p.z - F.kz.z);
      if (left < 260 || F.kidoCut) { cut = true; rt.unmark('oiTail'); return; }   // 自分で歩いて着いた
      const tailDone = tail && spent(tail);
      if (tailDone && !F.oiTailSaid) {
        F.oiTailSaid = true;
        rt.award((t) => t.side.push('追撃の道を塞いだ殿の門徒を払った'), '道を塞いだ殿を払った');
        rt.say('足軽', '殿が崩れた！　城戸口まで駆けろ！', 3);
        // 殿を払った後も本人と味方は既存の行軍で城戸口へ進む。
        // 追撃の完了は到着と城戸口での参戦で決め、座標は移し替えない。
      }
    },
  };
}
