// 敵の陣構えの見た目（K474「進んだ先で敵が陣を敷いているのが見える」。11/20 クラウド35）
// 各備の大将の座（備の後ろ）に家紋の陣幕の囲いと篝火、本陣の後ろに陣小屋と篝火を置く。見た目だけ：幕に当たりは付けない
// （兵の出入り・退き・後詰の道を塞がない）。手本：『長篠合戦図屏風』『関ヶ原合戦図屏風』『三方ヶ原戦役画像』の備の幕。
//   pts：[{ x, z, big? }] 各備の置き場。facing：兵の向き（0＝+z。前は (sin f, cos f)）。honjin：{ x, z } と本陣の向き
import { jinmaku, kagaribi } from './props.js';
import { jingoya } from './castle_parts.js';

export function enemyJin(rt, { mon, facing = 0, pts = [], honjin = null, back = 14, hutName = '陣小屋' }) {
  const W = rt.world, fx = Math.sin(facing), fz = Math.cos(facing);
  // 幕は東西南北にそろう囲い。口は敵（前）の方へ。前が北なら北にも口を開ける
  const gapN = fz < -0.5 ? 4 : 0;
  const put = (x, z, w, d) => {
    rt.scene.add(jinmaku(W, x, z, w, d, 4, { mon, solid: false, gapNorth: gapN }));
  };
  for (const p of pts) {
    const x = p.x - fx * back, z = p.z - fz * back;
    put(x, z, p.big ? 14 : 11, p.big ? 9 : 7);
    const sx = fz, sz = -fx;   // 横の向き
    rt.scene.add(kagaribi(W, x + fx * 5 - sx * 3, z + fz * 5 - sz * 3), kagaribi(W, x + fx * 5 + sx * 3, z + fz * 5 + sz * 3));
  }
  if (honjin) {
    const hf = honjin.facing ?? facing, hx = Math.sin(hf), hz = Math.cos(hf), sx = hz, sz = -hx;
    for (const k of [-1, 0, 1]) jingoya(rt, honjin.x - hx * 24 + sx * k * 14, honjin.z - hz * 24 + sz * k * 14, 5, 3.6, hf - k * 0.15, { name: hutName });
    for (const k of [-1, 1]) rt.scene.add(kagaribi(W, honjin.x + hx * 10 + sx * k * 7, honjin.z + hz * 10 + sz * k * 7));
  }
}
