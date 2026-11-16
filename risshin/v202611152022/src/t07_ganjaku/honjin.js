// ======================================================================
// 岩石城　麓の本陣（二巡・docs/generals_toyo_toku_1108.md の 10）：大将の羽柴秀勝が麓の陣幕の床几に座り、旗本が囲む。
//   秀吉は馬ヶ岳の本陣にいてこの山には来ない（史実）ので、声は使番が運ぶ「殿下より」。黒田官兵衛は秀長と日向へ向かっている（根白坂へ続く）。
//   堀秀政・長谷川秀一・福島正則・加藤清正ら、全国から集まった諸将の名を使番の知らせで出す。
// 呼び方：setup で install(rt, K)。
// ======================================================================
import { allyGroup } from '../bhelp.js';
import { shogi } from '../props.js';

const SEAT = { x: -214, z: 212 };

export function install(rt) {
  const F = rt.flags, W = rt.world;
  try { rt.scene.add(shogi(W, SEAT.x, SEAT.z, Math.PI * 0.75)); } catch (e) { /* 飾り */ }
  F.hidekatsu = allyGroup(rt, { name: '羽柴秀勝の本陣', faction: 'toyotomi', flag: 'toyotomi', anchor: SEAT, facing: Math.PI * 0.75, width: 3, aggro: 0, fixed: true, noAI: true, noRout: true, order: 'hold', fullStrength: true },
    [{ type: 'busho', n: 1, o: { name: '羽柴秀勝', invuln: true, horse: false } }, { type: 'samurai', n: 5 }]);
  F.hidekatsu.noFrontline = true;
  for (const u of F.hidekatsu.units) if (u.name === '羽柴秀勝') { u.noTarget = true; u.jinchu = {}; }
  const say = (t, who, s, d = 3.4) => rt.after(t, () => { if (!F.ending) rt.say(who, s, d); });
  say(11, '羽柴秀勝', '殿下より：岩石は今日のうちに落とせ。九州の者どもに、この数を見せてやれ、との仰せじゃ');
  say(48, '使番', '堀秀政様・長谷川秀一様の手、東の尾根の下に揃いました');
  say(76, '使番', '福島正則様・加藤清正様は殿下の旗本に。黒田官兵衛様は中納言様と日向へ');
}
