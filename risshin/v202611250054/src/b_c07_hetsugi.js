// 長宗我部家編 十一「戸次川の戦い」（天正十四年〔1586〕十二月・豊後国 戸次川）。軽い型（chosokabe_kit.js）・K647（docs/house_chosokabe.md ②'）
//   既存の t06_hetsugi（豊臣の側）・s05_hetsugi（島津の側）の、長宗我部の足軽の側（作り直しでなく、この家の足軽の目で写した軽い型）。
//   史実：軍監の仙石秀久は元親の止めるのを聞かず戸次川を渡った。島津家久は退くと見せて伏兵で挟み（釣り野伏せ）、豊臣の四国勢は崩れた。
//   長宗我部信親は中津留の河原で七百ほどの兵と踏みとどまって討ち死にした（『長元記』B・『元親記』B・docs/kaito_hetsugi_common_1120.md）。
//   K401：信親の討ち死にを戦の真ん中に置く（見出しと声。字の札は足さない）。勝ちは、河原で踏みとどまって元親を退かせる事
import { chosoBattle, ICHIRYO, uS, uA, uG, busho } from './chosokabe_kit.js';

const SHIMAZU = { flag: 'shimazu', armor: 0x1c1a1a };
const SPAWN = { x: 0, z: -40 };
const FORD = { x: 0, z: 30 };       // 戸次川の向こう岸
const NOBU = { x: -14, z: 20 };     // 中津留の河原（信親の踏みとどまる所）
const BACK = { x: 10, z: -60 };     // 元親の退く道
const RIVER = [[-220, 14], [-100, 10], [0, 16], [100, 12], [220, 18]];

export const c07_hetsugi = chosoBattle({
  id: 'c07_hetsugi',
  date: '天正十四年（1586）十二月　夕　豊後国 戸次川',
  intro: '島津を討つため、四国の衆が豊後へ渡った。軍監の仙石秀久は、元親様の止めるのも聞かず、川を渡ると言う。',
  history: '天正十四年（1586）十二月、豊臣方の四国の衆は豊後の戸次川で島津家久と戦った。軍監の仙石秀久は元親の止めるのを聞かずに川を渡り、島津の伏兵に挟まれて崩れた。元親の嫡男 信親は中津留の河原で踏みとどまり、二十二歳で討ち死にした。元親は伊予へ逃れ、この後は人が変わったように気を落としたと伝わる（兵の数は諸説ある）。',
  sides: { a: { name: '長宗我部の軍', mon: 'chosokabe', faction: 'chosokabe' }, b: { name: '島津の軍', mon: 'shimazu', faction: 'shimazu' } },
  force: { a: 6000, b: 18000 },
  foeLook: SHIMAZU,
  foeDmg: 0.7,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1586, time: 'dusk', fogFar: 380, winter: true, overcast: true,
    river: RIVER, riverW: 16, riverDepth: 0.7,
    hills: [[-150, 90, 70, 18], [150, 90, 70, 18], [0, 220, 100, 24], [-150, -140, 80, 18], [150, -150, 80, 20]],
    paths: [{ pts: [[10, -140], [10, -60], [0, -40], [0, 30], [0, 100], [0, 170]], w: 3 }],
    groves: [{ x: -70, z: 66, r: 26, n: 30 }, { x: 70, z: 66, r: 26, n: 30 }, { x: -150, z: -140, r: 30, n: 22 }],
    trees: 400, tufts: 1500,
  },
  allies: [
    { name: '長宗我部信親の手', at: { x: SPAWN.x - 8, z: SPAWN.z - 2 }, list: [uS(4), uA(10)] },
    { name: '長宗我部元親の旗本', at: { x: SPAWN.x + 10, z: SPAWN.z - 10 }, list: [busho('長宗我部元親'), uS(3), uA(6)] },
    { name: '先手の一領具足', at: { x: SPAWN.x + 2, z: SPAWN.z + 8 }, list: [uS(1), ICHIRYO(10), uG(3)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['仙石秀久', '島津は川向こうで縮こまっておる。渡って討て！', 3.2],
      ['長宗我部元親', '待たれよ。島津は退くと見せて挟むぞ', 3],
      ['長宗我部信親', '父上……軍監の下知では是非もない。渡りまする', 3.2]] },
    { kind: 'fight', at: FORD, obj: '戸次川を渡り、島津の先手を突く', title: '戸次川', sub: '島津の先手が川向こうに', max: 110,
      say: [['組頭', '渡れ！　冷たいぞ、足を取られるな！', 3], ['島津の侍', '引け、引けい！', 2.6]],
      foes: [{ name: '島津の先手', from: { x: FORD.x + 4, z: FORD.z + 16 }, list: [uS(2), uA(12)] }],
      reward: '戸次川を渡った' },
    { kind: 'fight', at: { x: FORD.x, z: FORD.z + 14 }, obj: '左右から出た島津の伏兵を払う', title: '釣り野伏せ', sub: '退いた島津が左右から挟む', max: 120,
      say: [['島津家久', '今じゃ！　挟め！', 2.8], ['組頭', '伏兵じゃ！　左右から来る！', 3]],
      foes: [{ name: '島津の伏兵', from: { x: FORD.x - 30, z: FORD.z + 20 }, list: [uS(2), uA(10)] }, { name: '島津の伏兵の二', from: { x: FORD.x + 30, z: FORD.z + 22 }, list: [uS(2), uA(8), uG(2)] }],
      reward: '伏兵を払った' },
    { kind: 'rest', dur: 10, heal: 0.25, banner: ['長宗我部信親 討死', '中津留の河原'], say: [
      ['組頭', '若殿が……信親様が、討たれた……！', 3.2],
      ['組頭', '亡骸を島津に渡すな！　河原で踏みとどまれ！', 3.2]] },
    { kind: 'hold', at: NOBU, label: '中津留の河原', obj: '中津留の河原で踏みとどまり、元親を退かせる', r: 16, dur: 70, title: '中津留の河原', sub: '島津の新手が押し寄せる',
      say: [['長宗我部元親', '信親……！　信親はどこじゃ！', 3]],
      waves: [{ t: 0, say: ['島津の侍', '首を取れ！'], foes: [{ name: '島津の新手', from: { x: NOBU.x + 10, z: NOBU.z + 34 }, list: [uS(2), uA(12)] }] },
        { t: 32, say: ['島津の侍', '一人も渡すな！'], foes: [{ name: '島津の新手の二', from: { x: NOBU.x - 24, z: NOBU.z + 26 }, list: [uS(2), uA(10)] }] }],
      reward: '中津留の河原で踏みとどまった' },
    { kind: 'move', at: BACK, label: '退く道', obj: '川を戻り、元親の退く道まで下がる', r: 10, max: 90,
      say: [['組頭', '殿を逃がせ！　退け！', 2.8]] },
  ],
  win: {
    banner: '元親を退かせた', sub: '四国の衆が伊予へ逃れる', award: '戸次川で元親の退き口を守った',
    say: [['長宗我部元親', '……信親を、置いてきてしもうた', 3.2],
      ['組頭', '若殿は七百と共に、最後まで槍を振るわれた', 3.2],
      ['組頭', '土佐へ帰ろう。若殿の分まで、田を守るんじゃ', 3]],
  },
});
export default c07_hetsugi;
