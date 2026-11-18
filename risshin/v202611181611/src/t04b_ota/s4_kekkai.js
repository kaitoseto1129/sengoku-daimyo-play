// 太田城 ④ 9〜12分「堤が崩れる」：東の堤の一か所が水に押されて崩れ、水が溢れ出す。人夫は逃げ惑い、
// 雑賀衆がここぞと崩れた所へ打って出る。崩れた所を守り、人夫が土俵で塞ぐまで持ちこたえる。
import { P, SAIKA, porters, holdGuard, breachBuild } from './scene.js';
import { troops, reports, move, living, broken, near } from '../toyo15/kit.js';
import { sfx } from '../audio.js';
import seki from './s3_seki.js';

export default {
  goal: '崩れた東の堤を、人夫が塞ぐまで守れ',   // 11/18 クラウド：二行に収める（874×402 で三行目が切れる）
  pin: { ...P.breach, label: '東の堤' },
  // bot：城の板塀の内へ追い込んだ時は北の門から出る（東の塀へ向けて歩き続け、崩れ目に着かず刻限切れになった 11/10）。
  //   崩れ目から二十二歩の内の敵だけを追い、城の塀ぎわまで追わない
  botAt: (rt) => { const p = rt.player.u.pos; return Math.abs(p.x) < 24 && Math.abs(p.z) < 26 ? { x: P.gate.x, z: P.gate.z - 8 } : null; },
  botLeash: 22,
  enter(rt, F) {
    // 再開時も前段の小舟の兵には退く下知を出してから、崩れ目の迎撃へ移る。
    seki.leave(rt, F);
    const W = rt.world;
    F.waterTo = -0.2; F.foesB = []; F.breachWithdrawn = false;
    sfx('taiko', 0.6);
    rt.banner('堤が崩れた', '東の堤から水があふれる');
    W.addSmokeColumn?.(P.breach.x, W.heightAt(P.breach.x, P.breach.z) + 1, P.breach.z, { size: 2.5 });
    breachBuild(rt);   // 崩れ目の切れ・流れ出す水・外の水溜まり（11/18 夜50-39）
    F.fixers = porters(rt, '堤を塞ぐ人夫', { x: 40, z: -70 }, 10);
    move(F.fixers, { x: P.breach.x - 3, z: P.breach.z - 6 });
    move(F.friends, { x: P.breach.x - 6, z: P.breach.z - 4 }, true);
    // 隊の兵が持ち場へ着いたら移動を終え、崩れ目の見張りと迎撃に移る。
    F.friends.onArrive = holdGuard;
    F.fix = 0; F.fixed = 0; F.breachGuard = 0; F.fixerReliefs = 0; F.fixerReliefAt = 0;
    rt.say('人夫頭', '堤が崩れた！　水が出ていく！　土俵を持って東へ走れ！', 3.5);
    rt.after(4, () => rt.say('羽柴秀長', '崩れた所を守れ！　雑賀は必ずそこを突いてくる！', 3.5));
    const wave = (name, from, list) => () => { const g = troops(rt, false, name, from, list, SAIKA, { free: true, aggro: 18 }); move(g, P.breach, true); F.foesB.push(g);
      // 11/18 20:10 クラウド 紀州の持ち主：act bot 531秒の回「名のある将 本人0」（侍大将が崩れ目の外で立ち、本人と打ち合わずに刻限で退いた）。侍大将の組は初めから本人へ向かう
      if (name === '雑賀の頭の組' && rt.player.u.alive) { g.focus = rt.player.u; g.focusMeFirst = true; g.focusMeRange = 14; g.order = 'attack'; g.dest = null; } };
    reports(rt, [
      [15, '組頭', '城から打って出たぞ！　崩れ目へ来る！', wave('崩れ目へ寄せる雑賀衆', { x: 30, z: -10 }, [{ type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }, { type: 'samurai', n: 1 }])],
      [50, '組頭', '水の中を渡って来る！', wave('水を渡る雑賀衆', { x: 36, z: 12 }, [{ type: 'ashigaru', n: 9 }, { type: 'samurai', n: 2 }])],
      // 11/18 クラウド 紀州の持ち主 ①：史実では四月九日に宇喜多の持ち場の堤が切れ、寄せ手にも溺れた者が出た（docs/books/sengoku_gonbee_4.md）
      [32, '使番', '崩れ目の外の味方の陣に水が入り、溺れた者が出ております！'],
      [80, '使番', '北と南の堤は持っております！　崩れたのはここだけ'],
      // 11/18 16:10 クラウド 紀州の持ち主：act bot「簡単すぎる・もっと強い奴と斬り合いたい」（名のある将 本人0）。崩れ目へ自ら出る雑賀の頭（侍大将・名は伝わらないので役の名）を組に足し、塞ぎ終わる前に斬り合えるよう九十秒→五十八秒に早める
      [58, '雑賀の頭', '堤を崩せ！　水を抜け！', wave('雑賀の頭の組', { x: 28, z: -26 }, [{ type: 'busho', n: 1, o: { name: '雑賀の侍大将' } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }])],
      [64, '組頭', '雑賀の侍大将が自ら出て来たぞ！　討てば大手柄じゃ！'],
    ]);
  },
  tick(rt, dt, t) {
    const F = rt.flags;
    const n = living(F.fixers);
    if (n < 3 && F.fixerReliefs < 2 && t >= F.fixerReliefAt) {
      move(F.fixers, P.pile);
      F.fixers = porters(rt, '堤を塞ぐ人夫', { x: 40, z: -70 }, 8);
      move(F.fixers, { x: P.breach.x - 3, z: P.breach.z - 6 });
      F.fixerReliefs++; F.fixerReliefAt = t + 30;
    }
    // 11/18 09:15 クラウド 紀州の持ち主：act bot「簡単すぎる・もっと強い奴と斬り合いたい」（144人斬って受けた傷0・侍0）。
    //   崩れ目へ寄せた雑賀の侍は、本人が二十五歩内に居る間は本人へ打ちかかる（足軽は人夫と味方へ）。命が半分を切ったか、退きに入ったら放す
    if ((F._duelT = (F._duelT || 0) - dt) <= 0) {
      F._duelT = 0.5;
      const me = rt.player.u, on = me.alive && me.hp >= me.maxHp * 0.5 && !F.breachWithdrawn, p = me.pos;
      for (const g of F.foesB) for (const u of g.units || []) {
        if (!u.alive || u.fleeing || u.woundOut || (u.type !== 'samurai' && u.type !== 'busho')) continue;
        if (on && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 25) { if (u.target !== me) { u.target = me; u.atk = null; u.aiT = Math.min(u.aiT || 0, 0.3); } }
        else if (u.target === me && !on) { u.target = null; u.aiT = 0; }
      }
    }
    // 人夫の損耗時にも最低の速さは保ち、主人公が崩れ目を守った事を別に確かめる。
    if (near(rt, P.breach, 26)) F.breachGuard += dt;
    F.fix += dt * (n >= 4 ? 1 : 0.5);
    // 人夫の損耗や到着の遅れで修復を待つ間も、敵は刻限で城へ退く。
    if (t > 155) withdraw(F);
    // 11/18 17:10 クラウド 紀州の持ち主：act bot「名のある将 本人0」（3回に3回）。雑賀の組が崩れた所で段が閉じ、
    //   侍大将が生きたまま城へ退いていた。侍大将が立って本人の三十歩内に居る間は「静まった」と見ない（刻限155秒は変えない）
    const chief = F.foesB.find((g) => g.name === '雑賀の頭の組')?.units?.find((u) => u.type === 'busho');
    const me = rt.player.u;
    const chiefUp = !!chief && chief.alive && !chief.fleeing && me.alive && Math.hypot(chief.pos.x - me.pos.x, chief.pos.z - me.pos.z) < 30;
    const quiet = F.foesB.length >= 3 && F.foesB.every((g) => broken(g, 0.35)) && !chiefUp;
    if (!F.fixed && t > 115 && F.fix >= 90 && F.breachGuard >= 12 && (quiet || t > 155)) {
      F.fixed = t; F.waterTo = 0.45;
      rt.say('人夫頭', '塞いだぞ！　また水が溜まる！', 3);
    }
    return !!F.fixed && t - F.fixed > 6;
  },
  leave(rt, F) {
    if (F.friends.onArrive === holdGuard) F.friends.onArrive = null;
    withdraw(F);
  },
  foes: (rt) => rt.flags.foesB,
  max: Infinity,
};
function withdraw(F) {
  if (F.breachWithdrawn) return;
  F.breachWithdrawn = true;
  for (const g of F.foesB) { g.noRout = false; g.morale = 0; move(g, { x: P.gate.x, z: P.gate.z - 8 }); g.order = 'retreat'; }
}

