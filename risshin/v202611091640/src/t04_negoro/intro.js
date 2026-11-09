// 根来寺 ① 0〜3分の足し：山麓の景色に、同じ時に動く羽柴の大軍と、使番の別戦線の知らせを重ねる（docs/toyo15_plan_1108.md の 6）。
// 竹束で寄せる間（移動の時間）を出来事にする。本物の兵は増やさない。
import { host, reports } from '../toyo15/kit.js';

export function install(rt, NG) {
  const { P, ROT } = NG, W = rt.world;
  // 谷の左右の山裾を行く別の手（軽い大軍）。紀の川の方へ流れていく
  const a = P(-110, -170), b = P(120, -120), c = P(0, -260);
  const L = host(rt, { x: a.x, z: a.z, w: 40, d: 24, count: 520, facing: ROT - 0.5, seed: 2201 });
  const R = host(rt, { x: b.x, z: b.z, w: 44, d: 24, count: 560, facing: ROT + 0.6, seed: 2202 });
  host(rt, { x: c.x, z: c.z, w: 80, d: 26, count: 900, facing: ROT, seed: 2203 });
  L.advance(60, 150); R.advance(70, 160);
  // 遠くに、前の日に落ちた城の煙（和泉の方）
  const s = P(-60, -420); W.addFire(s.x, s.z, { size: 5, h: 6, blackSmoke: true });
  reports(rt, [
    [22, '使番', '千石堀は焼け落ちました。積善寺城も開け渡しにございます'],
    [55, '使番', '左の山裾、仙石勢が粉河の方へ回ります'],
    [95, '使番', '雑賀の衆は紀の川を下り、太田の方へ引いておるとの事'],
  ]);
}
