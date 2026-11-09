// ======================================================================
// 八王子城の戦い　「急な山道」の段（6〜9分）　docs/toyo15_plan_1108.md の 14
// 史実：御主殿を取った寄せ手は、尾根の曲輪（金子丸・高丸・小宮曲輪）へ急な山道を登った。道は狭く、上の曲輪から弓・鉄砲・石が降った。
// 遊び：御主殿の裏から金子丸の下まで、尾根の細い坂を登る。坂の途中に北条の槍が踏み止まり、上の段から矢（石は金子丸の段から）。
//   竹束の陰で息を整え、坂の伏兵を討って金子丸の下に着くと、次の段（金子丸）へ。
// 入れ方：b_t11_hachioji.js の depthStart の段の並び（御主殿の後）に step(H) を置く。
// ======================================================================
import { enemyGroup, nm } from '../bhelp.js';
import { addTaba } from '../taketaba.js';

export function step(H) {
  const live = (g) => (g ? g.units.filter((u) => u.alive && !u.gone && !u.fleeing).length : 0);
  return {
    kind: 'fight', max: 160, key: 'sakamichi',
    start(rt, C, m, ctx) {
      C.at = H.SLOPE_MID; C.goal = H.SLOPE_MID; C.groups = [];
      rt.banner('尾根の山道', '上の曲輪から矢が降る');
      rt.obj('dp', '御主殿の裏の急な坂を、金子丸の下まで登る', 'main');
      // 坂の途中の踊り場に竹束（寄せ手が担いで上げた物）
      for (const [x, z] of [[68, -13], [73, -15], [69, -27], [75, -28]]) addTaba(rt, x, z, 0, { fixed: true, rot: Math.PI });
      // 坂に踏み止まる北条の槍と、上の段の弓
      C.spear = enemyGroup(rt, { fixed: true, faction: 'hojo', name: '坂の槍', anchor: { ...H.SLOPE_MID }, facing: 0, width: 4, formation: 'yari', aggro: 10, morale: 92, noRout: true, order: 'hold', seekRange: 12 },
        H.dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }], H.HOJO));
      C.spear.dmgMult = 0.42;
      C.bow = enemyGroup(rt, { fixed: true, faction: 'hojo', name: '上の段の弓', anchor: { ...H.SLOPE_TOP }, facing: 0, width: 5, aggro: 34, morale: 90, noRout: true, order: 'hold' },
        H.dress([{ type: 'bow', n: 4 }, { type: 'gun', n: 2 }, { type: 'ashigaru', n: 3 }], H.HOJO));
      C.bow.dmgMult = 0.3;
      C.groups.push(C.spear, C.bow);
      C.n0 = C.spear.units.length;
      ctx.friends(rt).forEach((g, k) => H.marchTo(rt, g, { x: H.SLOPE_MID.x, z: H.SLOPE_MID.z + 10 }, k));
      rt.say('前田の侍', '坂が細い！　二人並べぬ。竹束の陰を伝って登れ', 3.4);
      rt.after(6, () => rt.say(nm(rt), '上の段から矢が降ってくる……', 2.6));
      C.t2 = 0;
    },
    tick(rt, C, m, ctx, el) {
      const P = rt.player.u.pos;
      // 坂の半ばで、上の段から新手が駆け下りる（一度だけ）
      if (!C.down && (live(C.spear) <= C.n0 * 0.5 || el > 55)) {
        C.down = el;
        C.spear2 = enemyGroup(rt, { fixed: true, faction: 'hojo', name: '駆け下りる新手', anchor: { ...H.SLOPE_TOP }, facing: 0, width: 4, formation: 'yari', aggro: 12, morale: 95, noRout: true, order: 'attack', seekRange: 20 },
          H.dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 7 }], H.HOJO));
        C.spear2.dmgMult = 0.42;
        C.groups.push(C.spear2);
        rt.army.play('eshout', H.SLOPE_TOP, 1.3);
        rt.say('前田の侍', '上から駆け下りて来るぞ！　踏ん張れ、押し返せ！', 3);
        rt.after(5, () => rt.say('使番', '搦手、上杉勢が水の手の曲輪を破ったと！', 3.2));
      }
      rt.objProgress('dp', '');
      const left = live(C.spear) + live(C.spear2);
      // 坂の槍と駆け下りた新手を崩し、金子丸の下まで登ると次の段へ（上の段の弓は金子丸の段で一緒に落ちる）
      const top = Math.hypot(P.x - H.SLOPE_TOP.x, P.z - H.SLOPE_TOP.z) < 12;
      // 二巡 11/9：坂の槍がほぼ崩れたら、行き先を坂の上（金子丸の下）へ移す（行き先が坂の半ばのままで、上へ登らずに止まった）
      if (C.down && (left <= 4 || el > 150) && C.at !== H.SLOPE_TOP) { C.at = H.SLOPE_TOP; C.goal = H.SLOPE_TOP; }
      // 二巡 11/9：坂の脇の崖へ逃げた数人を討てず、十五分止まった。長引けば残りが少なくなった所で進む（味方が残りを払う）
      return !!C.down && top && (left <= 2 || (el > 150 && left <= 5) || el > 220);
    },
    end(rt, C) {
      for (const g of [C.spear, C.spear2]) if (g) { g.noRout = false; g.morale = 0; }
      // 上の段の弓は金子丸の守りへ退く
      if (C.bow) for (const u of C.bow.units) if (u.alive && !u.gone) rt.army.despawn(u);
      rt.objDone('dp');
      rt.award((t) => t.side.push('尾根の急な坂を登り切った'), '尾根の坂を登り切った');
    },
  };
}
