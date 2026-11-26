// K674（11/26 クラウドか・一戦10任務）：桶狭間に、義元の首を持って組の旗へ引き揚げた後の史実の続きの段を足す（tokugawa_more.js の moreSteps）。
//   史実：永禄三年（1560）五月十九日、義元が討たれると今川勢は崩れ、深田へ逃げ入る者を若者どもが追い付き追い付き討った（『信長公記』首巻 A）。
//   旗本の馬廻は首を取り返そうと踏み止まり、鳴海城の岡部元信は城を守り続けた（後に首と引き換えに開城・『信長公記』A・『改正三河後風土記』B）。
//   谷の外の殿・鳴海の道の出撃の細かな戦いは推。字は任務の一行と台詞だけ。
//   元の戦の締め（勝鬨と元康の退き・okehazama/yoin.js）は、段が尽きてから呼ぶ（b_okehazama.js の homeEnd）。今川の側（i10・SH.flip）には出さない。
import { moreSteps, S, A, G, B } from './tokugawa_more.js';
import { SH } from './okehazama/side.js';

const F = (title, sub, obj, who, said, foes, t2, said2, foes2) => ({ fight: { title, sub, obj, say: [[who, said]], foes, limit: 50,
  later: t2 ? [{ t: t2, say: said2, foes: foes2 || [] }] : [] } });

const OKE_MORE = { key: 'homeEnd', faction: 'imagawa', flag: 'imagawa', only: () => !SH.flip, rows: [
  F('首を取り返す馬廻', '義元の馬廻が踏み止まる', '首を取り返しに来た義元の馬廻を退けよ', '今川の馬廻', '御屋形の御首を渡すな。取り返せ！',
    [{ name: '義元の馬廻', list: [S(3), A(8)] }], 28, ['組頭 源八', '横からも来るぞ。首を囲め！'], [{ name: '馬廻の残り', list: [S(1), A(6)], dir: 0.7 }]),
  { dur: 4, rest: [['組頭 源八', '谷の外でも今川勢が崩れておる。殿は追い討てと仰せじゃ']] },
  F('深田の追い討ち', '深田へ逃げ入る今川の兵', '深田へ逃げ込む今川の兵を追い討て', '今川の足軽', '泥に足を取られる。逃げよ、逃げよ！',
    [{ name: '深田の今川勢', list: [A(10), B(2)], dir: -0.6 }], 26, ['織田の若武者', '追い付け、追い付け！一人も逃がすな'], [{ name: '逃げ遅れの組', list: [A(7)], dir: 0.4 }]),
  F('山の麓の殿', '踏み止まる今川の殿の備', '桶狭間山の麓で踏み止まる今川の殿の備を破れ', '今川の侍大将', 'ここで止めねば、皆が討たれる。槍を揃えよ！',
    [{ name: '今川の殿', list: [S(2), A(8), G(3)] }], 30, ['組頭 源八', '鉄砲がおる。間を詰めて斬り込め！'], [{ name: '殿の後の組', list: [S(1), A(6)], dir: -0.8 }]),
  { dur: 5, rest: [['組頭 源八', '鳴海の城から岡部の兵が出たそうな。清洲への道を塞がれる前に払うぞ']] },
  F('鳴海の道', '城から打って出た岡部の兵', '鳴海へ通じる道で、打って出た岡部元信の兵を押し返せ', '岡部の侍', '御屋形の仇じゃ。織田を一人も帰すな！',
    [{ name: '岡部元信の手勢', list: [S(2), A(10), B(2)], dir: 0.3 }], 30, ['組頭 源八', 'これで終いじゃ。押し返せば、清洲へ帰れるぞ！'], [{ name: '岡部の二の手', list: [S(1), A(7)], dir: -0.4 }]),
], en: [
  ['首を取り返す馬廻', 'Guards come for the head'], ['義元の馬廻が踏み止まる', 'Yoshimoto\'s guards stand their ground'],
  ['首を取り返しに来た義元の馬廻を退けよ', 'Drive off Yoshimoto\'s guards coming to take back the head'],
  ['御屋形の御首を渡すな。取り返せ！', 'Do not give up our lord\'s head. Take it back!'], ['義元の馬廻', 'Yoshimoto\'s guards'],
  ['横からも来るぞ。首を囲め！', 'More from the side. Guard the head!'], ['馬廻の残り', 'Remaining guards'],
  ['谷の外でも今川勢が崩れておる。殿は追い討てと仰せじゃ', 'The Imagawa are breaking outside the valley too. Our lord says pursue them.'],
  ['深田の追い討ち', 'Pursuit in the rice paddies'], ['深田へ逃げ入る今川の兵', 'Imagawa men flee into the deep paddies'],
  ['深田へ逃げ込む今川の兵を追い討て', 'Pursue the Imagawa men fleeing into the deep paddies'],
  ['泥に足を取られる。逃げよ、逃げよ！', 'The mud grabs our feet. Run, run!'], ['深田の今川勢', 'Imagawa in the paddies'],
  ['追い付け、追い付け！一人も逃がすな', 'Catch them, catch them! Let none escape.'], ['逃げ遅れの組', 'Stragglers'],
  ['山の麓の殿', 'Rearguard at the foot of the hill'], ['踏み止まる今川の殿の備', 'The Imagawa rearguard holds'],
  ['桶狭間山の麓で踏み止まる今川の殿の備を破れ', 'Break the Imagawa rearguard holding at the foot of Okehazama hill'],
  ['ここで止めねば、皆が討たれる。槍を揃えよ！', 'If we do not stop them here, we all die. Level spears!'], ['今川の殿', 'Imagawa rearguard'],
  ['鉄砲がおる。間を詰めて斬り込め！', 'They have guns. Close in and cut them down!'], ['殿の後の組', 'Squads behind the rearguard'],
  ['鳴海の城から岡部の兵が出たそうな。清洲への道を塞がれる前に払うぞ', 'Okabe\'s men have come out of Narumi Castle. We clear them before they block the road to Kiyosu.'],
  ['鳴海の道', 'Narumi road'], ['城から打って出た岡部の兵', 'Okabe\'s men sally from the castle'],
  ['鳴海へ通じる道で、打って出た岡部元信の兵を押し返せ', 'Push back Okabe Motonobu\'s men who sallied onto the Narumi road'],
  ['御屋形の仇じゃ。織田を一人も帰すな！', 'Avenge our lord. Not one Oda goes home!'], ['岡部元信の手勢', 'Okabe Motonobu\'s men'],
  ['これで終いじゃ。押し返せば、清洲へ帰れるぞ！', 'This is the last of them. Push them back and we go home to Kiyosu!'], ['岡部の二の手', 'Okabe second wave'],
] };

// 続きの段の間は、元の戦の行き先のピンと札の一行を段の物に譲る。段が尽きたら元の homeEnd が締める
export function okeMore(def) {
  const pin0 = def.missionPin, head0 = def.missionHeading;
  def.missionPin = function (rt, ...a) { if (rt.flags.k652m === 'on') return null; return pin0.call(this, rt, ...a); };
  def.missionHeading = function (rt, ...a) {
    if (rt.flags.k652m === 'on') { const o = rt.objectives?.find((x) => x.id === 'dp'); if (o?.text) return o.text; }
    return head0.call(this, rt, ...a);
  };
  def.pacingCap = (def.pacingCap || 1080) + 100 * OKE_MORE.rows.filter((r) => r.fight).length;
  moreSteps(def, OKE_MORE);
}
