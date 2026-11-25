// 長宗我部家編 十五「八尾の戦い」（慶長二十年〔1615〕五月六日・河内国 八尾＝大坂夏の陣）。軽い型（chosokabe_kit.js）・K647（docs/house_chosokabe.md ②'）
//   既存の k14_yao_wakae（徳川の側）の反対の、長宗我部の足軽の側（作り直しでなく軽い型で写した）。
//   史実：土佐を失って京で寺子屋の師をしていた盛親は、大坂城に入った。夏の陣で八尾へ出て、長瀬川の堤に兵を伏せ、
//   藤堂高虎の先手を引きつけて崩し、藤堂高刑・藤堂氏勝らを討った。だが若江で木村重成が敗れ、盛親は大坂へ退いた（『大坂御陣覚書』B・兵の数は推）。
// 仕組み：一領具足の呼び集め（堤の陰に伏せた旧臣を、法螺で起こす。土佐から盛親を慕って来た者たち）
import { chosoBattle, ICHIRYO, uS, uA, uG, busho } from './chosokabe_kit.js';
import { yaoField, YAO_WORLD, YAO_TIMESLIP, YAO_AT } from './b_k14_yao_wakae.js';   // K651：徳川編の八尾・若江の戦場をそのまま使う（素材は写さない）
import { BATTLE_ASSETS } from './asset_manifest.js';
import { foe, wave, fightS, holdS, moveS, restS, boss } from './house_steps.js';
import { uB } from './light_battle.js';

// 11/25 K651（kaito「立場を入れ替えるだけでできる戦は全部の家でそうする」）：
//   前の別の戦場（手書きの丘と東西の川）をやめ、徳川編 k14 の八尾・若江（河内の田・玉串川と長瀬川・若江と八尾の村・三つの本陣）を yaoField で建てる。
//   遊ぶ側は長宗我部盛親の手（西＝−x の長瀬川の堤）。藤堂は東（+x）の本陣から寄せる。行き先は YAO_AT で置く。
// K652⑥（その戦の逸話を本人がやる段）：長瀬川の堤に伏せた一領具足を法螺で起こし、引きつけた藤堂の先手へ一斉に槍を入れる（『大坂御陣覚書』）。
const TODO = { flag: 'todo', armor: 0x24221f };
const AT = YAO_AT;
const SPAWN = { x: AT.choA.x - 2, z: AT.choA.z + 14 };         // 長宗我部の先手の後ろ（長瀬川の東）
const HORA = { x: AT.fuse.x + 2, z: AT.fuse.z - 6 };            // 法螺の台（長瀬川の東岸の堤の上）
const TSUTSUMI = { x: AT.choA.x + 8, z: AT.choA.z };            // 堤の前の田（藤堂の先手を引きつける所）
const TAKANORI = { x: AT.yaoFront.x + 28, z: AT.yaoFront.z - 8 };   // 藤堂高刑の手（k14 の高刑の隊の所）
const KUCHI = { x: AT.yaoFront.x + 58, z: AT.yaoFront.z + 6 };   // 藤堂の二陣の口（高虎の本陣への道）
const E = Math.PI / 2;   // 東（藤堂の方）を向く

export const c15_yao = chosoBattle({
  id: 'c15_yao',
  date: '慶長二十年（1615）五月六日　朝　河内国 八尾',
  intro: '土佐を失って十五年。盛親様は大坂城に入り、八尾へ出た。長瀬川の堤の陰に、土佐から付いてきた一領具足が伏せている。霧の中から藤堂の兵。',
  history: '慶長二十年（1615）五月六日、大坂方の長宗我部盛親は河内の八尾で藤堂高虎の兵と戦った。長瀬川の堤に兵を伏せて藤堂の先手を引きつけ、藤堂高刑らを討って藤堂勢を崩した。だが隣の若江で木村重成が敗れ、盛親は大坂へ退いた。大坂城が落ちた後、盛親は捕らえられて斬られ、長宗我部の家は絶えた（兵の数は諸説ある）。',
  sides: { a: { name: '長宗我部の軍', mon: 'chosokabe', faction: 'chosokabe' }, b: { name: '藤堂の軍', mon: 'todo', faction: 'tokugawa' } },
  force: { a: 5300, b: 5000, la: 0.2, lb: 0.35 },   // K652①：長宗我部五千三百・藤堂五千（k14 と同じ）。藤堂の先手は大きく崩れた。討ち取りに合わせて少しずつ
  thick: true, playerTaken: 0.45,   // K652②（11/25）：10分の戦に延ばした＝受けの段に三の手（thickWaves）・長い戦で体が持つよう受ける傷を少し軽く
  foeLook: TODO,
  foeDmg: 0.5,   // 11/25 act bot が197秒で倒れた（藤堂の二陣の段）＝刃を弱める
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: E },
  world: { seed: 1615, time: 'morning' },   // 下で徳川編の八尾・若江の world に置き換える（K651）
  fields: [{ at: { x: AT.fuse.x + 2, z: AT.fuse.z + 10 }, far: 0 }, { at: { x: AT.fuse.x + 4, z: AT.fuse.z - 20 }, far: 1 }, { at: { x: AT.fuse.x + 6, z: AT.fuse.z + 28 }, far: 2 }, { at: { x: AT.fuse.x + 8, z: AT.fuse.z - 38 }, far: 3 }],   // 長瀬川の東岸の堤の陰（伏せ）
  callSay: ['長宗我部盛親', '皆、よう来てくれた。土佐の槍を、もう一度見せてやれ', '……来られたのは、これだけか。よい、行くぞ'],
  allies: [
    { name: '長宗我部盛親の旗本', at: { x: SPAWN.x - 10, z: SPAWN.z + 4 }, list: [busho('長宗我部盛親'), uS(4), uA(8)] },
    { name: '吉田重康の手', at: { x: SPAWN.x + 10, z: SPAWN.z - 4 }, list: [busho('吉田重康'), uS(3), uA(8)] },
    { name: '先手の一領具足', at: { x: SPAWN.x + 6, z: SPAWN.z - 8 }, list: [uS(1), ICHIRYO(10), uG(3)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['長宗我部盛親', '藤堂が来る。堤の陰で待ち、引きつけて叩く', 3.2],
      ['組頭', '土佐から付いてきた者らが、堤の田に伏せておる。法螺で起こせ', 3.4],
      ['吉田重康', '殿、関ヶ原の借りを、今日返しましょうぞ', 3]] },
    { kind: 'move', call: true, at: HORA, label: '法螺の台', obj: '法螺の台へ走り、旧臣の一領具足を呼び集める', r: 6, max: 90,
      say: [['組頭', 'あの塚じゃ！　上がって吹け！', 3]] },
    { kind: 'fight', at: TSUTSUMI, obj: '長瀬川の堤で、藤堂の先手を崩す', title: '八尾', sub: '霧の中から藤堂の先手',
      say: [['長宗我部盛親', '今じゃ！　堤から出よ！', 2.8], ['藤堂の侍', '伏兵じゃ！　堤の陰に！', 3]],
      foes: [{ name: '藤堂の先手', from: { x: TSUTSUMI.x + 22, z: TSUTSUMI.z + 2 }, list: [uS(2), uA(12)] }],
      later: [{ t: 28, say: ['藤堂の侍', '鉄砲、堤を撃て！'], foes: [{ name: '藤堂の鉄砲', from: { x: TSUTSUMI.x + 30, z: TSUTSUMI.z - 14 }, list: [uS(1), uG(5)] }] }],
      max: 120, reward: '長瀬川の堤で藤堂の先手を崩した' },
    { kind: 'fight', at: TAKANORI, obj: '藤堂高刑の手を崩す', title: '藤堂高刑', sub: '藤堂の一門が踏みとどまる', max: 130,
      say: [['吉田重康', '藤堂の一門じゃ！　討ち取れ！', 3]],
      foes: [{ name: '藤堂高刑の手', from: { x: TAKANORI.x + 12, z: TAKANORI.z }, list: [{ type: 'samurai', n: 1, o: { name: '藤堂高刑', horse: true } }, uS(3), uA(12)] }],
      later: [{ t: 30, say: ['藤堂の侍', '高刑様を守れ！'], foes: [{ name: '藤堂の旗本', from: { x: TAKANORI.x + 18, z: TAKANORI.z + 16 }, list: [uS(2), uA(8)] }] }],
      reward: '藤堂高刑の手を崩した' },
    { kind: 'hold', at: KUCHI, label: '二陣の口', obj: '二陣の口で、藤堂の新手を受ける', r: 16, dur: 60, title: '藤堂の新手', sub: '高虎の旗本が押し出す',
      say: [['長宗我部盛親', '藤堂の本陣が出てきた。ここで受けよ！', 3]],
      waves: [{ t: 0, say: ['藤堂の侍', '押し返せ！'], foes: [{ name: '藤堂の二陣', from: { x: KUCHI.x + 34, z: KUCHI.z + 8 }, list: [uS(2), uA(12)] }] },
        { t: 30, say: ['藤堂の侍', '三陣、かかれ！'], foes: [{ name: '藤堂の三陣', from: { x: KUCHI.x + 28, z: KUCHI.z - 20 }, list: [uS(2), uA(10)] }] }],
      reward: '藤堂の新手を受けた' },
    // K652②（11/25 kaito「全部の戦を10分ぐらいに。15分楽しめる質」）：段を足す（史実の流れの続き・house_steps.js）
    restS([['組頭', '藤堂の先手は崩れた。じゃが堤の北に、藤堂の一門がまだ残る', 3.2]]),
    fightS({ x: 40, z: 74 }, '堤の北で、藤堂氏勝の手を崩す', '藤堂氏勝', '藤堂の一門が堤の北に', [['長宗我部盛親', '藤堂をもう一つ崩せ。大坂の意地を見せよ', 3.2]],
      [foe('藤堂氏勝の手', 60, 64, [boss('藤堂氏勝'), uS(2), uA(12)])], { later: [wave(28, '藤堂の侍', '鉄砲、撃ちかけよ！', [foe('藤堂の鉄砲の二', 70, 86, [uS(1), uG(5)])])], reward: '藤堂氏勝の手を崩した' }),
    holdS({ x: -22, z: 70 }, '横の備', '横の備の所で、北から回った藤堂良勝の手を受ける', '藤堂良勝', '藤堂の一門が北から回る', [['組頭', '北から回ってきた！　横を空けるな！', 3]],
      [wave(0, '藤堂の侍', '長宗我部の横を突け！', [foe('藤堂良勝の手', 20, 24, [boss('藤堂良勝'), uS(2), uA(12)])]), wave(30, '藤堂の侍', '鉄砲、前へ！', [foe('藤堂良勝の鉄砲', -10, 30, [uS(2), uA(8), uG(2)])]),
        wave(52, '藤堂の侍', '押せ！', [foe('藤堂良勝の手の二', 40, 40, [uS(2), uA(10)])])], { reward: '藤堂良勝の手を受けきった' }),
    fightS({ x: 92, z: 112 }, '高虎の本陣の前の旗本を突く', '高虎の本陣', '藤堂高虎の旗本', [['組頭', '高虎の本陣が見えるぞ！　一太刀でも！', 3]],
      [foe('高虎の旗本', 110, 124, [uS(3), uA(12)])], { later: [wave(30, '藤堂の侍', '殿を守れ！', [foe('高虎の鉄砲', 120, 100, [uS(1), uG(5)])])], reward: '高虎の本陣を突いた' }),
    holdS({ x: 60, z: 106 }, '二陣の口の先', '二陣の口の先で、藤堂の旗本の最後の押しを受ける', '藤堂の押し', '高虎の旗本が押し返す', [['長宗我部盛親', 'ここで藤堂を崩しきる。土佐の槍を見せよ', 3.2]],
      [wave(0, '藤堂の侍', '長宗我部を押し返せ！', [foe('藤堂の旗本の押し', 100, 110, [uS(2), uA(12)])]), wave(30, '藤堂の侍', '横から回れ！', [foe('藤堂の旗本の押しの二', 90, 80, [uS(2), uA(10)])]),
        wave(52, '藤堂の侍', '首を取れ！', [foe('藤堂の旗本の押しの三', 96, 132, [uS(2), uA(8)])])], { reward: '藤堂の押しを受けきった' }),
  ],
  win: {
    banner: '八尾の勝ち', sub: '藤堂勢が崩れる', award: '八尾で藤堂勢を崩した',
    say: [['組頭', '藤堂が崩れた！　土佐の槍じゃ！', 3],
      ['吉田重康', '殿……若江の木村殿が、討たれたとの知らせ', 3.2],
      ['長宗我部盛親', '……そうか。皆、大坂へ退く。今日の槍、忘れぬぞ', 3.4]],
  },
});
// K651：徳川編の八尾・若江の地面・玉串川と長瀬川・田・道・村をそのまま使う（getter も写すため descriptor ごと）
c15_yao.world = Object.defineProperties({}, Object.getOwnPropertyDescriptors(YAO_WORLD));
c15_yao.world.fleeOut = (x, z, team) => (team === 1 ? x > 240 : x < -315);   // 崩れた藤堂は東の本陣の向こうへ
c15_yao.timeslip = YAO_TIMESLIP;
BATTLE_ASSETS.c15_yao = BATTLE_ASSETS.k14_yao_wakae;
// 戦場を建てる（徳川編の八尾・若江と同じ所）→ 軽い型の setup（長宗我部の組・段）
{ const s0 = c15_yao.setup; c15_yao.setup = function* (rt) { yield* yaoField(rt); s0.call(this, rt); }; }
export default c15_yao;
