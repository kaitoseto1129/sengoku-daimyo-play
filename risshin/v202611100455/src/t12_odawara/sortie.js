// ======================================================================
// 小田原征伐　「北条の打って出」の段（3〜6分）と、六月二十二日の夜への移り　docs/toyo15_plan_1108.md の 15
// 史実：囲まれた北条方は、時に総構えの口から打って出て寄せ手の陣を探った。秀吉は深追いを禁じ、囲みを保たせた。
// 遊び：山王口から北条勢が篠曲輪の木戸を出て、山王川を渡って徳川の陣へ寄せる。川の東の岸で押し返す。
//   半ばを討つと北条勢は城へ退く。「深追いするな、殿下の下知じゃ」で岸に留まる。済むと暗転して六月二十二日の雨の夜（篠曲輪の夜討ちへ）。
// 入れ方：b_t12_odawara.js の depthStart の段の並び（jinmawari の後）に step(H) と night(H) を置く。
// ======================================================================
import { enemyGroup, nm } from '../bhelp.js';
import { sfx } from '../audio.js';
import { k15Fade } from '../oda15_kit.js';

export function step(H) {
  const live = (g) => (g ? g.units.filter((u) => u.alive && !u.gone && !u.fleeing).length : 0);
  return {
    kind: 'fight', key: 'sortie',
    start(rt, C, m, ctx) {
      C.at = H.BANK; C.goal = H.BANK; C.groups = [];
      rt.banner('北条勢が打って出た', '山王口から、川を渡って寄せて来る');
      rt.obj('dp', '山王川の東の岸で、打って出た北条勢を押し返す', 'main');
      rt.marker('dp', H.BANK, '山王川の岸', { h: 3 });
      // 北条勢：篠曲輪の木戸を出て、山王川を渡り徳川の陣へ
      C.foe = enemyGroup(rt, { faction: 'hojo', name: '打って出た北条勢', anchor: { ...H.KIDO_F }, facing: Math.PI / 2, width: 8, formation: 'line', aggro: 6, morale: 90, noRout: true,
        order: 'move', dest: { x: H.BANK.x - 2, z: H.BANK.z }, speed: 3 },
      H.dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 14 }, { type: 'bow', n: 3 }], H.HOJO));
      C.foe.dmgMult = 0.55;
      C.foe.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; q.seekRange = 24; q.aggro = 14; };
      C.n0 = C.foe.units.length;
      C.groups.push(C.foe);
      // 味方の組も岸へ（自分一人で戦わない）
      ctx.friends(rt).forEach((g, k) => { g.ai = true; g.order = 'move'; g.dest = { x: H.BANK.x + 3 + (k % 2) * 3, z: H.BANK.z - 10 + k * 7 }; g.speed = 3.4; g.onArrive = (q) => { q.onArrive = null; q.order = 'hold'; q.anchor = { ...q.dest }; q.aggro = 14; q.seekRange = 16; }; });
      rt.army.play('eshout', H.KIDO_F, 1.4);
      sfx('taiko', 0.7);
      rt.say('井伊直政', '北条が打って出たぞ！　川の岸で受け止めよ。川は越えるな', 3.6);
      C.say = 0;
    },
    tick(rt, C, m, ctx, el) {
      const P = rt.player.u.pos;
      rt.objProgress('dp', '');
      // 二の手（川を渡り切る前に、木戸からもう一手）
      if (!C.foe2 && el > 35) {
        C.foe2 = enemyGroup(rt, { faction: 'hojo', name: '北条の二の手', anchor: { x: H.KIDO_F.x, z: H.KIDO_F.z + 4 }, facing: Math.PI / 2, width: 6, formation: 'line', aggro: 8, morale: 90, noRout: true,
          order: 'move', dest: { x: H.BANK.x - 2, z: H.BANK.z - 6 }, speed: 3.2 },
        H.dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }], H.HOJO));
        C.foe2.dmgMult = 0.55;
        C.foe2.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; q.seekRange = 24; q.aggro = 14; };
        C.groups.push(C.foe2);
        rt.say('井伊の足軽', '木戸からまた出て来る！', 2.6);
      }
      // 三の手：弓を連れて川の北の浅瀬から（横から回り込む）
      if (!C.foe3 && el > 75) {
        C.foe3 = enemyGroup(rt, { faction: 'hojo', name: '北条の三の手', anchor: { x: H.KIDO_F.x, z: H.KIDO_F.z - 10 }, facing: Math.PI / 2, width: 6, formation: 'line', aggro: 8, morale: 90, noRout: true,
          order: 'move', dest: { x: H.BANK.x - 2, z: H.BANK.z - 14 }, speed: 3.2 },
        H.dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'bow', n: 3 }], H.HOJO));
        C.foe3.dmgMult = 0.55;
        C.foe3.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; q.seekRange = 24; q.aggro = 14; };
        C.groups.push(C.foe3);
        rt.army.play('eshout', C.foe3.anchor, 1.2);
        rt.say('井伊の足軽', '北の浅瀬から回って来る！　横を突かれるぞ！', 3);
      }
      const all = [C.foe, C.foe2, C.foe3].filter(Boolean);
      const n0 = all.reduce((n, g) => n + g.units.length, 0);
      // 時間だけで全軍を退かせない。三の手まで押し返してから退く下知を出す。
      if (!C.back && C.foe3 && all.reduce((n, g) => n + live(g), 0) <= n0 * 0.35) {
        C.back = el;
        for (const g of all) { g.noRout = true; g.order = 'path'; g.path = [[H.KIDO_F.x, H.KIDO_F.z], [H.KIDO_F.x - 12, H.KIDO_F.z], [100, H.SANNO_IN.z], [H.SANNO_IN.x, H.SANNO_IN.z]]; g.pathIdx = 0; g.speed = 4; g.aggro = 0; g.focus = null;
          // 背を向けた兵は隊の path ではなく fleePath を読む。木戸と西の口を通って自分の城へ退かせる。
          g.fleePath = g.path;
          for (const u of g.units) if (u.alive) { u.target = null; u.atk = null; u.swing = null; u.fleePathIdx = 0; u.fleeing = true; } }
        rt.say('北条の侍', '引け！　城へ引け！', 2.6);
        rt.after(2, () => rt.say('使番', '深追いするな！　殿下の下知じゃ。城は攻めぬ。岸で止まれ！', 3.6));
        rt.after(6.2, () => rt.say(nm(rt), '……追えば城の口まで行けるのに', 3));
        rt.after(9.6, () => rt.say('井伊直政', '囲みを崩さぬのが、この陣の戦よ', 3.2));
      }
      // 退く北条勢は口の内へ入ったら見えなくなる。寄せ手は川を越えて追わない
      for (const g of [C.foe, C.foe2, C.foe3]) if (g) for (const u of g.units) if (u.alive && !u.gone && u.fleeing && (u.pos.x < H.SANNO_IN.x + 6 || (C.back && el - C.back > 25))) rt.army.despawn(u);
      for (const g of ctx.friends(rt)) for (const u of g.units) if (u.alive && u.target?.fleeing) u.target = null;
      // 陣で待つだけでは岸を守ったことにしない。退く敵を追わず、指定した岸へ本人が着いてから済ませる。
      if (C.back) return el - C.back > 13 && P.x > H.RIVER_X && Math.hypot(P.x - H.BANK.x, P.z - H.BANK.z) < 18;
      return false;
    },
    end(rt, C) {
      for (const g of [C.foe, C.foe2, C.foe3]) if (g) for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u);
      rt.unmark('dp');
      rt.objDone('dp');
      rt.award((t) => t.side.push('打って出た北条勢を山王川で返した'), '打って出た北条勢を返した');
    },
  };
}

// 六月二十二日の雨の夜へ（暗転）：篠曲輪の夜討ちの支度。主人公と組は井伊の陣へ
export function night(H) {
  return {
    kind: 'rest', key: 'yoru', max: 16,
    start(rt, C, m, ctx) {
      const F = rt.flags, W = rt.world;
      C.at = H.II_JIN; C.goal = null; C.groups = [];
      k15Fade(rt, () => {
        F.day = 0;
        W.setTime('night', true); W.setRainTarget(0.85); W.rainLevel = 0.85;
        if (W.stars) W.stars.visible = false; if (W.moon) W.moon.visible = false; if (W.mountains) W.mountains.visible = false;
        H.warp(rt, H.II_JIN.x + 2, H.II_JIN.z + 4, -Math.PI / 2);
        for (const g of ctx.friends(rt)) { g.ai = true; g.order = 'hold'; g.onArrive = null; g.anchor = { ...(g.home || g.anchor) }; }
        H.shinoArm(rt, true);
      }, '六月二十二日の夜　雨', '篠曲輪へ夜討ちをかける');
      rt.say('井伊直政', '今宵は雨。山王口の外の出丸、篠曲輪を取る。松平康頼殿の手と、川と堀を渡って続け', 4.5);
      rt.after(5, () => rt.say('手勢の侍', '囲んで二月半、初めて城へ寄せる夜じゃ', 3.5));
    },
    tick(rt, C, m, ctx, el) { return el > 9.5; },
  };
}
