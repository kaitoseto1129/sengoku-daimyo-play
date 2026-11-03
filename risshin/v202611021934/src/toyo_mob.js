// 豊臣編の持ち場の先の乱戦（11/2 c_mob_toyo「乱戦なし・敵が遠い」）：始めの25秒のカメラの先 35〜55m に、軽い大軍どうしの斬り合いを置く。
//   軽い作り（world.addClash）だけ。本物の兵・兵力の数・当たり・bot には入れない（team を渡さない）。携帯（MEM_TIGHT）は数を減らし後詰めを付けない。
//   前線はカメラに斜め（横から刃の当たる所が見える向き）に置く。本物の兵の立つ所は形の側で避けるので、本物の組の上には置かない。
import { MEM_TIGHT } from './settings.js';

// o：{ x, z, facing（A の向き）, w, seed, A: { flag, armor, count, guns, bows }, B: {...}, corpses }
export function toyoClash(rt, o) {
  const T = MEM_TIGHT, k = T ? 0.62 : 1;
  const side = (s) => ({ flagRate: 0.6, ...s, count: Math.round((s.count || 120) * k) });
  const C = rt.world.addClash({
    // measuredMelee：前の列が踏み出して相手の列へ入り込む（二つの横隊が向き合って立つだけに見えない。稲葉山の町の乱戦と同じ）
    gap: 2.4, bw: 5, noWake: true, noRout: true, measuredMelee: true, killRate: 0.012, maxDrift: 1.2, corpses: T ? 10 : 20, ...o,
    w: T ? Math.round(o.w * 0.8) : o.w, A: side(o.A), B: side(o.B),
    host: T ? false : o.host,
    play: (s, p, v) => rt.army.play(s, p, v * 0.5), smoke: (x, y, z, sx, sz) => rt.army.smoke(x, y, z, sx, sz),
  });
  C?.go?.();
  return C;
}
