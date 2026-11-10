// ======================================================================
// 山中城　落城の後（14〜15分）：山じゅうの曲輪に豊臣の旗が立ち、遠く箱根の向こうに小田原。「北条の本城はまだ先」
// 呼び方：本体の win から play(rt)。戻り値は終わりまでの秒
// ======================================================================
import { nobori } from '../props.js';
import { sfx } from '../audio.js';

const FLAGS = [[10, 20, 'toyotomi'], [16, -46, 'toyotomi'], [25, -106, 'toyotomi'], [-46, 176, 'kuginuki'], [46, -152, 'hori'], [-54, -50, 'kashiwa'], [32, -96, 'toyotomi'], [4, -40, 'toyotomi']];

export function play(rt) {
  FLAGS.forEach(([x, z, k], i) => rt.after(1 + i * 0.8, () => { try { rt.scene.add(nobori(rt.world, x, z, k, 6)); } catch (e) { /* 飾り */ } if (i % 2 === 0) rt.army.play('toki', { x, z }, 0.9); }));
  rt.after(17.5, () => rt.say('堀秀政', '箱根の向こうに小田原。北条の本城は、まだ先じゃ', 3.6));
  rt.after(21.5, () => { rt.say('使番', '殿下より：このまま箱根を越え、小田原を囲め', 3.4); sfx('horagai', 0.6); });
  return 26;
}
