// 今川家編（K647・docs/house_imagawa.md ⑥）の足した11戦の共通の作り。i07〜i09 の形（軽い型＋帯 obiTick）をそのまま一つにまとめただけ。
//   allies は [前の手, 本隊, 後ろの備] の順に三つ（obiTick が 0⇄1・1⇄2 を帯で結ぶ）。thin に書いた段（rest を 0 と数える）で帯が細り、ほかの段で太く戻る。
//   字・札・ボタンは足さない。本物の兵は一戦 250 人まで（各戦の list の和で 120 人ほど）。
import { lightBattle } from './light_battle.js';
import { jinmaku, nobori } from './props.js';
import { obiTick } from './imagawa_obi.js';

export const IMAGAWA = { flag: 'imagawa', armor: 0x302e2a };
export const ODA = { flag: 'oda', armor: 0x24221f };
export const TOKU = { flag: 'tokugawa', armor: 0x2a2622 };
export const TAKEDA = { flag: 'takeda', armor: 0x3a2420 };
export const REBEL = { flag: 'imagawa', armor: 0x3c3630 };   // 今川の内の敵（花倉・曳馬）。旗は同じ家、具足の色だけ違える

// S：lightBattle の表に、hon（本陣の幕）・foeFlag と foeFlags（敵の幟の置き場）・thin（帯の細る段）・props(rt)・land（world に足す地形）を足した物
export function imagawaBattle(S) {
  const { hon, foeFlag, foeFlags = [], thin = [1], fade = [], props, land, ...rest } = S;
  const def = lightBattle({
    ...rest,
    setup(rt) {
      const W = rt.world;
      if (hon) {   // 幕は本隊の南 24 歩（道の上に置くと本人が幕に引っかかって先へ進めない・11/25 act bot の花倉と小豆坂）
        const jx = hon.x, jz = hon.z + 24;
        rt.scene.add(jinmaku(W, jx, jz, 12, 9, 6, { mon: 'imagawa' }));
        for (const [dx, dz] of [[-6, -6], [6, -6]]) rt.scene.add(nobori(W, jx + dx, jz + dz, 'imagawa', 5));
      }
      for (const p of foeFlags) rt.scene.add(nobori(W, p.x, p.z, foeFlag || 'oda', 6));
      try { props?.(rt); } catch (e) { /* 置物が無くても戦は進める */ }
      rt.flags.obi = { a: 1, b: 1, t: 0 };
    },
    update(rt, dt) {
      const O = rt.flags.obi, i = rt.flags.dp?.on ? rt.flags.dp.i : -1;
      if (!O) return;
      if (thin.includes(i)) { O.a = Math.max(0.28, O.a - dt / 35); O.b = Math.max(0.28, O.b - dt / 45); }
      else if (i >= 1) { O.a = Math.min(1, O.a + dt / 6); O.b = Math.min(1, O.b + dt / 6); }
      obiTick(rt, dt);
      // K719：味方の旗が消えていく（薩埵峠）・降りる（掛川）。段 i に入った時に一度だけ
      const D = (rt.flags._fade ||= {});
      fade.forEach((f, k) => {
        if (i !== f.i || D[k]) return;
        D[k] = 1;
        let n = 0;
        for (const g of rt.flags.allies || []) {
          if (!g?.count || (f.names && !f.names.includes(g.name))) continue;
          if (f.lower) { g.order = 'hold'; g.noAI = true; for (const u of g.units) { if (u.isPlayer) continue; if (u.flag) u.flag.visible = false; if (u.standardFlag) u.standardFlag.visible = false; } continue; }
          const a = n++ * 2.2 + 0.4;
          g.order = 'retreat'; g.noRout = false; g.morale = 0; g.fleeSet = true; g.fleeDir = { x: Math.cos(a), z: Math.sin(a) };
        }
      });
    },
  });
  Object.assign(def.world, land);
  return def;
}
