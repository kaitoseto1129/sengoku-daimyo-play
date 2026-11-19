// ======================================================================
// 小田原征伐　「石垣山の夜の普請」の段（9〜12分）　docs/toyo15_plan_1108.md の 15
// 史実：秀吉は小田原城の南西の笠懸山（石垣山）に、およそ八十日かけて石垣の城を築いた。小田原の側の林を残して普請を隠し、
//   出来上がると一夜で木を伐り払って、城が一夜で現れたように見せた（六月二十六日）。
// 遊び：六月二十五日の夜、石垣山へ歩く。火を焚かずに材木と石を運ぶ人夫の列。北条の物見が山の北の林から忍び寄る。
//   普請を見られないよう物見を退け、翌朝は井伊の陣へ歩いて戻る（城が現れる段へ）。
// 入れ方：b_t12_odawara.js の depthStart の段の並び（夜討ちから退いた後・石垣山の城が現れる段の前）に step(H) を置く。
// ======================================================================
import { allyGroup, enemyGroup, nm } from '../bhelp.js';
import { tawara } from '../props.js';
import { sfx } from '../audio.js';
import { k15Fade } from '../oda15_kit.js';

const WAVES = [[4, 0], [26, 1], [48, 2], [70, 1]];   // 11/18 cloud-21（司令塔：長さを指示書の15分へ）：物見の間を三十二秒→二十二秒に（数と強さはそのまま）   // [段の始めからの秒, 来る所の番]

export function step(H) {
  const live = (g) => (g ? g.units.filter((u) => u.alive && !u.gone && !u.fleeing).length : 0);
  return {
    kind: 'fight', key: 'ishigaki',
    start(rt, C, m, ctx) {
      const F = rt.flags, W = rt.world;
      C.at = H.FUSHIN; C.goal = H.FUSHIN; C.groups = []; C.scouts = []; C.w = 0;
      k15Fade(rt, () => {
        F.day = 0.5;
        W.setTime('night', true); W.setRainTarget(0); W.rainLevel = 0;
        H.clearFoes(rt);
        // 11/18 cloud-21：前の段の味方の新手が夜の林の縁に残り、物見を本人の三十歩手前で討ち切っていた。暗転の間に外す（普請の番と手勢だけで守る）
        for (const g of rt.army.groups) if (g.team === 0 && g.name === '味方の新手') for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u);
        // 普請の城は林の向こうで出来かけている（小田原からは林に隠れて見えない）
        // 小田原の側の杉の帯（ichiyajo の wood）は普請場の北の縁に並ぶ。山の上では視点が帯の中に入り真っ暗に写ったので、夜の普請の間だけ隠す
        if (F.ichiya) { F.ichiya.castle.visible = true; F.ichiya.wood.visible = false; }
        // 普請場へは現在地から歩く。日付の暗転でも本人と手勢を移さない。
        // 人夫の列：材木と石を背に、山の道を上り下りする
        C.porters = allyGroup(rt, { faction: 'oda', name: '普請の人夫', anchor: { ...H.FUSHIN }, facing: 0, width: 6, aggro: 0, noRout: true, fullStrength: true, order: 'path',
          path: [[H.FUSHIN.x - 6, H.FUSHIN.z + 10], [H.FUSHIN.x + 4, H.FUSHIN.z - 4]], pathIdx: 0, speed: 1.6, arriveNoncombat: true },
        [{ type: 'porter', n: 12, o: { flag: null, hat: 'none', armor: 0x4a4034, lace: 0x5a4e3c, cloth: 0x6a5a44, haori: null, mon: null } }]);
        for (const u of C.porters.units) u.noTarget = true;
        C.porters.onArrive = (q) => { q.path = q.path.slice().reverse(); q.pathIdx = 0; q.order = 'path'; };
        // 普請の番の豊臣の兵（主人公と共に物見を討つ）
        C.guard = allyGroup(rt, { faction: 'oda', name: '普請の番', anchor: { x: H.FUSHIN.x + 4, z: H.FUSHIN.z - 8 }, facing: 0, width: 6, aggro: 12, noRout: true, fullStrength: true, order: 'hold', seekRange: 10 },
          H.dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }], H.TOYO));
        C.guard.dmgMult = 0.5;   // 番が物見を先に討ち尽くさないよう（本人の斬り合いを残す）
        for (const [dx, dz] of [[-8, 4], [6, 6], [-2, -4]]) rt.scene.add(tawara(W, H.FUSHIN.x + dx, H.FUSHIN.z + dz, 0.4, 5));
      }, '六月二十五日の夜　石垣山', '火を焚かず、城を築く');
      // 11/18 iMac の検品（段7の林で本人一人）：普請場へ歩く間、本人の手勢も普請場へ連れて行く（前は陣に残り、夜の林を本人一人で歩いた）
      for (const g of [rt.flags.mine, ...(rt.squadGroups || [])]) if (g && g.count && !g.routed) { g.ai = false; g.order = 'move'; g.dest = { x: H.FUSHIN.x - 4, z: H.FUSHIN.z + 6 }; g.onArrive = (q) => { q.onArrive = null; q.order = 'hold'; q.aggro = 12; q.seekRange = 16; }; }
      rt.obj('dp', '石垣山の普請場で、北条の物見を退けて普請を守る', 'main');
      rt.marker('dp', H.FUSHIN, '石垣山の普請場', { h: 3 });
      rt.say('普請の奉行', '火は焚くな。声も立てるな。小田原から見られてはならぬ', 3.6);
      rt.after(4.2, () => rt.say(nm(rt), '林の向こうに……石垣と白い壁。もう城が出来ておる', 3.4));
    },
    tick(rt, C, m, ctx, el, dt = 0) {
      // 物見：山の北の林から三度、少しずつ忍び寄る
      while (C.w < WAVES.length && el >= WAVES[C.w][0]) {
        const from = H.SCOUT_FROM[WAVES[C.w][1]];
        const g = enemyGroup(rt, { faction: 'hojo', name: '北条の物見', anchor: { ...from }, facing: Math.atan2(H.FUSHIN.x - from.x, H.FUSHIN.z - from.z), width: 3, aggro: 10, morale: 85, noRout: true,
          order: 'move', dest: { x: H.FUSHIN.x, z: H.FUSHIN.z - 6 }, speed: 2.6 },
        H.dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: C.w >= 2 ? 5 : 3 }], { ...H.HOJO, flag: null }));   // 11/19 cloud-21：二度目からの物見に弓を足したら、退いた後も帰り道の普請場の東 (-47,80) で本人が千秒止まる回が出た（act bot 3回中1回・1500秒の時切れ）。弓は戻した
        g.dmgMult = 0.55; g.dmgMultPlayer = 0.85;   // 本人へは強く（act bot「21人を無傷で討った」11/18）
        // 11/18 クラウド小田原の持ち主（13:00 JST）：act bot「15分で10人・斬り合う相手が少なくて退屈」。物見は普請の番と手勢にばかり討たれ、
        //   本人の刃に掛からなかった。二度目からの物見は着くと本人へ打ち掛かる（kuzure の追っ手と同じ focus）。三度目からは足軽を一人ずつ増やす
        const hunt = C.w >= 1;
        g.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; q.seekRange = 20; q.aggro = 14; const pu = rt.player.u; if (hunt && pu.alive && Math.hypot(pu.pos.x - q.center().x, pu.pos.z - q.center().z) < 25) q.focus = pu; };
        g.bornEl = el; g.hunt = hunt;
        C.scouts.push(g); C.groups.push(g);
        rt.say('普請の番', ['林の中に人影！　北条の物見じゃ。生かして帰すな', 'また来た！　東の沢からじゃ', '三方から来る！　一人も城へ戻すな', '夜明け前の最後の物見じゃ！'][C.w], 3.2);
        C.w++;
      }
      // 11/18 cloud-21：物見は普請の番・手勢と林の縁で斬り合って move のまま着かず、本人へ打ち掛かる onArrive が働かなかった（描かずの通しで段の討ち取り0・近い敵平均59m。kuzure の追っ手と同じ）。出て十二秒で寄せる
      // 前の段から残る味方の新手は、この段では打ち込みを三割に（物見・追っ手を本人の手前で討ち切らない。b_t12_odawara の noRsvStep と対）
      for (const g of rt.army.groups) if (g.team === 0 && g.name === '味方の新手' && !g._dpSoft) { g._dpSoft = true; g.dmgMult = Math.min(g.dmgMult ?? 1, 0.3); }
      if (!C.withdraw) for (const q of C.scouts) if (q.onArrive && el - q.bornEl > 12) {
        q.onArrive = null; q.order = 'attack'; q.seekRange = 40; q.aggro = 14;
        const pu = rt.player.u; if (q.hunt && pu.alive && Math.hypot(pu.pos.x - H.FUSHIN.x, pu.pos.z - H.FUSHIN.z) < 30) q.focus = pu;
      }
      // 11/19 05:15 UTC クラウド小田原の持ち主：act bot 491〜703秒、普請の人夫が道の端 (-69,90) で「着いて待つ」のまま止まった（列の誰かが石・俵の際で持ち場へ寄り切れず、着いた事にならない）。
      //   道の端に三秒いれば着いた事にして、折り返して歩かせる
      { const P = C.porters; if (P && P.order === 'path' && P.path && P.pathIdx >= P.path.length) { P._endT = (P._endT || 0) + dt; if (P._endT > 3) { P._endT = 0; P.path = P.path.slice().reverse(); P.pathIdx = 0; } } else if (P) P._endT = 0; }
      rt.objProgress('dp', '');
      // 主な物見を退けるか、現地で夜明けまで守れば、残兵には撤退の下知が出る。
      // 命を消して全滅にせず、生きたまま林へ退かせる。
      const near = Math.hypot(rt.player.u.pos.x - H.FUSHIN.x, rt.player.u.pos.z - H.FUSHIN.z) < 18;
      // 陣を離れて待った時間は、普請を守った時間に含めない。
      if (near && rt.player.u.alive !== false) C.guardHold = (C.guardHold || 0) + dt;
      const total = C.scouts.reduce((n, g) => n + g.units.length, 0);
      const remaining = C.scouts.reduce((n, g) => n + live(g), 0);
      if (!C.withdraw && C.w >= WAVES.length && near && remaining > 0 &&
          (remaining <= total * 0.2 || C.guardHold >= 100)) {
        C.withdraw = true;
        for (const g of C.scouts) {
          g.order = 'move'; g.dest = { ...H.SCOUT_FROM[1] }; g.speed = 3;
          g.onArrive = null; g.aggro = 0; g.seekRange = 0; g.focus = null; g.peaceful = true; g.noAI = true; g.ai = false;
          for (const u of g.units) if (u.alive && !u.gone) { u.target = null; u.atk = null; u.swing = null; u.bind = null; }
        }
        rt.say('北条の物見', '夜が明ける。林へ引け！', 3);
      }
      const done = C.w >= WAVES.length && (remaining === 0 || C.withdraw);
      if (done && Math.hypot(rt.player.u.pos.x - H.FUSHIN.x, rt.player.u.pos.z - H.FUSHIN.z) < 18 && !C.done) {
        C.done = el;
        rt.say('普請の番', '物見を退けた。普請は守り通したぞ', 3.6);
        rt.after(4, () => rt.say('普請の奉行', '夜のうちに林を伐る。夜が明けたら、城が姿を見せるぞ', 3.6));
      }
      return !!C.done && el - C.done > 8.5;
    },
    end(rt, C) {
      rt.objDone('dp');
      rt.unmark('dp');
      rt.award((t) => t.side.push('石垣山の普請を北条の物見から守った'), '石垣山の普請を守った');
      // 日付だけを暗転で進める。城が現れる段では井伊の陣へ歩いて戻る。
      k15Fade(rt, () => {
        // 翌日へ移る暗転の中で退場させ、目の前の生存者を消さない。
        for (const g of [...C.scouts, C.porters, C.guard]) if (g) for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u);
        // 次の段が既に林を伐っている場合もあるため、遅れて林を戻さない。
        // 次の段の行き先の印に従い、井伊の陣へ歩いて戻る。
      });
    },
  };
}
