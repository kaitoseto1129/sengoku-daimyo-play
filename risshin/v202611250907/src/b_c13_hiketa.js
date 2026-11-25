// 長宗我部家編 七「引田の戦い」（天正十一年〔1583〕四月・讃岐国 引田）。軽い型（chosokabe_kit.js）・K647（docs/house_chosokabe.md ②'）
//   史実：羽柴秀吉は仙石秀久を讃岐へ送り、十河存保を助けさせた。元親は引田の浜で仙石勢を迎え、伏せた兵で横を突いて破った（『元親記』B・東かがわ市の解説 C・兵の数は推）。
// 仕組み：一領具足の呼び集め（浜の松原の外の畑に伏せた影を、法螺で起こす）
import { chosoBattle, ICHIRYO, uS, uA, uG, busho } from './chosokabe_kit.js';

const SENGOKU = { flag: 'eiraku', armor: 0x2a2420 };
const SPAWN = { x: 0, z: -40 };
const HORA = { x: -24, z: -60 };    // 法螺の台
const BEACH = { x: 4, z: 26 };      // 引田の浜
const PINE = { x: -10, z: 50 };     // 松原の口
const HIDE = { x: 6, z: 102 };      // 仙石秀久の備

export const c13_hiketa = chosoBattle({
  id: 'c13_hiketa',
  date: '天正十一年（1583）四月　朝　讃岐国 引田',
  intro: '羽柴秀吉が、仙石秀久を讃岐へ送ってきた。引田の浜に、永楽銭の旗。畑の畦には、一領具足が伏せている。',
  history: '天正十一年（1583）四月、羽柴秀吉は仙石秀久を讃岐へ送り、十河存保を助けさせた。長宗我部元親は引田の浜で仙石勢を迎え、伏せた兵で横を突いて破った。仙石は淡路へ退いた（兵の数は諸説ある）。',
  sides: { a: { name: '長宗我部の軍', mon: 'chosokabe', faction: 'chosokabe' }, b: { name: '仙石の軍', mon: 'eiraku', faction: 'toyotomi' } },
  force: { a: 10000, b: 2000 },
  foeLook: SENGOKU,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
  world: {
    seed: 1583, time: 'morning', fogFar: 440,
    hills: [[HORA.x, HORA.z, 7, 1.6], [-170, 60, 80, 22], [-160, -130, 80, 20], [160, -130, 80, 18], [HIDE.x - 40, HIDE.z + 40, 50, 14]],
    paths: [{ pts: [[0, -140], [0, -40], [4, 26], [-10, 50], [6, 102], [0, 170]], w: 3 }],
    paddy: (x, z) => (z < -10 && z > -128 && Math.abs(x) > 6 && Math.abs(x) < 110 && Math.hypot(x - HORA.x, z - HORA.z) > 9 && (Math.abs(x) % 24) > 1.4 && (Math.abs(z) % 22) > 1.4 ? 1 : 0),
    groves: [{ x: 50, z: 50, r: 26, n: 30 }, { x: -60, z: 70, r: 24, n: 26 }, { x: -170, z: 60, r: 30, n: 24 }],
    trees: 380, tufts: 1700,
  },
  fields: [{ at: { x: -58, z: -40 }, far: 0 }, { at: { x: 40, z: -50 }, far: 1 }, { at: { x: -66, z: -96 }, far: 2 }, { at: { x: 56, z: -100 }, far: 3 }],
  callSay: ['長宗我部元親', '起きたな。仙石の横を突け！', '……遅い。集まった者だけで行く'],
  allies: [
    { name: '長宗我部元親の旗本', at: { x: SPAWN.x - 8, z: SPAWN.z - 8 }, list: [busho('長宗我部元親'), uS(4), uA(8)] },
    { name: '香川親和の手', at: { x: SPAWN.x + 10, z: SPAWN.z - 4 }, list: [busho('香川親和'), uS(3), uA(8)] },
    { name: '先手の一領具足', at: { x: SPAWN.x + 2, z: SPAWN.z + 8 }, list: [uS(1), ICHIRYO(10), uG(3)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['長宗我部元親', '羽柴の手先が讃岐へ来た。浜で迎えて追い返す', 3.2],
      ['組頭', '畑の者は伏せておる。法螺が鳴れば、仙石の横へ出る', 3.2],
      ['香川親和', '父上、仙石は戦上手と聞きまする', 3]] },
    { kind: 'move', call: true, at: HORA, label: '法螺の台', obj: '法螺の台へ走り、一領具足を呼び集める', r: 6, max: 90,
      say: [['組頭', 'あの塚じゃ！　上がって吹け！', 3]] },
    { kind: 'fight', at: BEACH, obj: '引田の浜で、仙石の先手を破る', title: '引田', sub: '浜に仙石の先手',
      say: [['長宗我部元親', '浜へ出よ！', 2.6], ['仙石の侍', '土佐の兵など、羽柴の槍の前では田の案山子じゃ！', 3.2]],
      foes: [{ name: '仙石の先手', from: { x: BEACH.x + 6, z: BEACH.z + 14 }, list: [uS(2), uA(12)] }],
      later: [{ t: 28, say: ['仙石の侍', '鉄砲、前へ！'], foes: [{ name: '仙石の鉄砲', from: { x: BEACH.x + 20, z: BEACH.z + 18 }, list: [uS(1), uG(5)] }] }],
      max: 120, reward: '引田の浜で仙石の先手を破った' },
    { kind: 'hold', at: PINE, label: '松原の口', obj: '松原の口を守り、仙石の寄せを受ける', r: 16, dur: 60, title: '松原の口', sub: '仙石の寄せ',
      say: [['香川親和', '松原の口を取った！　ここで受けよ！', 3]],
      waves: [{ t: 0, say: ['仙石の侍', '押し返せ！'], foes: [{ name: '仙石の二の手', from: { x: PINE.x + 12, z: PINE.z + 34 }, list: [uS(2), uA(12)] }] },
        { t: 30, say: ['仙石の侍', '三の手、かかれ！'], foes: [{ name: '仙石の三の手', from: { x: PINE.x - 18, z: PINE.z + 30 }, list: [uS(2), uA(10)] }] }],
      reward: '松原の口を守った' },
    { kind: 'fight', at: HIDE, obj: '仙石秀久の備を崩す', title: '仙石秀久', sub: '永楽銭の旗が踏みとどまる', max: 140,
      say: [['長宗我部元親', '秀久の旗じゃ！　押せ！', 3]],
      foes: [{ name: '仙石秀久の備', from: { x: HIDE.x, z: HIDE.z + 10 }, list: [{ type: 'samurai', n: 1, o: { name: '仙石秀久', horse: true } }, uS(3), uA(12)] }],
      later: [{ t: 30, say: ['仙石の侍', '殿を舟へ！　ここで止めよ！'], foes: [{ name: '仙石の旗本', from: { x: HIDE.x - 14, z: HIDE.z + 18 }, list: [uS(3), uA(8)] }] }],
      reward: '仙石秀久の備を崩した' },
  ],
  win: {
    banner: '引田の勝ち', sub: '仙石の兵が舟へ逃げる', award: '引田で仙石秀久を破った',
    say: [['組頭', '仙石が舟へ逃げていく。讃岐はもう少しじゃ', 3.2],
      ['長宗我部元親', '羽柴の手先も、一領具足には敵わぬ', 3],
      ['香川親和', 'されど父上、羽柴は次に、もっと大きな兵を寄越しましょう', 3.2]],
  },
});
export default c13_hiketa;
