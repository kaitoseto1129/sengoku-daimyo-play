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
      const foe = () => { const pu = rt.player.u; let best = null, bd = 1e9; for (const g of C.groups) { if (!g.chaser || live(g) === 0) continue; const c = nearU(g, pu); if (Math.hypot(c.x - H.BANK.x, c.z - H.BANK.z) > 40) continue; const d = Math.hypot(c.x - pu.pos.x, c.z - pu.pos.z); if (d < bd) { bd = d; best = c; } } return best && bd > 12 ? best : null; };
      rt.marker('dp', () => { const c = foe(); return c ? { x: Math.max(H.KIDO_F.x + 1, c.x), z: c.z } : H.BANK; }, () => foe() ? '北条の追っ手' : '山王川の岸', { h: 3 });
      rt.army.play('eshout', H.SANNO_IN, 1.2);
      // 11/18 cloud-21：岸と木戸の間に残る味方の新手が追っ手を本人の十四歩手前で受け止め、描かずの通しで本人の討ち取り0だった。岸の後ろ（東）へ下げて控えさせる
      let k = 0;
      for (const g of rt.army.groups) if (g.team === 0 && g.name === '味方の新手' && g.count && Math.hypot(g.center().x - H.BANK.x, g.center().z - H.BANK.z) < 40) {
        g.order = 'move'; g.dest = { x: H.BANK.x + 16 + (k % 2) * 4, z: H.BANK.z - 8 + k * 6 }; g.aggro = 4; g.seekRange = 4; g.focus = null; k++;
        g.onArrive = (q) => { q.onArrive = null; q.order = 'hold'; };
        for (const u of g.units) { u.target = null; u.atk = null; }
      }
      // 11/18 クラウド小田原の持ち主：城が現れる段（castleReveal）の後に置いた。驚きの声と支城の知らせはその段と shijo の段で済んでいるので繰り返さない
      rt.say('井伊の足軽', '山王口が騒がしい……城から人が降りて来るぞ！', 3.4);
    },
    tick(rt, C, m, ctx, el, dt = 1 / 30) {
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
      if (!C.r2 && el > r0 + 22) { C.r2 = true; runners(rt, C, H, 1); }
      if (!C.r3 && el > r0 + 44) { C.r3 = true; runners(rt, C, H, 0, true); }
      // 11/18 夜50-43（act bot 6遊びで討ち取り5〜22・「斬り合う相手が少ない」）：城の割れが広がり、四組目の追っ手が岸の本人へ打ち掛かる
      if (!C.r4 && el > r0 + 66)   /* 11/18 cloud-21（司令塔：長さを15分へ）：組の間を三十秒→二十二秒に（数と強さはそのまま） */  { C.r4 = el; runners(rt, C, H, 1, true); }
      // 逃げて来た者は岸に着くと座って槍を伏せる
      for (const g of C.runners) if (!g.sat && Math.hypot(g.center().x - H.BANK.x, g.center().z - H.BANK.z) < 7) { g.sat = true; for (const u of g.units) if (u.alive) u._crouch = true; rt.say('逃げて来た北条の兵', 'お助けを……城の中は、もう皆、戦う気がござらぬ', 3.6); }
      const chasers = C.groups.filter((g) => g.chaser);
      // 11/18 cloud-21：追っ手は岸の手前（木戸の外）で井伊の足軽と斬り合って move のまま着かず、本人へ打ち掛かる onArrive が一度も働かなかった（描かずの通しで四組とも）。岸から十八歩に入れば着いた事にする
      //   描かずの通しで追っ手は木戸の外 (84〜110,-62) で足を止め、岸 (136,-78) の本人から三十〜五十歩離れて斬り合っていた（写真は岸の前が空）→ 出て十二秒で岸へ駆け、本人へ打ち掛かる組は本人を的にする
      // 前の段から残る味方の新手は、この段では打ち込みを三割に（物見・追っ手を本人の手前で討ち切らない。b_t12_odawara の noRsvStep と対）
      for (const g of rt.army.groups) if (g.team === 0 && g.name === '味方の新手' && !g._dpSoft) { g._dpSoft = true; g.dmgMult = Math.min(g.dmgMult ?? 1, 0.3); }
      // 11/19 01:20 UTC クラウド小田原の持ち主：act bot（描かずの位置の記録）で、追っ手が木戸の前 (123〜126,-67) で井伊の足軽と斬り合って討ち切られ、
      //   岸の本人の段の討ち取りが2（もう一本は19）。木戸の三十歩内の味方の組も、この段の間だけ打ち込みを四割に（斬り合いの絵は残す。end で戻す）
      for (const g of rt.army.groups) if (g.team === 0 && g._kzDm == null && g.name !== '味方の新手' && g !== rt.player.u.group && g.count && Math.hypot(g.center().x - H.KIDO_F.x, g.center().z - H.KIDO_F.z) < 30) { g._kzDm = g.dmgMult ?? 1; g.dmgMult = Math.min(g._kzDm, 0.4); (C.soft ||= []).push(g); }
      for (const q of chasers) if (q.onArrive && (Math.hypot(q.center().x - H.BANK.x, q.center().z - H.BANK.z) < 18 || el - q.bornEl > 12)) {
        q.onArrive = null; q.order = 'attack'; q.seekRange = 40; q.aggro = 14;
        const pu = rt.player.u; if (q.hunt && pu.alive && Math.hypot(pu.pos.x - H.BANK.x, pu.pos.z - H.BANK.z) < 30) q.focus = pu;
      }
      // 着いた時に本人が遠くて的を付けなかった組も、本人が二十五歩内に来たら本人へ打ち掛かる
      { const pu = rt.player.u; if (pu.alive) for (const q of chasers) if (q.hunt && !q.onArrive && !q.focus && live(q) && Math.hypot(pu.pos.x - q.center().x, pu.pos.z - q.center().z) < 25) q.focus = pu; }
      // 11/18 23:45 UTC の残り（act bot 791秒：印「北条の追っ手」に着いて6秒なにも起きない）＝印は木戸の前で止め、追っ手は木戸の内で井伊の足軽と斬り合っていた。
      //   印の二歩半の内に一秒半立てば、近い追っ手の組が本人へ打って出る（一言）
      { const pu = rt.player.u, fc = foeAt(C, H, pu, live), mp = fc ? { x: Math.max(H.KIDO_F.x + 1, fc.c.x), z: fc.c.z } : null;
        // 11/19 00:25 UTC：act bot 804秒、本人は岸 (139,-78) に立ったまま、印の追っ手は川向こう (125,-68) で井伊の足軽と斬り合い六秒なにも起きない。
        //   印が追っ手を指す間に本人が三歩の内で四秒動かなければ、同じく追っ手が本人へ打って出る
        const still = C.stillP && Math.hypot(pu.pos.x - C.stillP.x, pu.pos.z - C.stillP.z) < 3;
        if (!still) C.stillP = { x: pu.pos.x, z: pu.pos.z };
        C.stillT = mp && still ? (C.stillT || 0) + dt : 0;
        C.pinT = mp && pu.alive && (Math.hypot(pu.pos.x - mp.x, pu.pos.z - mp.z) < 2.5 || C.stillT > 2.5) ? (C.pinT || 0) + dt : 0;
        // 11/19 04:45 UTC クラウド小田原の持ち主：act bot 794秒 印「北条の追っ手」で六秒なにも起きない＝本人は印の十m内を斬り合いながら動き、二歩半にも「止まって」にも入らなかった。印の十m内に三秒いれば同じく打って出る
        C.pin10T = mp && pu.alive && Math.hypot(pu.pos.x - mp.x, pu.pos.z - mp.z) < 10 ? (C.pin10T || 0) + dt : 0;
        if (C.pin10T > 3) C.pinT = Math.max(C.pinT, 1.6);
        if (C.pinT > 1.5 && fc.g.focus !== pu) {
          const q = fc.g; q.onArrive = null; q.order = 'attack'; q.seekRange = 40; q.aggro = 14; q.focus = pu; q.hunt = true;
          for (const u of q.units) if (u.alive && !u.fleeing) { u.target = null; u.atk = null; }
          if (el - (C.pinSay ?? -9) > 8) { C.pinSay = el; rt.say('北条の追っ手', '寄せ手の者か！　邪魔立てするな！', 3); }
        } else if (C.pinT > 1.5 && el - (C.pinRe ?? -9) > 4) {
          // 11/19 05:25 UTC クラウド小田原の持ち主：act bot 690秒 印「北条の追っ手」で六秒なにも起きない（四度目）＝組は前に本人へ向けたまま、兵は井伊の足軽と組み合って来なかった。
          //   印で待つ間は四秒ごとに、本人から六歩より遠い追っ手の組み合いを解いて本人へ寄せる（一言）
          C.pinRe = el;
          for (const u of fc.g.units) if (u.alive && !u.fleeing && Math.hypot(u.pos.x - pu.pos.x, u.pos.z - pu.pos.z) > 6) { u.target = null; u.atk = null; }
          // 11/19 07:30 UTC クラウド小田原の持ち主：act bot 715秒 印「北条の追っ手」で六秒なにも起きない（五度目）＝一言が八秒に一度で、六秒の間に何も言わなかった。
          //   二つの一言を交互に四秒半ごと（同じ文は九秒に一度）
          if (el - (C.pinSay ?? -9) > 4.5) { C.pinSay = el; C.pinAlt = !C.pinAlt; rt.say(C.pinAlt ? '井伊の足軽' : '手勢の侍', C.pinAlt ? '追っ手がこちらへ向きを変えた！　来るぞ！' : '槍を揃えよ！　追っ手を岸へ寄せるな！', 3); }
        } }
      // 11/19 06:35 UTC クラウド小田原の持ち主：act bot 849秒「54人を無傷で討った」（この段で33人・受けた傷0・受け流し11）。
      //   追っ手は本人を的（focus）にしても、兵は横の井伊の足軽と組み合ったままで本人へ振らない。一秒ごとに、本人の八歩内の追っ手のうち
      //   本人へ向いていない者を近い順に三人まで本人へ向ける（侍を先に）。打ちの重さは変えない
      if (el - (C.pressT ?? -9) > 1) {
        C.pressT = el; const pu = rt.player.u;
        if (pu.alive) {
          let on = 0; const cand = [];
          for (const g of chasers) for (const u of g.units) {
            if (!u.alive || u.gone || u.fleeing || u.downed) continue;
            const d = Math.hypot(u.pos.x - pu.pos.x, u.pos.z - pu.pos.z); if (d > 8) continue;
            if (u.target === pu || u.atk?.target === pu) on++; else cand.push([d - (u.type === 'samurai' ? 3 : 0), u]);
          }
          cand.sort((a, b) => a[0] - b[0]);
          for (const [, u] of cand.slice(0, Math.max(0, 3 - on))) { u.target = pu; u.atk = null; u.watch = null; }
        }
      }
      rt.objProgress('dp', '');
      // 追っ手だけを先に討っても、降りに来た三組を岸で迎えるまでは済ませない。
      // 11/18 クラウド小田原の持ち主：降りに来た者が岸に着けない時も段を止めない（act bot で千秒止まった）。出て四十秒で迎えた事にする
      const welcomed = C.runners.length >= 3 && C.runners.every((g) => g.sat || el - g.bornEl > 40);
      // 追っ手が堀の角などに掛かって残っても、三番手から一分半で城へ引き揚げさせて済ませる
      const done = C.r4 && ((welcomed && chasers.length >= 3 && chasers.every((g) => live(g) <= 1)) || el > C.r4 + 45);
      // 11/19 05:40 UTC クラウド小田原の持ち主：act bot 794秒 段の終わり近くで四十五秒だれも討たれず一言も無い（追っ手の残り一人を待つ間・本人が岸から離れている間）。
      //   本人の二十五歩内に追っ手がいない間は、十八秒ごとに岸の様子を一言（終わりの形が揃えば岸へ呼ぶ）。岸は二十四歩の内で迎えた事にする
      { const pu = rt.player.u, foeNear = chasers.some((g) => g.units.some((u) => u.alive && !u.gone && Math.hypot(u.pos.x - pu.pos.x, u.pos.z - pu.pos.z) < 25));
        if (!C.done && C.r4 && !foeNear && el - (C.nudge ?? C.r4) > 18) {
          C.nudge = el;
          const w = done ? ['井伊直政', '追っ手は退いた。岸へ戻り、逃げて来た者を迎えよ'] : [['井伊の足軽', '木戸の陰に、まだ追っ手が残っておる'], ['手勢の侍', '逃げて来た者が岸で震えておる。城の中で何があったのか'], ['井伊の足軽', '城の土塁の上で、北条の者どうしが言い争うておる']][(C.nk = (C.nk || 0) + 1) % 3];
          rt.say(w[0], w[1], 3.4);
        } }
      // 11/19 cloud-21：act bot 4回中1回、本人が木戸の口 (116,-61・岸から二十七歩) で木戸の内に残った追っ手へ斬り掛かり続け、九百秒段が済まず1500秒の時切れ。
      //   済む形が揃って二十五秒たてば、本人が岸から離れていても済ませる（残る追っ手は城へ退く）
      if (done && C.doneSeen == null) C.doneSeen = el;
      if (done && (Math.hypot(rt.player.u.pos.x - H.BANK.x, rt.player.u.pos.z - H.BANK.z) < 24 || el - C.doneSeen > 25) && !C.done) {
        C.done = el;
        const KL = rt.flags.kuzureLog; if (KL) { KL.end = Math.round(el); KL.k1 = rt.stats?.kills ?? -1; KL.left = chasers.reduce((n, g) => n + live(g), 0); }
        for (const g of chasers) { g.noRout = false; g.morale = 0; }
        rt.say(nm(rt), '城から逃げる者を、城の者が討ちに来る……もう城の中は割れておる', 3.6);
        rt.award((t) => t.side.push('城から逃げて来た北条の兵を迎えた'), '逃げて来た兵を迎えた');
      }
      return !!C.done && el - C.done > 6;
    },
    end(rt, C) {
      for (const g of C.soft || []) { g.dmgMult = g._kzDm; g._kzDm = null; }
      for (const g of [...C.groups, ...C.runners]) if (g) for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u);
      rt.unmark('dp');
      rt.objDone('dp');
    },
  };
}

// 本人に一番近い、岸の四十歩内の追っ手の組と、その真ん中
// 11/19 03:35 UTC クラウド小田原の持ち主：act bot 721秒「印『北条の追っ手』に着いて6秒なにも起きない」（三度目）。組の真ん中は散った兵の間の空き地を指す事がある→本人に一番近い生きた兵を指す
function nearU(g, pu) { let b = null, bd = 1e9; for (const u of g.units) { if (!u.alive || u.gone) continue; const d = Math.hypot(u.pos.x - pu.pos.x, u.pos.z - pu.pos.z); if (d < bd) { bd = d; b = u.pos; } } return b ? { x: b.x, z: b.z } : g.center(); }

function foeAt(C, H, pu, live) {
  let best = null, bd = 1e9;
  for (const g of C.groups) { if (!g.chaser || live(g) === 0) continue; const c = nearU(g, pu); if (Math.hypot(c.x - H.BANK.x, c.z - H.BANK.z) > 40) continue; const d = Math.hypot(c.x - pu.pos.x, c.z - pu.pos.z); if (d < bd) { bd = d; best = { g, c }; } }
  return best && bd > 12 ? best : null;
}

function runners(rt, C, H, i, hunt = !!i) {
  // 11/18 クラウド小田原の持ち主：前は木戸の前の二歩西・五歩脇 (120,-67)(120,-59) から出し、篠曲輪の堀の角に掛かって岸へ着けなかった。
  //   木戸の前の堀の外（堀と山王川の間）から出し、追っ手は木戸の切れ目の真ん中から出す
  const from = { x: H.KIDO_F.x + 1.5, z: H.KIDO_F.z + (i ? 1.5 : -1.5) };
  const g = enemyGroup(rt, { faction: 'hojo', name: '逃げて来た北条の兵', anchor: from, noGuard: true, facing: Math.PI / 2, width: 3, aggro: 0, morale: 100, noRout: true, noAI: true,
    order: 'move', dest: { x: H.BANK.x + 2, z: H.BANK.z + (i ? 4 : -4) }, speed: 3.6 },
  H.dress([{ type: 'ashigaru', n: 4 }], H.HOJO));
  g.peaceful = true; g.fire = false;
  for (const u of g.units) { u.noTarget = true; u.invuln = true; }
  C.runners.push(g);
  g.bornEl = C.el || 0;
  const ch = enemyGroup(rt, { faction: 'hojo', name: '北条の追っ手', anchor: { x: H.KIDO_F.x - 3, z: H.KIDO_F.z + (i ? 1 : -1) }, noGuard: true,   /* 11/18 cloud-21：見える所に湧かせない共通の決まり（guardSpawn）で (66〜91,-35〜-76) の町の中へずらされ、四十〜六十歩を歩く間に味方に止められていた。木戸から打って出る形なので木戸の前から出す */ facing: Math.PI / 2, width: 5, aggro: 12, morale: 95, noRout: true,
    order: 'move', dest: { x: H.BANK.x - 1, z: H.BANK.z + (i ? 4 : -4) }, speed: 3.4 },
  // 11/19 07:40 UTC クラウド小田原の持ち主：act bot 4本とも「43〜49人を無傷で討った」（この段で30人・受けた傷0・受け流し12〜27）。
  //   土塁の鉄砲は夜討ちの後に下げてあるので、二組目と四組目の追っ手に鉄砲二挺（数は同じ十一）。槍の届かない所からの傷を岸でも受ける
  //   11/19 08:50 UTC：それでも鉄砲の傷は三本に一〜二本。一組目・三組目も足軽二人を鉄砲二挺に替える（数は同じ九）
  H.dress(i ? [{ type: 'samurai', n: 2 }, { type: 'gun', n: 2 }, { type: 'ashigaru', n: 7 }] : [{ type: 'samurai', n: 2 }, { type: 'gun', n: 2 }, { type: 'ashigaru', n: 5 }], H.HOJO));
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
