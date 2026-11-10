// 根来寺 ⑤ 12〜15分「最後の拠点」：大塔を守り切った後、奥の院の平場に残った根来の鉄砲衆と行人方の拠点を潰す。
// 逃げる根来衆は奥の谷へ走る。遠くで寺の坊舎が燃え続ける中、「太田城に残党が集まる」の知らせで次へ。
import { enemyGroup } from '../bhelp.js';
import { breath } from '../toyo15/kit.js';

export function kyotenStep(NG) {
  const { P, dirL, ROT, NEGORO, dress, flee, heads, nearestFighter, OKU } = NG;
  return {
    kind: 'kyoten', max: Infinity, idleAdvance: false,
    start(rt, C) {
      const F = rt.flags;
      C.at = C.goal = OKU; C.groups = [];
      C.groups.push(enemyGroup(rt, { faction: 'saika', fixed: true, name: '奥の院の鉄砲衆', anchor: OKU, facing: Math.PI + ROT, order: 'hold', seekRange: 22, aggro: 10, width: 6, morale: 95, fleeDir: dirL(0, 1), dmgMult: 0.25 },
        dress([{ type: 'gun', n: 5 }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }], NEGORO)));
      F.friends().forEach((g, i) => { g.order = 'attack'; g.seekRange = 30; g.anchor = { x: OKU.x + dirL(i % 2 ? 6 : -6, -8).x, z: OKU.z + dirL(i % 2 ? 6 : -6, -8).z }; });
      rt.obj('dp', NG.GOALS[6], 'main');
      breath(rt, 0.35);   // 段の替わり目に息を整える
      rt.say('羽柴秀次', '奥の院にまだ鉄砲が残っておる！　あれを潰せば寺は終いじゃ', 4);
      rt.after(60, () => { if (!C.over) rt.say('組頭', '奥の院の縁の下からも撃ってくる！　回り込め！', 3); });
      rt.after(30, () => { if (!C.over) { C.groups.push(enemyGroup(rt, { faction: 'saika', fixed: true, name: '奥の谷から戻った行人方', anchor: P(20, 128), facing: Math.PI + ROT, order: 'attack', seekRange: 40, aggro: 14, width: 5, morale: 80, fleeDir: dirL(0, 1), dmgMult: 0.3 }, dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 7 }], NEGORO))); rt.say('足軽', '谷から戻って来たぞ！', 2.5); } });
    },
    tick(rt, C, m, ctx, el, dt) {
      const u = rt.player.u;
      const present = u.alive && !u.downed && !u.dying && !u.fleeing && !rt.retryOpen
        && Math.hypot(u.pos.x - OKU.x, u.pos.z - OKU.z) < 30;
      C.pressT = (C.pressT || 0) + (present ? dt : 0);
      if (!C.withdraw && el > 180 && C.pressT >= 30 && present) {
        C.withdraw = true;
        for (const g of C.groups) flee(g);
        rt.say('組頭', '奥の院の守りが退くぞ！　奥の院を押さえよ！', 3);
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
      // 奥の院まで攻め入り、守りを崩してから退却の知らせを出す。時刻だけでは勝ちにしない。
      if (!C.over && el > 95 && (C.withdraw || n <= 5) && arrived) {
        C.over = el;
        for (const g of C.groups) flee(g);
        rt.say('足軽', '根来の衆が逃げる！　奥の谷へ散っていくぞ！', 3);
        rt.after(5, () => rt.say('使番', '雑賀の残党、太田城へ集まっております！', 4));
      }
      return !!C.over && el - C.over > 10 && arrived;
    },
    end(rt, C) { rt.objDone('dp'); rt.award((t) => t.side.push('奥の院の鉄砲衆を潰した'), '最後の拠点を潰した'); },
  };
}
