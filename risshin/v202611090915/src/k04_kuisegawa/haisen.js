// ======================================================================
// 杭瀬川　両軍の厚みと負け戦の締め（docs/toku15_plan_1108.md の 4）
//  ・0〜3分：川の向こう（大垣の側）に石田・宇喜多の備が先鋒→二陣→本陣と奥へ重なる。赤坂の側にも東軍の備（会戦はまだ）
//  ・12〜15分：東軍が有馬の陣へ逃げ込むと、左近は追うのを止める。西軍の勝鬨 →「杭瀬川　東軍敗北」→ その夜「明朝、関ヶ原にて決戦」
// 本物の兵は足さない。呼び方：setup で install(rt, ctx, { T, Y })、win で ctx.ending()（finish はその後 26 秒）
// ======================================================================
import { sfx } from '../audio.js';
import { sonaeLayers } from '../k_toku_a/sonae.js';
import { jinmaku, nobori } from '../props.js';

export function install(rt, ctx, { T, Y }) {
  const F = rt.flags, W = rt.world;
  // 川の向こう（大垣の側）：石田と宇喜多。前＝赤坂の側（局所の +x）
  const west = (lx, lz, mon, armor, seed, layers) => { const p = T(lx, lz); return sonaeLayers(rt, { x: p.x, z: p.z, facing: Y(Math.PI / 2), mon, armor, team: 1, seed, layers }); };
  west(-170, -70, 'ishida', 0x6b2e22, 41, [{ back: 0, w: 40, d: 10, count: 150 }, { back: 22, w: 40, d: 12, count: 150 }, { back: 42, w: 20, d: 10, count: 70, kind: 'honjin' }]);
  west(-180, 40, 'ukita', 0x5e3222, 42, [{ back: 0, w: 44, d: 10, count: 170 }, { back: 22, w: 44, d: 12, count: 170 }, { back: 42, w: 22, d: 10, count: 80, kind: 'honjin' }]);
  // 石田三成の本陣（generals_toyo_toku 4：後方本陣。前へは出ない）：大垣の側の奥、宇喜多と石田の備の後ろに陣幕と床几
  try {
    const h = T(-228, -40), f = Y(Math.PI / 2);
    rt.scene.add(jinmaku(W, h.x, h.z, 14, 10, 5, { mon: 'ishida' }));
    for (const [dx, dz] of [[-6, 4], [6, 4], [0, 7]]) rt.scene.add(nobori(W, h.x + dx, h.z + dz, 'ishida', 7));
    const lf = W.lastFocus; W.lastFocus = { x: h.x, z: h.z };
    try {
      W.addDistantArmy({ x: h.x, z: h.z + 1, w: 6, d: 4, facing: f, armor: 0x6b2e22, flag: 'ishida', mon: 'ishida', team: 1, kind: 'honjin', seed: 4407, host: false,
        people: [{ k: 'seated', general: 1, x: h.x, z: h.z + 1, facing: f }, ...[[-1.6, 0.6], [1.6, 0.6], [-1, -1.4], [1, -1.4]].map(([dx, dz]) => ({ k: 'samurai', x: h.x + dx, z: h.z + 1 + dz, facing: f }))] });
    } finally { W.lastFocus = lf; }
  } catch (e) { /* 置けない時は置かない */ }
  // 赤坂の側：岡山の家康の本陣の前に並ぶ東軍の諸隊（福島・池田など。この日は動かない）
  const east = (lx, lz, mon, seed, layers) => { const p = T(lx, lz); return sonaeLayers(rt, { x: p.x, z: p.z, facing: Y(-Math.PI / 2), mon, armor: 0x24221f, team: 0, seed, layers }); };
  east(170, -50, 'maru', 43, [{ back: 0, w: 40, d: 10, count: 150 }, { back: 22, w: 36, d: 10, count: 120 }]);
  east(165, 100, 'ageha', 44, [{ back: 0, w: 40, d: 10, count: 150 }, { back: 22, w: 36, d: 10, count: 120 }]);

  // 締め：左近が追うのを止め、西軍が勝鬨。負けの札の後、その夜へ
  ctx.ending = () => {
    rt.after(12.4, () => {
      for (const g of rt.army.groups) if (g.team === 1 && g.count && !g.routed) { const c = g.center?.(); if (c) { g.order = 'hold'; g.anchor = { x: c.x, z: c.z }; g.seekRange = 0; g.aggro = 0; } }
      rt.say('島左近', '追うな。川を越えれば有馬の鉄砲が待つ。引き上げよ', 3.4);
    });
    rt.after(15.6, () => { rt.army.celebrate?.(1); sfx('sig_enemyToki', 0.8); });
    rt.after(16.4, () => rt.banner('杭瀬川　東軍敗北', '慶長五年九月十四日'));
    rt.after(21, () => { W.setTime?.('dusk', true); rt.banner('その夜', '明朝、関ヶ原にて決戦'); });
  };
  return ctx;
}
