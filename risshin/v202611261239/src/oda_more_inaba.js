// K674（11/26 クラウドせ・一戦10任務）：稲葉山城の戦いに、本丸に合図の火を放った後の史実の続きの段を足す（tokugawa_more.js の moreSteps）。
//   史実：永禄十年（1567）八月、信長は稲葉山を鹿垣で囲み、城の内から火が上がると斎藤の兵は崩れた。龍興は城を捨て、
//   長良川を舟で下って伊勢の長島へ落ちた（『信長公記』首巻 A・『美濃国諸旧記』B。本丸の取り返し・水の手の戦いの細かな所は推）。
//   段は本丸の火の所で起こる（本人は動かさない）。字は任務の一行と台詞だけ。元の win の締め（火・褒美・終幕）は段が尽きてから。
import { moreSteps, S, A, G, B } from './tokugawa_more.js';

const F = (title, sub, obj, who, said, foes, t2, said2, foes2) => ({ fight: { title, sub, obj, say: [[who, said]], foes, limit: 40,
  later: t2 ? [{ t: t2, say: said2, foes: foes2 || [] }] : [] } });
const gone = (g) => !g || g.count === 0 || g.routed;

const INABA_MORE = { faction: 'saito', flag: 'saito', rows: [
  { dur: 4, rest: [['木下藤吉郎', '火は上がった。じゃが城の内には、まだ刃向かう者が残っておるぞ']] },
  F('本丸の館の近習', '館から打って出る龍興の近習', '本丸の館から打って出た龍興の近習を討て', '斎藤の近習', '殿の館を焼かせるな。織田の者を斬り捨てよ！',
    [{ name: '龍興の近習', list: [S(3), A(6)] }], 24, ['織田の侍', '館の奥からも出て来た！'], [{ name: '館の奥の侍', list: [S(1), A(5)], dir: 0.7 }]),
  F('二の丸の取り返し', '本丸へ上がって来る長井の手', '二の丸から本丸を取り返しに来た長井道利の手を押し返せ', '長井の侍', '本丸を取り返せ。火を踏み消すのじゃ！',
    [{ name: '長井の手', list: [S(2), A(8), B(2)], dir: -0.4 }], 24, ['足軽', '弓が射掛けて来る。間を詰めよ！'], [{ name: '二の丸の弓組', list: [A(4), B(3)], dir: 0.3 }]),
  { dur: 5, rest: [['木下藤吉郎', '龍興は城を捨てたぞ。退く者は追うな。刃向かう者だけを討て']] },
  F('水の手の曲輪', '井戸を守る斎藤の兵', '水の手の曲輪で、井戸を守って退かぬ斎藤の兵を払え', '斎藤の侍', '水の手だけは渡さぬ。ここで死ぬぞ！',
    [{ name: '水の手の守り', list: [S(2), A(7), G(2)], dir: 0.9 }], 24, ['織田の侍', '鉄砲が井戸の陰におる。回り込め！'], [{ name: '井戸の陰の組', list: [A(5)], dir: -0.8 }]),
  F('長良川への落ち口', '舟へ落ちる龍興の殿', '長良川へ落ちる龍興の舟を守る、殿の侍を討て', '斎藤の侍大将', '殿の舟が出るまで、一歩も通すな！',
    [{ name: '龍興の殿', list: [S(3), A(8)], dir: -0.9 }], 24, ['木下藤吉郎', 'これが最後の殿じゃ。破れば、美濃は殿のものぞ！'], [{ name: '殿の後の組', list: [A(6)], dir: -0.3 }]),
], en: [
  ['火は上がった。じゃが城の内には、まだ刃向かう者が残っておるぞ', 'The fire is up. But men inside the castle still fight on.'],
  ['本丸の館の近習', 'Retainers of the main hall'], ['館から打って出る龍興の近習', "Tatsuoki's retainers sally from the hall"],
  ['本丸の館から打って出た龍興の近習を討て', "Cut down Tatsuoki's retainers sallying from the main hall"],
  ['殿の館を焼かせるな。織田の者を斬り捨てよ！', "Do not let them burn our lord's hall. Cut the Oda down!"], ['龍興の近習', "Tatsuoki's retainers"],
  ['館の奥からも出て来た！', 'More are coming from deep in the hall!'], ['館の奥の侍', 'Samurai from the inner hall'],
  ['二の丸の取り返し', 'Counterattack from the second bailey'], ['本丸へ上がって来る長井の手', "Nagai's men climb to the main bailey"],
  ['二の丸から本丸を取り返しに来た長井道利の手を押し返せ', "Push back Nagai Michitoshi's men coming up from the second bailey to retake the main bailey"],
  ['本丸を取り返せ。火を踏み消すのじゃ！', 'Retake the main bailey. Stamp out the fire!'], ['長井の手', "Nagai's men"],
  ['弓が射掛けて来る。間を詰めよ！', 'Their bows are shooting. Close the distance!'], ['二の丸の弓組', 'Second bailey archers'],
  ['龍興は城を捨てたぞ。退く者は追うな。刃向かう者だけを討て', 'Tatsuoki has abandoned the castle. Do not chase those who flee. Strike only those who fight.'],
  ['水の手の曲輪', 'Water bailey'], ['井戸を守る斎藤の兵', 'Saito men guarding the well'],
  ['水の手の曲輪で、井戸を守って退かぬ斎藤の兵を払え', 'Drive off the Saito men who will not leave the well in the water bailey'],
  ['水の手だけは渡さぬ。ここで死ぬぞ！', 'We will never give up the water. We die here!'], ['水の手の守り', 'Water bailey guard'],
  ['鉄砲が井戸の陰におる。回り込め！', 'Guns behind the well. Go around!'], ['井戸の陰の組', 'Squad behind the well'],
  ['長良川への落ち口', 'Escape path to the Nagara River'], ['舟へ落ちる龍興の殿', "Tatsuoki's rearguard covers the boats"],
  ['長良川へ落ちる龍興の舟を守る、殿の侍を討て', "Cut down the rearguard covering Tatsuoki's boat escape down the Nagara River"],
  ['殿の舟が出るまで、一歩も通すな！', "Not one step until our lord's boat is away!"], ['龍興の殿', "Tatsuoki's rearguard"],
  ['これが最後の殿じゃ。破れば、美濃は殿のものぞ！', 'This is the last rearguard. Break it and Mino is our lord\'s!'], ['殿の後の組', 'Squads behind the rearguard'],
], // 元の win の関所（火・旗・龍興・本丸の守り）が揃った時だけ続きの段を始める。揃わない時は元の win がそのまま返す
// 段の初めに合図の火を上げる（台詞の「火は上がった」と合わせる）。元の敵は退かせる（moreSteps の既定と同じ）
onStart: (rt) => { rt.def?.sigFire?.(rt); for (const g of rt.army.groups) if (g.team === 1 && g.count && !g.routed) { g.noRout = false; g.focus = null; g.order = 'flee'; g.routed = true; g.morale = 0; } },
// 敵の出所：本丸は高く持ち上げた狭い山の上なので、遠くの斜面（五十歩下）から出すと登れず本人まで届かなかった（act bot 170秒討ち0）。
//   本人から 10〜22 歩・向きに近い所のうち、本人の足元と高さの差が四歩より小さい所。無ければ本人から十歩
fromAt: (rt, P, d) => { const y0 = rt.player?.u?.pos?.y ?? rt.world.heightAt(P.x, P.z);
  for (let r = 22; r >= 10; r -= 3) for (const da of [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1]) {
    const x = P.x + Math.sin(d + da) * r, z = P.z + Math.cos(d + da) * r;
    if (Math.abs(rt.world.heightAt(x, z) - y0) < 4) return { x, z }; }
  return { x: P.x + Math.sin(d) * 10, z: P.z + Math.cos(d) * 10 }; },
only: (rt) => { const F = rt.flags, u = rt.player?.u; return !!u && !u.dying && !u.downed && !rt.retryOpen && !F.carry && F.step === 4 && !!F.sig && !!F.hata?.every(gone) && gone(F.tatsu) && gone(F.keep?.guard); } };

export function inabaMore(def) {
  def.pacingCap = (def.pacingCap || 1080) + 80 * INABA_MORE.rows.filter((r) => r.fight).length;
  moreSteps(def, INABA_MORE);
}
