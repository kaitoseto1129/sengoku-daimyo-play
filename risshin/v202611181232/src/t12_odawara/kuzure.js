// ======================================================================
// 小田原征伐　「城の心が折れる」の段（12〜14分）　docs/toyo15_plan_1108.md の 15
// 史実：六月二十六日に石垣山の城が姿を見せると、籠もる北条方の心は大きく揺れた。同じ頃、関東の支城は次々に落ち（山中は三月、
//   鉢形は六月十四日、八王子は二十三日、韮山は二十四日に開城）、城から逃げ出す者や内通する者が出始めた。忍城はなお囲みの中。
// 遊び：石垣山の城が現れた朝、総構えの土塁の上の北条の兵が騒ぐ。使番が支城の落城を次々に伝える。
//   山王口から逃げ出した北条の兵が山王川の岸へ降りに来る。追って出た北条の追っ手を岸で討ち、逃げて来た者を迎える。
// 入れ方：b_t12_odawara.js の depthStart の段の並び（城が現れる段の後・包囲の陣を回る段の前）に step(H) を置く。
// ======================================================================
import { enemyGroup, nm } from '../bhelp.js';
import { sfx } from '../audio.js';

export function step(H) {
  const live = (g) => (g ? g.units.filter((u) => u.alive && !u.gone && !u.fleeing).length : 0);
  return {
    kind: 'fight', key: 'kuzure',
    start(rt, C, m, ctx) {
      C.at = H.BANK; C.goal = H.BANK; C.groups = []; C.say = 0; C.runners = [];
      rt.obj('dp', '山王川の岸で、逃げて来る兵の追っ手を討て', 'main');
      rt.marker('dp', H.BANK, '山王川の岸', { h: 3 });
      rt.army.play('eshout', H.SANNO_IN, 1.2);
      // 11/18 クラウド小田原の持ち主：城が現れる段（castleReveal）の後に置いた。驚きの声と支城の知らせはその段と shijo の段で済んでいるので繰り返さない
      rt.say('井伊の足軽', '山王口が騒がしい……城から人が降りて来るぞ！', 3.4);
    },
    tick(rt, C, m, ctx, el) {
      C.el = el;
      const line = (t, f) => { if (el >= t && C.say < t) { C.say = t; f(); } };
      line(4.5, () => rt.say('井伊直政', '山の上の城を見て、城の中の者の心が折れ始めたな', 3.4));
      line(10, () => rt.say('井伊直政', '逃げて来る者は討つな。追って来る城の者だけを岸で討て', 3.6));
      // 逃げ出す北条の兵（降りに来る。槍を伏せる）と、追って出た北条の追っ手
      // 11/18 クラウド小田原の持ち主（13:45 JST）：act bot の討ち取りが流しごとに6〜33とぶれる（低い時は追っ手を井伊の足軽に取られる）→ 一組目の追っ手も岸で本人へ打ち掛かる
      if (!C.r1 && el > 20) { C.r1 = true; runners(rt, C, H, 0, true); }
      if (!C.r2 && el > 50) { C.r2 = true; runners(rt, C, H, 1); }
      if (!C.r3 && el > 82) { C.r3 = true; runners(rt, C, H, 0, true); }
      // 11/18 夜50-43（act bot 6遊びで討ち取り5〜22・「斬り合う相手が少ない」）：城の割れが広がり、四組目の追っ手が岸の本人へ打ち掛かる
      if (!C.r4 && el > 112) { C.r4 = true; runners(rt, C, H, 1, true); }
      // 逃げて来た者は岸に着くと座って槍を伏せる
      for (const g of C.runners) if (!g.sat && Math.hypot(g.center().x - H.BANK.x, g.center().z - H.BANK.z) < 7) { g.sat = true; for (const u of g.units) if (u.alive) u._crouch = true; rt.say('逃げて来た北条の兵', 'お助けを……城の中は、もう皆、戦う気がござらぬ', 3.6); }
      const chasers = C.groups.filter((g) => g.chaser);
      rt.objProgress('dp', '');
      // 追っ手だけを先に討っても、降りに来た三組を岸で迎えるまでは済ませない。
      // 11/18 クラウド小田原の持ち主：降りに来た者が岸に着けない時も段を止めない（act bot で千秒止まった）。出て四十秒で迎えた事にする
      const welcomed = C.runners.length >= 3 && C.runners.every((g) => g.sat || el - g.bornEl > 40);
      // 追っ手が堀の角などに掛かって残っても、三番手から一分半で城へ引き揚げさせて済ませる
      const done = C.r4 && ((welcomed && chasers.length >= 3 && chasers.every((g) => live(g) <= 1)) || el > 172);
      if (done && Math.hypot(rt.player.u.pos.x - H.BANK.x, rt.player.u.pos.z - H.BANK.z) < 18 && !C.done) {
        C.done = el;
        for (const g of chasers) { g.noRout = false; g.morale = 0; }
        rt.say(nm(rt), '城から逃げる者を、城の者が討ちに来る……もう城の中は割れておる', 3.6);
        rt.award((t) => t.side.push('城から逃げて来た北条の兵を迎えた'), '逃げて来た兵を迎えた');
      }
      return !!C.done && el - C.done > 6;
    },
    end(rt, C) {
      for (const g of [...C.groups, ...C.runners]) if (g) for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u);
      rt.unmark('dp');
      rt.objDone('dp');
    },
  };
}

function runners(rt, C, H, i, hunt = !!i) {
  // 11/18 クラウド小田原の持ち主：前は木戸の前の二歩西・五歩脇 (120,-67)(120,-59) から出し、篠曲輪の堀の角に掛かって岸へ着けなかった。
  //   木戸の前の堀の外（堀と山王川の間）から出し、追っ手は木戸の切れ目の真ん中から出す
  const from = { x: H.KIDO_F.x + 1.5, z: H.KIDO_F.z + (i ? 1.5 : -1.5) };
  const g = enemyGroup(rt, { faction: 'hojo', name: '逃げて来た北条の兵', anchor: from, facing: Math.PI / 2, width: 3, aggro: 0, morale: 100, noRout: true, noAI: true,
    order: 'move', dest: { x: H.BANK.x + 2, z: H.BANK.z + (i ? 4 : -4) }, speed: 3.6 },
  H.dress([{ type: 'ashigaru', n: 4 }], H.HOJO));
  g.peaceful = true; g.fire = false;
  for (const u of g.units) { u.noTarget = true; u.invuln = true; }
  C.runners.push(g);
  g.bornEl = C.el || 0;
  const ch = enemyGroup(rt, { faction: 'hojo', name: '北条の追っ手', anchor: { x: H.KIDO_F.x - 3, z: H.KIDO_F.z + (i ? 1 : -1) }, facing: Math.PI / 2, width: 5, aggro: 12, morale: 95, noRout: true,
    order: 'move', dest: { x: H.BANK.x - 1, z: H.BANK.z + (i ? 4 : -4) }, speed: 3.4 },
  H.dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: i ? 9 : 7 }], H.HOJO));
  // 11/18 クラウド小田原の持ち主（12:20 JST）：act bot「無傷で22人・歯ごたえがない」→ 追っ手は城の侍の一番の手練れ。本人へは 0.55→0.85、味方へは 0.7
  ch.dmgMult = 0.7; ch.dmgMultPlayer = 0.85; ch.chaser = true;
  // 11/18 クラウド小田原の持ち主：act bot が二本とも一太刀も受けずに38人・21人を討った（追っ手は井伊の足軽とばかり斬り合う）。
  //   二組目（侍2・足軽9）と三組目は岸に着くと、そばの本人へ打ち掛かる（b_domyoji の渡る足軽と同じ focus。三組目は act bot 15分で7〜10人の後に足した）
  ch.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; q.seekRange = 20; q.aggro = 14; const pu = rt.player.u; if (hunt && pu.alive && Math.hypot(pu.pos.x - q.center().x, pu.pos.z - q.center().z) < 25) q.focus = pu; };
  C.groups.push(ch);
  rt.army.play('eshout', from, 1.2);
  sfx('taiko', 0.5);
  rt.say('井伊の足軽', i ? 'また逃げて来る！　追っ手も多いぞ！' : '城から逃げて来る者がおる！　後ろに追っ手じゃ！', 3.2);
}
