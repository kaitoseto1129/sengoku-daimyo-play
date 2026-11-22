// k10/uesugi.js … 鴫野の戦いの「上杉の存在感」（docs/toku15_plan_1108.md の 10）
// ・始め：上杉の本陣から先手の後ろまで、堤の両脇に竹に雀と毘の旗を並べる（遠くからでも「上杉の軍が来ている」と分かる。旗の密集＝大将の軍）。
//   話の後に足軽の一言：関ヶ原の年に徳川と争った上杉が、今は徳川の先手にいる。
// ・終わり：家康の言葉「上杉はやはり上杉よ」を使番が伝える。字の札は足さない。
// 重さ：幟を十二本置くだけ（当たり無し）。
// 使い方：setup の終わりで install(rt, { at: 話が終わる秒 })、win の中で ending(rt) の返す秒で finish。
import { nobori } from '../props.js';

export function install(rt, o = {}) {
  const W = rt.world, F = rt.flags;
  if (F.uesugiShown) return;
  F.uesugiShown = true;
  // 堤の両脇（道の外）に旗の列：先手の後ろ（x=124）から本陣の前（x=184）まで
  for (let i = 0; i < 6; i++) {
    const x = 124 + i * 12;
    for (const z of [-7, 7]) {
      const f = nobori(W, x, z + (i % 2 ? 0.8 : -0.8), (i + (z > 0 ? 1 : 0)) % 3 === 0 ? 'uesugi_bi' : 'uesugi', 5.2);
      f.rotation.y = -Math.PI / 2 + (i % 3 - 1) * 0.15;
      rt.scene.add(f);
    }
  }
  rt.after(o.at || 11, () => { if (!F.ending) rt.say('足軽', '十四年前は徳川と争うた上杉が、今は徳川の先手か……', 3.4); });
}

export function ending(rt) {
  rt.after(18, () => rt.say('家康の使番', '大御所様の御言葉。上杉はやはり上杉よ、と', 3.6));
  return 22.5;
}
