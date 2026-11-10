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
      rt.obj('dp', '山王川の岸で、城から逃げて来る北条の兵を迎え、追っ手を討つ', 'main');
      rt.marker('dp', H.BANK, '山王川の岸', { h: 3 });
      rt.army.play('eshout', H.SANNO_IN, 1.2);
      rt.say('北条の兵', '山の上に城が……！　一夜で、城が建ったぞ！', 3.4);
    },
    tick(rt, C, m, ctx, el) {
      const line = (t, f) => { if (el >= t && C.say < t) { C.say = t; f(); } };
      line(4, () => rt.say('使番', '知らせ！　八王子城、二十三日に一日で落城！', 3.4));
      line(8.4, () => rt.say('使番', '韮山城も二十四日に開城。鉢形はすでに落ち、山中は三月に半日で落ちております', 4));
      line(13, () => rt.say('使番', '忍城だけは、石田殿の水攻めの囲みの中。なお落ちず', 3.6));
      line(17.4, () => rt.say('井伊直政', '城の中の者の心が、折れ始めたな', 3.2));
      // 逃げ出す北条の兵（降りに来る。槍を伏せる）と、追って出た北条の追っ手
      if (!C.r1 && el > 20) { C.r1 = true; runners(rt, C, H, 0); }
      if (!C.r2 && el > 50) { C.r2 = true; runners(rt, C, H, 1); }
      if (!C.r3 && el > 82) { C.r3 = true; runners(rt, C, H, 0); }
      // 逃げて来た者は岸に着くと座って槍を伏せる
      for (const g of C.runners) if (!g.sat && Math.hypot(g.center().x - H.BANK.x, g.center().z - H.BANK.z) < 7) { g.sat = true; for (const u of g.units) if (u.alive) u._crouch = true; rt.say('逃げて来た北条の兵', 'お助けを……城の中は、もう皆、戦う気がござらぬ', 3.6); }
      const chasers = C.groups.filter((g) => g.chaser);
      rt.objProgress('dp', '');
      // 追っ手だけを先に討っても、降りに来た三組を岸で迎えるまでは済ませない。
      const welcomed = C.runners.length === 3 && C.runners.every((g) => g.sat);
      const done = C.r3 && welcomed && chasers.length >= 3 && chasers.every((g) => live(g) <= 1);
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

function runners(rt, C, H, i) {
  const from = { x: H.KIDO_F.x - 2, z: H.KIDO_F.z + (i ? 5 : -3) };
  const g = enemyGroup(rt, { faction: 'hojo', name: '逃げて来た北条の兵', anchor: from, facing: Math.PI / 2, width: 3, aggro: 0, morale: 100, noRout: true, noAI: true,
    order: 'move', dest: { x: H.BANK.x + 2, z: H.BANK.z + (i ? 4 : -4) }, speed: 3.6 },
  H.dress([{ type: 'ashigaru', n: 4 }], H.HOJO));
  g.peaceful = true; g.fire = false;
  for (const u of g.units) { u.noTarget = true; u.invuln = true; }
  C.runners.push(g);
  const ch = enemyGroup(rt, { faction: 'hojo', name: '北条の追っ手', anchor: { x: H.KIDO_F.x - 6, z: from.z }, facing: Math.PI / 2, width: 5, aggro: 12, morale: 95, noRout: true,
    order: 'move', dest: { x: H.BANK.x - 1, z: H.BANK.z + (i ? 4 : -4) }, speed: 3.4 },
  H.dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: i ? 9 : 7 }], H.HOJO));
  ch.dmgMult = 0.55; ch.chaser = true;
  ch.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; q.seekRange = 20; q.aggro = 14; };
  C.groups.push(ch);
  rt.army.play('eshout', from, 1.2);
  sfx('taiko', 0.5);
  rt.say('井伊の足軽', i ? 'また逃げて来る！　追っ手も多いぞ！' : '城から逃げて来る者がおる！　後ろに追っ手じゃ！', 3.2);
}
