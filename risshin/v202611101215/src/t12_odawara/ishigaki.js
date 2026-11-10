// ======================================================================
// 小田原征伐　「石垣山の夜の普請」の段（9〜12分）　docs/toyo15_plan_1108.md の 15
// 史実：秀吉は小田原城の南西の笠懸山（石垣山）に、およそ八十日かけて石垣の城を築いた。小田原の側の林を残して普請を隠し、
//   出来上がると一夜で木を伐り払って、城が一夜で現れたように見せた（六月二十六日）。
// 遊び：暗転して六月二十五日の夜の石垣山。火を焚かずに材木と石を運ぶ人夫の列。北条の物見が山の北の林から忍び寄る。
//   普請を見られないよう、物見を三度討つ。済むと暗転して翌朝の井伊の陣（城が現れる段へ）。
// 入れ方：b_t12_odawara.js の depthStart の段の並び（夜討ちから退いた後・石垣山の城が現れる段の前）に step(H) を置く。
// ======================================================================
import { allyGroup, enemyGroup, nm } from '../bhelp.js';
import { tawara } from '../props.js';
import { sfx } from '../audio.js';
import { k15Fade } from '../oda15_kit.js';

const WAVES = [[4, 0], [36, 1], [68, 2], [100, 1]];   // [段の始めからの秒, 来る所の番]

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
        // 普請の城は林の向こうで出来かけている（小田原からは林に隠れて見えない）
        // 小田原の側の杉の帯（ichiyajo の wood）は普請場の北の縁に並ぶ。山の上では視点が帯の中に入り真っ暗に写ったので、夜の普請の間だけ隠す
        if (F.ichiya) { F.ichiya.castle.visible = true; F.ichiya.wood.visible = false; }
        H.warp(rt, H.FUSHIN.x + 3, H.FUSHIN.z - 6, Math.atan2(H.SCOUT_FROM[1].x - H.FUSHIN.x, H.SCOUT_FROM[1].z - H.FUSHIN.z));
        // 人夫の列：材木と石を背に、山の道を上り下りする
        C.porters = allyGroup(rt, { faction: 'oda', name: '普請の人夫', anchor: { ...H.FUSHIN }, facing: 0, width: 6, aggro: 0, noRout: true, fullStrength: true, order: 'path',
          path: [[H.FUSHIN.x - 6, H.FUSHIN.z + 10], [H.FUSHIN.x + 4, H.FUSHIN.z - 4]], pathIdx: 0, speed: 1.6, arriveNoncombat: true },
        [{ type: 'porter', n: 12, o: { flag: null, hat: 'none', armor: 0x4a4034, lace: 0x5a4e3c, cloth: 0x6a5a44, haori: null, mon: null } }]);
        for (const u of C.porters.units) u.noTarget = true;
        C.porters.onArrive = (q) => { q.path = q.path.slice().reverse(); q.pathIdx = 0; q.order = 'path'; };
        // 普請の番の豊臣の兵（主人公と共に物見を討つ）
        C.guard = allyGroup(rt, { faction: 'oda', name: '普請の番', anchor: { x: H.FUSHIN.x + 4, z: H.FUSHIN.z - 8 }, facing: 0, width: 6, aggro: 12, noRout: true, fullStrength: true, order: 'hold', seekRange: 18 },
          H.dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }], H.TOYO));
        C.guard.dmgMult = 0.7;
        for (const [dx, dz] of [[-8, 4], [6, 6], [-2, -4]]) rt.scene.add(tawara(W, H.FUSHIN.x + dx, H.FUSHIN.z + dz, 0.4, 5));
      }, '六月二十五日の夜　石垣山', '火を焚かず、城を築く');
      rt.obj('dp', '石垣山の普請場で、北条の物見を退けて普請を守る', 'main');
      rt.marker('dp', H.FUSHIN, '石垣山の普請場', { h: 3 });
      rt.say('普請の奉行', '火は焚くな。声も立てるな。小田原から見られてはならぬ', 3.6);
      rt.after(4.2, () => rt.say(nm(rt), '林の向こうに……石垣と白い壁。もう城が出来ておる', 3.4));
    },
    tick(rt, C, m, ctx, el) {
      // 物見：山の北の林から三度、少しずつ忍び寄る
      while (C.w < WAVES.length && el >= WAVES[C.w][0]) {
        const from = H.SCOUT_FROM[WAVES[C.w][1]];
        const g = enemyGroup(rt, { faction: 'hojo', name: '北条の物見', anchor: { ...from }, facing: Math.atan2(H.FUSHIN.x - from.x, H.FUSHIN.z - from.z), width: 3, aggro: 10, morale: 85, noRout: true,
          order: 'move', dest: { x: H.FUSHIN.x, z: H.FUSHIN.z - 6 }, speed: 2.6 },
        H.dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: C.w >= 2 ? 4 : 3 }], { ...H.HOJO, flag: null }));
        g.dmgMult = 0.55;
        g.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; q.seekRange = 20; q.aggro = 14; };
        C.scouts.push(g); C.groups.push(g);
        rt.say('普請の番', ['林の中に人影！　北条の物見じゃ。生かして帰すな', 'また来た！　東の沢からじゃ', '三方から来る！　一人も城へ戻すな', '夜明け前の最後の物見じゃ！'][C.w], 3.2);
        C.w++;
      }
      rt.objProgress('dp', '');
      // 主な物見を退けるか、現地で夜明けまで守れば、残兵には撤退の下知が出る。
      // 命を消して全滅にせず、生きたまま林へ退かせる。
      const near = Math.hypot(rt.player.u.pos.x - H.FUSHIN.x, rt.player.u.pos.z - H.FUSHIN.z) < 18;
      const total = C.scouts.reduce((n, g) => n + g.units.length, 0);
      const remaining = C.scouts.reduce((n, g) => n + live(g), 0);
      if (!C.withdraw && C.w >= WAVES.length && near && remaining > 0 &&
          (remaining <= total * 0.2 || el >= 180)) {
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
      // 翌朝の井伊の陣へ（暗転。城が現れる段は、井伊の陣から南西を見る）
      k15Fade(rt, () => {
        // 翌日へ移る暗転の中で退場させ、目の前の生存者を消さない。
        for (const g of [...C.scouts, C.porters, C.guard]) if (g) for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u);
        if (rt.flags.ichiya) rt.flags.ichiya.wood.visible = true;   // 翌朝、陣から見ると林がまだ城を隠している（伐るのは次の段）
        const view = rt.player.camYawOff;
        H.warp(rt, H.II_JIN.x - 2, H.II_JIN.z + 6, rt.player.yaw);
        rt.player.camYawOff = view;
      });
    },
  };
}
