// 根来寺 ④ 9〜12分「火の連鎖」：境内の坊舎に火が回り、一棟から次の棟へ燃え移る。煙で景色が変わり、根来衆は退き始める。
// 大塔と大師堂は残す（史実）。全部は燃やさない。enterStep の start・tick から呼ぶ。
import { smoke, breath } from '../toyo15/kit.js';

export function fireStart(rt, NG) {
  const F = rt.flags;
  F.fireChain = { next: 6, n: 0, k: 0 };
  breath(rt, 0.35);   // 段の替わり目に息を整える
  rt.after(12, () => rt.say('足軽', '火が隣の坊舎へ移った！　風が谷を上っておる！', 3));
  rt.after(45, () => rt.say('使番', '根来の衆、奥の谷へ退き始めました！　ただ大塔の裏に残る者がおります', 4));
  rt.after(90, () => rt.say('組頭', '煙で前が見えぬ！　参道を外れるな！', 3));
  rt.after(125, () => rt.say('羽柴秀次', '大塔の前に行人方が集まっておる。火を渡させるな、急げ！', 3.5));
}
export function fireTick(rt, dt, el, NG) {
  const F = rt.flags, C = F.fireChain, W = rt.world;
  if (!C) return;
  // 子院の坊舎へ順に燃え移る（大塔の平場・大師堂の平場には渡さない）
  if (el > C.next && C.n < NG.chain.length) {
    const q = NG.chain[C.n++];
    W.addBlaze(q.x, q.z, { w: 6.5, d: 5, h: 3.2 });
    C.next = el + 18 + Math.random() * 8;
  }
  C.k = Math.min(0.6, C.k + dt * 0.006);
  smoke(rt, C.k);
}
