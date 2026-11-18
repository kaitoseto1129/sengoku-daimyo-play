// ======================================================================
// 天王寺の戦い　追撃の段の道中（12〜14分。b_tennoji.js の chase から入れる）
// 史実：再攻撃で崩れた本願寺勢を、信長は大坂の城戸口まで追い、二千七百余を討った（信長公記巻九）。砦から石山まで約二・五キロ。
// 遊び：二キロ余りを歩かせるだけにしない。道中で、①燃える在家と逃げる門徒の列 ②道を塞ぐ殿の門徒 を見せ、
//   道中を歩いて追い、城戸口では殿を討ち減らして木戸へ退かせる。
// 時間だけで座標や参戦の判定を変えない。城戸口の退却と勝敗は本体で扱う。
// ======================================================================
import { enemyGroup } from '../bhelp.js';

export function install(rt, ctx) {
  const F = rt.flags;
  const { spent, dress, IKKO } = ctx;
  const W = rt.world;
  let tail = null, cut = false, tick = 0;
  const canPursue = () => {
    const u = rt.player.u;
    return u.alive && !u.gone && !u.dying && !u.woundOut && !u.fleeing;
  };
  // 予約から実行までに城戸口へ着いた時は、道中の演出を新しく出さない。
  const onRoad = () => !cut && !F.ending && !rt.over && canPursue() && F.step === 4 && !F.kidoCut &&
    Math.hypot(rt.player.u.pos.x - F.kz.x, rt.player.u.pos.z - F.kz.z) >= 260;
  // ① 道の脇の在家が燃える（石山へ退く門徒が火を掛けた。煙の柱を三つだけ）
  rt.after(10, () => {
    if (!onRoad()) return;
    const p = rt.player.u.pos;
    F.oiSmoke = [[-40, -160], [55, -230], [-25, -300]].map(([dx, dz], i) => W.addSmokeColumn?.(p.x + dx, W.heightAt(p.x + dx, p.z + dz) + 5, p.z + dz, { size: 3 - i * 0.5, black: true }));
    rt.say('足軽', '在家に火を掛けて退いていくぞ！　煙に紛れて逃がすな！', 3.5);
  });
  // ② 道を塞ぐ殿の門徒（自分の前、約九十歩）。11/16 K337：道中の殿は一組だけだと千歩の追撃がほぼ歩くだけで、
  //   斬り合う相手が少なかった（act bot：十五分で討ち取り二〜四）。崩れるたびに次の殿が九十歩先に踏み止まる（三組まで・人数は推定）。
  //   一度に立つのは一組だけなので、本物の兵の上限は変わらない。
  let tails = 0, nextAt = 0;
  const TAIL_SAY = ['殿の門徒が道を塞いだ！　味方と進み、鉄砲衆を払え！', 'また殿が踏み止まったぞ！　崩せ！', '城戸口の手前にも殿じゃ！　これを破れば木戸は近い！'];
  const spawnTail = () => {
    // 11/18 クラウド k365-cloud-13（全戦の一枚表：天王寺砦 1009秒＝指示書の十五分を越える「長」・act bot で追撃の道中 334秒）：殿は二組まで
    if (!onRoad() || tails >= 2) return false;
    const p = rt.player.u.pos, dx = F.kz.x - p.x, dz = F.kz.z - p.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 350) return false;   // 九十歩先が城戸口の殿と重なる所では出さない
    // 東の堀を回った追撃路は中央より東を通る。横位置を半分にすると
    // 殿が道から十数歩外れ、八歩の持ち場を守る槍兵の横を素通りできた。
    // 城戸口へ向かう線の九十歩先に構え、追って来る側へ槍を向ける。
    const x = p.x + dx / distance * 90, z = p.z + dz / distance * 90;
    const n = tails++;
    tail = enemyGroup(rt, { name: '道を塞ぐ殿の門徒', anchor: { x, z }, facing: Math.atan2(-dx, -dz), width: 10, order: 'hold', guard: true, guardLeash: 8, aggro: 26, seekRange: 34, morale: 80, faction: 'honganji', fleeDir: { x: 0, z: -1 } },
      dress([{ type: 'samurai', n: 1, o: { hat: 'kabuto_m' } }, { type: 'ashigaru', n: 6 + n }, { type: 'gun', n: 2 }], IKKO));
    F.oiTail = tail;
    // 道中の殿も敵の探索・残数と同じ組へ渡す。
    F.foes.push(tail);
    rt.army.play?.('eshout', { x, z }, 1.3);
    // 銃声は実際の射手の発砲で鳴らす。出現しただけでは撃ったことにしない。
    rt.say('組頭', TAIL_SAY[n], 4);
    const g = tail;
    rt.marker('oiTail', () => (spent(g) ? null : g.center()), '道を塞ぐ殿', { red: true, group: g });
    return true;
  };
  rt.after(24, spawnTail);

  return {
    update(dt) {
      if (F.ending || rt.over || !canPursue() || F.step !== 4) return;
      // 味方だけが殿を払った時は、待っていた本人の手柄にしない。
      // 短い斬り込みも拾うため、半秒の見回りより先に参加を記録する。
      const u = rt.player.u;
      if (!cut && !F.kidoCut && tail && !F.oiTailHelp && !u.dying && !u.fleeing && !u.woundOut && (u.atk || u.guard || u.swing)) {
        for (const enemy of tail.units) {
          if (!enemy.alive || enemy.dying || enemy.gone || enemy.noTarget || enemy.fleeing || enemy.woundOut ||
              Math.hypot(enemy.pos.x - u.pos.x, enemy.pos.z - u.pos.z) > 7 ||
              Math.abs((enemy.pos.y || 0) - (u.pos.y || 0)) > 3 ||
              rt.army.wallBetween?.(u.pos, -1, enemy.pos, false)) continue;
          F.oiTailHelp = true;
          break;
        }
      }
      if ((tick -= dt) > 0) return;
      tick = 0.5;
      if (cut) return;
      const p = rt.player.u.pos;
      const left = Math.hypot(p.x - F.kz.x, p.z - F.kz.z);
      if (left < 260 || F.kidoCut) { cut = true; rt.unmark('oiTail'); return; }   // 自分で歩いて着いた
      const tailDone = tail && spent(tail);
      if (tailDone && !F.oiTailSaid) {
        F.oiTailSaid = true;
        if (F.oiTailHelp && !F.oiTailAwarded && (F.oiTailAwarded = true))
          rt.award((t) => t.side.push('追撃の道を塞いだ殿の門徒を払った'), '道を塞いだ殿を払った');
        rt.say('足軽', '殿が崩れた！　城戸口まで駆けろ！', 3);
        nextAt = rt.t + 6;
        // 殿を払った後も本人と味方は既存の行軍で城戸口へ進む。
        // 追撃の完了は到着と城戸口での参戦で決め、座標は移し替えない。
      }
      // 崩れた殿の六秒後、まだ城戸口が遠ければ次の殿が九十歩先に踏み止まる。
      if (tailDone && tails < 2 && nextAt && rt.t >= nextAt) { nextAt = 0; if (spawnTail()) F.oiTailSaid = false; }
    },
  };
}
