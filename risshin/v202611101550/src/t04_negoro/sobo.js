// 根来寺 ③ 6〜9分「僧坊の路地」：大門の内は子院の坊舎と塀と石段が入り組む。根来の鉄砲衆は持ち場を次々に替えて撃ち、
// 路地から行人方が斬って出る。近い斬り合いへ。鉄砲衆を追って討つ（段の長さは出来事で決める。体力では伸ばさない）。
import { enemyGroup } from '../bhelp.js';
import { breath } from '../toyo15/kit.js';

export function soboStep(NG) {
  const { P, dirL, ROT, NEGORO, dress, flee, alive, heads, nearestFighter } = NG;
  // 鉄砲衆の持ち場（子院の縁・塀の角・石段の上）。二十秒ほどで次の持ち場へ移る
  const SPOTS = [[-20, 12], [22, 16], [-30, 26], [28, 30], [-8, 30], [12, 26]].map(([x, z]) => P(x, z));
  const guns = (rt, name, at) => enemyGroup(rt, { faction: 'saika', fixed: true, name, anchor: at, facing: Math.PI + ROT, order: 'hold', seekRange: 26, aggro: 8, width: 4, morale: 90, fleeDir: dirL(0, 1), dmgMult: 0.25 },
    dress([{ type: 'gun', n: 3 }], NEGORO));
  const blades = (rt, name, at) => enemyGroup(rt, { faction: 'saika', fixed: true, name, anchor: at, facing: Math.PI + ROT, order: 'attack', seekRange: 40, aggro: 14, width: 5, morale: 85, fleeDir: dirL(0, 1), dmgMult: 0.3 },
    dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }], NEGORO));
  return {
    kind: 'sobo', max: Infinity, idleAdvance: false,
    start(rt, C) {
      const F = rt.flags;
      C.at = P(0, 18); C.goal = P(0, 18); C.groups = []; C.gunG = []; C.hop = 22; C.wave = 0;
      // 門の楼・塀・子院の石垣の撃ち手は退き、路地の鉄砲衆（持ち場を替える）に替わる（撃つ者が多すぎて路地で討たれた）
      for (const k of ['deck', 'wall', 'kei']) flee(F.posts[k]);
      for (const g of [F.innerG]) if (alive(g)) { g.stay = false; g.order = 'attack'; g.seekRange = 30; g.dmgMult = Math.min(g.dmgMult || 1, 0.3); C.groups.push(g); }
      // 鉄砲衆は初めは二組。三組目は奥から遅れて来る（一度に十挺が撃たない）
      for (let i = 0; i < 2; i++) { const g = guns(rt, '持ち場を替える鉄砲衆', SPOTS[i * 2 + 2]); g._spot = i * 2 + 2; C.gunG.push(g); C.groups.push(g); }
      F.friends().forEach((g, i) => { g.order = 'attack'; g.seekRange = 22; g.anchor = P(i % 2 ? 8 : -8, 14); });
      rt.obj('dp', NG.GOALS[3], 'main');
      breath(rt, 0.35);   // 段の替わり目に息を整える
      rt.say('組頭', '坊舎の塀の陰から撃ってくる！　撃った所へすぐ寄れ、次の所へ移る前に斬れ！', 4);
      rt.after(6, () => rt.say('羽柴秀次', '路地は狭い。槍を短く持て。塀の角に気を付けい', 3.5));
    },
    tick(rt, C, m, ctx, el, dt) {
      const F = rt.flags;
      const u = rt.player.u, at = P(0, 22);
      const present = u.alive && !u.downed && !u.dying && !u.fleeing && !rt.retryOpen
        && Math.hypot(u.pos.x - at.x, u.pos.z - at.z) < 36;
      C.pressT = (C.pressT || 0) + (present ? dt : 0);
      // 斬って出た後も建物の裏に残る者は、路地を攻めた本人の前から退く。
      // 後方で待つだけでは進めず、増援三組と斬り合う時間を残す。
      if (!C.withdraw && el > 300 && C.wave === 3 && C.pressT >= 30 && present) {
        C.withdraw = true;
        for (const g of C.groups) flee(g);
        rt.say('組頭', '路地の守りが退くぞ！　参道へ集まれ！', 3);
      }
      // 鉄砲衆が持ち場を替える（撃っては移る）
      // 四分を過ぎても残る鉄砲衆・行人方は持ち場を捨てて斬りかかる（届かない縁に残って段が十分止まった。豊臣A 11/9 三巡）
      if (el > 240 && !C.charge) {
        C.charge = true;
        let drewSidearm = false;
        for (const g of C.groups) if (alive(g)) {
          g.fixed = false; g.stay = false; g.order = 'attack'; g.dest = null; g.onArrive = null; g.aggro = 40; g.seekRange = 60;
          for (const q of g.units) {
            q.perch = null;
            // 攻撃の下知だけでは鉄砲の間合いで止まる。知らせどおり筒を置いて斬り合う。
            if (q.alive && !q.fleeing && !q.downed && !q.dying && !q.woundOut && !q.rearWound && q.type === 'gun' && !q.sidearm) {
              rt.army.drawSidearm(q);
              drewSidearm = !!q.sidearm || drewSidearm;
            }
          }
        }
        if (drewSidearm) rt.say('組頭', '鉄砲衆が筒を捨てて斬って出たぞ！　ここで討ち取れ！', 3);
      }
      if (el > C.hop && !C.charge) {
        C.hop = el + 20 + Math.random() * 6;
        let moving = false;
        for (const g of C.gunG) if (alive(g)) {
          g._spot = (g._spot + 1 + (Math.random() * 2 | 0)) % SPOTS.length;
          const q = SPOTS[g._spot];
          // 持ち場へ歩いて移る。要を先に移すと、到着扱いになって隊が走って追うだけになる。
          g.order = 'move'; g.dest = { x: q.x, z: q.z };
          g.onArrive = (gg) => { gg.order = 'hold'; gg.dest = null; };
          moving = true;
        }
        if (moving && el < 120) rt.say('足軽', '鉄砲衆が次の持ち場へ移るぞ！', 2.5);
      }
      // 路地から行人方が斬って出る
      const W = [[12, [-34, 22]], [55, [34, 24]], [100, [-14, 34]]];
      if (C.wave < W.length && el > W[C.wave][0]) {
        const [, [x, z]] = W[C.wave++];
        C.groups.push(blades(rt, '路地の行人方', P(x, z)));
        if (C.wave === 2) { rt.say('使番', '大伝法堂の裏にも根来の衆が集まっております！', 3.5); const g = guns(rt, '奥から来た鉄砲衆', SPOTS[5]); g._spot = 5; C.gunG.push(g); C.groups.push(g); }
      }
      const gunsLeft = heads(C.gunG), foes = heads(C.groups);
      const cleared = C.wave === W.length && (C.withdraw || gunsLeft <= 2 && foes <= 6);
      const p = rt.player.u.pos;
      let target = null;
      for (const g of C.gunG) {
        target = nearestFighter(g, p);
        if (target) break;
      }
      if (!target) for (const g of C.groups) {
        target = nearestFighter(g, p);
        if (target) break;
      }
      // 守りが崩れたら、達成判定と同じ路地の合流場所を示す。残兵を追わせ続けない。
      // 隊の中心は後送中の者にも引かれる。斬れる撃ち手本人へ案内する。
      C.goal = C.at = cleared || !target ? P(0, 22) : target.pos;
      rt.objProgress('dp', '');
      // 本人が路地の合流場所へ戻ってから済ませる。
      return el > 140 && cleared && u.alive && !u.downed && !u.dying && !u.fleeing && !rt.retryOpen
        && Math.hypot(u.pos.x - at.x, u.pos.z - at.z) < 18;
    },
    end(rt, C) { for (const g of C.groups) flee(g); rt.objDone('dp'); rt.award((t) => t.side.push('僧坊の路地で鉄砲衆を追い詰めた'), '僧坊の鉄砲衆を討った'); },
  };
}
