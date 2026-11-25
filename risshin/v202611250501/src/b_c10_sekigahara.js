// 長宗我部家編 十四「関ヶ原の戦い（南宮山）」（慶長五年〔1600〕九月十五日・美濃国 南宮山）。軽い型（chosokabe_kit.js）・K647（docs/house_chosokabe.md ②'）
//   既存の関ヶ原（sekigahara・k06・s08）の南宮山の側を、長宗我部の足軽の目で写した軽い型（作り直しではない）。
//   史実：元親の跡を継いだ盛親は西軍に付き、南宮山の東の麓に陣した。前の吉川広家が動かず、盛親は戦わずに戦が終わった。
//   盛親は伊勢路へ退き、土佐へ帰った（『土佐物語』B・docs/fujin/sekigahara.md）。勝ちは、追ってくる東軍を払って伊勢路へ抜ける事
import { chosoBattle, ICHIRYO, uS, uA, uG, busho } from './chosokabe_kit.js';

const EAST = { flag: 'asano', armor: 0x24221f };
const SPAWN = { x: 0, z: -40 };
const WAIT = { x: 0, z: -14 };      // 栗原の陣（動けずに待つ所）
const NOROSHI = { x: 20, z: 24 };   // 麓の口（浅野の物見）
const ISE = { x: -40, z: -96 };     // 伊勢路の口

export const c10_sekigahara = chosoBattle({
  id: 'c10_sekigahara',
  date: '慶長五年（1600）九月十五日　朝　美濃国 南宮山',
  intro: '盛親様は西軍に付き、南宮山の麓に陣を張った。霧の向こうで鉄砲の音。だが前の吉川が、動かない。',
  history: '慶長五年（1600）九月十五日、長宗我部盛親は西軍に付いて南宮山の東の麓に陣した。前に陣した吉川広家が東軍に通じて動かず、盛親は戦わぬまま西軍が敗れた。盛親は伊勢路から土佐へ退いたが、のちに土佐を取り上げられた（兵の数は諸説ある）。',
  sides: { a: { name: '長宗我部の軍', mon: 'chosokabe', faction: 'chosokabe' }, b: { name: '東軍', mon: 'asano', faction: 'tokugawa' } },
  force: { a: 6600, b: 10000 },
  foeLook: EAST,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1600, time: 'morning', fogFar: 300, mist: 0.6, marchMist: true, overcast: true,
    hills: [[-60, 80, 60, 30], [-20, 60, 40, 18], [120, 120, 80, 18], [-140, -60, 70, 22], [80, -120, 60, 16]],
    paths: [{ pts: [[0, -40], [0, -14], [20, 24], [60, 80]], w: 3 }, { pts: [[0, -40], [-40, -96], [-60, -160]], w: 2.8 }],
    groves: [{ x: -60, z: 80, r: 36, n: 40 }, { x: -140, z: -60, r: 30, n: 26 }, { x: 80, z: -120, r: 26, n: 20 }],
    trees: 440, tufts: 1500,
  },
  allies: [
    { name: '長宗我部盛親の旗本', at: { x: SPAWN.x - 8, z: SPAWN.z - 8 }, list: [busho('長宗我部盛親'), uS(4), uA(8)] },
    { name: '吉田重康の手', at: { x: SPAWN.x + 10, z: SPAWN.z - 4 }, list: [busho('吉田重康'), uS(3), uA(8)] },
    { name: '先手の一領具足', at: { x: SPAWN.x + 2, z: SPAWN.z + 8 }, list: [uS(1), ICHIRYO(10), uG(4)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['長宗我部盛親', '吉川殿は何をしておる。使いを出せ', 3],
      ['組頭', '吉川の陣から返事じゃ。「いま弁当を使うておる」と……', 3.2],
      ['吉田重康', '弁当じゃと。鉄砲の音が、あれほど鳴っておるのに', 3]] },
    { kind: 'move', at: WAIT, label: '栗原の陣', obj: '栗原の陣の前に出て、下知を待つ', r: 10, max: 60,
      say: [['組頭', '前へ出ても、吉川が道を塞いでおる', 3]] },
    { kind: 'fight', at: NOROSHI, obj: '麓の口に寄った東軍の物見を払う', title: '南宮山', sub: '東軍の物見が麓に寄る', max: 120,
      say: [['吉田重康', '浅野の物見じゃ。追い払え！', 3], ['東軍の侍', '長宗我部は動かぬぞ！　押せ！', 3]],
      foes: [{ name: '浅野の物見', from: { x: NOROSHI.x + 6, z: NOROSHI.z + 14 }, list: [uS(2), uA(10)] }],
      later: [{ t: 28, say: ['東軍の侍', '鉄砲、撃ちかけよ！'], foes: [{ name: '浅野の鉄砲', from: { x: NOROSHI.x + 22, z: NOROSHI.z + 10 }, list: [uS(1), uG(5)] }] }],
      reward: '麓の口の物見を払った' },
    { kind: 'rest', dur: 10, heal: 0.25, banner: ['西軍 崩れる', '関ヶ原'], say: [
      ['組頭', '石田の陣が崩れた……戦が、終わってしもうた', 3.2],
      ['長宗我部盛親', '一度も槍を合わせずにか……。伊勢路へ退く！', 3.2]] },
    { kind: 'hold', at: { x: -12, z: -50 }, label: '退き口', obj: '退き口で、追ってくる東軍を受ける', r: 16, dur: 60, title: '退き口', sub: '東軍の追手',
      say: [['吉田重康', '土佐の兵を一人でも多く帰す。ここで止めよ！', 3]],
      waves: [{ t: 0, say: ['東軍の侍', '長宗我部を逃がすな！'], foes: [{ name: '東軍の追手', from: { x: 10, z: -10 }, list: [uS(2), uA(12)] }] },
        { t: 30, say: ['東軍の侍', '横から回れ！'], foes: [{ name: '東軍の追手の二', from: { x: 30, z: -34 }, list: [uS(2), uA(10)] }] }],
      reward: '退き口を守った' },
    { kind: 'move', at: ISE, label: '伊勢路の口', obj: '伊勢路の口まで退く', r: 10, max: 90,
      say: [['組頭', '退け！　伊勢路へ！', 2.6]] },
  ],
  win: {
    banner: '伊勢路へ抜けた', sub: '長宗我部の兵が土佐へ帰る', award: '南宮山から盛親を退かせた',
    say: [['長宗我部盛親', '……戦わずに負けた。土佐に、何と言えばよい', 3.2],
      ['組頭', '殿、生きて帰れば、また槍は取れまする', 3],
      ['組頭', '田の者らが待っておる。帰りましょう', 3]],
  },
});
export default c10_sekigahara;
