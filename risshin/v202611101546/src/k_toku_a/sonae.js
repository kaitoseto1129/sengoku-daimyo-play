// 徳川編・係A（伏見・河田・岐阜・杭瀬川）の共通の小道具：備の層（先鋒→二陣→本陣）を遠景の軽い作りで重ねる。
// docs/army_depth_spec_1108.md の 2・6・7・22・26（前後の厚み・本陣を奥に・後詰を始めから見せる・旗）。
// 本物の兵は増やさない（addDistantArmy は描くだけ。host:false で後詰めの本物も付けない）。勝ち負け・数には入れない。
import { flagTexture } from '../textures.js';

// o：{ x, z, facing, mon, armor, team, seed, layers:[{ back, side, w, d, count, kind }] }
//   facing は隊の向き（前＝(sin f, cos f)）。back は前の列から後ろへの m、side は横へのずれ（右が＋）
export function sonaeLayers(rt, o) {
  const W = rt.world, f = o.facing || 0, fx = Math.sin(f), fz = Math.cos(f), out = [];
  for (const [k, L] of o.layers.entries()) {
    const x = o.x - fx * (L.back || 0) + fz * (L.side || 0), z = o.z - fz * (L.back || 0) - fx * (L.side || 0);
    // 遠さの目安（outsideNearView）は備の所から測る（設営の時の焦点が遠いと、空の隊になって描かれなかった）
    const lf = W.lastFocus; W.lastFocus = { x, z };
    try {
      const A = W.addDistantArmy({ x, z, w: L.w || 30, d: L.d || 10, count: L.count || 120, facing: f, team: o.team ?? 1, armor: o.armor ?? 0x2c2a26,
        flagTex: flagTexture(o.mon), flag: o.mon, mon: o.mon, kind: L.kind || 'mixed', seed: (o.seed || 1) * 13 + k, host: false });
      if (A) out.push(A);
    } catch (e) { /* 作れない時は置かない（遊びは続く） */ } finally { W.lastFocus = lf; }
  }
  return out;
}

const meshOf = (A) => A?.mesh || A;
export function showLayers(list, on) { for (const A of list || []) { const m = meshOf(A); if (m && 'visible' in m) m.visible = !!on; } }

// 段ごとに一度だけ動く台本の小さな見張り：when(rt) が真になった時に fn(rt) を一度呼ぶ
export function onceWhen(rt, list) {
  const done = new Set();
  return () => { for (const [k, [when, fn]] of list.entries()) if (!done.has(k) && when(rt)) { done.add(k); try { fn(rt); } catch (e) { /* 台本の一つが壊れても戦は止めない */ } } };
}
