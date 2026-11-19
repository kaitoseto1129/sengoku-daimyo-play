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
        // 11/18 04時 クラウド持ち主（act bot「名のある将 本人0・もっと強い奴と斬り合いたい」）：守りの頭に行人方の頭を一人立てる。
        //   根来の行人方は杉之坊・泉識坊・岩室坊・閼伽井坊の子院が率いた（坊の名で呼ばれた）。岩室坊の頭を据えたのは推定（docs/fujin/t04_negoro.md）
        // 11/19 05時 クラウド持ち主：行人方の頭が並の兜と羽織では僧兵の頭に見えない。比叡山の正覚院と同じ裹頭に金茶の袈裟（soheiLook の頭の形）に
        dress([{ type: 'gun', n: 5 }, { type: 'busho', n: 1, o: { name: '岩室坊', horse: false, sohei: 1, flag: null } }, { type: 'ashigaru', n: 3 }, { type: 'ashigaru', n: 3, o: SOHEI }], NEGORO)));
      // 11/19 05時 クラウド持ち主（act bot 2戦とも「受けた傷 武将0・侍0／もっと強い奴と斬り合いたい」）：岩室坊は鉄砲の組の倍（dmgMult 0.25）に
      //   刃まで縛られ、一太刀が並の四分の一だった。頭の刃だけ組の倍を戻して七割に（鉄砲衆の弾と組の数はそのまま）
      { const hb = C.groups[0].units.find((b) => b.type === 'busho'); if (hb) { hb.dmg *= 2.8; C.boss = hb; } }
      // 11/19 08時 クラウド持ち主（描かずの位置の記録：段7 の三秒目に奥の院の鉄砲衆が持ち場 OKU から三十五歩東の急な斜面 (130,−75)・高さ27m に立ち、
      //   要も (156,−93) で号令 attack に替わっていた＝act bot「奥の院のピンへ十七mより近づけず」）：組を奥の院の平場へ置き直し、持ち場を OKU に留める
      C.post = C.groups[0];
      C.post.units.forEach((q, i) => { const a = i * 2.39996, r = 1.5 + (i % 4) * 1.4, nx = OKU.x + Math.cos(a) * r, nz = OKU.z + Math.sin(a) * r;
        if (rt.world.walkable?.(nx, nz) === false) return; q.pos.x = nx; q.pos.z = nz; q.pos.y = rt.world.heightAt(nx, nz); q.vel && (q.vel.x = q.vel.z = 0); q.warpedOnce = true; });
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
      rt.after(5, () => { if (!C.over) rt.say('組頭', '奥の院の頭は岩室坊じゃ！　あの首を取れ！', 3); });
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
      // 11/19 01時 クラウド持ち主（act bot POSLOG：岩室坊と本人が二歩で斬り合う間に、味方十五〜二十一人が頭を囲んで削り、命百余りで組の数が五を切って皆退き、頭も逃げた＝名のある将 本人0）：
      //   頭が本人と十五歩内で斬り合う間（四十五秒まで）は、組を崩さず・退かせず・締めにしない。本人でない者からの頭の傷は五分の一
      // 守りが退くまでは持ち場を奥の院に留める（要が東の斜面へずれて組が山腹へ上がらない）
      if (C.post && !C.withdraw && !C.over && !C.post.routed && C.post.anchor && Math.hypot(C.post.anchor.x - OKU.x, C.post.anchor.z - OKU.z) > 6) { C.post.anchor = { x: OKU.x, z: OKU.z }; C.post.order = 'hold'; C.post.fixed = true; }
      const hb = C.boss, hbUp = hb && hb.alive && !hb.downed && !hb.fleeing && !C.groups[0].routed;
      const duel = hbUp && u.alive && Math.hypot(hb.pos.x - u.pos.x, hb.pos.z - u.pos.z) < 15;
      if (duel) C.duelT = (C.duelT || 0) + dt;
      const hold = duel && C.duelT < 45;
      if (hb) hb.takeNonPlayer = hbUp && u.alive && Math.hypot(hb.pos.x - u.pos.x, hb.pos.z - u.pos.z) < 25 ? 0.2 : null;
      // 同じ回の二戦目：大塔の段が延び、奥の院に着く前に味方が組を八人まで削り、本人が四十歩の所で締めになった（段7 討0）。
      //   頭が立っている間は二分まで締めにせず、組も崩さない（行き先の▼は頭に付いている）
      const keepHead = hbUp && (hold || el < 120);
      if (hbUp) C.groups[0].noRout = keepHead;
      if (!C.withdraw && !hold && el > 180 && (C.pressT >= 30 && present || el > 270)) {
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
      // 11/18 04時 クラウド持ち主（act bot 4回中3回 岩室坊を本人が討てず・刃の傷0〜12）：頭の岩室坊は、本人が二十歩内に来たら自ら本人へ斬り掛かり、行き先の▼も頭に付ける
      const boss = C.boss || (C.boss = C.groups[0].units.find((b) => b.type === 'busho'));
      // 11/18 夜50-38（act bot 366秒「崩れた部隊が、また戦っている：奥の院の鉄砲衆」）：組が崩れて逃げた後も頭に本人を的として掛け直していた。崩れた・逃げる頭は掛け直さない
      const bossUp = boss && boss.alive && !boss.downed && !boss.fleeing && !C.withdraw && !C.over && !C.groups[0].routed;
      if (boss && boss.alive && !bossUp && boss.target === u && (C.groups[0].routed || boss.fleeing)) boss.target = null;
      if (bossUp && Math.hypot(boss.pos.x - u.pos.x, boss.pos.z - u.pos.z) < 20 && u.alive && boss.target !== u) { boss.target = u; boss.aiT = 0; }
      if (bossUp && !C.bossCalled && Math.hypot(boss.pos.x - u.pos.x, boss.pos.z - u.pos.z) < 20) { C.bossCalled = true; rt.say('岩室坊', '根来の寺、羽柴の猿にはやらぬ！　かかって来い！', 3); }
      if (bossUp) target = boss;
      // 守りを崩した後は、達成に必要な奥の院へ案内する。遠い残兵を追わせない。
      C.goal = (C.withdraw || n <= 5) && !bossUp || !target ? OKU : target.pos;
      const arrived = u.alive && !u.downed && !u.dying && !u.fleeing && !rt.retryOpen
        && Math.hypot(u.pos.x - OKU.x, u.pos.z - OKU.z) < 18;
      if (!C.reinforced && n <= 5 && arrived) C.callBack();
      // 奥の院まで攻め入り、守りを崩してから退却の知らせを出す。時刻だけでは勝ちにしない。
      // 援軍も含めて守りを崩し、本人が着けば締めへ。九十五秒まで立って待たせない。
      if (!C.over && !keepHead && C.reinforced && (C.withdraw || n <= 5) && arrived) {
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
