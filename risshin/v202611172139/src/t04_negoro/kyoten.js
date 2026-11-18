// 根来寺 ⑤ 12〜15分「最後の拠点」：大塔を守り切った後、奥の院の平場に残った根来の鉄砲衆と行人方の拠点を潰す。
// 逃げる根来衆は奥の谷へ走る。遠くで寺の坊舎が燃え続ける中、「太田城に残党が集まる」の知らせで次へ。
import { enemyGroup } from '../bhelp.js';
import { breath } from '../toyo15/kit.js';

export function kyotenStep(NG) {
  const { P, dirL, ROT, NEGORO, SOHEI, dress, flee, alive, heads, nearestFighter, OKU } = NG;
  return {
    kind: 'kyoten', max: Infinity, idleAdvance: false,
    start(rt, C) {
      const F = rt.flags;
      C.at = C.goal = OKU; C.groups = []; C.reinforced = false;
      C.groups.push(enemyGroup(rt, { faction: 'saika', fixed: true, name: '奥の院の鉄砲衆', anchor: OKU, facing: Math.PI + ROT, order: 'hold', seekRange: 22, aggro: 10, width: 6, morale: 95, fleeDir: dirL(0, 1), dmgMult: 0.25 },
        dress([{ type: 'gun', n: 5 }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 3 }, { type: 'ashigaru', n: 3, o: SOHEI }], NEGORO)));
      // 11/18 クラウド（根来の持ち主）：寺の奥に布陣図どおり立つ表の備（奥の院の行人方）も、この段で奥の院の脇へ降りて打ち掛かる（act bot「簡単すぎる・もっと斬り合いたい」）
      C.extra = (rt.army.groups || []).filter((g) => g.team === 1 && g.count > 0 && !g.routed && /奥の院の行人方/.test(g.name || ''));
      for (const g of C.extra) { g.stay = false; g.order = 'attack'; g.seekRange = 30; g.anchor = { x: OKU.x + dirL(-10, 6).x, z: OKU.z + dirL(-10, 6).z }; }
      //   携帯の数の上限の刈り込みで遠い間に一人二人まで減っていたら、寺の奥 P(−40,108) から本物の八人で降りてくる（一人だけ立ち尽くさせない）
      if (C.extra.reduce((n, g) => n + g.count, 0) < 8) C.extra.push(enemyGroup(rt, { faction: 'saika', fixed: true, name: '奥の院の行人方', anchor: P(-34, 110), facing: Math.PI + ROT, order: 'attack', seekRange: 30, aggro: 12, width: 5, morale: 85, fleeDir: dirL(0, 1), dmgMult: 0.4 },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 3 }, { type: 'ashigaru', n: 4, o: SOHEI }], NEGORO)));
      F.friends().forEach((g, i) => { g.order = 'attack'; g.seekRange = 30; g.anchor = { x: OKU.x + dirL(i % 2 ? 6 : -6, -8).x, z: OKU.z + dirL(i % 2 ? 6 : -6, -8).z }; });
      rt.obj('dp', NG.GOALS[6], 'main');
      // 行き先のピンを段の終わりまで立てる（関所3）。残る撃ち手か奥の院を追う
      rt.marker('dp', () => C.goal, '奥の院', { h: 3 });
      breath(rt, 0.35);   // 段の替わり目に息を整える
      rt.say('羽柴秀次', '奥の院にまだ鉄砲が残っておる！　あれを潰せば寺は終いじゃ', 4);
      // 守りが崩れた後の待ち時間に、存在しない縁下の射撃を知らせない。
      rt.after(60, () => { if (!C.over && heads(C.groups) > 5) rt.say('組頭', '奥の院にまだ敵が残っておる！　守りを崩せ！', 3); });
      // 堂の移設後も援軍は建物の内に出さず、奥の参道から寄せる。
      // 11/18 クラウド：守りを先に崩して奥の院に着くと、三十秒の援軍まで六秒ほど何も起きなかった（bot の記録）。崩して着いたら、その場で谷から呼ぶ。
      C.callBack = () => { if (!C.over && !C.reinforced) { C.groups.push(enemyGroup(rt, { faction: 'saika', fixed: true, name: '奥の谷から戻った行人方', anchor: P(-4, 138), facing: Math.PI + ROT, order: 'attack', seekRange: 40, aggro: 14, width: 5, morale: 80, fleeDir: dirL(0, 1), dmgMult: 0.3 }, dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 3 }, { type: 'ashigaru', n: 4, o: SOHEI }], NEGORO))); C.reinforced = true; rt.say('足軽', '谷から戻って来たぞ！', 2.5); } };
      rt.after(30, C.callBack);
    },
    tick(rt, C, m, ctx, el, dt) {
      const u = rt.player.u;
      const present = u.alive && !u.downed && !u.dying && !u.fleeing && !rt.retryOpen
        && Math.hypot(u.pos.x - OKU.x, u.pos.z - OKU.z) < 30;
      C.pressT = (C.pressT || 0) + (present ? dt : 0);
      // 上限（全戦共通の決まり7・8）：四分半を過ぎたら、本人がどこにいても奥の院の守りは退く（bot が大塔の脇で止まり五分続いた。関所 11/10）
      if (!C.withdraw && el > 180 && (C.pressT >= 30 && present || el > 270)) {
        C.withdraw = true;
        const retreating = C.groups.some(alive);
        for (const g of [...C.groups, ...(C.extra || [])]) flee(g);
        if (retreating) rt.say('組頭', '奥の院の守りが退くぞ！　奥の院を押さえよ！', 3);
      }
      const n = heads(C.groups);
      let target = null;
      for (const g of C.groups) {
        target = nearestFighter(g, rt.player.u.pos);
        if (target) break;
      }
      // 守りを崩した後は、達成に必要な奥の院へ案内する。遠い残兵を追わせない。
      C.goal = C.withdraw || n <= 5 || !target ? OKU : target.pos;
      const arrived = u.alive && !u.downed && !u.dying && !u.fleeing && !rt.retryOpen
        && Math.hypot(u.pos.x - OKU.x, u.pos.z - OKU.z) < 18;
      if (!C.reinforced && n <= 5 && arrived) C.callBack();
      // 奥の院まで攻め入り、守りを崩してから退却の知らせを出す。時刻だけでは勝ちにしない。
      // 援軍も含めて守りを崩し、本人が着けば締めへ。九十五秒まで立って待たせない。
      if (!C.over && C.reinforced && (C.withdraw || n <= 5) && arrived) {
        C.over = el;
        const retreating = C.groups.some(alive);
        for (const g of [...C.groups, ...(C.extra || [])]) flee(g);
        if (retreating) rt.say('足軽', '根来の衆が逃げる！　奥の谷へ散っていくぞ！', 3);
        rt.after(5, () => rt.say('使番', '雑賀の残党、太田城へ集まっております！', 4));
      }
      return !!C.over && el - C.over > 10 && arrived;
    },
    end(rt, C) { rt.unmark('dp'); rt.objDone('dp'); rt.award((t) => t.side.push('奥の院の鉄砲衆を潰した'), '最後の拠点を潰した'); },
  };
}
