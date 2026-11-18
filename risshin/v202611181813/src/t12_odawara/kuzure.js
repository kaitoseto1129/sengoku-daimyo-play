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
      // 11/18 22:25 UTC クラウド小田原の持ち主：描かずの通しで、追っ手は木戸の前 (112〜118,-67) で井伊の足軽と斬り合ったまま岸へ来ず、
      //   本人は岸 (137,-78) で百秒立つだけ（act bot の段の討ち取り0が二本続いた）。追っ手が本人から十二歩より遠い間は、印を追っ手へ向ける（曲輪の内へは入れない：木戸の前で止める）
      const foe = () => { const pu = rt.player.u; let best = null, bd = 1e9; for (const g of C.groups) { if (!g.chaser || live(g) === 0) continue; const c = g.center(); if (Math.hypot(c.x - H.BANK.x, c.z - H.BANK.z) > 40) continue; const d = Math.hypot(c.x - pu.pos.x, c.z - pu.pos.z); if (d < bd) { bd = d; best = c; } } return best && bd > 12 ? best : null; };
      rt.marker('dp', () => { const c = foe(); return c ? { x: Math.max(H.KIDO_F.x + 1, c.x), z: c.z } : H.BANK; }, () => foe() ? '北条の追っ手' : '山王川の岸', { h: 3 });
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
      // 11/18 22:20 UTC クラウド小田原の持ち主：act bot 5本のうち2本で本人の討ち取り0。前の段（城が現れた朝）の印が山の上の城を指し、
      //   本人が陣から石垣山の方へ百歩余り歩いた所で段が替わり、岸へ戻る前に一組目が出て、本人を狙う向き（focus）を付けられず井伊の足軽に討たれ尽くした。
      //   一組目は本人が岸の二十五歩内に来てから出す（長くて五十秒待つ）。二組目からは一組目の時から数える
      const pu0 = rt.player.u, atBank = Math.hypot(pu0.pos.x - H.BANK.x, pu0.pos.z - H.BANK.z) < 25;
      if (!C.r1 && el > 20 && (atBank || el > 50)) { C.r1 = el; runners(rt, C, H, 0, true); rt.flags.kuzureLog = { r1: Math.round(el), d0: Math.round(Math.hypot(pu0.pos.x - H.BANK.x, pu0.pos.z - H.BANK.z)), k0: rt.stats?.kills ?? -1 }; }
      const r0 = C.r1 || 1e9;
      if (!C.r2 && el > r0 + 30) { C.r2 = true; runners(rt, C, H, 1); }
      if (!C.r3 && el > r0 + 62) { C.r3 = true; runners(rt, C, H, 0, true); }
      // 11/18 夜50-43（act bot 6遊びで討ち取り5〜22・「斬り合う相手が少ない」）：城の割れが広がり、四組目の追っ手が岸の本人へ打ち掛かる
      if (!C.r4 && el > r0 + 92) { C.r4 = el; runners(rt, C, H, 1, true); }
      // 逃げて来た者は岸に着くと座って槍を伏せる
      for (const g of C.runners) if (!g.sat && Math.hypot(g.center().x - H.BANK.x, g.center().z - H.BANK.z) < 7) { g.sat = true; for (const u of g.units) if (u.alive) u._crouch = true; rt.say('逃げて来た北条の兵', 'お助けを……城の中は、もう皆、戦う気がござらぬ', 3.6); }
      const chasers = C.groups.filter((g) => g.chaser);
      // 11/18 cloud-21：追っ手は岸の手前（木戸の外）で井伊の足軽と斬り合って move のまま着かず、本人へ打ち掛かる onArrive が一度も働かなかった（描かずの通しで四組とも）。岸から十八歩に入れば着いた事にする
      //   描かずの通しで追っ手は木戸の外 (84〜110,-62) で足を止め、岸 (136,-78) の本人から三十〜五十歩離れて斬り合っていた（写真は岸の前が空）→ 出て十二秒で岸へ駆け、本人へ打ち掛かる組は本人を的にする
      for (const q of chasers) if (q.onArrive && (Math.hypot(q.center().x - H.BANK.x, q.center().z - H.BANK.z) < 18 || el - q.bornEl > 12)) {
        q.onArrive = null; q.order = 'attack'; q.seekRange = 40; q.aggro = 14;
        const pu = rt.player.u; if (q.hunt && pu.alive && Math.hypot(pu.pos.x - H.BANK.x, pu.pos.z - H.BANK.z) < 30) q.focus = pu;
      }
      // 着いた時に本人が遠くて的を付けなかった組も、本人が二十五歩内に来たら本人へ打ち掛かる
      { const pu = rt.player.u; if (pu.alive) for (const q of chasers) if (q.hunt && !q.onArrive && !q.focus && live(q) && Math.hypot(pu.pos.x - q.center().x, pu.pos.z - q.center().z) < 25) q.focus = pu; }
      rt.objProgress('dp', '');
      // 追っ手だけを先に討っても、降りに来た三組を岸で迎えるまでは済ませない。
      // 11/18 クラウド小田原の持ち主：降りに来た者が岸に着けない時も段を止めない（act bot で千秒止まった）。出て四十秒で迎えた事にする
      const welcomed = C.runners.length >= 3 && C.runners.every((g) => g.sat || el - g.bornEl > 40);
      // 追っ手が堀の角などに掛かって残っても、三番手から一分半で城へ引き揚げさせて済ませる
      const done = C.r4 && ((welcomed && chasers.length >= 3 && chasers.every((g) => live(g) <= 1)) || el > C.r4 + 60);
      if (done && Math.hypot(rt.player.u.pos.x - H.BANK.x, rt.player.u.pos.z - H.BANK.z) < 18 && !C.done) {
        C.done = el;
        const KL = rt.flags.kuzureLog; if (KL) { KL.end = Math.round(el); KL.k1 = rt.stats?.kills ?? -1; KL.left = chasers.reduce((n, g) => n + live(g), 0); }
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
  ch.dmgMult = 0.7; ch.dmgMultPlayer = 0.85; ch.chaser = true; ch.hunt = hunt; ch.bornEl = C.el || 0;
  // 11/18 クラウド小田原の持ち主：act bot が二本とも一太刀も受けずに38人・21人を討った（追っ手は井伊の足軽とばかり斬り合う）。
  //   二組目（侍2・足軽9）と三組目は岸に着くと、そばの本人へ打ち掛かる（b_domyoji の渡る足軽と同じ focus。三組目は act bot 15分で7〜10人の後に足した）
  ch.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; q.seekRange = 20; q.aggro = 14; const pu = rt.player.u; if (hunt && pu.alive && Math.hypot(pu.pos.x - q.center().x, pu.pos.z - q.center().z) < 25) q.focus = pu; };
  C.groups.push(ch);
  rt.army.play('eshout', from, 1.2);
  sfx('taiko', 0.5);
  rt.say('井伊の足軽', i ? 'また逃げて来る！　追っ手も多いぞ！' : '城から逃げて来る者がおる！　後ろに追っ手じゃ！', 3.2);
}
