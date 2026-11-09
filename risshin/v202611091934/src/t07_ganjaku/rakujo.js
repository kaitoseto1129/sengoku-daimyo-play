// ======================================================================
// 岩石城　落城の後（14〜15分）：山じゅうの尾根に豊臣の旗が次々と立ち、麓の大軍は南へ動き出す。本陣から「九州を南へ」
//   巨大な豊臣軍が一城を飲み込む怖さで締める。
// 呼び方：本体の win から play(rt)。戻り値は終わりまでの秒
// ======================================================================
import { nobori } from '../props.js';
import { sfx } from '../audio.js';

const FLAGS = [[-46, 46, 'sashi:tsuru:#ece6d6:#201f1c'], [-24, 30, 'sashi:tsuru:#ece6d6:#201f1c'], [40, 40, 'toyotomi'], [52, 30, 'toyotomi'], [-60, -20, 'sashi:tsuru:#ece6d6:#201f1c'], [-50, -32, 'sashi:tsuru:#ece6d6:#201f1c'],
  [30, -30, 'maeda'], [20, -40, 'maeda'], [-10, 20, 'toyotomi'], [12, 14, 'toyotomi']];

export function play(rt) {
  const W = rt.world;
  FLAGS.forEach(([x, z, k], i) => rt.after(1.5 + i * 0.9, () => { try { rt.scene.add(nobori(W, x, z, k, 6)); } catch (e) { /* 飾り */ } if (i % 3 === 0) rt.army.play('toki', { x, z }, 0.9); }));
  rt.after(11, () => rt.say('使番', '馬ヶ岳の本陣より：岩石は落ちた。このまま九州を南へ、と', 3.6));
  rt.after(15, () => { rt.say('蒲生郷成', '一日で、この岩山が……。島津も、これを聞けば震えよう', 3.4); sfx('horagai', 0.6); });
  return 21;
}
