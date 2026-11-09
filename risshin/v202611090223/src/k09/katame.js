// k09/katame.js … 今福の戦いの締め「陣地を固める」（docs/toku15_plan_1108.md の 9 の 12〜15）
// 豊臣方が城へ退いた後、堤の上の今福の持ち場に佐竹の扇に月の旗を一本ずつ立てていく（木槌の音）。
// 最後に、南の鴫野でまだ鳴る鉄砲の音を聞かせて、次の戦へつなぐ。字の札は足さない。
// 重さ：幟を五本置くだけ（当たり無し）。
// 使い方：win の中で ending(rt, { at: 持ち場の中心 }) の返す秒で finish。
import { nobori } from '../props.js';
import { sfx } from '../audio.js';

export function ending(rt, o = {}) {
  const W = rt.world, at = o.at || { x: -88, z: 0 };
  // 堤の幅は狭い：道の両脇と砦の木戸の跡に、東から西へ順に立てる
  const spots = [[16, -4.5], [16, 4.5], [6, -4.5], [6, 4.5], [-2, 0.5]];
  spots.forEach(([dx, dz], i) => rt.after(3.4 + i * 0.9, () => {
    try {
      const f = nobori(W, at.x + dx, at.z + dz, 'satake', 5);
      f.rotation.y = -Math.PI / 2 + (i % 2 ? 0.12 : -0.12);
      rt.scene.add(f);
      sfx('wood', 0.4);
    } catch (e) { /* 旗が置けなくても締めは続ける */ }
  }));
  rt.after(4.6, () => rt.say('梅津憲忠', '旗を立てよ。柵を結い直せ。今福は佐竹が持つ', 3.2));
  rt.after(9, () => { sfx('volley', 0.25); rt.say('足軽', '南の鴫野では、まだ上杉の鉄砲が鳴っておる……', 3.2); });
  return 13;
}
