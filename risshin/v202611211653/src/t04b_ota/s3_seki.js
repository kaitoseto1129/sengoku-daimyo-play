// 太田城 ③ 6〜9分「水を入れる」：堤が繋がり、出水の堰を開く。紀の川の水が回り、城の周りが水に沈んでいく。
// 日が暮れ、雑賀衆が小舟で水の上から堰を壊しに来る。堰を守る。
import { P, SAIKA, setMound, konishiFleet } from './scene.js';
import { troops, reports, move, broken, near } from '../toyo15/kit.js';
import { sfx } from '../audio.js';
import chikutei from './s2_chikutei.js';

export default {
  goal: '出水の堰を開き、小舟の雑賀衆から守れ',   // 11/18 クラウド：長い文が 874×402 の右上で三行目に切れ「堰を…」になった
  pin: { ...P.weir, label: '出水の堰' },
  enter(rt, F) {
    // 再開で築堤の三波まで作り直されても、堰へ追い掛け続けさせない。
    chikutei.leave(rt, F);
    // 堰の開放と出撃の予約は一組で作り直す。保存された時刻だけ戻ると、小舟が来ずに終われなくなる。
    F.boats = []; F.weirRun = { opened: null }; F.weirLift = 0; F.weirGuard = 0; F.boatsWithdrawn = false;
    F.dug = 1;
    setMound(F, 1);
    move(F.friends, { x: P.weir.x - 6, z: P.weir.z - 6 }, true);
    rt.say('羽柴秀長', '堤は繋がった。堰へ行け。水を入れる', 3.5);
  },
  tick(rt, dt, t) {
    const F = rt.flags, W = rt.world, run = F.weirRun;
    if (run.opened === null && near(rt, P.weir, 9)) {
      run.opened = t; F.waterTo = 0.25; F.weirLift = 0;
      F.weirSolid.yBot = W.heightAt(P.weir.x, P.weir.z) + 3;
      sfx('wood', 0.8);
      rt.say('人夫頭', '堰板を上げるぞ！　水が回る！', 3);
      if (W.setTime) { W.dayClock = null; W.setTime('dusk'); if (W.fade) W.fade.dur = 40; }
      reports(rt, [
        [20, '使番', '城の周りの田が水に沈んでいきます！'],
        [25, '足軽', '水の上に小舟じゃ！　雑賀の衆が堰を壊しに来る！', () => {
          // 保存から戻した隊があれば使い、同じ小舟の兵を二重に増やさない。
          const g = rt.army.groups.find((g) => g.team === 1 && g.name === '小舟で寄せる雑賀衆') || troops(rt, false, '小舟で寄せる雑賀衆', { x: -30, z: -26 }, [{ type: 'ashigaru', n: 9 }, { type: 'gun', n: 2 }], SAIKA, { free: true, aggro: 18 });
          move(g, P.weir, true); F.boats.push(g);
        }],
        // 11/19 k365-cloud-41：史実で小西行長が安宅船を水の上へ入れ、城へ大筒を撃ち込んだ（紀州攻めの水攻め）
        [42, '足軽', '小西様の大船が水の上へ出た！　城の屋根へ大筒を撃ち込んでおる', () => { sfx('far', 0.7); konishiFleet(rt); }],
        [58, '使番', '城の中の井戸に水があふれ、雑賀の衆が騒いでおります'],
        [85, '人夫頭', '水はまだ上がる！　堰を閉じさせるな！'],
        [65, '足軽', 'また小舟が来る！　松明を持っておるぞ！', () => {
          const g = rt.army.groups.find((g) => g.team === 1 && g.name === '松明を持つ雑賀衆') || troops(rt, false, '松明を持つ雑賀衆', { x: -40, z: -14 }, [{ type: 'ashigaru', n: 8 }, { type: 'samurai', n: 2 }], SAIKA, { free: true, aggro: 18 });
          move(g, P.weir, true); F.boats.push(g);
        }],
      ]);
    }
    if (run.opened !== null && F.weirLift < 2.4) { F.weirLift = Math.min(2.4, F.weirLift + dt * 0.8); F.weir.position.y = W.heightAt(P.weir.x, P.weir.z) + 0.75 + F.weirLift; }
    if (run.opened !== null && near(rt, P.weir, 26)) F.weirGuard += dt;
    // 11/18 17:25 クラウド 紀州の持ち主：act bot「③④で本人の討ち取り0」（6回に3回）。堰の護衛が小舟の衆を先に討ち、本人の斬り合いが無かった。
    //   ④と同じく、小舟の雑賀の侍は本人が二十五歩内に居る間は本人へ打ちかかる（足軽は堰と護衛へ）。命が半分を切ったか退きに入ったら放す
    if ((F._duelT3 = (F._duelT3 || 0) - dt) <= 0 && F.boats.length) {
      F._duelT3 = 0.5;
      const me = rt.player.u, on = me.alive && me.hp >= me.maxHp * 0.5 && !F.boatsWithdrawn, p = me.pos;
      // 11/18 21:20：本人へ打ちかかる者は四人まで（囲まれ過ぎると突けずに下がるだけになる。④と同じ）
      let onMe = 0; for (const u of rt.army.units) if (u.alive && u.team === 1 && u.target === me) onMe++;
      for (const g of F.boats) for (const u of g.units || []) {
        if (!u.alive || u.fleeing || u.woundOut || u.type !== 'samurai') continue;
        if (on && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 25) { if (u.target !== me && onMe < 4) { u.target = me; u.atk = null; u.aiT = Math.min(u.aiT || 0, 0.3); onMe++; } }
        else if (u.target === me && !on) { u.target = null; u.aiT = 0; }
      }
    }
    // 持ち場を離れていても打ち出しは刻限で退く。戻って守れば次へ進める。
    if (run.opened !== null && t - run.opened > 135) withdraw(F);
    return run.opened !== null && F.weirGuard >= 12 && t - run.opened > 95 && F.boats.length >= 2 && (F.boats.every((g) => broken(g, 0.35)) || t - run.opened > 135);
  },
  leave(rt, F) { withdraw(F); },
  foes: (rt) => rt.flags.boats,
  max: Infinity, // 開く前の待ち時間で、小舟の迎撃を飛ばさない。
};

function withdraw(F) {
  if (F.boatsWithdrawn) return;
  F.boatsWithdrawn = true;
  for (const g of F.boats || []) { g.noRout = false; g.morale = 0; move(g, { x: P.gate.x, z: P.gate.z - 8 }); g.order = 'retreat'; }
}
