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
    F.waterTo = -0.2; F.foesB = []; F.breachWithdrawn = false; F.headKept = false;
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
      [32, '使番', '宇喜多様の陣に水が入り、溺れた者が出ております！'],
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
      // 11/18 21:20 クラウド 紀州の持ち主：act bot 381〜469秒 崩れ目で本人の八m 内に敵四人より多く、bot が下がり続けて九十秒 討ち取り0（突き11/当たり12）。
      //   侍大将が本人の十四歩内へ来たら、組ごとの本人への向きは解き（足軽は人夫と味方へ）、侍大将と侍だけが本人へ。本人へ打ちかかる者は四人まで（侍大将は数えず必ず）
      const head = F.foesB.find((g) => g.name === '雑賀の頭の組');
      if (head && head.focus === me) { const b = head.units.find((u) => u.type === 'busho' && u.alive); if (!b || Math.hypot(b.pos.x - p.x, b.pos.z - p.z) < 14) { head.focus = null; head.focusMeFirst = false; } }
      // 11/19 02:40 クラウド 紀州の持ち主：POSLOG_X で本人が崩れ目（60,-18）を守る間、侍大将は向きを解かれた後に味方と打ち合って二十八〜三十七m 西に留まり、
      //   一度も本人と打ち合わず退いた（名のある将 本人0・act bot 522秒）。侍大将が本人から二十二m より離れたら、組をまた本人へ向ける（十四歩内で解く）
      if (head && !head.focus && !head.routed && (on || F.headKept)) { const b = head.units.find((u) => u.type === 'busho' && u.alive && !u.fleeing), d = b ? Math.hypot(b.pos.x - p.x, b.pos.z - p.z) : 0; if (d > 22 && d < 60) { head.focus = me; head.focusMeFirst = true; head.focusMeRange = 14; head.order = 'attack'; head.dest = null; } }
      let onMe = 0; for (const u of rt.army.units) if (u.alive && u.team === 1 && u.target === me && u.type !== 'busho') onMe++;
      for (const g of F.foesB) for (const u of g.units || []) {
        if (!u.alive || u.fleeing || u.woundOut || (u.type !== 'samurai' && u.type !== 'busho')) continue;
        const onU = on || (F.headKept && u.type === 'busho' && me.alive);   // 残した侍大将は退きの後も本人へ
        if (onU && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 25) { if (u.target !== me && (u.type === 'busho' || onMe < 4)) { u.target = me; u.atk = null; u.aiT = Math.min(u.aiT || 0, 0.3); if (u.type !== 'busho') onMe++; } }
        else if (u.target === me && !onU) { u.target = null; u.aiT = 0; }
      }
      // 11/18 22:40 クラウド 紀州の持ち主：描かずの通しで侍大将は本人の一〜八m に二百秒居たが、本人の八m 内に敵三十人が詰め、
      //   本人の刃は一度も侍大将へ届かなかった（命454のまま）。侍大将が本人の八m 内に来たら、ほかに本人へ打ちかかる者は近い一人までにし、
      //   残りは近くの味方の兵へ向け直す（侍大将が前へ出て一騎打ちの形。敵の数・強さは変えない）
      const hb = head?.units?.find((u) => u.type === 'busho' && u.alive && !u.fleeing);
      if (hb && me.alive && Math.hypot(hb.pos.x - p.x, hb.pos.z - p.z) < 8) {
        // 旗本を前へ呼んで自分は半歩下がる武将の癖（army_think の callT・stepBackT）を、この間は止める（呼んで下がり続け、二百秒一太刀も交えなかった）
        hb.callT = (rt.army.time || 0) + 2; hb.stepBackT = 0; hb.target = me; F.chiefClose = rt.t + 0.6;   // index.js の pressPlayer もこの間は脇の者を本人へ足さない
        const tg = rt.army.units.filter((u) => u.alive && u.team === 1 && u !== hb && u.target === me && !u.fleeing).sort((a, b) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z) - Math.hypot(b.pos.x - p.x, b.pos.z - p.z));
        // 11/19 02:30 クラウド 紀州の持ち主：POSLOG_X で侍大将は本人の一〜七m に百三十秒居たが、侍大将と脇の一人が交互に打ち込み、本人に隙が無く
        //   侍大将の命は456→442、④の討ち取り0（act bot 563秒）。侍大将が八m 内の間は、本人へ打つのは侍大将だけ（一騎打ち。数・強さは変えない）
        // 11/19 04:25 クラウド 紀州の持ち主：act bot（描く・471秒 ★）雑賀の頭の組の足軽が本人の脇で六秒立った（十二m 内に味方が無く、本人へ打つ順も来ない）。
        //   足軽は三十二m 内の味方の兵（崩れ目の人夫・護衛）へ向かわせる。侍は今まで通り本人の脇に残す
        for (const u of tg) { const ok = (o) => o !== me && !o.isPlayer && !o.isStruct && !o.fleeing, a = rt.army.nearestEnemy(u, 12, ok) || (u.type !== 'samurai' && rt.army.nearestEnemy(u, 32, ok)); if (a) { u.target = a; u.atk = null; u.aiT = 0.4; } }   // 22:35：近くに味方が居ない者は向け直さない（null にして本人の脇で六秒立った act bot 418秒）
      }
    }
    // 人夫の損耗時にも最低の速さは保ち、主人公が崩れ目を守った事を別に確かめる。
    if (near(rt, P.breach, 26)) F.breachGuard += dt;
    F.fix += dt * (n >= 4 ? 1 : 0.5);
    // 人夫の損耗や到着の遅れで修復を待つ間も、敵は刻限で城へ退く。
    // 11/18 22:30 クラウド 紀州の持ち主：描かずの通しで侍大将は本人の二〜九m で五十秒打ち合い、命四割まで減ったところで刻限155秒の退きで逃げた（名のある将 本人0 が act bot 4回に4回）。
    //   侍大将が立って本人の三十歩内に居る間は、刻限を215秒まで延ばし、その組は退かせない（ほかの組は155秒で退く）
    const hd = F.foesB.find((g) => g.name === '雑賀の頭の組'), hb = hd?.units?.find((u) => u.type === 'busho'), pm = rt.player.u;
    const chiefNear = !!hb && hb.alive && !hb.fleeing && pm.alive && Math.hypot(hb.pos.x - pm.pos.x, hb.pos.z - pm.pos.z) < 30;
    if (t > 155) withdraw(F, chiefNear && t < 215 ? hd : null);
    if (F.headKept && (!chiefNear || t >= 215)) { F.headKept = false; retreat(hd); }
    // 11/18 17:10 クラウド 紀州の持ち主：act bot「名のある将 本人0」（3回に3回）。雑賀の組が崩れた所で段が閉じ、
    //   侍大将が生きたまま城へ退いていた。侍大将が立って本人の三十歩内に居る間は「静まった」と見ない（刻限155秒は変えない）
    const chief = F.foesB.find((g) => g.name === '雑賀の頭の組')?.units?.find((u) => u.type === 'busho');
    const me = rt.player.u;
    const chiefUp = !!chief && chief.alive && !chief.fleeing && me.alive && Math.hypot(chief.pos.x - me.pos.x, chief.pos.z - me.pos.z) < 30;
    const quiet = F.foesB.length >= 3 && F.foesB.every((g) => broken(g, 0.35)) && !chiefUp;
    if (!F.fixed && t > 115 && F.fix >= 90 && F.breachGuard >= 12 && (quiet || (t > 155 && !chiefUp) || t > 215)) {
      F.fixed = t; F.waterTo = 0.45;
      rt.say('人夫頭', '塞いだぞ！　また水が溜まる！', 3);
    }
    return !!F.fixed && t - F.fixed > 6;
  },
  leave(rt, F) {
    if (F.friends.onArrive === holdGuard) F.friends.onArrive = null;
    withdraw(F);
    if (F.headKept) { F.headKept = false; retreat(F.foesB.find((g) => g.name === '雑賀の頭の組')); }
  },
  foes: (rt) => rt.flags.foesB,
  max: Infinity,
};
function withdraw(F, keep) {
  if (F.breachWithdrawn) return;
  F.breachWithdrawn = true;
  for (const g of F.foesB) { if (g === keep) { F.headKept = true; continue; } retreat(g); }
}
// 11/18 23:30 クラウド 紀州の持ち主：act bot「崩れた部隊が、また戦っている」（雑賀の頭の組・544秒）＝退きの下知の後も侍大将の狙いが本人に残り、
//   段5 で打ちかかり続けた。退く組の者は狙いと振りを解いてから城へ向ける
function retreat(g) { if (!g) return; g.noRout = false; g.morale = 0; for (const u of g.units || []) if (u.alive) { u.target = null; u.atk = null; u.aiT = 0; } move(g, { x: P.gate.x, z: P.gate.z - 8 }); g.order = 'retreat'; }

